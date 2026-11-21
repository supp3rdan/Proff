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

const ARTIGOS = {
  introducao: String.raw`{
    "titulo": "Por que a corrida de táxi tem a ver com Matemática?",
    "paragrafos": [
      "Imagine que você pediu um carro por aplicativo. Antes mesmo de sair do lugar, já existe um valor a pagar: a bandeirada. Depois, cada quilômetro rodado acrescenta um valor fixo à conta.",
      "Essa forma de calcular aparece em muitas situações do dia a dia: conta de luz, plano de celular, salário com comissão. Em todas elas, existe uma parte fixa e uma parte que cresce sempre do mesmo jeito.",
      "Nesta aula, você vai descobrir que essas situações são descritas por um tipo de função muito importante: a função afim."
    ],
    "caixas": [{ "tipo": "curiosidade", "titulo": "Você sabia?", "texto": "O gráfico de toda função afim é uma reta. Por isso, com apenas dois pontos você já consegue desenhá-lo inteiro." }]
  }`,
  teoria: String.raw`{
    "titulo": "Entendendo a ideia: uma parte fixa e uma parte que varia",
    "paragrafos": [
      "Quando uma grandeza depende de outra, dizemos que existe uma relação entre elas. No táxi, o preço depende da distância percorrida.",
      "Repare que, a cada quilômetro a mais, o preço aumenta sempre a mesma quantia. Essa quantia é chamada de taxa de variação: ela diz o quanto a conta cresce para cada unidade a mais.",
      "Já a bandeirada é o valor inicial: é quanto você paga mesmo sem andar nada. Toda função afim tem essas duas partes.",
      "Pense em uma escada com degraus sempre do mesmo tamanho: a altura de onde você começa é o valor inicial, e o tamanho de cada degrau é a taxa de variação."
    ],
    "caixas": [
      { "tipo": "definicao", "titulo": "Taxa de variação", "texto": "É o quanto a grandeza muda quando a outra aumenta uma unidade. Na função afim, ela é sempre a mesma." },
      { "tipo": "dica", "titulo": "Monte uma tabela", "texto": "Antes de usar fórmulas, faça uma tabela com alguns valores. Fica fácil perceber o padrão de crescimento." }
    ]
  }`,
  formulas: String.raw`{
    "titulo": "Escrevendo a ideia em linguagem matemática",
    "paragrafos": ["Agora que você entendeu a parte fixa e a parte que varia, podemos escrever tudo em uma única fórmula, chamada lei de formação."],
    "formulas": [
      { "latex": "f(x) = ax + b", "explicacao": "$a$ é a taxa de variação (quanto cresce por unidade), $b$ é o valor inicial e $x$ é a quantidade que varia." },
      { "latex": "x = -\frac{b}{a}", "explicacao": "Raiz da função: o valor de $x$ em que $f(x) = 0$, ou seja, onde a reta corta o eixo $x$." }
    ],
    "caixas": [{ "tipo": "atencao", "titulo": "Cuidado com a ordem", "texto": "Em $f(x) = 3 - 2x$, a taxa de variação é $-2$, e não $3$. O coeficiente $a$ é sempre o número que multiplica $x$." }]
  }`,
  aplicacoes: String.raw`{
    "titulo": "Colocando em prática",
    "paragrafos": ["Veja como usar a lei de formação para resolver problemas. Clique para ver cada passo da resolução."],
    "exemplos": [
      { "enunciado": "Um táxi cobra R$ 5,00 de bandeirada e R$ 2,50 por km. Quanto custa uma corrida de 10 km?", "passos": ["Lei de formação: $f(x) = 2{,}5x + 5$", "Substitua $x$ por 10: $f(10) = 2{,}5 \cdot 10 + 5$", "Calcule: $f(10) = 25 + 5 = 30$"], "resposta": "R$ 30,00" },
      { "enunciado": "Qual é a raiz de $f(x) = 3x - 6$?", "passos": ["Faça $f(x) = 0$: $3x - 6 = 0$", "Some 6 dos dois lados: $3x = 6$", "Divida por 3: $x = 2$"], "resposta": "$x = 2$" }
    ],
    "caixas": [{ "tipo": "dica", "titulo": "Confira a resposta", "texto": "Substitua o resultado na função. Se a conta fechar, a resposta está certa." }]
  }`,
  pratica: String.raw`{
    "titulo": "Hora de praticar",
    "paragrafos": ["Tente resolver no caderno antes de abrir a resposta."],
    "exercicios": [
      { "enunciado": "Para $f(x) = -2x + 8$, calcule $f(3)$.", "resposta": "$f(3) = 2$", "dica": "Troque o $x$ por 3." },
      { "enunciado": "Qual é a raiz de $g(x) = 4x + 2$?", "resposta": "$x = -\frac{1}{2}$", "dica": "Iguale a função a zero." },
      { "enunciado": "Um plano de celular custa R$ 20,00 fixos mais R$ 0,50 por minuto. Quanto custa falar 40 minutos?", "resposta": "R$ 40,00", "dica": "Monte $f(x) = 0{,}5x + 20$." }
    ]
  }`,
};

const VISUALIZACOES = `{ "visualizacoes": [
  { "tipo": "funcao", "titulo": "Mexa nos coeficientes", "explicacao": "Arraste os controles e veja: a muda a inclinação da reta e b move a reta para cima ou para baixo.", "secao": "formulas",
    "params": { "expressao": "a*x + b", "parametros": [ { "nome": "a", "rotulo": "a (taxa de variação)", "min": -5, "max": 5, "passo": 0.5, "valor": 2 }, { "nome": "b", "rotulo": "b (valor inicial)", "min": -10, "max": 10, "passo": 1, "valor": 1 } ], "x_min": -10, "x_max": 10 } },
  { "tipo": "barras", "titulo": "Preço da corrida por distância", "explicacao": "Cada barra mostra o preço para uma distância. Repare que o aumento é sempre igual.", "secao": "teoria",
    "params": { "rotulos": ["0 km", "2 km", "4 km", "6 km", "8 km"], "valores": [5, 10, 15, 20, 25], "unidade": "R$" } }
] }`;

const JOGOS = String.raw`{
  "quiz": [
    { "pergunta": "Em $f(x) = 3x + 2$, qual é a taxa de variação?", "alternativas": ["2", "3", "5", "x"], "correta": 1, "explicacao": "A taxa de variação é o número que multiplica $x$: 3." },
    { "pergunta": "Qual é o valor inicial de $f(x) = -x + 7$?", "alternativas": ["-1", "1", "7", "-7"], "correta": 2, "explicacao": "O valor inicial é o termo independente, $b = 7$." },
    { "pergunta": "Se $a > 0$, a função afim é:", "alternativas": ["crescente", "decrescente", "constante", "não existe"], "correta": 0, "explicacao": "Com taxa positiva, a função cresce." },
    { "pergunta": "Qual é a raiz de $f(x) = 2x - 8$?", "alternativas": ["-4", "2", "4", "8"], "correta": 2, "explicacao": "$2x - 8 = 0 \Rightarrow x = 4$." },
    { "pergunta": "O gráfico de uma função afim é:", "alternativas": ["uma parábola", "uma reta", "um círculo", "uma curva em S"], "correta": 1, "explicacao": "Toda função afim tem gráfico em forma de reta." }
  ],
  "verdadeiro_falso": [
    { "afirmacao": "Em $f(x) = 5x$, o valor inicial é zero.", "verdadeiro": true, "explicacao": "Não há termo independente, então $b = 0$." },
    { "afirmacao": "Se $a < 0$, a reta sobe da esquerda para a direita.", "verdadeiro": false, "explicacao": "Com $a < 0$ a função é decrescente: a reta desce." },
    { "afirmacao": "A raiz é o ponto onde a reta corta o eixo $x$.", "verdadeiro": true, "explicacao": "Na raiz, $f(x) = 0$." },
    { "afirmacao": "Em $f(x) = 4 - 3x$, a taxa de variação é 4.", "verdadeiro": false, "explicacao": "A taxa é o número que multiplica $x$: $-3$." }
  ],
  "pares": [
    { "termo": "$a$", "significado": "taxa de variação" },
    { "termo": "$b$", "significado": "valor inicial" },
    { "termo": "$f(x) = 0$", "significado": "raiz da função" },
    { "termo": "$a > 0$", "significado": "função crescente" }
  ],
  "desafios": [
    { "pergunta": "Calcule $f(4)$ para $f(x) = 3x - 2$.", "resposta": 10, "tolerancia": 0, "dica": "Troque $x$ por 4." },
    { "pergunta": "Um táxi cobra R$ 4,00 fixos e R$ 3,00 por km. Quanto custa uma corrida de 7 km?", "resposta": 25, "tolerancia": 0, "dica": "Monte $f(x) = 3x + 4$." }
  ]
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
    case 'artigo': {
      const secao = texto.match(/\[secao:(\w+)\]/)?.[1];
      return ARTIGOS[secao] || '{"paragrafos": ["Texto de exemplo."]}';
    }
    case 'visualizacoes':
      return VISUALIZACOES;
    case 'jogos':
      return JOGOS;
    case 'comparar': {
      const numeros = [...texto.matchAll(/"numero":(\d+)/g)].map((m) => Number(m[1]));
      return JSON.stringify({ comparacoes: numeros.map((numero) => ({ numero, equivalentes: true })) });
    }
    default:
      return '{}';
  }
}
