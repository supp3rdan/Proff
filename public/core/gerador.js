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
} from './prompts.js?v=__VERSAO__';
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

  if (!['1', '2', '3'].includes(serie)) throw new ErroEntrada('Escolha a série (1º, 2º ou 3º ano).');
  if (!assunto) throw new ErroEntrada('Informe o assunto.');
  if (assunto.length > 150) throw new ErroEntrada('O assunto deve ter no máximo 150 caracteres.');
  if (observacoes.length > 1500) throw new ErroEntrada('As observações devem ter no máximo 1500 caracteres.');

  return { serie, assunto, observacoes };
}

// ---------- plano: visão geral → plano ----------

export async function gerarVisaoGeral(llm, entrada) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptVisaoGeral(entrada), tarefa: 'visao', temperatura: 0.4, perfil: 'texto' });
  return { visao: dados, provedor };
}

export async function gerarPlano(llm, entrada, visao) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptPlano(entrada, visao), tarefa: 'plano', perfil: 'texto' });
  if (!Array.isArray(dados.etapas)) throw new Error('Plano gerado sem etapas.');
  return { plano: dados, provedor };
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
export async function conferirProva(llm, questoes) {
  const copia = structuredClone(questoes);
  try {
    const verificacao = await verificarGabarito(llm, copia);
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

async function verificarGabarito(llm, questoes) {
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

  if (discursivas.length) {
    const { dados: comp } = await llm.gerarJSON({
      ...promptComparar(discursivas),
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
  return { concluida: true, provedor, revisar };
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
