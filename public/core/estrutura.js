// Estrutura padrão de toda aula do Proff.
// A IA escreve o conteúdo de cada parte; a ordem, os divisores de seção e as
// correções são feitos aqui, por código, sempre do mesmo jeito.

export const SECOES = [
  {
    id: 'introducao',
    numero: 1,
    titulo: 'Introdução',
    subtitulo: 'Para começar: onde esse assunto aparece?',
    etapa: 'Introdução ao assunto',
    instrucoes:
      'Desperte a curiosidade: uma situação do cotidiano ou pergunta provocadora, um pouco de história ou curiosidade sobre o tema, e onde ele aparece na vida real. Ainda sem fórmulas.',
  },
  {
    id: 'teoria',
    numero: 2,
    titulo: 'Entendendo a ideia',
    subtitulo: 'A teoria em palavras simples, antes das fórmulas',
    etapa: 'Explanação teórica',
    instrucoes:
      'Explique os conceitos de forma didática e simples: definições em linguagem do dia a dia, analogias, intuição visual e vocabulário novo explicado. NÃO use fórmulas nesta parte (no máximo números simples). Use o campo "destaque" para a ideia-chave do slide.',
  },
  {
    id: 'formulas',
    numero: 3,
    titulo: 'Fórmulas',
    subtitulo: 'Escrevendo a ideia em linguagem matemática',
    etapa: 'Fórmulas e propriedades',
    instrucoes:
      'Agora sim apresente as fórmulas, ligando cada uma à ideia explicada na teoria. Coloque a fórmula no campo "formula" e use os tópicos para explicar o significado de cada letra/termo e quando usar.',
  },
  {
    id: 'aplicacoes',
    numero: 4,
    titulo: 'Aplicações',
    subtitulo: 'Usando o que aprendemos',
    etapa: 'Aplicações e exemplos resolvidos',
    instrucoes:
      'Exemplos resolvidos passo a passo (tipo "exemplo"), começando por um direto e indo para um contextualizado em situação real.',
  },
  {
    id: 'pratica',
    numero: 5,
    titulo: 'Hora de praticar',
    subtitulo: 'Exercícios para a turma',
    etapa: 'Prática',
    instrucoes: 'Exercícios para a turma resolver (tipo "exercicio"), do mais fácil para o mais desafiador, com a resposta.',
  },
];

export const FECHAMENTO = { id: 'fechamento', etapa: 'Fechamento' };

const ORDEM = ['abertura', ...SECOES.map((s) => s.id), FECHAMENTO.id];
const QUANTIDADE = { introducao: '1 a 2', teoria: '2 a 4', formulas: '1 a 3', aplicacoes: '2 a 3', pratica: '2' };

/** Texto do roteiro usado nos prompts (plano e slides). */
export function roteiroParaPrompt() {
  return SECOES.map(
    (s) => `${s.numero}. ${s.etapa} (secao "${s.id}", ${QUANTIDADE[s.id]} slides): ${s.instrucoes}`
  ).join('\n');
}

/** Nomes das etapas do plano, na ordem. */
export const ETAPAS_DO_PLANO = [...SECOES.map((s) => s.etapa), FECHAMENTO.etapa];

/** Descobre a seção de um slide quando a IA não informou ou informou errado. */
function secaoDoSlide(s) {
  if (s.tipo === 'capa') return 'abertura';
  if (s.tipo === 'resumo') return FECHAMENTO.id;
  if (ORDEM.includes(s.secao) && s.secao !== 'abertura' && s.secao !== FECHAMENTO.id) {
    // exemplo e exercício têm lugar certo, mesmo que a IA erre a seção
    if (s.tipo === 'exercicio') return 'pratica';
    if (s.tipo === 'exemplo' && (s.secao === 'introducao' || s.secao === 'teoria')) return 'aplicacoes';
    return s.secao;
  }
  if (s.tipo === 'exemplo') return 'aplicacoes';
  if (s.tipo === 'exercicio') return 'pratica';
  if (s.formula) return 'formulas';
  return 'teoria';
}

/**
 * Organiza a aula no padrão: capa, Introdução, Teoria, Fórmulas, Aplicações,
 * Prática e Resumo, com um slide divisor no início de cada parte.
 * Mantém a ordem original dentro de cada parte.
 */
export function organizarAula(deck) {
  const originais = (deck?.slides || []).filter((s) => s && s.tipo !== 'secao');
  const comSecao = originais.map((s, i) => ({ ...s, secao: secaoDoSlide(s), _i: i }));

  if (!comSecao.some((s) => s.tipo === 'capa')) {
    comSecao.unshift({ tipo: 'capa', titulo: deck?.titulo || 'Aula', secao: 'abertura', _i: -1 });
  }

  comSecao.sort((a, b) => ORDEM.indexOf(a.secao) - ORDEM.indexOf(b.secao) || a._i - b._i);

  const slides = [];
  let anterior = null;
  for (const { _i, ...s } of comSecao) {
    const secao = SECOES.find((x) => x.id === s.secao);
    if (secao && s.secao !== anterior) {
      slides.push({ tipo: 'secao', secao: secao.id, numero: secao.numero, titulo: secao.titulo, subtitulo: secao.subtitulo });
    }
    slides.push(s);
    anterior = s.secao;
  }
  return { ...deck, slides };
}

const TIPO_PERMITIDO = {
  introducao: ['conteudo'],
  teoria: ['conteudo'],
  formulas: ['conteudo'],
  aplicacoes: ['exemplo', 'conteudo'],
  pratica: ['exercicio'],
};

/** Limpa os slides de uma parte vindos da IA (tipo, campos e seção). */
export function normalizarSlidesDaSecao(secaoId, slides) {
  return (Array.isArray(slides) ? slides : [])
    .filter((s) => s && typeof s === 'object' && s.titulo)
    .map((s) => {
      const tipo = TIPO_PERMITIDO[secaoId].includes(s.tipo) ? s.tipo : TIPO_PERMITIDO[secaoId][0];
      const limpo = { ...s, tipo, secao: secaoId };
      if (Array.isArray(limpo.topicos)) limpo.topicos = limpo.topicos.slice(0, 4);
      if (secaoId === 'introducao' || secaoId === 'teoria') delete limpo.formula; // teoria sem fórmulas
      if (tipo === 'exercicio' && !limpo.enunciado) limpo.enunciado = (limpo.topicos || []).join(' ');
      return limpo;
    });
}

/**
 * Resumo montado por código (sem chamar a IA): as fórmulas principais e as
 * ideias-chave da teoria; se faltar, os objetivos do plano.
 */
export function resumoAutomatico(secoes, plano) {
  const formulas = (secoes.formulas || []).filter((s) => s.formula).map((s) => `$${s.formula}$`);
  const ideias = [...(secoes.teoria || []), ...(secoes.introducao || [])].map((s) => s.destaque).filter(Boolean);
  let topicos = [...formulas.slice(0, 2), ...ideias].slice(0, 4);
  if (topicos.length < 2) topicos = [...topicos, ...(plano?.objetivos || [])].slice(0, 4);
  return { tipo: 'resumo', titulo: 'Resumo', topicos, notas: plano?.tarefa_casa ? `Tarefa de casa: ${plano.tarefa_casa}` : '' };
}

/**
 * Junta as partes geradas em uma apresentação completa:
 * capa (código) + partes (IA) + resumo (código), com divisores e ordem padrão.
 * @param {object} secoes  { introducao: [slides], teoria: [...], ... }
 */
export function montarApresentacao(plano, secoes, entrada) {
  const capa = {
    tipo: 'capa',
    titulo: plano?.titulo || entrada.assunto,
    subtitulo: `${entrada.serie}º ano do Ensino Médio`,
    notas: (plano?.objetivos || []).length ? `Objetivos: ${plano.objetivos.join('; ')}` : '',
  };
  const meio = SECOES.flatMap((s) => secoes[s.id] || []);
  return organizarAula({ titulo: capa.titulo, slides: [capa, ...meio, resumoAutomatico(secoes, plano)] });
}
