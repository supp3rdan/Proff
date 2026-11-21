// Aula interativa: catálogo de visualizações e jogos, e validação do que a IA devolver.
// A IA só escolhe um item do catálogo e preenche parâmetros; quem desenha e anima
// é o código da página (public/interativa/runtime.js). Nada da IA vira código.

import { compilarExpressao } from './expressao.js?v=__VERSAO__';
import { SECOES } from './estrutura.js?v=__VERSAO__';

const IDS_SECOES = SECOES.map((s) => s.id);

/** Catálogo enviado no prompt: o que existe e quais parâmetros cada item aceita. */
export const CATALOGO_VISUALIZACOES = `
- "funcao": gráfico de função com controles deslizantes. params: { "expressao": "a*x+b" (use x e parâmetros de UMA letra; operadores + - * / ^; funções sin cos tan sqrt abs log ln exp), "parametros": [{ "nome": "a", "rotulo": "coeficiente a", "min": -5, "max": 5, "passo": 0.5, "valor": 1 }] (até 3), "x_min": -10, "x_max": 10 }
- "barras": gráfico de barras (estatística, porcentagem, comparação). params: { "rotulos": ["A","B"], "valores": [3,5], "unidade": "alunos" } (2 a 10 barras)
- "sequencia": PA ou PG com controles. params: { "tipo": "PA" | "PG", "primeiro": 2, "razao": 3, "termos": 8 }
- "triangulo": triângulo retângulo com ângulo ajustável, mostrando seno, cosseno e tangente. params: { "angulo": 30 }
- "probabilidade": simulador de lançamentos. params: { "experimento": "moeda" | "dado" | "dois_dados" }
- "geometria": figura com medidas ajustáveis, mostrando área e perímetro. params: { "figura": "retangulo" | "quadrado" | "triangulo" | "circulo" }`;

const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
const texto = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const lista = (v) => (Array.isArray(v) ? v : []);

function validarFuncao(p) {
  const parametros = lista(p.parametros)
    .slice(0, 3)
    .map((q) => {
      const nome = texto(q?.nome, 1).toLowerCase();
      let min = num(q?.min, -5);
      let max = num(q?.max, 5);
      if (min >= max) [min, max] = [-5, 5];
      const passo = limitar(Math.abs(num(q?.passo, (max - min) / 20)) || (max - min) / 20, (max - min) / 200, max - min);
      return { nome, rotulo: texto(q?.rotulo, 40) || nome, min, max, passo, valor: limitar(num(q?.valor, (min + max) / 2), min, max) };
    })
    .filter((q) => /^[a-df-wyz]$/.test(q.nome)); // uma letra, sem x e sem e

  const expressao = texto(p.expressao, 120);
  let compilada;
  try {
    compilada = compilarExpressao(expressao);
  } catch {
    return null;
  }
  const permitidas = new Set(['x', ...parametros.map((q) => q.nome)]);
  if (!compilada.variaveis.includes('x') || compilada.variaveis.some((v) => !permitidas.has(v))) return null;

  let xMin = num(p.x_min, -10);
  let xMax = num(p.x_max, 10);
  if (xMin >= xMax || xMax - xMin > 1000) [xMin, xMax] = [-10, 10];

  // precisa dar valores finitos em boa parte do intervalo
  const valores = Object.fromEntries(parametros.map((q) => [q.nome, q.valor]));
  let finitos = 0;
  for (let i = 0; i <= 40; i++) {
    if (Number.isFinite(compilada.avaliar({ ...valores, x: xMin + ((xMax - xMin) * i) / 40 }))) finitos++;
  }
  if (finitos < 10) return null;
  return { expressao, parametros, x_min: xMin, x_max: xMax };
}

function validarBarras(p) {
  const rotulos = lista(p.rotulos).map((r) => texto(String(r ?? ''), 30));
  const valores = lista(p.valores).map((v) => num(v, NaN));
  const n = Math.min(rotulos.length, valores.length, 10);
  if (n < 2 || valores.slice(0, n).some((v) => !Number.isFinite(v))) return null;
  return { rotulos: rotulos.slice(0, n), valores: valores.slice(0, n), unidade: texto(p.unidade, 20) };
}

function validarSequencia(p) {
  const tipo = String(p.tipo).toUpperCase() === 'PG' ? 'PG' : 'PA';
  return {
    tipo,
    primeiro: limitar(num(p.primeiro, 1), -50, 50),
    razao: tipo === 'PG' ? limitar(num(p.razao, 2), -5, 5) : limitar(num(p.razao, 2), -20, 20),
    termos: Math.round(limitar(num(p.termos, 8), 3, 12)),
  };
}

const VALIDADORES = {
  funcao: validarFuncao,
  barras: validarBarras,
  sequencia: validarSequencia,
  triangulo: (p) => ({ angulo: limitar(num(p.angulo, 30), 5, 85) }),
  probabilidade: (p) => ({ experimento: ['moeda', 'dado', 'dois_dados'].includes(p.experimento) ? p.experimento : 'dado' }),
  geometria: (p) => ({ figura: ['retangulo', 'quadrado', 'triangulo', 'circulo'].includes(p.figura) ? p.figura : 'retangulo' }),
};

/** Mantém só visualizações válidas do catálogo (no máximo 3). */
export function validarVisualizacoes(lista_) {
  return lista(lista_)
    .map((v) => {
      const validar = VALIDADORES[v?.tipo];
      const params = validar ? validar(v.params || {}) : null;
      if (!params) return null;
      return {
        tipo: v.tipo,
        titulo: texto(v.titulo, 80) || 'Explore',
        explicacao: texto(v.explicacao, 300),
        secao: IDS_SECOES.includes(v.secao) ? v.secao : 'formulas',
        params,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

/** Valida os jogos de fixação. */
export function validarJogos(j = {}) {
  const quiz = lista(j.quiz)
    .map((q) => {
      const alternativas = lista(q?.alternativas).map((a) => texto(String(a ?? ''), 200)).filter(Boolean).slice(0, 5);
      const correta = Math.round(num(q?.correta, -1));
      if (!texto(q?.pergunta) || alternativas.length < 2 || correta < 0 || correta >= alternativas.length) return null;
      return { pergunta: texto(q.pergunta), alternativas, correta, explicacao: texto(q.explicacao) };
    })
    .filter(Boolean)
    .slice(0, 8);

  const verdadeiroFalso = lista(j.verdadeiro_falso)
    .map((v) => (texto(v?.afirmacao) && typeof v.verdadeiro === 'boolean'
      ? { afirmacao: texto(v.afirmacao), verdadeiro: v.verdadeiro, explicacao: texto(v.explicacao) }
      : null))
    .filter(Boolean)
    .slice(0, 6);

  const pares = lista(j.pares)
    .map((p) => (texto(p?.termo, 120) && texto(p?.significado, 200) ? { termo: texto(p.termo, 120), significado: texto(p.significado, 200) } : null))
    .filter(Boolean)
    .slice(0, 6);

  const desafios = lista(j.desafios)
    .map((d) => {
      const resposta = num(d?.resposta, NaN);
      if (!texto(d?.pergunta) || !Number.isFinite(resposta)) return null;
      return { pergunta: texto(d.pergunta), resposta, tolerancia: Math.abs(num(d.tolerancia, 0.01)), dica: texto(d.dica) };
    })
    .filter(Boolean)
    .slice(0, 4);

  return { quiz, verdadeiro_falso: verdadeiroFalso, pares: pares.length >= 3 ? pares : [], desafios };
}

const TIPOS_CAIXA = ['dica', 'atencao', 'curiosidade', 'definicao'];

/** Valida o texto de uma parte do artigo. */
export function validarArtigoSecao(secaoId, a = {}) {
  return {
    secao: secaoId,
    titulo: texto(a.titulo, 100),
    paragrafos: lista(a.paragrafos).map((p) => texto(p, 900)).filter(Boolean).slice(0, 8),
    caixas: lista(a.caixas)
      .map((c) => (TIPOS_CAIXA.includes(c?.tipo) && texto(c.texto) ? { tipo: c.tipo, titulo: texto(c.titulo, 60), texto: texto(c.texto, 500) } : null))
      .filter(Boolean)
      .slice(0, 3),
    formulas: lista(a.formulas)
      .map((f) => (texto(f?.latex, 200) ? { latex: texto(f.latex, 200), explicacao: texto(f.explicacao, 400) } : null))
      .filter(Boolean)
      .slice(0, 4),
    exemplos: lista(a.exemplos)
      .map((e) => (texto(e?.enunciado)
        ? { enunciado: texto(e.enunciado), passos: lista(e.passos).map((p) => texto(p, 300)).filter(Boolean).slice(0, 8), resposta: texto(e.resposta, 200) }
        : null))
      .filter(Boolean)
      .slice(0, 3),
    exercicios: lista(a.exercicios)
      .map((e) => (texto(e?.enunciado) ? { enunciado: texto(e.enunciado), resposta: texto(e.resposta, 300), dica: texto(e.dica, 300) } : null))
      .filter(Boolean)
      .slice(0, 4),
  };
}

const ICONES = { introducao: '🚀', teoria: '💡', formulas: '📐', aplicacoes: '🧩', pratica: '✏️' };

/**
 * Reúne tudo o que a página precisa (código, sem IA): dados da aula, partes do
 * artigo, visualizações, jogos e conclusão (a partir do resumo dos slides).
 */
export function dadosDaPagina({ entrada, plano, visao, deck, interativa }) {
  const resumo = (deck?.slides || []).find((s) => s.tipo === 'resumo');
  return {
    meta: {
      titulo: plano?.titulo || entrada.assunto,
      assunto: entrada.assunto,
      serie: `${entrada.serie}º ano do Ensino Médio`,
      duracao: plano?.duracao || '',
      gerado_em: new Date().toISOString().slice(0, 10),
    },
    resumo: visao?.resumo || '',
    objetivos: plano?.objetivos || [],
    prerequisitos: visao?.prerequisitos || plano?.conhecimentos_previos || [],
    secoes: SECOES.map((s) => ({
      id: s.id,
      numero: s.numero,
      icone: ICONES[s.id],
      rotulo: s.titulo,
      artigo: interativa?.secoes?.[s.id] || null,
    })).filter((s) => s.artigo),
    visualizacoes: interativa?.visualizacoes || [],
    jogos: interativa?.jogos || { quiz: [], verdadeiro_falso: [], pares: [], desafios: [] },
    conclusao: {
      topicos: resumo?.topicos || [],
      tarefa: plano?.tarefa_casa || '',
    },
  };
}
