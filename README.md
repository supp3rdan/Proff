# Proff

Gerador de **plano de aula**, **slides** e **prova com gabarito** de Matemática para o Ensino Médio.
O professor escolhe a série e o assunto e, se quiser, descreve como prefere a aula. O Proff faz o resto usando APIs **gratuitas** de IA.

## O que ele faz

Toda aula segue o mesmo roteiro, definido em `public/core/estrutura.js`:

1. **Introdução**: situação do cotidiano, curiosidade e onde o assunto aparece.
2. **Entendendo a ideia**: teoria didática e simples, em palavras, **antes** das fórmulas, com a ideia-chave em destaque.
3. **Fórmulas**: a ideia escrita em linguagem matemática, com o significado de cada termo.
4. **Aplicações**: exemplos resolvidos passo a passo.
5. **Hora de praticar**: exercícios para a turma.
6. **Resumo**.

A IA escreve o conteúdo de cada parte; o código garante a ordem, corrige slides fora do lugar e cria os slides de abertura de cada parte.

- **Plano de aula**: objetivos, habilidades da BNCC, conhecimentos prévios, recursos, etapas com tempo, avaliação, tarefa e adaptações.
- **Slides didáticos** com exemplos resolvidos passo a passo, exercícios com resposta revelada e anotações para o professor. Dá para apresentar no navegador (Reveal.js + KaTeX) ou baixar em `.pptx` (pptxgenjs).
- **A IA só escreve o conteúdo.** O visual dos slides é código do projeto: tema fixo (cores, fontes, barra lateral, etiquetas, passos numerados, cartões de resumo) e um layout para cada tipo de slide. No `.pptx`, as fórmulas em destaque são desenhadas pelo MathJax como imagem nítida, e as fórmulas no meio do texto usam a fonte Cambria Math (continuam editáveis). Cada exercício vira dois slides: o enunciado e, em seguida, a resposta.
- **Prova** pronta para imprimir e **gabarito** com resolução.
- **Conferência do gabarito**: uma segunda chamada de IA (de preferência em outro provedor) resolve a prova sem ver as respostas. Se o resultado não bater, a questão aparece marcada para revisão.
- **Modelo certo para cada tarefa**: com a chave do Groq, o **Llama 3.3 70B** escreve a aula e os slides (muito rápido) e o **gpt-oss-120b** cuida das contas, das questões e do gabarito (raciocina antes de responder).
- **Troca automática**: tenta o Groq; se der limite ou erro, passa para o Gemini e depois para o OpenRouter. Limite por minuto espera alguns segundos e repete.

## Como funciona

O professor faz três ações separadas. Cada uma é dividida em **chamadas pequenas** à IA (mais rápidas e com mais chance de dar certo):

| Ação | Chamadas à IA | O que o código faz |
| --- | --- | --- |
| **Gerar plano de aula** | 1. visão geral do tema → 2. plano de aula baseado nela | — |
| **Gerar slides** (aba Slides) | para cada uma das 5 partes: material didático → formatação em slides | capa, divisores, resumo, ordem e layout |
| **Gerar avaliação** (aba Avaliação) | questões objetivas → questões discursivas → conferência do gabarito | numeração, junção e marcação do que revisar |
| **Gerar aula interativa** (aba Aula interativa, depois dos slides) | texto de cada parte em formato de artigo → escolha de gráficos → jogos | página HTML completa: sumário, caixas, exemplos passo a passo, gráficos e jogos |

Se uma parte falhar, o botão passa a mostrar **Gerar partes que faltam** e refaz só o que não deu certo.

A lógica de geração (`public/core/`) é a mesma nos dois modos:
- **com servidor** (`npm run dev` ou Vercel): as chaves ficam no servidor e cada etapa é uma requisição a `POST /api/gerar`;
- **sem servidor** (GitHub Pages): o navegador chama a IA direto, com a chave do professor ou a chave padrão.

## Aula interativa

Depois do plano e dos slides, o Proff gera uma **página HTML** com a aula em formato de artigo-tutorial, para o professor usar no lugar dos slides ou enviar aos alunos:

- capa, "nesta aula você vai aprender", sumário e barra de leitura;
- as 5 partes da aula com caixas de **dica**, **atenção**, **curiosidade** e **definição**;
- exemplos resolvidos que se revelam **passo a passo** e exercícios com dica e resposta;
- **gráficos interativos** quando o assunto permite: função com controles deslizantes (com raízes e ponto no eixo y), barras, PA/PG, triângulo retângulo com seno/cosseno/tangente, simulador de moeda e dados, e figuras com área e perímetro;
- **jogos de fixação**: quiz, verdadeiro ou falso, associação de pares e desafios de cálculo, com placar, estrelas e comemoração;
- botão "Entendi" em cada parte, com o progresso salvo no navegador do aluno.

A IA só escolhe o tipo de gráfico e os parâmetros a partir de um catálogo; o desenho é feito pelo código da página (`public/interativa/runtime.js`), com um avaliador de expressões que não usa `eval` (`public/core/expressao.js`). Os textos entram na página como texto, nunca como HTML.

Dá para ver a prévia dentro do Proff, **abrir em nova aba** (sem baixar) ou **baixar o .html**, que funciona sozinho. As fórmulas usam o KaTeX pela internet; sem conexão, elas aparecem como texto.

## Usar pelo GitHub Pages (sem servidor)

Acesse **https://supp3rdan.github.io/Proff/**.

No Pages não há servidor, então o Proff roda inteiro no navegador:

1. Por padrão, ele usa as **chaves padrão** do projeto (veja abaixo).
2. O professor pode colar as próprias chaves em **Chaves de API**; elas têm prioridade e ficam salvas **só no navegador dele**.
3. Sem nenhuma chave, dá para marcar **Modo demonstração** e ver uma aula de exemplo.

Passo a passo para gerar as chaves: página [`chaves.html`](https://supp3rdan.github.io/Proff/chaves.html).

### Chaves padrão (arquivo `public/config.js`)

As chaves padrão **não ficam no código**: o repositório e o site são públicos. Cadastre-as em
*Settings → Secrets and variables → Actions* com os nomes `GEMINI_API_KEY`, `GROQ_API_KEY` e `OPENROUTER_API_KEY`.
Na publicação, o workflow roda `scripts/gerar-config.js` e escreve essas chaves no `config.js` do site.

> Quem abrir o site consegue ver as chaves padrão no `config.js`. Restrinja a chave do Gemini ao endereço `https://supp3rdan.github.io/*` no Google Cloud (detalhes em `chaves.html`).

Publicação: o workflow `.github/workflows/pages.yml` roda os testes e publica a pasta `public/` a cada push na `main` (em *Settings → Pages*, a origem fica como **GitHub Actions**). Se preferir *Deploy from a branch* (`main` / `(root)`), o `index.html` da raiz redireciona para `public/`.

## Rodar no seu computador

Precisa do **Node.js 18.17 ou mais novo**. Não há dependências para instalar.

```bash
git clone https://github.com/supp3rdan/Proff.git
cd Proff
cp .env.example .env      # coloque pelo menos uma chave no .env
npm run dev               # abre em http://localhost:3000
```

Quer só ver funcionando, sem chave? Use o modo simulado, que devolve uma aula de exemplo:

```bash
npm run demo
```

### Onde pegar as chaves (todas grátis, sem cartão)

| Provedor | Onde criar a chave | Observação |
| --- | --- | --- |
| Google Gemini | https://aistudio.google.com/app/apikey | Reserva (gemini-3.8-flash; se um modelo for desativado, o Proff tenta outro sozinho). No plano grátis, o Google pode usar os pedidos para melhorar os produtos. |
| Groq | https://console.groq.com/keys | **Principal.** Muito rápido; Llama 3.3 para texto e gpt-oss para matemática. |
| OpenRouter | https://openrouter.ai/keys | Modelos `:free`, até 50 pedidos por dia. |

Basta uma chave para funcionar. Com duas ou mais, a conferência do gabarito usa um modelo diferente do que criou a prova.
Fonte dos limites: [awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis).

> Não envie dados de alunos para as APIs gratuitas.

## Publicar na Vercel (com servidor)

Use a Vercel se quiser que as chaves fiquem no servidor, sem cada professor precisar ter a sua.

1. Importe o repositório em https://vercel.com/new (preset **Other**, sem comando de build).
2. Em **Settings → Environment Variables**, cadastre as mesmas variáveis do `.env`.
3. Defina também `APP_SENHA` para que só quem tem o código consiga gerar aulas (senão qualquer pessoa com o link gasta a sua cota).

A pasta `public/` vira o site e cada arquivo de `api/` vira uma função serverless.

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Chaves dos provedores (pelo menos uma). |
| `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL` | Troca o modelo padrão de cada provedor. |
| `APP_SENHA` | Código de acesso pedido na tela. |
| `LLM_MOCK=1` | Modo simulado, sem chamar nenhuma API. |
| `LLM_TIMEOUT_MS` | Tempo máximo por chamada (padrão 120000). |

## Estrutura

```
api/gerar.js           rota POST /api/gerar (plano, slides ou prova)
api/status.js          rota GET /api/status (o front usa para saber se há servidor)
lib/ambiente.js        cria o cliente de IA a partir das variáveis de ambiente
lib/http.js            utilidades HTTP e código de acesso
public/                interface (HTML, CSS e JS puros)
public/pptx.js         tema e layouts do .pptx (pptxgenjs)
public/pptx-matematica.js fórmulas no .pptx (MathJax → imagem, LaTeX → Unicode)
public/slides-render.js + slides.css  slides no navegador (Reveal.js)
public/core/llm.js     cliente único com troca automática de provedor e leitura do JSON
public/core/estrutura.js roteiro padrão da aula e organização dos slides
public/core/prompts.js prompts de plano, slides, prova e conferência
public/core/gerador.js fluxo de geração e conferência do gabarito
public/core/mock.js    respostas de exemplo do modo simulado/demonstração
public/core/interativa.js catálogo e validação de gráficos e jogos; dados da aula interativa
public/core/expressao.js avaliador seguro de expressões (gráficos)
public/interativa/     página da aula interativa (CSS, runtime e montagem do arquivo)
index.html             redireciona para public/ (GitHub Pages)
server.js           servidor local de desenvolvimento
test/               testes (npm test)
```

## Testes

```bash
npm test
```

## Limitações conhecidas

- IA pode errar conteúdo e contas. A conferência automática reduz, mas **não elimina**, erros: revise antes de usar em sala.
- Os códigos da BNCC sugeridos devem ser conferidos.
- No `.pptx`, as fórmulas no meio do texto viram texto Unicode (ex.: `a/b`, `x²`), porque o PowerPoint não lê LaTeX; as fórmulas em destaque e as linhas que são só fórmula entram como imagem.
- Os limites gratuitos mudam com frequência; se um provedor parar de responder, o Proff tenta o próximo.
