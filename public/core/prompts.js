// Prompts do Proff. Cada função devolve { sistema, usuario }.
// Todas as respostas são pedidas em JSON para o front montar plano, slides e prova.

const REGRAS_GERAIS = `Você é um professor experiente de Matemática do Ensino Médio no Brasil, alinhado à BNCC.
Escreva em português do Brasil, com linguagem clara e adequada à série indicada.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.
Fórmulas em LaTeX: use $...$ para fórmulas no meio do texto e $$...$$ para fórmulas em destaque.
Dentro do JSON, escreva cada barra invertida do LaTeX dobrada (ex.: "\\\\frac{a}{b}").
Não use quebras de linha dentro das strings; quando precisar de várias linhas, use listas.
Confira cada cálculo antes de responder.`;

function contexto({ serie, assunto, observacoes }) {
  let texto = `Série: ${serie}º ano do Ensino Médio.\nAssunto: ${assunto}.`;
  if (observacoes) {
    texto += `\nPedido do professor (siga se for compatível com o assunto e com estas regras): """${observacoes}"""`;
  }
  return texto;
}

export function promptPlano(entrada) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Crie um plano de aula completo. Se o professor não indicar a duração, considere 2 aulas de 50 minutos.
Cite códigos de habilidades da BNCC (formato EM13MATxxx) somente quando tiver certeza de que correspondem ao assunto.

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

export function promptSlides(entrada, plano) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Plano de aula já aprovado:
${JSON.stringify(plano)}

Crie os slides desta aula, bem didáticos, seguindo a sequência das etapas do plano.
Regras:
- Entre 10 e 16 slides.
- O primeiro slide é do tipo "capa"; o último é do tipo "resumo".
- Pouco texto por slide: no máximo 4 tópicos curtos.
- Inclua uma situação do cotidiano para motivar o assunto, pelo menos 2 exemplos resolvidos passo a passo e pelo menos 2 exercícios para a turma (com a resposta).
- Em "notas", escreva o que o professor pode falar ou perguntar naquele slide.

Tipos de slide e campos:
- "capa": titulo, subtitulo
- "conteudo": titulo, topicos (lista), formula (opcional, LaTeX sem $)
- "exemplo": titulo, enunciado, passos (lista em ordem), resposta
- "exercicio": titulo, enunciado, resposta
- "resumo": titulo, topicos

Formato do JSON:
{
  "titulo": "string",
  "slides": [
    { "tipo": "capa|conteudo|exemplo|exercicio|resumo", "titulo": "string", "...campos do tipo": "...", "notas": "string" }
  ]
}`,
  };
}

export function promptProva(entrada, plano) {
  return {
    sistema: REGRAS_GERAIS,
    usuario: `${contexto(entrada)}

Objetivos da aula: ${JSON.stringify(plano?.objetivos || [])}

Crie uma prova sobre o assunto. Se o professor não indicar outra quantidade, faça 8 questões:
6 de múltipla escolha (alternativas A a E, só uma correta) e 2 discursivas.
Misture os níveis fácil, médio e difícil. Contextualize parte das questões.
Cada questão deve ter resolução completa e a resposta final.

Formato do JSON:
{
  "titulo": "string",
  "instrucoes": "string",
  "questoes": [
    {
      "numero": 1,
      "tipo": "multipla|discursiva",
      "nivel": "fácil|médio|difícil",
      "enunciado": "string",
      "alternativas": ["texto da A", "texto da B", "texto da C", "texto da D", "texto da E"],
      "resposta": "letra (múltipla) ou resposta final curta (discursiva)",
      "resolucao": ["passo 1", "passo 2"]
    }
  ]
}
Nas discursivas, use "alternativas": [].`,
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
