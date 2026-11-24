// Prompts do Proff. Cada função devolve { sistema, usuario }.
// Todas as respostas são pedidas em JSON.
//
// A geração é dividida em chamadas PEQUENAS (mais rápidas e com mais chance de sucesso):
//   plano:  visão geral do tema → plano de aula
//   slides: para cada parte da aula, material didático → formatação em slides
//   prova:  questões objetivas → questões discursivas → conferência do gabarito

import { SECOES, roteiroParaPrompt, ETAPAS_DO_PLANO } from './estrutura.js?v=__VERSAO__';
import { CATALOGO_VISUALIZACOES } from './interativa.js?v=__VERSAO__';

const REGRAS_GERAIS = `Você é um professor experiente de Matemática do Ensino Médio no Brasil, alinhado à BNCC.
Escreva em português do Brasil, com linguagem clara e adequada à série indicada.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.
Fórmulas em LaTeX: use $...$ para fórmulas no meio do texto e $$...$$ para fórmulas em destaque.
Dentro do JSON, escreva cada barra invertida do LaTeX dobrada (ex.: "\\\\frac{a}{b}").
Não use quebras de linha dentro das strings; quando precisar de várias linhas, use listas.
Seja conciso. Confira cada cálculo antes de responder.`;

// Ajustes por nível da turma (versões da mesma aula)
const NIVEIS = {
  reforco: 'REFORÇO: turma com dificuldades. Retome os pré-requisitos, use passos menores, mais exemplos simples e linguagem bem acessível.',
  avancado: 'AVANÇADO: turma com bom domínio. Aprofunde, traga desafios, problemas mais elaborados e conexões com outros conteúdos.',
  inclusao: 'INCLUSÃO (Desenho Universal para a Aprendizagem): frases curtas, uma ideia por vez, vocabulário simples, apoio visual e concreto, instruções passo a passo e mais tempo para as atividades.',
};

function contexto({ serie, assunto, observacoes, nivel }) {
  let texto = `Série: ${serie}º ano do Ensino Médio.\nAssunto: ${assunto}.`;
  if (NIVEIS[nivel]) texto += `\nNível da aula: ${NIVEIS[nivel]}`;
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
export function promptPlano(entrada, visao, { bncc = [], referencia = null } = {}) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Visão geral do tema (use como base):
${JSON.stringify(visao || {})}

Crie o plano de aula. Se o professor não indicar a duração, considere 2 aulas de 50 minutos.
${bncc.length
    ? `Em "habilidades_bncc", escolha de 1 a 3 códigos SOMENTE desta lista (os que mais combinam com o assunto):\n${bncc.map((h) => `${h.codigo}: ${h.resumo}`).join('\n')}`
    : 'Cite códigos de habilidades da BNCC (formato EM13MATxxx) somente quando tiver certeza de que correspondem ao assunto.'}
${referencia ? `\nExemplo de plano bem avaliado por professores para um assunto parecido (use como referência de qualidade, sem copiar):\n${JSON.stringify({ titulo: referencia.titulo, objetivos: referencia.objetivos, etapas: referencia.etapas })}\n` : ''}
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


// ---------- aula interativa (página HTML) ----------

const ARTIGO_POR_SECAO = {
  introducao: `"paragrafos": 2 a 3 parágrafos que contextualizam o tema e despertam curiosidade. "caixas": 1 caixa "curiosidade".`,
  teoria: `"paragrafos": 3 a 5 parágrafos explicando os conceitos em linguagem simples, com analogias, SEM fórmulas. "caixas": 1 "definicao" e 1 "dica".`,
  formulas: `"paragrafos": 1 a 2 parágrafos ligando a teoria às fórmulas. "formulas": cada fórmula com explicação de cada termo. "caixas": 1 "atencao" sobre um erro comum.`,
  aplicacoes: `"paragrafos": 1 parágrafo de introdução. "exemplos": 2 a 3 exemplos resolvidos com passos curtos (um cálculo por passo). "caixas": 1 "dica".`,
  pratica: `"paragrafos": 1 parágrafo curto. "exercicios": 3 a 4 exercícios com resposta e uma dica cada.`,
};

/** Texto de UMA parte da aula no formato de artigo-tutorial (como os de portais educacionais). */
export function promptArtigo(entrada, plano, secaoId, material, slides) {
  const secao = secaoPorId(secaoId);
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Título da aula: ${plano?.titulo || entrada.assunto}
Material desta parte [secao:${secao.id}]: ${JSON.stringify(material || {})}
Slides desta parte (resumo do que foi apresentado): ${JSON.stringify((slides || []).map((s) => ({ titulo: s.titulo, topicos: s.topicos, destaque: s.destaque, formula: s.formula })))}

Escreva a parte "${secao.titulo}" de uma AULA ONLINE em formato de artigo-tutorial, para o aluno ler sozinho.
Use o material e os slides como base e aprofunde a explicação, sem inventar conteúdo fora do assunto.
Linguagem clara, amigável e direta (fale com o aluno usando "você"), sem exageros nem personagens.
Inclua: ${ARTIGO_POR_SECAO[secao.id]}
Tipos de caixa: "dica", "atencao", "curiosidade", "definicao".

Formato do JSON:
{
  "titulo": "título curto e chamativo desta parte",
  "paragrafos": ["string"],
  "caixas": [{ "tipo": "dica|atencao|curiosidade|definicao", "titulo": "string", "texto": "string" }],
  "formulas": [{ "latex": "LaTeX sem $", "explicacao": "string" }],
  "exemplos": [{ "enunciado": "string", "passos": ["string"], "resposta": "string" }],
  "exercicios": [{ "enunciado": "string", "resposta": "string", "dica": "string" }]
}
(deixe vazias as listas que não se aplicam)`,
  };
}

/** Escolhe visualizações interativas do catálogo (o código da página desenha). */
export function promptVisualizacoes(entrada, plano, visao) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Título da aula: ${plano?.titulo || entrada.assunto}
Visão geral: ${JSON.stringify(visao || {})}

Escolha de 1 a 2 visualizações interativas que ajudem o aluno a ENXERGAR este assunto.
Use SOMENTE itens deste catálogo, com os parâmetros indicados:
${CATALOGO_VISUALIZACOES}

Se nenhum item fizer sentido para o assunto, devolva a lista vazia. Os valores devem ser coerentes com o assunto e a série.
Cada item tem "secao": a parte da aula onde aparece ("teoria", "formulas" ou "aplicacoes").

Formato do JSON:
{ "visualizacoes": [{ "tipo": "funcao|barras|sequencia|triangulo|probabilidade|geometria", "titulo": "string", "explicacao": "o que o aluno deve observar ao mexer (1 ou 2 frases)", "secao": "teoria|formulas|aplicacoes", "params": {} }] }`,
  };
}

/** Jogos de fixação bem simples (o código da página monta e corrige). */
export function promptJogos(entrada, plano, visao) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Título da aula: ${plano?.titulo || entrada.assunto}
Objetivos: ${JSON.stringify(plano?.objetivos || [])}
Visão geral: ${JSON.stringify(visao || {})}

Crie atividades rápidas e simples para o aluno fixar o assunto [jogos].
- "quiz": 5 perguntas de múltipla escolha (4 alternativas), "correta" é o índice da alternativa certa (0 a 3), com explicação curta.
- "verdadeiro_falso": 4 afirmações (misture verdadeiras e falsas), com explicação curta.
- "pares": 4 ou 5 pares para associar (termo ↔ significado ou fórmula ↔ nome).
- "desafios": 2 ou 3 perguntas de conta com resposta NUMÉRICA (número puro, use ponto decimal) e uma dica.
Confira cada resposta.

Formato do JSON:
{
  "quiz": [{ "pergunta": "string", "alternativas": ["a","b","c","d"], "correta": 0, "explicacao": "string" }],
  "verdadeiro_falso": [{ "afirmacao": "string", "verdadeiro": true, "explicacao": "string" }],
  "pares": [{ "termo": "string", "significado": "string" }],
  "desafios": [{ "pergunta": "string", "resposta": 12.5, "tolerancia": 0.01, "dica": "string" }]
}`,
  };
}


// ---------- planejamento do bimestre ----------

export function promptSequencia({ serie, bimestre, conteudos, quantidade }) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `Série: ${serie}º ano do Ensino Médio.${bimestre ? ` Bimestre: ${bimestre}º.` : ''}
Conteúdos do período (informados pelo professor): """${conteudos}"""

Monte uma sequência didática de ${quantidade} aulas encadeadas para esses conteúdos [sequencia].
Cada aula deve partir do que foi visto na anterior, do mais simples ao mais complexo.
Reserve a penúltima ou a última aula para revisão/avaliação quando fizer sentido.

Formato do JSON:
{
  "titulo": "título curto da sequência",
  "itens": [{ "ordem": 1, "assunto": "assunto da aula (curto, até 80 caracteres)", "objetivo": "o que o aluno aprende nesta aula", "observacoes": "como esta aula se liga à anterior e o que enfatizar" }]
}`,
  };
}

// ---------- regerar só uma parte ----------

const CAMPOS_TIPO = {
  conteudo: '"titulo", "topicos" (até 4), "destaque" (opcional), "formula" (opcional, LaTeX sem $)',
  exemplo: '"titulo", "enunciado", "passos" (lista), "resposta"',
  exercicio: '"titulo", "enunciado", "resposta"',
};

/** Novo slide no lugar de um que o professor não gostou. */
export function promptRegerarSlide(entrada, slide, material, pedido) {
  const tipo = CAMPOS_TIPO[slide.tipo] ? slide.tipo : 'conteudo';
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Material desta parte da aula: ${JSON.stringify(material || {})}
Slide atual (o professor quer uma versão melhor): ${JSON.stringify(slide)}
${pedido ? `Pedido do professor para este slide: """${pedido}"""` : 'Faça uma versão mais clara e didática.'}

Reescreva SOMENTE este slide, do tipo "${tipo}", com os campos ${CAMPOS_TIPO[tipo]} e "notas" (orientação objetiva para o professor).
Linguagem direta, no máximo 12 palavras por tópico, sem personagens nem dramatização.

Formato do JSON: { "slide": { "tipo": "${tipo}", ... } }`,
  };
}

/** Nova questão no lugar de uma que o professor não gostou. */
export function promptRegerarQuestao(entrada, questao, pedido) {
  const multipla = questao.tipo === 'multipla';
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Questão atual (o professor quer trocar): ${JSON.stringify({ enunciado: questao.enunciado, alternativas: questao.alternativas, nivel: questao.nivel })}
${pedido ? `Pedido do professor: """${pedido}"""` : 'Crie outra questão do mesmo tipo e nível, sobre o mesmo conteúdo.'}

Crie UMA questão ${multipla ? 'de múltipla escolha (5 alternativas, só uma correta)' : 'discursiva'} com resolução completa. Confira a resposta.

Formato do JSON:
{ "questao": { "tipo": "${questao.tipo}", "nivel": "fácil|médio|difícil", "enunciado": "string", "alternativas": ${multipla ? '["A","B","C","D","E"]' : '[]'}, "resposta": "${multipla ? 'letra' : 'resposta final curta'}", "resolucao": ["passo"] } }`,
  };
}
