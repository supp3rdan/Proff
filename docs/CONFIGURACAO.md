# Configurar o Proff na Vercel + Supabase

Tempo estimado: 20 a 30 minutos. Faça na ordem.

## 1. Supabase (banco de dados e login)

1. Entre em https://supabase.com/dashboard e clique em **New project**.
   - Nome: `proff` · Região: **South America (São Paulo)** · crie uma senha do banco e guarde.
2. Quando o projeto terminar de criar, abra **SQL Editor → New query**.
3. Copie todo o conteúdo do arquivo [`supabase/migrations/20261124000000_proff.sql`](../supabase/migrations/20261124000000_proff.sql), cole e clique em **Run**.
   - Deve aparecer **Success. No rows returned**.
   - Confira em **Table Editor**: devem existir as tabelas `aulas`, `turmas`, `tarefas`, `questoes`, `bncc` (com 43 linhas) e outras.
   - O arquivo pode ser rodado de novo sem problema (não apaga dados).
4. **Authentication → Sign In / Providers → Email**: deixe ligado. "Confirm email" pode ficar ligado (o professor confirma o cadastro pelo e-mail).
5. **Project Settings → API Keys** (ou **API**): copie para usar na Vercel:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** (ou **Publishable key**) → `SUPABASE_ANON_KEY`
   - **service_role** (ou **Secret key**) → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ é secreta: só na Vercel, nunca no código.

O passo de URLs de login (Authentication → URL Configuration) é feito depois do primeiro deploy, no item 3.

## 2. Vercel (site e servidor)

1. Entre em https://vercel.com/new e importe o repositório **supp3rdan/Proff** (autorize o GitHub se pedir).
2. **Framework Preset: Other**. Não mude build nem pasta de saída (vêm do `vercel.json`).
3. Em **Environment Variables**, cadastre (marque **Production** e **Preview**):

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave anon/publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role/secret |
| `GROQ_API_KEY` | chave do Groq (`gsk_...`) |
| `GEMINI_API_KEY` | chave do Gemini (opcional, reserva) |
| `OPENROUTER_API_KEY` | chave do OpenRouter (opcional, reserva) |
| `WORKER_SECRET` | um texto aleatório longo (40+ caracteres), ex.: gerado em https://www.uuidgenerator.net/ juntando 2 UUIDs |
| `LIMITE_DIARIO` | opcional; pedidos à IA por professor por dia (padrão 400) |

   > Os segredos do GitHub (`GROK_API_SECRET_TRUE`, `API_KEY_GROQ`...) não podem ser lidos de volta: copie as chaves de novo nos sites dos provedores (ou crie novas).

4. Clique em **Deploy**. (O primeiro deploy é da branch `main`; o teste é na branch `teste-vercel-supabase`, item 4.)
5. **Settings → Deployment Protection → Protection Bypass for Automation → Add secret**.
   - Necessário para a fila de geração conseguir chamar a si mesma nos endereços protegidos da Vercel. A Vercel cria sozinha a variável `VERCEL_AUTOMATION_BYPASS_SECRET`.
6. **Settings → Functions**: confira que **Fluid Compute** está ativado (permite até 300 s por execução).
7. **Settings → Environment Variables**: crie `APP_URL` **só em Production** com o endereço do site, ex.: `https://proff.vercel.app` (veja em **Domains**).

## 3. Ligar o login ao endereço da Vercel

No Supabase, **Authentication → URL Configuration**:

- **Site URL**: o endereço de produção, ex.: `https://proff.vercel.app`
- **Redirect URLs** → **Add URL**, adicione as duas:
  - `https://proff.vercel.app/**` (troque pelo seu endereço)
  - `https://*-supp3rdan.vercel.app/**` (endereços de teste/preview da Vercel; confira o final do endereço do seu preview e ajuste)

## 4. Testar a branch `teste-vercel-supabase`

1. Na Vercel, **Deployments → Create Deployment** (ou peça para eu enviar um commit na branch) e escolha a branch `teste-vercel-supabase`.
2. Abra o endereço do preview (a Vercel pode pedir seu login da Vercel: é a proteção de previews).
3. Crie uma conta de professor, confirme pelo e-mail e entre.
4. Roteiro de teste rápido:
   - **Turmas**: cadastre uma turma.
   - **Nova aula**: gere uma aula e acompanhe o progresso.
   - Na aula: **Slides → Gerar slides**; **Avaliação → Gerar avaliação → Versões A e B**; **Aula interativa → Gerar**.
   - Edite um slide (✏️), refaça outro (🔄) e troque uma questão.
   - Ative **Link para os alunos** e abra o link numa aba anônima (no preview, a proteção da Vercel pode bloquear alunos; o link para alunos funciona de verdade em produção).
   - **Bimestre**: planeje uma sequência e gere uma aula dela.
   - Feche o navegador no meio de uma geração e volte depois: ela deve ter continuado.

Se algo falhar, veja em **Vercel → Deployments → (deploy) → Logs** e me mande o print.

## 5. Depois de ir para produção

- Desative o GitHub Pages (**GitHub → Settings → Pages → Unpublish**) para ninguém usar a versão antiga.
- Os segredos antigos do GitHub (`GROK_API_SECRET_TRUE`, `API_KEY_GROQ`, `GEMINI_API_KEY`) podem ser apagados.
- O Supabase grátis envia poucos e-mails por hora. Com muitos professores se cadastrando, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.
- Projetos grátis do Supabase podem ser pausados após um período sem uso; basta reativar no painel.
