// Prompts do Proff. Cada função devolve { sistema, usuario }.
// Todas as respostas são pedidas em JSON.
//
// A geração é dividida em chamadas PEQUENAS (mais rápidas e com mais chance de sucesso):
//   plano:  visão geral do tema → plano de aula
//   slides: para cada parte da aula, material didático → formatação em slides
//   prova:  questões objetivas → questões discursivas → conferência do gabarito

import { SECOES, roteiroParaPrompt, ETAPAS_DO_PLANO } from './estrutura.js?v=__VERSAO__';

const REGRAS_GERAIS = `Você é um professor experiente de Matemática do Ensino Médio no Brasil, alinhado à BNCC.
Escreva em português do Brasil, com linguagem clara e adequada à série indicada.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.
Fórmulas em LaTeX: use $...$ para fórmulas no meio do texto e $$...$$ para fórmulas em destaque.
Dentro do JSON, escreva cada barra invertida do LaTeX dobrada (ex.: "\\\\frac{a}{b}").
Não use quebras de linha dentro das strings; quando precisar de várias linhas, use listas.
Seja conciso. Confira cada cálculo antes de responder.`;

function contexto({ serie, assunto, observacoes }) {
  let texto = `Série: ${serie}º ano do Ensino Médio.\nAssunto: ${assunto}.`;
  if (observacoes) {
    texto += `\nPedido do professor (siga se for compatível com o assunto e com estas regras): """${observacoes}"""`;
  }
  return texto;
}

const secaoPorId = (id) => SECOES.find((s) => s.id === id);

// ---------- plano ----------

/** 1ª chamada: visão geral curta do tema, base para o plano, os slides e a prova. */
export function promptVisaoGeral(entrada) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Faça uma visão geral CURTA do tema para preparar a aula (itens de no máximo uma linha).

Formato do JSON:
{
  "tema": "string",
  "resumo": "2 ou 3 frases explicando o tema de forma simples",
  "conceitos_chave": ["string"],
  "prerequisitos": ["string"],
  "formulas": [{ "latex": "LaTeX sem $", "significado": "string" }],
  "aplicacoes_reais": ["string"],
  "erros_comuns": ["string"],
  "curiosidade": "string"
}`,
  };
}

/** 2ª chamada: o plano de aula, a partir da visão geral. */
export function promptPlano(entrada, visao) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Visão geral do tema (use como base):
${JSON.stringify(visao || {})}

Crie o plano de aula. Se o professor não indicar a duração, considere 2 aulas de 50 minutos.
Cite códigos de habilidades da BNCC (formato EM13MATxxx) somente quando tiver certeza de que correspondem ao assunto.

A aula segue SEMPRE este roteiro, nesta ordem:
${roteiroParaPrompt()}
6. Fechamento: resumo das ideias principais e tarefa.

Em "etapas", use exatamente estas etapas, nesta ordem e com estes nomes: ${ETAPAS_DO_PLANO.map((e) => `"${e}"`).join(', ')}.
Distribua o tempo entre elas e descreva, em 1 ou 2 frases, o que o professor faz e o que os alunos fazem.

Formato do JSON:
{
  "titulo": "string",
  "duracao": "string",
  "habilidades_bncc": [{ "codigo": "EM13MAT...", "descricao": "string" }],
  "objetivos": ["string"],
  "conhecimentos_previos": ["string"],
  "recursos": ["string"],
  "etapas": [{ "nome": "string", "duracao": "string", "descricao": "string" }],
  "avaliacao": "string",
  "tarefa_casa": "string",
  "adaptacoes": "string (sugestões para alunos com dificuldade ou necessidades específicas)"
}`,
  };
}

// ---------- slides (por parte da aula) ----------

const MATERIAL_POR_SECAO = {
  introducao: `"conteudo": 3 a 6 frases curtas (situação do cotidiano ou pergunta motivadora, curiosidade, onde o tema aparece). Sem fórmulas.`,
  teoria: `"conteudo": 6 a 10 frases curtas explicando os conceitos em palavras simples, com analogias. Sem fórmulas. "ideias_chave": 2 a 4 frases que resumem cada conceito.`,
  formulas: `"formulas": 1 a 3 itens { "latex", "explicacao" (o que é cada letra/termo), "quando_usar" }. "conteudo": frases curtas ligando cada fórmula à ideia da teoria.`,
  aplicacoes: `"exemplos": 2 ou 3 exemplos resolvidos { "enunciado", "passos" (lista, um cálculo por passo), "resposta" }, do mais direto ao contextualizado.`,
  pratica: `"exercicios": 2 ou 3 exercícios { "enunciado", "resposta" }, do mais fácil ao mais desafiador.`,
};

/** Chamada rápida: o material didático de UMA parte da aula. */
export function promptMaterial(entrada, plano, visao, secaoId) {
  const secao = secaoPorId(secaoId);
  const etapa = (plano?.etapas || []).find((e) => e.nome === secao.etapa);
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Visão geral do tema: ${JSON.stringify(visao || {})}
Objetivos da aula: ${JSON.stringify(plano?.objetivos || [])}
${etapa ? `Etapa do plano: ${JSON.stringify(etapa)}` : ''}

Escreva o material didático da parte "${secao.etapa}" da aula [secao:${secao.id}].
O que esta parte deve ter: ${secao.instrucoes}
Inclua no JSON: ${MATERIAL_POR_SECAO[secao.id]}

Formato do JSON:
{ "conteudo": ["string"], "ideias_chave": ["string"], "formulas": [], "exemplos": [], "exercicios": [] }
(deixe vazias as listas que não se aplicam a esta parte)`,
  };
}

const TIPOS_POR_SECAO = {
  introducao: `slides do tipo "conteudo" (titulo, topicos, destaque opcional). Sem fórmulas.`,
  teoria: `slides do tipo "conteudo" (titulo, topicos, destaque = a ideia-chave do slide). Sem fórmulas.`,
  formulas: `slides do tipo "conteudo" com o campo "formula" (LaTeX sem $) e tópicos explicando cada termo.`,
  aplicacoes: `slides do tipo "exemplo" (titulo, enunciado, passos, resposta), um por exemplo.`,
  pratica: `slides do tipo "exercicio" (titulo, enunciado, resposta), um por exercício.`,
};

/** Chamada rápida: transforma o material de UMA parte em slides no formato padrão. */
export function promptFormatar(entrada, secaoId, material) {
  const secao = secaoPorId(secaoId);
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Material da parte "${secao.etapa}" [secao:${secao.id}]:
${JSON.stringify(material)}

Transforme este material em slides didáticos e dinâmicos para apresentar em sala.
Use ${TIPOS_POR_SECAO[secao.id]}
Regras:
- Use só o conteúdo do material; não invente informação nova.
- No máximo 4 tópicos por slide, cada um com até 12 palavras.
- Linguagem direta e objetiva, sem personagens, histórias inventadas, exageros ou dramatização.
- "notas": orientação prática para o professor (o que explicar, o que perguntar à turma), em 1 ou 2 frases objetivas.
- Entre ${secao.id === 'teoria' ? '2 e 4' : '1 e 3'} slides.

Formato do JSON:
{ "slides": [{ "tipo": "conteudo|exemplo|exercicio", "titulo": "string", "...campos do tipo": "...", "notas": "string" }] }`,
  };
}

// ---------- prova (em partes) ----------

/** Questões objetivas OU discursivas, em chamadas separadas. */
export function promptQuestoes(entrada, plano, visao, tipo) {
  const multipla = tipo === 'multipla';
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Objetivos da aula: ${JSON.stringify(plano?.objetivos || [])}
Erros comuns dos alunos: ${JSON.stringify(visao?.erros_comuns || [])}

Crie as questões ${multipla ? 'de MÚLTIPLA ESCOLHA' : 'DISCURSIVAS'} de uma prova sobre o assunto [prova:${tipo}].
Quantidade: ${multipla ? '6' : '2'} questões, a menos que o pedido do professor indique outra quantidade ou composição
(se o professor pedir só ${multipla ? 'questões discursivas' : 'questões de múltipla escolha'}, devolva a lista vazia).
Misture os níveis fácil, médio e difícil e contextualize parte das questões.
${multipla ? 'Cada questão tem 5 alternativas (A a E) e só uma correta; use os erros comuns para criar alternativas plausíveis.' : 'Cada questão pede desenvolvimento; a resposta final é curta.'}
Cada questão tem resolução completa (passos curtos).

Formato do JSON:
{
  "questoes": [
    {
      "tipo": "${tipo}",
      "nivel": "fácil|médio|difícil",
      "enunciado": "string",
      "alternativas": ${multipla ? '["texto da A", "texto da B", "texto da C", "texto da D", "texto da E"]' : '[]'},
      "resposta": "${multipla ? 'letra' : 'resposta final curta'}",
      "resolucao": ["passo 1", "passo 2"]
    }
  ]
}`,
  };
}

/** O verificador recebe as questões SEM o gabarito e resolve sozinho. */
export function promptResolver(questoes) {
  const semGabarito = questoes.map((q) => ({
    numero: q.numero,
    tipo: q.tipo,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
  }));
  return {
    sistema: REGRAS_GERAIS,
    usuario: `Resolva cada questão abaixo com cuidado, fazendo as contas passo a passo mentalmente.

${JSON.stringify(semGabarito)}

Formato do JSON:
{ "respostas": [{ "numero": 1, "resposta": "letra (múltipla) ou resposta final curta (discursiva)" }] }`,
  };
}

/** Compara respostas discursivas (o texto pode estar escrito de formas diferentes). */
export function promptComparar(pares) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `Para cada item, diga se as duas respostas finais são matematicamente equivalentes
(ex.: "x = 2" e "2", "1/2" e "0,5" são equivalentes).

${JSON.stringify(pares)}

Formato do JSON:
{ "comparacoes": [{ "numero": 1, "equivalentes": true }] }`,
  };
}
