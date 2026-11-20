// Respostas de exemplo para testar o Proff sem chave de API (LLM_MOCK=1).
// Vêm como texto com LaTeX de barra simples, igual muitos modelos respondem,
// para exercitar o reparo feito em extrairJSON.

const PLANO = String.raw`{
  "titulo": "Função afim: lei de formação e gráfico",
  "duracao": "2 aulas de 50 minutos",
  "habilidades_bncc": [
    { "codigo": "EM13MAT302", "descricao": "Construir modelos com funções polinomiais de 1º e 2º graus para resolver problemas em contextos diversos." }
  ],
  "objetivos": [
    "Reconhecer a lei de formação $f(x) = ax + b$",
    "Interpretar os coeficientes $a$ e $b$",
    "Construir e ler o gráfico da função afim"
  ],
  "conhecimentos_previos": ["Plano cartesiano", "Equações do 1º grau"],
  "recursos": ["Quadro", "Projetor", "Papel quadriculado"],
  "etapas": [
    { "nome": "Problematização", "duracao": "10 min", "descricao": "Conta de táxi: bandeirada fixa mais valor por quilômetro." },
    { "nome": "Conceito", "duracao": "25 min", "descricao": "Definição de função afim e papel dos coeficientes." },
    { "nome": "Gráfico", "duracao": "30 min", "descricao": "Construção do gráfico a partir de dois pontos." },
    { "nome": "Prática", "duracao": "30 min", "descricao": "Exercícios em duplas com correção coletiva." },
    { "nome": "Fechamento", "duracao": "5 min", "descricao": "Síntese e tarefa de casa." }
  ],
  "avaliacao": "Observação da participação e correção dos exercícios em duplas.",
  "tarefa_casa": "Pesquisar uma situação do dia a dia que possa ser modelada por uma função afim.",
  "adaptacoes": "Oferecer tabela de valores pronta para alunos com dificuldade em montar o gráfico."
}`;

const SLIDES = String.raw`{
  "titulo": "Função afim",
  "slides": [
    { "tipo": "capa", "titulo": "Função afim", "subtitulo": "1º ano do Ensino Médio", "notas": "Pergunte quem já pegou táxi ou aplicativo de transporte." },
    { "tipo": "conteudo", "titulo": "Quanto custa a corrida?", "topicos": ["Bandeirada: R$ 5,00", "Cada km: R$ 2,50", "Quanto pago por 10 km?"], "notas": "Deixe a turma tentar antes de mostrar a fórmula." },
    { "tipo": "conteudo", "titulo": "Lei de formação", "topicos": ["$a$ é a taxa de variação", "$b$ é o valor inicial", "No táxi: $a = 2{,}5$ e $b = 5$"], "formula": "f(x) = ax + b", "notas": "Relacione cada coeficiente com o problema do táxi." },
    { "tipo": "exemplo", "titulo": "Exemplo 1", "enunciado": "Calcule $f(10)$ para $f(x) = 2{,}5x + 5$.", "passos": ["Substitua $x$ por 10: $f(10) = 2{,}5 \cdot 10 + 5$", "Multiplique: $25 + 5$", "Some: $f(10) = 30$"], "resposta": "R$ 30,00", "notas": "Mostre que o resultado responde à pergunta inicial." },
    { "tipo": "conteudo", "titulo": "Crescente ou decrescente?", "topicos": ["$a > 0$: crescente", "$a < 0$: decrescente", "$a \neq 0$ sempre"], "formula": "a = \frac{\Delta y}{\Delta x}", "notas": "Desenhe as duas retas no quadro." },
    { "tipo": "exemplo", "titulo": "Exemplo 2", "enunciado": "Ache a raiz de $f(x) = 3x - 6$.", "passos": ["Faça $f(x) = 0$: $3x - 6 = 0$", "Isole $x$: $3x = 6$", "Divida: $x = 2$"], "resposta": "$x = 2$", "notas": "A raiz é onde a reta corta o eixo $x$." },
    { "tipo": "exercicio", "titulo": "Sua vez!", "enunciado": "Para $f(x) = -2x + 8$, calcule $f(3)$.", "resposta": "$f(3) = 2$", "notas": "Dê 3 minutos e peça que comparem com o colega." },
    { "tipo": "exercicio", "titulo": "Desafio", "enunciado": "Qual a raiz de $g(x) = 4x + 2$?", "resposta": "$x = -\frac{1}{2}$", "notas": "Atenção ao sinal negativo." },
    { "tipo": "resumo", "titulo": "Resumo", "topicos": ["$f(x) = ax + b$", "$a$: taxa de variação; $b$: valor inicial", "Raiz: $x = -\frac{b}{a}$"], "notas": "Passe a tarefa de casa." }
  ]
}`;

const PROVA = String.raw`{
  "titulo": "Avaliação: Função afim",
  "instrucoes": "Leia com atenção. Mostre os cálculos nas questões discursivas.",
  "questoes": [
    { "numero": 1, "tipo": "multipla", "nivel": "fácil", "enunciado": "Se $f(x) = 2x + 3$, quanto vale $f(4)$?", "alternativas": ["8", "9", "11", "12", "14"], "resposta": "C", "resolucao": ["$f(4) = 2 \cdot 4 + 3$", "$= 8 + 3 = 11$"] },
    { "numero": 2, "tipo": "multipla", "nivel": "fácil", "enunciado": "Na função $f(x) = -x + 5$, o coeficiente angular é:", "alternativas": ["5", "1", "-1", "-5", "0"], "resposta": "C", "resolucao": ["O coeficiente angular é o número que multiplica $x$: $-1$"] },
    { "numero": 3, "tipo": "multipla", "nivel": "médio", "enunciado": "A raiz de $f(x) = 5x - 15$ é:", "alternativas": ["-3", "3", "5", "15", "-15"], "resposta": "B", "resolucao": ["$5x - 15 = 0$", "$x = 3$"] },
    { "numero": 4, "tipo": "multipla", "nivel": "médio", "enunciado": "Um táxi cobra R$ 4,00 fixos mais R$ 3,00 por km. Uma corrida de 6 km custa:", "alternativas": ["R$ 18,00", "R$ 22,00", "R$ 24,00", "R$ 26,00", "R$ 28,00"], "resposta": "B", "resolucao": ["$f(6) = 3 \cdot 6 + 4 = 22$"] },
    { "numero": 5, "tipo": "discursiva", "nivel": "difícil", "enunciado": "Determine a função afim cujo gráfico passa por $(1, 5)$ e $(3, 9)$.", "alternativas": [], "resposta": "f(x) = 2x + 3", "resolucao": ["$a = \frac{9 - 5}{3 - 1} = 2$", "$5 = 2 \cdot 1 + b \Rightarrow b = 3$"] },
    { "numero": 6, "tipo": "discursiva", "nivel": "médio", "enunciado": "Calcule a raiz de $g(x) = 4x + 2$.", "alternativas": [], "resposta": "x = -1/2", "resolucao": ["$4x + 2 = 0$", "$x = -\frac{1}{2}$"] }
  ]
}`;

// O verificador simulado erra de propósito a questão 3 para mostrar o aviso de revisão.
const RESOLVER = `{ "respostas": [
  { "numero": 1, "resposta": "C" }, { "numero": 2, "resposta": "C" }, { "numero": 3, "resposta": "A" },
  { "numero": 4, "resposta": "B" }, { "numero": 5, "resposta": "2x + 3" }, { "numero": 6, "resposta": "-0,5" }
] }`;

export function respostaSimulada(tarefa, usuario) {
  switch (tarefa) {
    case 'plano':
      return PLANO;
    case 'slides':
      return SLIDES;
    case 'prova':
      return PROVA;
    case 'resolver':
      return RESOLVER;
    case 'comparar': {
      const numeros = [...String(usuario).matchAll(/"numero":(\d+)/g)].map((m) => Number(m[1]));
      return JSON.stringify({ comparacoes: numeros.map((numero) => ({ numero, equivalentes: true })) });
    }
    default:
      return '{}';
  }
}
