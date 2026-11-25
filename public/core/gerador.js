// Fluxo de geração. Recebe o cliente de IA (criarClienteLLM) como parâmetro,
// então funciona igual no servidor e no navegador.
import {
  promptVisaoGeral,
  promptPlano,
  promptMaterial,
  promptFormatar,
  promptQuestoes,
  promptResolver,
  promptComparar,
  promptArtigo,
  promptVisualizacoes,
  promptJogos,
  promptSequencia,
  promptPlanejamento,
  promptRegerarSlide,
  promptRegerarQuestao,
} from './prompts.js?v=__VERSAO__';
import { validarArtigoSecao, validarVisualizacoes, validarJogos } from './interativa.js?v=__VERSAO__';
import { SECOES, normalizarSlidesDaSecao } from './estrutura.js?v=__VERSAO__';

export { montarApresentacao } from './estrutura.js?v=__VERSAO__';

const IDS_SECOES = SECOES.map((s) => s.id);

// Partes da aula com contas (exemplos resolvidos e exercícios) usam o modelo de matemática.
const SECOES_COM_CONTAS = ['aplicacoes', 'pratica'];

export class ErroEntrada extends Error {}

export function validarEntrada(corpo) {
  const serie = String(corpo?.serie ?? '').trim();
  const assunto = String(corpo?.assunto ?? '').trim();
  const observacoes = String(corpo?.observacoes ?? '').trim();
  const nivel = String(corpo?.nivel || 'regular');

  if (!['1', '2', '3'].includes(serie)) throw new ErroEntrada('Escolha a série (1º, 2º ou 3º ano).');
  if (!assunto) throw new ErroEntrada('Informe o assunto.');
  if (assunto.length > 150) throw new ErroEntrada('O assunto deve ter no máximo 150 caracteres.');
  if (observacoes.length > 1500) throw new ErroEntrada('As observações devem ter no máximo 1500 caracteres.');

  if (!NIVEIS_VALIDOS.includes(nivel)) throw new ErroEntrada('Nível inválido.');

  return { serie, assunto, observacoes, nivel };
}

export const NIVEIS_VALIDOS = ['regular', 'reforco', 'avancado', 'inclusao'];

// ---------- plano: visão geral → plano ----------

export async function gerarVisaoGeral(llm, entrada) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptVisaoGeral(entrada), tarefa: 'visao', temperatura: 0.4, perfil: 'texto' });
  return { visao: dados, provedor };
}

/**
 * @param {object} [extras]
 * @param {Array<{codigo, resumo}>} [extras.bncc]  lista oficial: a IA escolhe dela e o código confere
 * @param {object} [extras.referencia]  plano bem avaliado de assunto parecido (exemplo de qualidade)
 */
export async function gerarPlano(llm, entrada, visao, extras = {}) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptPlano(entrada, visao, extras), tarefa: 'plano', perfil: 'texto' });
  if (!Array.isArray(dados.etapas)) throw new Error('Plano gerado sem etapas.');
  if (extras.bncc?.length) dados.habilidades_bncc = conferirBncc(dados.habilidades_bncc, extras.bncc);
  return { plano: dados, provedor };
}

/** Mantém só códigos que existem na lista oficial, com a descrição da lista. */
export function conferirBncc(habilidades, lista, maximo = 3) {
  const porCodigo = new Map(lista.map((h) => [h.codigo, h]));
  const vistos = new Set();
  return (Array.isArray(habilidades) ? habilidades : [])
    .map((h) => String(h?.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter((c) => porCodigo.has(c) && !vistos.has(c) && vistos.add(c))
    .slice(0, maximo)
    .map((c) => ({ codigo: c, descricao: porCodigo.get(c).resumo, ...(porCodigo.get(c).competencia ? { competencia: porCodigo.get(c).competencia } : {}) }));
}

// ---------- slides: para cada parte, material → formatação ----------

export function validarSecao(secao) {
  if (!IDS_SECOES.includes(secao)) throw new ErroEntrada('Parte da aula inválida.');
  return secao;
}

export async function gerarMaterial(llm, entrada, plano, visao, secao) {
  validarSecao(secao);
  const { dados, provedor } = await llm.gerarJSON({
    ...promptMaterial(entrada, plano, visao, secao),
    tarefa: 'material',
    temperatura: 0.5,
    perfil: SECOES_COM_CONTAS.includes(secao) ? 'matematica' : 'texto',
  });
  return { material: dados, provedor };
}

export async function formatarSlides(llm, entrada, secao, material) {
  validarSecao(secao);
  const { dados, provedor } = await llm.gerarJSON({
    ...promptFormatar(entrada, secao, material),
    tarefa: 'formatar',
    temperatura: 0.3,
    perfil: 'texto',
  });
  const slides = normalizarSlidesDaSecao(secao, dados.slides);
  if (slides.length === 0) throw new Error('Nenhum slide gerado para esta parte.');
  return { slides, provedor };
}

// ---------- prova: objetivas → discursivas → conferência ----------
// Cada passo é uma chamada pequena; o front chama um por vez e mostra o progresso.

export async function gerarQuestoes(llm, entrada, plano, visao, tipo) {
  if (!['multipla', 'discursiva'].includes(tipo)) throw new ErroEntrada('Tipo de questão inválido.');
  const { dados, provedor } = await llm.gerarJSON({ ...promptQuestoes(entrada, plano, visao, tipo), tarefa: `prova-${tipo}`, perfil: 'matematica' });
  const questoes = (Array.isArray(dados.questoes) ? dados.questoes : []).filter((q) => q && q.enunciado);
  return { questoes, provedor };
}

/** Junta as questões em uma prova numerada (código, sem IA). */
export function montarProva(questoes, plano, entrada) {
  if (!questoes.length) throw new Error('Prova gerada sem questões.');
  const lista = questoes.map((q, i) => {
    const alternativas = Array.isArray(q.alternativas) ? q.alternativas : [];
    return { ...q, numero: i + 1, alternativas, tipo: alternativas.length ? 'multipla' : 'discursiva' };
  });
  return {
    titulo: `Avaliação: ${plano?.titulo || entrada.assunto}`,
    instrucoes: 'Leia com atenção. Nas questões discursivas, mostre os cálculos.',
    questoes: lista,
  };
}

/**
 * Confere o gabarito: outro pedido (de preferência em outro provedor) resolve
 * as questões sem ver as respostas. Devolve as questões com o resultado.
 */
/**
 * @param {object} [opcoes]
 * @param {(pares: Array<{a: string, b: string}>) => Promise<Array<boolean|null>>} [opcoes.compararSimbolico]
 *        comparação exata (SymPy no servidor); null = não soube, aí a IA compara
 */
export async function conferirProva(llm, questoes, opcoes = {}) {
  const copia = structuredClone(questoes);
  try {
    const verificacao = await verificarGabarito(llm, copia, opcoes);
    return { questoes: copia, verificacao };
  } catch (erro) {
    console.warn('[prova] verificação não concluída:', erro.message);
    return { questoes: copia, verificacao: { concluida: false, motivo: erro.message } };
  }
}

/** Prova completa em sequência (usada nos testes e em scripts). */
export async function gerarProva(llm, entrada, plano, visao) {
  const objetivas = await gerarQuestoes(llm, entrada, plano, visao, 'multipla');
  const discursivas = await gerarQuestoes(llm, entrada, plano, visao, 'discursiva');
  const prova = montarProva([...objetivas.questoes, ...discursivas.questoes], plano, entrada);
  const { questoes, verificacao } = await conferirProva(llm, prova.questoes);
  return { prova: { ...prova, questoes }, verificacao, provedor: objetivas.provedor };
}

async function verificarGabarito(llm, questoes, { compararSimbolico } = {}) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptResolver(questoes),
    tarefa: 'resolver',
    perfil: 'matematica',
    comecarPor: 1,
    temperatura: 0.1,
  });
  const respostas = new Map((dados.respostas || []).map((r) => [Number(r.numero), String(r.resposta ?? '')]));

  const discursivas = [];
  for (const q of questoes) {
    const doVerificador = respostas.get(q.numero);
    q.verificacao = { resposta_verificador: doVerificador ?? null, confere: null };
    if (doVerificador == null) continue;

    if (q.tipo === 'multipla') {
      q.verificacao.confere = letra(doVerificador) === letra(q.resposta);
    } else if (normalizar(doVerificador) === normalizar(q.resposta)) {
      q.verificacao.confere = true;
    } else {
      discursivas.push({ numero: q.numero, resposta_a: String(q.resposta), resposta_b: doVerificador });
    }
  }

  // 1º: comparação exata (SymPy), quando disponível
  let metodo = 'ia';
  if (discursivas.length && compararSimbolico) {
    try {
      const veredictos = await compararSimbolico(discursivas.map((d) => ({ a: d.resposta_a, b: d.resposta_b })));
      discursivas.forEach((d, i) => {
        if (typeof veredictos?.[i] === 'boolean') {
          questoes.find((x) => x.numero === d.numero).verificacao.confere = veredictos[i];
          d.resolvida = true;
        }
      });
      if (discursivas.some((d) => d.resolvida)) metodo = 'sympy+ia';
    } catch (erro) {
      console.warn('[prova] comparação simbólica indisponível:', erro.message);
    }
  }
  const pendentes = discursivas.filter((d) => !d.resolvida).map(({ resolvida, ...d }) => d);

  if (pendentes.length) {
    const { dados: comp } = await llm.gerarJSON({
      ...promptComparar(pendentes),
      tarefa: 'comparar',
      perfil: 'matematica',
      temperatura: 0,
    });
    for (const c of comp.comparacoes || []) {
      const q = questoes.find((x) => x.numero === Number(c.numero));
      if (q) q.verificacao.confere = c.equivalentes === true;
    }
  }

  const revisar = questoes.filter((q) => q.verificacao.confere !== true).map((q) => q.numero);
  return { concluida: true, provedor, revisar, metodo };
}

function letra(texto) {
  const m = String(texto).trim().toUpperCase().match(/^\(?([A-E])\b/);
  return m ? m[1] : String(texto).trim().toUpperCase();
}

function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/^[a-z](\([a-z]\))?=/, '');
}

// ---------- aula interativa: texto por parte → visualizações → jogos ----------

export async function gerarArtigoSecao(llm, entrada, plano, secao, material, slides) {
  validarSecao(secao);
  const { dados, provedor } = await llm.gerarJSON({
    ...promptArtigo(entrada, plano, secao, material, slides),
    tarefa: 'artigo',
    temperatura: 0.5,
    perfil: SECOES_COM_CONTAS.includes(secao) ? 'matematica' : 'texto',
  });
  const artigo = validarArtigoSecao(secao, dados);
  if (!artigo.paragrafos.length && !artigo.exemplos.length && !artigo.exercicios.length) {
    throw new Error('Texto vazio para esta parte.');
  }
  return { artigo, provedor };
}

export async function gerarVisualizacoes(llm, entrada, plano, visao) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptVisualizacoes(entrada, plano, visao),
    tarefa: 'visualizacoes',
    temperatura: 0.3,
    perfil: 'matematica',
  });
  return { visualizacoes: validarVisualizacoes(dados.visualizacoes), provedor };
}

export async function gerarJogos(llm, entrada, plano, visao) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptJogos(entrada, plano, visao),
    tarefa: 'jogos',
    temperatura: 0.4,
    perfil: 'matematica',
  });
  const jogos = validarJogos(dados);
  if (!jogos.quiz.length && !jogos.verdadeiro_falso.length && !jogos.desafios.length) throw new Error('Nenhuma atividade gerada.');
  return { jogos, provedor };
}

// ---------- bimestre ----------

export async function gerarSequencia(llm, { serie, bimestre, conteudos, quantidade }) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptSequencia({ serie, bimestre, conteudos, quantidade }),
    tarefa: 'sequencia',
    temperatura: 0.4,
    perfil: 'texto',
  });
  const texto = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const itens = (Array.isArray(dados.itens) ? dados.itens : [])
    .map((i) => ({ assunto: texto(i?.assunto, 150), objetivo: texto(i?.objetivo, 300), observacoes: texto(i?.observacoes, 600) }))
    .filter((i) => i.assunto)
    .slice(0, 20)
    .map((i, k) => ({ ordem: k + 1, ...i, aula_id: null }));
  if (!itens.length) throw new Error('A sequência veio vazia.');
  return { titulo: texto(dados.titulo, 120) || 'Sequência didática', itens, provedor };
}

/** Planejamento detalhado do bimestre: só códigos BNCC da lista oficial, listas limpas e com tamanho limitado. */
export async function gerarPlanejamento(llm, { serie, bimestre, conteudos, itens }, bncc) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptPlanejamento({ serie, bimestre, conteudos, itens, bncc }),
    tarefa: 'planejamento',
    temperatura: 0.3,
    perfil: 'texto',
  });
  return { planejamento: validarPlanejamento(dados, bncc), provedor };
}

export function validarPlanejamento(dados, bncc) {
  const texto = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const lista = (v, n, max) => (Array.isArray(v) ? v : []).map((x) => texto(x, n)).filter(Boolean).slice(0, max);
  const habilidades = conferirBncc(dados?.habilidades, bncc, 10);
  const conteudos = (Array.isArray(dados?.conteudos) ? dados.conteudos : [])
    .map((c) => ({ tema: texto(c?.tema, 120), topicos: lista(c?.topicos, 160, 12) }))
    .filter((c) => c.tema)
    .slice(0, 8);
  const competenciasGerais = [...new Set((Array.isArray(dados?.competencias_gerais) ? dados.competencias_gerais : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10))].sort((a, b) => a - b);
  const planejamento = {
    ementa: texto(dados?.ementa, 600),
    habilidades,
    competencias_especificas: [...new Set(habilidades.map((h) => h.competencia).filter(Boolean))].sort((a, b) => a - b),
    objetivos: lista(dados?.objetivos, 300, 15),
    conteudos,
    competencias_gerais: competenciasGerais,
    avaliacao: lista(dados?.avaliacao, 300, 6),
    recuperacao: texto(dados?.recuperacao, 400),
  };
  if (!planejamento.objetivos.length || !planejamento.conteudos.length) throw new Error('O planejamento veio sem objetivos ou conteúdos.');
  return planejamento;
}

// ---------- regerar só uma parte ----------

export async function regerarSlide(llm, entrada, slide, material, pedido) {
  if (!['conteudo', 'exemplo', 'exercicio'].includes(slide?.tipo)) throw new ErroEntrada('Este slide não pode ser regerado.');
  const { dados, provedor } = await llm.gerarJSON({
    ...promptRegerarSlide(entrada, slide, material, pedido),
    tarefa: 'regerar-slide',
    temperatura: 0.7,
    perfil: slide.tipo === 'conteudo' ? 'texto' : 'matematica',
  });
  const [novo] = normalizarSlidesDaSecao(slide.secao, [{ ...dados.slide, tipo: slide.tipo }]);
  if (!novo) throw new Error('A IA não devolveu um slide válido.');
  return { slide: novo, provedor };
}

export async function regerarQuestao(llm, entrada, questao, pedido) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptRegerarQuestao(entrada, questao, pedido),
    tarefa: 'regerar-questao',
    temperatura: 0.7,
    perfil: 'matematica',
  });
  const q = dados.questao;
  if (!q?.enunciado) throw new Error('A IA não devolveu uma questão válida.');
  const alternativas = Array.isArray(q.alternativas) ? q.alternativas.map(String).slice(0, 5) : [];
  if (questao.tipo === 'multipla' && alternativas.length < 2) throw new Error('Questão sem alternativas.');
  return {
    questao: {
      ...questao,
      enunciado: String(q.enunciado),
      nivel: q.nivel || questao.nivel,
      alternativas: questao.tipo === 'multipla' ? alternativas : [],
      resposta: String(q.resposta ?? ''),
      resolucao: Array.isArray(q.resolucao) ? q.resolucao.map(String) : [],
      verificacao: undefined,
    },
    provedor,
  };
}
