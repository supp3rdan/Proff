# Proff

Gerador de **plano de aula**, **slides**, **avaliação com gabarito conferido** e **aula interativa** de Matemática para o Ensino Médio, com APIs **gratuitas** de IA.

🌐 **Produção:** [proff-math.vercel.app](https://proff-math.vercel.app/) · apresentação: [proff-math.vercel.app/conheca](https://proff-math.vercel.app/conheca/)

## Problema que resolve

Preparar uma aula completa (plano, slides, prova com gabarito e atividade para os alunos) toma horas do professor. No Proff, o professor escolhe a **série**, o **assunto** e o **nível da turma**. O sistema gera cada parte em separado, para ser revisada: o plano segue um roteiro fixo e cita habilidades da BNCC, a prova tem o gabarito conferido por um segundo modelo e pelo SymPy, e a aula interativa vira um link que os alunos abrem no celular, com os resultados chegando ao professor.

Principais funções: biblioteca de aulas com turma e bimestre · editor com "refazer slide" e "trocar questão" · exportação para PowerPoint · provas A e B · banco de questões · planejamento do bimestre com BNCC, objetivos e conteúdos, baixado em Word (.docx) · versões de reforço, avançado e inclusão (DUA) · link, QR Code, Google Classroom e WhatsApp · painel de desempenho por turma · comunidade de professores.

## Stack

| Parte | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript (módulos ES) sem framework nem bundler, em `public/` |
| Bibliotecas do navegador (CDN) | supabase-js 2, KaTeX 0.16.11, pptxgenjs 3.12.0, docx 9.8.1, MathJax 3.2.2, Reveal.js 5.1.0, qrcode-generator 1.4.4 |
| Back-end | Funções serverless na **Vercel**: Node.js ≥ 20 (`api/r.js`) e Python 3.12 com SymPy 1.14 (`api/sympy_comparar.py`) |
| Banco e login | **Supabase** (Postgres com RLS, Auth, Realtime) |
| IA | Groq, Gemini e OpenRouter, com troca automática de provedor e modelo |
| Testes | `node:test` e `unittest` (Python); CI no GitHub Actions |
| Pacotes | npm (`@supabase/supabase-js`, `@vercel/functions`; `docx` só nos testes) e pip (`sympy`) |

## Pré-requisitos

- Node.js 20 ou mais novo (a CI usa o 22) e npm.
- Python 3.12 com pip (só para os testes da conferência simbólica).
- Para produção: conta no Supabase, conta na Vercel e ao menos uma chave de IA (Groq, Gemini ou OpenRouter). Os links para criar as chaves estão em [`public/chaves.html`](public/chaves.html).

## Instalação

```bash
git clone https://github.com/supp3rdan/Proff.git
cd Proff
npm ci
pip install -r requirements.txt
```

## Variáveis de ambiente

Copie o modelo e preencha:

```bash
cp .env.example .env
```

| Variável | Para quê |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Banco e login (a `service_role` fica só no servidor) |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | IA (basta uma) |
| `WORKER_SECRET` | Protege as chamadas internas da fila e do SymPy |
| `APP_URL` | Endereço de produção usado pela fila |
| `LIMITE_DIARIO` | Pedidos à IA por professor por dia (padrão 400) |

Lista completa, exemplos seguros e variáveis de desenvolvimento: [docs/OPERACAO_E_DEPLOY.md](docs/OPERACAO_E_DEPLOY.md#2-variáveis-de-ambiente).

## Execução local

```bash
npm run demo   # sem Supabase e sem IA: banco em memória e IA simulada → http://localhost:3000
npm run dev    # com o .env preenchido (Supabase e chaves reais)
```

No modo de demonstração, o login pede só um e-mail e os dados somem quando o servidor reinicia. A conferência com SymPy só roda na Vercel; localmente a conferência fica só com a IA.

## Testes

```bash
npm test                              # tudo (o mesmo comando da CI)
node --test test/unidade.test.js      # unidade
node --test test/api.test.js          # integração da API (modo memória)
python3 -m unittest discover -s test -p 'test_*.py'   # SymPy
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Componentes, fluxos (login, fila de geração, IA, gabarito, aula pública), decisões, erros, segurança e observabilidade |
| [docs/FLUXO_DADOS.md](docs/FLUXO_DADOS.md) | DFD níveis 0 e 1, modelo de dados (ER), estrutura de `aulas.estado` e contratos da API |
| [docs/CASOS_DE_USO.md](docs/CASOS_DE_USO.md) | Atores, diagrama de casos de uso, regras de negócio e especificação de cada caso |
| [docs/OPERACAO_E_DEPLOY.md](docs/OPERACAO_E_DEPLOY.md) | CI/CD, deploy na Vercel, variáveis de ambiente, monitoramento e solução de problemas |
| [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md) | Passo a passo para configurar Supabase e Vercel do zero |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Memória resumida para o Claude Code (mapa de arquivos, regras e bugs já corrigidos) |

## Estrutura

```
api/r.js                 todas as rotas da API (uma função na Vercel)
api/sympy_comparar.py    comparação exata de respostas (Python + SymPy)
lib/                     servidor: dados (db.js), IA (ia.js), fila (tarefas.js), HTTP, BNCC, resultados
supabase/migrations/     banco: tabelas, RLS, funções, tempo real e BNCC
public/app.js, public/js/  aplicativo do professor
public/core/             núcleo compartilhado navegador/servidor: prompts, IA, validação, LaTeX, provas A/B
public/interativa/       página da aula interativa
public/pptx*.js, slides* slides e exportação para PowerPoint
public/conheca/          página de apresentação (feita com a taste-skill, licença MIT)
server.js                servidor local que imita a Vercel
vercel.json              build, funções, reescritas e cabeçalhos
test/                    testes de unidade, integração e SymPy
```

## Limitações

- Conteúdo gerado por IA: revise antes de usar em sala. A conferência do gabarito reduz, mas não elimina, erros.
- O resumo das habilidades da BNCC é curto; o texto oficial está em http://basenacionalcomum.mec.gov.br/.
- Fórmulas, PowerPoint e QR Code dependem de bibliotecas da CDN jsDelivr; sem acesso a ela, esses recursos não carregam.
