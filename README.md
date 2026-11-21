# Proff

Gerador de **plano de aula**, **slides** e **prova com gabarito** de Matemática para o Ensino Médio.
O professor escolhe a série e o assunto e, se quiser, descreve como prefere a aula. O Proff faz o resto usando APIs **gratuitas** de IA.

## O que ele faz

- **Plano de aula**: objetivos, habilidades da BNCC, conhecimentos prévios, recursos, etapas com tempo, avaliação, tarefa e adaptações.
- **Slides didáticos** com exemplos resolvidos passo a passo, exercícios com resposta revelada e anotações para o professor. Dá para apresentar no navegador (Reveal.js + KaTeX) ou baixar em `.pptx` (pptxgenjs).
- **A IA só escreve o conteúdo.** O visual dos slides é código do projeto: tema fixo (cores, fontes, barra lateral, etiquetas, passos numerados, cartões de resumo) e um layout para cada tipo de slide. No `.pptx`, as fórmulas em destaque são desenhadas pelo MathJax como imagem nítida, e as fórmulas no meio do texto usam a fonte Cambria Math (continuam editáveis). Cada exercício vira dois slides: o enunciado e, em seguida, a resposta.
- **Prova** pronta para imprimir e **gabarito** com resolução.
- **Conferência do gabarito**: uma segunda chamada de IA (de preferência em outro provedor) resolve a prova sem ver as respostas. Se o resultado não bater, a questão aparece marcada para revisão.
- **Troca automática de provedor**: tenta o Gemini; se der limite ou erro, passa para o Groq e depois para o OpenRouter.

## Como funciona

```
Navegador (public/)                   Servidor (api/ + lib/)                 APIs gratuitas
────────────────────                  ─────────────────────                  ──────────────
formulário ── POST /api/gerar ──▶  1. plano  ─────────────────┐
                                    2. slides (usa o plano)    ├──▶ Gemini → Groq → OpenRouter
                                    3. prova  (usa o plano)    │     (respostas em JSON)
                                       └─ resolve de novo e    │
                                          compara o gabarito ──┘
◀── JSON ── monta plano, slides (Reveal.js + KaTeX), prova e .pptx
```

A lógica de geração (`public/core/`) é a mesma nos dois modos:
- **com servidor** (`npm run dev` ou Vercel): as chaves ficam no servidor;
- **sem servidor** (GitHub Pages): o navegador chama a IA direto, com a chave que o professor colou.

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
| Google Gemini | https://aistudio.google.com/app/apikey | Principal (modelo gemini-3.8-flash; se um modelo for desativado, o Proff tenta outro sozinho). No plano grátis, o Google pode usar os pedidos para melhorar os produtos. |
| Groq | https://console.groq.com/keys | Muito rápido; limite de 8 mil tokens por minuto. |
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
public/core/prompts.js prompts de plano, slides, prova e conferência
public/core/gerador.js fluxo de geração e conferência do gabarito
public/core/mock.js    respostas de exemplo do modo simulado/demonstração
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
