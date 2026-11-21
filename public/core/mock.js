// Respostas de exemplo para testar o Proff sem chave de API (LLM_MOCK=1).
// Vêm como texto com LaTeX de barra simples, igual muitos modelos respondem,
// para exercitar o reparo feito em extrairJSON.

import { repararLatex } from './llm.js?v=__VERSAO__';

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
    { "nome": "Introdução ao assunto", "duracao": "10 min", "descricao": "Conta de táxi e de aplicativo: quanto pagamos por uma corrida? Os alunos estimam valores." },
    { "nome": "Explanação teórica", "duracao": "20 min", "descricao": "Ideia de grandeza que depende de outra, valor fixo e valor que cresce sempre do mesmo jeito, em palavras e com tabelas." },
    { "nome": "Fórmulas e propriedades", "duracao": "20 min", "descricao": "Lei de formação $f(x) = ax + b$, significado de $a$ e $b$, raiz e crescimento." },
    { "nome": "Aplicações e exemplos resolvidos", "duracao": "20 min", "descricao": "Dois exemplos resolvidos no quadro, um direto e um contextualizado." },
    { "nome": "Prática", "duracao": "20 min", "descricao": "Exercícios em duplas com correção coletiva." },
    { "nome": "Fechamento", "duracao": "10 min", "descricao": "Resumo das ideias principais e tarefa de casa." }
  ],
  "avaliacao": "Observação da participação e correção dos exercícios em duplas.",
  "tarefa_casa": "Pesquisar uma situação do dia a dia que possa ser modelada por uma função afim.",
  "adaptacoes": "Oferecer tabela de valores pronta para alunos com dificuldade em montar o gráfico."
}`;

const SLIDES = String.raw`{
  "titulo": "Função afim",
  "slides": [
    { "tipo": "capa", "titulo": "Função afim", "subtitulo": "1º ano do Ensino Médio", "notas": "Pergunte quem já pegou táxi ou aplicativo de transporte." },
    { "tipo": "conteudo", "secao": "introducao", "titulo": "Quanto custa a corrida?", "topicos": ["Bandeirada: R$ 5,00", "Cada km: R$ 2,50", "Quanto pago por 10 km? E por 20 km?"], "notas": "Deixe a turma estimar antes de calcular." },
    { "tipo": "conteudo", "secao": "introducao", "titulo": "Onde isso aparece?", "topicos": ["Conta de luz e de água", "Salário com comissão", "Plano de celular"], "destaque": "Sempre que há um valor fixo mais um valor que cresce por unidade.", "notas": "Peça outros exemplos aos alunos." },
    { "tipo": "conteudo", "secao": "teoria", "titulo": "Uma coisa depende da outra", "topicos": ["O preço depende da distância", "Mais km, mais caro", "Cada km a mais soma sempre o mesmo valor"], "destaque": "O preço varia de forma constante com a distância.", "notas": "Monte uma tabela km × preço no quadro." },
    { "tipo": "conteudo", "secao": "teoria", "titulo": "Parte fixa e parte que varia", "topicos": ["Parte fixa: paga mesmo sem andar", "Parte variável: depende de quantos km", "Preço = fixo + variável"], "destaque": "Toda função afim tem um valor inicial e uma taxa de variação.", "notas": "Ainda sem letras: só a ideia." },
    { "tipo": "conteudo", "secao": "formulas", "titulo": "Lei de formação", "topicos": ["$a$ é a taxa de variação", "$b$ é o valor inicial", "No táxi: $a = 2{,}5$ e $b = 5$"], "formula": "f(x) = ax + b", "notas": "Relacione cada letra com a ideia de parte fixa e parte variável." },
    { "tipo": "conteudo", "secao": "formulas", "titulo": "Crescente ou decrescente?", "topicos": ["$a > 0$: crescente", "$a < 0$: decrescente", "Raiz: onde $f(x) = 0$"], "formula": "x = -\frac{b}{a}", "notas": "Desenhe as duas retas no quadro." },
    { "tipo": "exemplo", "secao": "aplicacoes", "titulo": "Exemplo 1", "enunciado": "Calcule $f(10)$ para $f(x) = 2{,}5x + 5$.", "passos": ["Substitua $x$ por 10: $f(10) = 2{,}5 \cdot 10 + 5$", "Multiplique: $25 + 5$", "Some: $f(10) = 30$"], "resposta": "R$ 30,00", "notas": "Mostre que o resultado responde à pergunta inicial." },
    { "tipo": "exemplo", "secao": "aplicacoes", "titulo": "Exemplo 2", "enunciado": "Ache a raiz de $f(x) = 3x - 6$.", "passos": ["Faça $f(x) = 0$: $3x - 6 = 0$", "Isole $x$: $3x = 6$", "Divida: $x = 2$"], "resposta": "$x = 2$", "notas": "A raiz é onde a reta corta o eixo $x$." },
    { "tipo": "exercicio", "secao": "pratica", "titulo": "Sua vez!", "enunciado": "Para $f(x) = -2x + 8$, calcule $f(3)$.", "resposta": "$f(3) = 2$", "notas": "Dê 3 minutos e peça que comparem com o colega." },
    { "tipo": "exercicio", "secao": "pratica", "titulo": "Desafio", "enunciado": "Qual a raiz de $g(x) = 4x + 2$?", "resposta": "$x = -\frac{1}{2}$", "notas": "Atenção ao sinal negativo." },
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

const VISAO = String.raw`{
  "tema": "Função afim",
  "resumo": "Função afim relaciona duas grandezas em que uma varia de forma constante com a outra. Tem um valor inicial e uma taxa de variação.",
  "conceitos_chave": ["Valor inicial", "Taxa de variação", "Gráfico é uma reta", "Raiz"],
  "prerequisitos": ["Plano cartesiano", "Equações do 1º grau"],
  "formulas": [{ "latex": "f(x) = ax + b", "significado": "a é a taxa de variação e b o valor inicial" }],
  "aplicacoes_reais": ["Corrida de táxi", "Conta de luz", "Salário com comissão"],
  "erros_comuns": ["Trocar a e b", "Errar o sinal da raiz"],
  "curiosidade": "O nome 'afim' vem da ideia de afinidade: a reta mantém sempre a mesma inclinação."
}`;

const MATERIAL = String.raw`{
  "conteudo": ["Material de exemplo do modo demonstração."],
  "ideias_chave": [], "formulas": [], "exemplos": [], "exercicios": []
}`;

/** JSON de exemplo já interpretado (com o mesmo reparo de LaTeX do cliente real). */
const ler = (texto) => JSON.parse(repararLatex(texto));

export function respostaSimulada(tarefa, usuario) {
  const texto = String(usuario);
  switch (tarefa) {
    case 'visao':
      return VISAO;
    case 'plano':
      return PLANO;
    case 'material':
      return MATERIAL;
    case 'formatar': {
      const secao = texto.match(/\[secao:(\w+)\]/)?.[1];
      const slides = ler(SLIDES).slides.filter((s) => s.secao === secao);
      return JSON.stringify({ slides });
    }
    case 'prova-multipla':
    case 'prova-discursiva': {
      const tipo = tarefa.slice('prova-'.length);
      return JSON.stringify({ questoes: ler(PROVA).questoes.filter((q) => q.tipo === tipo) });
    }
    case 'resolver':
      return RESOLVER;
    case 'comparar': {
      const numeros = [...texto.matchAll(/"numero":(\d+)/g)].map((m) => Number(m[1]));
      return JSON.stringify({ comparacoes: numeros.map((numero) => ({ numero, equivalentes: true })) });
    }
    default:
      return '{}';
  }
}
