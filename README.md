# Proff

Gerador de **plano de aula**, **slides**, **avaliação com gabarito** e **aula interativa** de Matemática para o Ensino Médio.
O professor escolhe a série e o assunto (e, se quiser, como prefere a aula); o Proff faz o resto com APIs **gratuitas** de IA.

Hospedagem: **Vercel** (site + servidor) e **Supabase** (banco de dados + login).
Passo a passo de configuração: **[docs/CONFIGURACAO.md](docs/CONFIGURACAO.md)**.

## Funções

- **Roteiro padrão de aula**: introdução → teoria em palavras (antes das fórmulas) → fórmulas → aplicações → prática → resumo.
- **Plano de aula** com habilidades da **BNCC conferidas** com a lista oficial (a IA escolhe; o código valida).
- **Slides** com tema fixo (Reveal.js no navegador e `.pptx` com fórmulas do MathJax).
- **Avaliação** com **gabarito conferido**: uma segunda resolução por outro modelo e comparação exata com **SymPy**.
- **Aula interativa**: página em formato de artigo, com gráficos manipuláveis e jogos de fixação.
- **Biblioteca do professor**: histórico, busca, turma e bimestre.
- **Editor**: editar plano, slides e questões; **refazer só um slide** ou **trocar só uma questão**.
- **Link e QR Code** da aula interativa para os alunos (sem login), **Google Classroom** e WhatsApp.
- **Turmas com desempenho**: os resultados dos jogos chegam ao professor (média e itens mais errados).
- **Provas em versões A e B** (questões e alternativas embaralhadas, gabarito acompanha) e **banco de questões**.
- **Planejamento do bimestre**: sequência de aulas encadeadas, geradas com um clique.
- **Níveis**: versão de **reforço**, **avançado** ou **inclusão (DUA)** da mesma aula.
- **Comunidade**: compartilhar, curtir e usar aulas de outros professores.
- **Aprende com o uso**: planos com 👍 viram exemplo para os próximos do mesmo assunto.

## Arquitetura

```
Navegador (public/)                 Vercel (api/ + lib/)                          Supabase
───────────────────                 ────────────────────                          ────────
login (Supabase Auth) ─────────────────────────────────────────────────────────▶ auth
app ── /v1/<rota> ──▶ api/r.js (uma função, todas as rotas) ──▶ lib/db.js ─────▶ tabelas (RLS)
                          │
                          └─ cria tarefa ──▶ lib/tarefas.js: UMA etapa por execução,
                                             salva e chama a próxima (/api/r?rota=worker)
                                                  │
                                                  └─ lib/ia.js: cache · limite diário ·
                                                     monitor de provedores · nova tentativa
                                                        └─ Groq → Gemini → OpenRouter
app ◀── progresso em tempo real (Supabase Realtime na tabela tarefas) ──────────
alunos ── /a/<slug> ──▶ página interativa ── resultado dos jogos ──▶ resultados
api/sympy_comparar.py: comparação exata de respostas (Python + SymPy)
```

- **Chaves só no servidor** (variáveis de ambiente da Vercel).
- **Geração em segundo plano**: o professor pode fechar o app; se uma execução cair, a tarefa continua de onde parou.
- **Cache de IA**: pedidos iguais não gastam cota; "gerar de novo" ignora o cache.
- **Monitor**: cada chamada é registrada (`eventos_ia`); o provedor com muitos erros recentes vai para o fim da fila.
- **Limite por professor**: `LIMITE_DIARIO` pedidos à IA por dia.

## Rodar no computador

Precisa do Node.js 20+.

```bash
npm install
npm run demo     # sem Supabase e sem IA: banco em memória e aula de exemplo → http://localhost:3000
```

Com Supabase e IA de verdade: copie `.env.example` para `.env`, preencha e rode `npm run dev`.

## Testes

```bash
npm test         # Node (unidade + integração da API) e Python (SymPy)
```

## Estrutura

```
api/r.js                 todas as rotas da API (Vercel)
api/sympy_comparar.py    comparação exata de respostas (Vercel, Python)
lib/db.js                dados: Supabase (produção) ou memória (demonstração)
lib/ia.js                IA no servidor: cache, monitor, limite, nova tentativa
lib/tarefas.js           fila de geração em segundo plano
lib/bncc.js              habilidades da BNCC (mesma lista do SQL)
supabase/migrations/     banco de dados (tabelas, segurança RLS, BNCC, tempo real)
public/app.js, public/js/  aplicativo do professor (telas)
public/core/             geração compartilhada: prompts, roteiro, IA, validação
public/interativa/       página da aula interativa
public/pptx*.js          exportação para PowerPoint
server.js                servidor local (imita a Vercel)
vercel.json              rotas, funções e build
```

## Limitações

- Conteúdo gerado por IA: revise antes de usar. A conferência do gabarito reduz, mas não elimina, erros.
- O resumo das habilidades da BNCC é curto; o texto oficial está em http://basenacionalcomum.mec.gov.br/.
- Fórmulas usam KaTeX pela internet; sem conexão aparecem como texto.
