# CLAUDE.md — Proff

Gerador de plano de aula, slides (.pptx), avaliação c/ gabarito e aula interativa de Matemática (Ensino Médio). Produção: https://proff-math.vercel.app (Vercel + Supabase). Idioma do código, UI e commits: **pt-BR**.

## 1. Stack e comandos

| Item | Valor |
|---|---|
| Runtime | Node ≥20 (CI: 22), ESM (`"type": "module"`), JS puro — sem framework, sem bundler, sem TypeScript |
| Python | 3.12 (CI), só `api/sympy_comparar.py`; dep única `sympy==1.14.0` |
| Deps npm | `@supabase/supabase-js` ^2, `@vercel/functions` ^2 (só servidor) |
| Front (CDN) | supabase-js@2 ESM, KaTeX 0.16.11, pptxgenjs 3.12.0 (em `public/index.html` / `sessao.js`) |
| Pacotes | npm (`package-lock.json`) + pip (`requirements.txt`) |
| IA | Groq (Llama 3.3 texto / gpt-oss matemática), Gemini, OpenRouter — APIs grátis, chaves só no servidor |

```bash
npm ci && pip install -r requirements.txt   # instalar
npm run demo        # local sem Supabase e sem IA (DB_MEMORIA=1 LLM_MOCK=1) → http://localhost:3000
npm run dev         # local com .env real (server.js lê .env sem dotenv)
npm test            # node --test (test/*.test.js) + python unittest (test/test_*.py) — mesmo comando do CI
node --test test/unidade.test.js            # só unidade
node --test test/api.test.js                # só integração da API (modo memória)
python3 -m unittest discover -s test -p 'test_*.py'
node --check <arquivo.js>                   # checagem de sintaxe (não há lint nem typecheck)
```
- `npm run build` = `scripts/build.js`: **reescreve `public/` no lugar** (troca `__VERSAO__` pelo SHA). Só a Vercel roda. Ver §4.
- Deploy: push na `main` → Vercel (produção). Outras branches → preview. CI: `.github/workflows/testes.yml` (só `npm test`).
- SymPy não roda no `server.js` local (responde 501); a conferência local usa só o 2º modelo.

## 2. Arquitetura

Fluxo: navegador (`public/app.js`, rotas `#/…`) → `fetch /v1/<rota>` com Bearer do Supabase Auth → `vercel.json` reescreve para `api/r.js?rota=` → `lib/db.js` (Supabase service_role, filtro `professor_id` + RLS). Geração = **tarefa em fila**: `iniciarTarefa` cria linha em `tarefas` com `etapas`; 1 etapa por invocação; encadeia via `POST worker` (`x-worker-secret`) + `waitUntil`; front acompanha por realtime + polling 3 s (`acompanharTarefa`). Prompts/validação ficam em `public/core/` (compartilhado navegador ↔ servidor).

| Responsabilidade | Caminho |
|---|---|
| API (única função Vercel, todas as rotas via `rota(MÉTODO,'caminho')`) | `api/r.js` |
| Conferência simbólica de gabarito | `api/sympy_comparar.py` (exige `WORKER_SECRET`) |
| Dados (Supabase **ou** memória `DB_MEMORIA=1`), auth `usuarioDoToken`, `urlSupabase()`, `chaveAmbiente()` | `lib/db.js` |
| Cliente IA servidor: cache sha256, limite diário, saúde dos provedores, retry | `lib/ia.js` |
| Fila/etapas, worker, retomada, chamada ao SymPy | `lib/tarefas.js` |
| HTTP util (corpo ≤800 KB, token, HTML) | `lib/http.js` |
| BNCC (43 EM13MAT) — espelho do SQL | `lib/bncc.js` |
| Painel de resultados | `lib/resultados.js` |
| Schema, RLS, RPCs, realtime, seed BNCC (idempotente) | `supabase/migrations/20261124000000_proff.sql` |
| Provedores/modelos, fallback, `corrigirChaves`, mock | `public/core/llm.js`, `public/core/mock.js` |
| Prompts, níveis (regular/reforço/avançado/inclusão) | `public/core/prompts.js` |
| Geração/validação (`validarEntrada`, `conferirProva`, `conferirBncc`) | `public/core/gerador.js` |
| Estrutura de seções da aula | `public/core/estrutura.js` |
| Aula interativa: dados / montagem HTML / runtime | `public/core/interativa.js`, `public/interativa/{montar.js,runtime.js,pagina.css}` |
| LaTeX sem `$` → delimitado | `public/core/latex.js` |
| Provas A/B (embaralhamento por semente) | `public/core/versoes.js` |
| App: login/sessão/fila | `public/js/sessao.js`; HTTP `public/js/api.js`; DOM `public/js/ui.js` |
| Telas | `public/js/views/aula.js`, `public/js/views/listas.js`; rotas em `public/app.js` |
| Slides HTML / PowerPoint | `public/slides-render.js`, `public/slides.html`, `public/pptx.js`, `public/pptx-matematica.js` |
| Página de apresentação (estática) | `public/conheca/` |
| Página de chaves/config | `public/chaves.html` |
| Servidor local que imita a Vercel | `server.js` |
| Rotas, funções, redirects, headers | `vercel.json` |
| Variáveis de ambiente (modelo) | `.env.example`; guia: `docs/CONFIGURACAO.md` |
| Testes | `test/unidade.test.js`, `test/api.test.js`, `test/test_sympy.py` |

Rotas sem login: `status`, `login-demo` (só memória), `publica/:slug` (+`/resultado`), `worker` (segredo). Página do aluno: `/a/:slug`.

Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable `sb_publishable_…` ou legada), `SUPABASE_SERVICE_ROLE_KEY` (secret `sb_secret_…`), `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `WORKER_SECRET`, `APP_URL`, `LIMITE_DIARIO` (400), `LLM_TIMEOUT_MS` (90000), `*_MODEL`, `VERCEL_AUTOMATION_BYPASS_SECRET`; dev: `DB_MEMORIA`, `LLM_MOCK`, `FILA_HTTP`, `PORT`.

## 3. Convenções e restrições

- Nomes, mensagens e comentários em português; erros ao usuário em pt-BR, curtos.
- Erros: lançar `ErroHttp(status)` / `ErroEntrada` (400) / `ErroLimite` (429) / `ErroLLM` (503); `api/r.js` converte; resto → 500 genérico.
- Nova rota = `rota(...)` em `api/r.js` (limite de funções do plano grátis). Não criar arquivos novos em `api/`.
- Toda consulta de dado do professor filtra `professor_id` em `lib/db.js` (RLS é a 2ª barreira). Toda função de `db` tem implementação Supabase **e** memória.
- `public/core/*` roda no navegador e no Node: sem DOM, sem `node:*`. Arquivos lidos pela função via `includeFiles` (`vercel.json`); `montar.js` recebe `lerArquivo`.
- DOM só por `el()`/`textContent`; **nunca `innerHTML`**. JSON embutido em HTML via `jsonSeguro`.
- Todo import/link em `public/` leva `?v=__VERSAO__` (exceto `public/conheca/`).
- LaTeX: prompts pedem `$…$`/`$$…$$` e barra invertida dobrada no JSON; render protege `R$` antes do KaTeX.
- Migration idempotente (`if not exists`, `create or replace`); `lib/bncc.js` muda junto com o SQL (teste compara).
- Acessibilidade mínima: texto ≥7:1 (`--suave #465260`; laranja de texto `--laranja-texto`), `:focus-visible` visível, campos com `<label>` visível, alvos ≥44 px no celular.

**Proibido**
- Chave de IA ou `SUPABASE_SERVICE_ROLE_KEY` no front, em commit ou em `public/`. Ler env de Supabase direto: usar `db.urlSupabase()` / `db.chaveAmbiente()`.
- Rodar `npm run build` na árvore de trabalho; `git checkout -- public` com alterações não commitadas.
- Commitar `?v=<hash>` concreto no lugar de `__VERSAO__`.
- Editar `public/conheca/assets/**` (kit da taste-skill, MIT) — mudar só `public/conheca/index.html`.
- Fixar um único modelo de IA; adicionar framework/bundler/dependência sem necessidade.
- Commits/PRs com Claude como autor/coautor ou rodapé "Generated with Claude Code" (identidade do dono do repo).
- Mesclar na `main` sem confirmação do usuário quando ele pedir branch de teste.

## 4. Correções já feitas (não reintroduzir)

| Sintoma | Causa | Regra |
|---|---|---|
| Gemini 404 (modelo desativado) / 503 | modelo fixo | lista de modelos por provedor + tenta o sugerido pelo erro (`PROVEDORES` em `llm.js`) |
| Timeout Gemini/Groq | modelos "pensando" demais | `reasoning_effort: 'low'` (gpt-oss: `medium` só em matemática) |
| 401 com chave certa | chave OpenRouter na variável do Groq | `corrigirChaves` reconhece prefixo (`gsk_`, `AIza`/`AQ.`, `sk-or-v1-`); fallbacks `GROK_API_SECRET_TRUE`, `API_KEY_GROQ` |
| Navegador usa JS antigo após deploy | cache | `?v=__VERSAO__` em todo import; build troca |
| Imports com `?v=mwvaocy` commitados | build rodado no lugar | ver Proibido |
| Edições perdidas | `git checkout -- public` após build | ver Proibido; usar cópia/`git stash` |
| Script da interativa quebrado | U+2028 literal em regex (`montar.js`) | usar escape `\u2028`, nunca o caractere |
| `\frac` virou form feed no mock | `\f` em string | barras de LaTeX dobradas em strings JS/Python |
| Login: "Invalid path specified in request URL" | `SUPABASE_URL` com `/rest/v1/`, barra ou link do painel | `urlSupabase()` normaliza; teste em `unidade.test.js` |
| Fórmula aparece crua (`\frac{f_i}{N}`) | IA escreveu LaTeX sem `$` | `delimitarLatex` em `renderizarMatematica`, runtime da interativa e `segmentar` (pptx); regra no prompt |
| `0,25` vira `0, 25` no KaTeX | vírgula decimal | `delimitarLatex` troca por `{,}` |
| "Criar conta" não faz nada | Supabase não acusa e-mail existente | `identities.length === 0` → avisar; erros traduzidos em `traduzirErro` |
| Conta criada não entra | "Confirm email" ligado + SMTP grátis limitado | documentado em `docs/CONFIGURACAO.md`; fluxo "Esqueci / criar senha" + botão **Senha** |
| Evento de recuperação perdido | `onAuthStateChange` registrado depois de `getSession` | registrar listener antes; checar `type=recovery` na URL |
| 404 ao trocar de professor | hash de aula do outro mantido | `Sair` faz `history.replaceState(…'#/aulas')` |
| Página rola para o lado no celular | `table.tabela` larga | `display:block; overflow-x:auto` ≤760 px |

**Armadilhas**
- `R$` conflita com delimitador `$`: proteger antes de renderizar (`MARCADOR`) e regex `(?<!R)\$`.
- Supabase: chaves `anon`/`service_role` legadas saem no fim de 2026; nomes das env continuam, valores podem ser `sb_publishable_`/`sb_secret_`.
- Previews da Vercel exigem "Protection Bypass for Automation" para o worker encadear; `APP_URL` só em Production.
- Ambiente de sandbox bloqueia CDNs (KaTeX, Google Fonts, supabase-js): testes de navegador servem KaTeX local; `public/conheca` usa fontes próprias.
- `/conheca` precisa da barra final (caminhos relativos): redirect em `vercel.json` e em `server.js`.
- Rolagem suave faz verificadores de foco falharem; só com `prefers-reduced-motion: no-preference`.
- Teste e2e de navegador (`e2e_vercel.py`) **não está no repositório**.

## 5. Manutenção deste arquivo

Ao terminar tarefa que mude arquitetura, comandos, rotas/contratos da API, env, dependências, schema ou que corrija bug não trivial: atualizar a seção correspondente aqui, no mesmo formato telegráfico (linha de tabela ou item curto), removendo o que ficou obsoleto. Bug novo → linha em §4 `Sintoma | Causa | Regra`. Não duplicar o README; manter este arquivo curto (alvo < 200 linhas).

Local: `.claude/CLAUDE.md` (fora do deploy). Commits que só mexem em `.claude/` ou `*.md` não geram deploy (`ignoreCommand` em `vercel.json`).
