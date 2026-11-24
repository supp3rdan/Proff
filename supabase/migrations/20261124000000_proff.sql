-- Proff: banco de dados no Supabase.
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou com `supabase db push`).
-- O backend (Vercel) usa a chave service_role e confere o dono de cada registro;
-- as políticas de RLS abaixo protegem o acesso direto pelo navegador (chave anon).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Professores (perfil ligado ao login do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  escola text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Turmas
-- ---------------------------------------------------------------------------
create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  serie smallint not null check (serie between 1 and 3),
  ano_letivo smallint not null default extract(year from now())::smallint,
  criado_em timestamptz not null default now()
);
create index if not exists turmas_professor on public.turmas (professor_id);

-- ---------------------------------------------------------------------------
-- Aulas: todo o conteúdo gerado fica em "estado" (jsonb), como no app
-- ---------------------------------------------------------------------------
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users (id) on delete cascade,
  turma_id uuid references public.turmas (id) on delete set null,
  serie smallint not null check (serie between 1 and 3),
  assunto text not null check (char_length(assunto) between 1 and 150),
  observacoes text not null default '' check (char_length(observacoes) <= 1500),
  nivel text not null default 'regular' check (nivel in ('regular', 'reforco', 'avancado', 'inclusao')),
  bimestre smallint check (bimestre between 1 and 4),
  titulo text,
  estado jsonb not null default '{}'::jsonb,
  origem_id uuid references public.aulas (id) on delete set null, -- versão/duplicata de outra aula
  publica boolean not null default false,       -- link público da aula interativa
  comunidade boolean not null default false,    -- aparece na comunidade
  slug text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists aulas_professor on public.aulas (professor_id, atualizado_em desc);
create index if not exists aulas_comunidade on public.aulas (comunidade, serie) where comunidade;

-- ---------------------------------------------------------------------------
-- Tarefas (fila de geração em segundo plano)
-- ---------------------------------------------------------------------------
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users (id) on delete cascade,
  aula_id uuid references public.aulas (id) on delete cascade,
  sequencia_id uuid,
  tipo text not null check (tipo in ('plano', 'slides', 'prova', 'interativa', 'sequencia')),
  status text not null default 'pendente' check (status in ('pendente', 'rodando', 'pronta', 'erro')),
  etapas jsonb not null default '[]'::jsonb,   -- [{id, rotulo, situacao, detalhe}]
  erro text,
  sem_cache boolean not null default false,     -- "gerar de novo": ignora o cache da IA
  travada_ate timestamptz,                      -- trava enquanto um worker executa uma etapa
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.tarefas add column if not exists sem_cache boolean not null default false;
create index if not exists tarefas_aula on public.tarefas (aula_id, criado_em desc);
create index if not exists tarefas_ativas on public.tarefas (status) where status in ('pendente', 'rodando');

-- ---------------------------------------------------------------------------
-- Banco de questões (as questões das avaliações são guardadas aqui)
-- ---------------------------------------------------------------------------
create table if not exists public.questoes (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users (id) on delete cascade,
  aula_id uuid references public.aulas (id) on delete set null,
  serie smallint not null,
  assunto text not null,
  tipo text not null check (tipo in ('multipla', 'discursiva')),
  nivel text,
  enunciado text not null,
  alternativas jsonb not null default '[]'::jsonb,
  resposta text,
  resolucao jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists questoes_professor on public.questoes (professor_id, serie, criado_em desc);

-- ---------------------------------------------------------------------------
-- Planejamento do bimestre (sequência didática)
-- ---------------------------------------------------------------------------
create table if not exists public.sequencias (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users (id) on delete cascade,
  turma_id uuid references public.turmas (id) on delete set null,
  serie smallint not null check (serie between 1 and 3),
  bimestre smallint check (bimestre between 1 and 4),
  conteudos text not null check (char_length(conteudos) <= 2000),
  quantidade smallint not null default 8 check (quantidade between 2 and 20),
  titulo text,
  itens jsonb not null default '[]'::jsonb,     -- [{ordem, assunto, objetivo, observacoes, aula_id}]
  criado_em timestamptz not null default now()
);
create index if not exists sequencias_professor on public.sequencias (professor_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Resultados dos alunos nos jogos da aula interativa (sem login do aluno)
-- LGPD: guarda só um apelido escolhido pelo aluno e os acertos.
-- ---------------------------------------------------------------------------
create table if not exists public.resultados (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas (id) on delete cascade,
  apelido text not null check (char_length(apelido) between 1 and 40),
  acertos smallint not null check (acertos >= 0),
  total smallint not null check (total > 0),
  detalhes jsonb not null default '{}'::jsonb,  -- {erros: ["quiz:2", "vf:1", ...]}
  criado_em timestamptz not null default now()
);
create index if not exists resultados_aula on public.resultados (aula_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Comunidade: curtidas
-- ---------------------------------------------------------------------------
create table if not exists public.curtidas (
  aula_id uuid not null references public.aulas (id) on delete cascade,
  professor_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (aula_id, professor_id)
);

-- ---------------------------------------------------------------------------
-- Avaliação do conteúdo gerado (👍/👎 e correções) — usado para melhorar os prompts
-- ---------------------------------------------------------------------------
create table if not exists public.avaliacoes_conteudo (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas (id) on delete cascade,
  professor_id uuid not null references auth.users (id) on delete cascade,
  parte text not null check (parte in ('plano', 'slides', 'prova', 'interativa')),
  nota smallint not null check (nota in (-1, 1)),
  comentario text check (char_length(comentario) <= 1000),
  criado_em timestamptz not null default now(),
  unique (aula_id, professor_id, parte)
);

-- ---------------------------------------------------------------------------
-- Infraestrutura de IA: cache, eventos (monitor de provedores) e limite diário
-- Só o backend acessa estas tabelas.
-- ---------------------------------------------------------------------------
create table if not exists public.cache_ia (
  chave text primary key,                       -- sha256 do pedido
  tarefa text not null,
  resposta jsonb not null,
  usos integer not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.eventos_ia (
  id bigint generated always as identity primary key,
  provedor text not null,
  modelo text,
  tarefa text,
  ok boolean not null,
  ms integer,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists eventos_ia_recentes on public.eventos_ia (criado_em desc);

create table if not exists public.uso_diario (
  professor_id uuid not null references auth.users (id) on delete cascade,
  dia date not null default current_date,
  chamadas integer not null default 0,
  primary key (professor_id, dia)
);

-- soma 1 ao uso do dia e devolve o total (atômico)
create or replace function public.registrar_uso(p_professor uuid)
returns integer language sql security definer set search_path = public as $$
  insert into public.uso_diario (professor_id, dia, chamadas)
  values (p_professor, current_date, 1)
  on conflict (professor_id, dia) do update set chamadas = public.uso_diario.chamadas + 1
  returning chamadas;
$$;

-- pega a tarefa para um worker, se não estiver travada por outro (atômico)
create or replace function public.travar_tarefa(p_tarefa uuid, p_segundos integer)
returns setof public.tarefas language sql security definer set search_path = public as $$
  update public.tarefas
     set status = 'rodando', travada_ate = now() + make_interval(secs => p_segundos), atualizado_em = now()
   where id = p_tarefa
     and status in ('pendente', 'rodando')
     and (travada_ate is null or travada_ate < now())
  returning *;
$$;

-- taxa de erro recente por provedor (para escolher o mais estável)
create or replace function public.saude_provedores(p_minutos integer default 30)
returns table (provedor text, total bigint, erros bigint)
language sql stable security definer set search_path = public as $$
  select provedor, count(*), count(*) filter (where not ok)
    from public.eventos_ia
   where criado_em > now() - make_interval(mins => p_minutos)
   group by provedor;
$$;

-- ---------------------------------------------------------------------------
-- BNCC: habilidades de Matemática e suas Tecnologias (Ensino Médio)
-- "resumo" é uma descrição curta; o texto oficial está no documento da BNCC:
-- http://basenacionalcomum.mec.gov.br/
-- ---------------------------------------------------------------------------
create table if not exists public.bncc (
  codigo text primary key check (codigo ~ '^EM13MAT[1-5][0-9]{2}$'),
  competencia smallint not null check (competencia between 1 and 5),
  resumo text not null
);

insert into public.bncc (codigo, competencia, resumo) values
  ('EM13MAT101', 1, 'Interpretar criticamente situações econômicas, sociais e científicas que envolvem variação de grandezas, com gráficos e taxas'),
  ('EM13MAT102', 1, 'Analisar tabelas, gráficos e pesquisas estatísticas divulgadas na mídia, identificando inadequações'),
  ('EM13MAT103', 1, 'Interpretar textos científicos e da mídia que usam unidades de medida e suas conversões'),
  ('EM13MAT104', 1, 'Interpretar índices socioeconômicos (como IDH e inflação) e como são calculados'),
  ('EM13MAT105', 1, 'Usar transformações isométricas e homotéticas para construir figuras e analisar produções naturais e humanas'),
  ('EM13MAT106', 1, 'Tomar decisões no cotidiano considerando riscos probabilísticos'),
  ('EM13MAT201', 2, 'Propor ações comunitárias que envolvam medições de perímetro, área, volume, capacidade ou massa'),
  ('EM13MAT202', 2, 'Planejar e executar pesquisa amostral e comunicar os resultados com gráficos e interpretações'),
  ('EM13MAT203', 2, 'Aplicar conceitos matemáticos em aplicativos e planilhas, como controle de orçamento e simuladores'),
  ('EM13MAT301', 3, 'Resolver e elaborar problemas com sistemas de equações lineares, por métodos algébricos ou gráficos'),
  ('EM13MAT302', 3, 'Construir modelos com funções polinomiais de 1º e 2º graus para resolver problemas'),
  ('EM13MAT303', 3, 'Interpretar e comparar juros simples e compostos, relacionando crescimento linear e exponencial'),
  ('EM13MAT304', 3, 'Resolver problemas com funções exponenciais, como em matemática financeira'),
  ('EM13MAT305', 3, 'Resolver problemas com funções logarítmicas, como abalos sísmicos, pH e radioatividade'),
  ('EM13MAT306', 3, 'Modelar fenômenos periódicos com as funções seno e cosseno'),
  ('EM13MAT307', 3, 'Calcular áreas de superfícies por reconfiguração ou aproximação e deduzir fórmulas'),
  ('EM13MAT308', 3, 'Aplicar relações métricas, leis do seno e do cosseno, congruência e semelhança de triângulos'),
  ('EM13MAT309', 3, 'Calcular áreas totais e volumes de prismas, pirâmides e corpos redondos em situações reais'),
  ('EM13MAT310', 3, 'Resolver problemas de contagem com agrupamentos ordenáveis ou não (princípios aditivo e multiplicativo)'),
  ('EM13MAT311', 3, 'Identificar espaços amostrais e contar possibilidades para calcular probabilidades'),
  ('EM13MAT312', 3, 'Calcular probabilidades de eventos em experimentos aleatórios sucessivos'),
  ('EM13MAT313', 3, 'Usar notação científica e algarismos significativos, reconhecendo a imprecisão das medidas'),
  ('EM13MAT314', 3, 'Resolver problemas com grandezas determinadas por razão ou produto de outras (velocidade, densidade)'),
  ('EM13MAT315', 3, 'Investigar e registrar algoritmos por meio de fluxogramas'),
  ('EM13MAT316', 3, 'Calcular e interpretar medidas de tendência central e de dispersão'),
  ('EM13MAT401', 4, 'Converter representações de funções polinomiais de 1º grau para o plano cartesiano'),
  ('EM13MAT402', 4, 'Converter representações de funções polinomiais de 2º grau para o plano cartesiano'),
  ('EM13MAT403', 4, 'Relacionar representações de funções exponenciais e logarítmicas em tabelas e no plano cartesiano'),
  ('EM13MAT404', 4, 'Analisar funções definidas por mais de uma sentença (como tarifas e imposto de renda)'),
  ('EM13MAT405', 4, 'Utilizar conceitos iniciais de linguagem de programação para implementar algoritmos'),
  ('EM13MAT406', 4, 'Construir tabelas e gráficos de frequência a partir de dados de pesquisas'),
  ('EM13MAT407', 4, 'Comparar conjuntos de dados com histogramas, box-plot, ramo-e-folhas e outros gráficos'),
  ('EM13MAT501', 5, 'Investigar números em tabelas no plano cartesiano e generalizar como função polinomial de 1º grau'),
  ('EM13MAT502', 5, 'Investigar números em tabelas no plano cartesiano e generalizar como função polinomial de 2º grau (y = ax²)'),
  ('EM13MAT503', 5, 'Investigar pontos de máximo e mínimo de funções quadráticas em contextos diversos'),
  ('EM13MAT504', 5, 'Investigar volumes de prismas, pirâmides, cilindros e cones, incluindo o princípio de Cavalieri'),
  ('EM13MAT505', 5, 'Resolver problemas de ladrilhamento do plano e conjecturar sobre os polígonos que ladrilham'),
  ('EM13MAT506', 5, 'Representar graficamente a variação de área e perímetro de polígonos regulares'),
  ('EM13MAT507', 5, 'Associar progressões aritméticas a funções afins de domínio discreto'),
  ('EM13MAT508', 5, 'Associar progressões geométricas a funções exponenciais de domínio discreto'),
  ('EM13MAT509', 5, 'Investigar deformações de ângulos e áreas em projeções cartográficas'),
  ('EM13MAT510', 5, 'Investigar dados de duas variáveis e, quando adequado, ajustar uma reta'),
  ('EM13MAT511', 5, 'Reconhecer espaços amostrais discretos ou não e eventos equiprováveis ou não')
on conflict (codigo) do update set competencia = excluded.competencia, resumo = excluded.resumo;

-- ---------------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists aulas_atualizado on public.aulas;
create trigger aulas_atualizado before update on public.aulas
  for each row execute function public.tocar_atualizado_em();
drop trigger if exists tarefas_atualizado on public.tarefas;
create trigger tarefas_atualizado before update on public.tarefas
  for each row execute function public.tocar_atualizado_em();

-- cria o perfil quando o professor se cadastra
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome) values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------------
-- Segurança (RLS): cada professor só enxerga o que é dele.
-- O backend usa service_role (ignora RLS) e confere o dono no código.
-- ---------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.turmas enable row level security;
alter table public.aulas enable row level security;
alter table public.tarefas enable row level security;
alter table public.questoes enable row level security;
alter table public.sequencias enable row level security;
alter table public.resultados enable row level security;
alter table public.curtidas enable row level security;
alter table public.avaliacoes_conteudo enable row level security;
alter table public.cache_ia enable row level security;
alter table public.eventos_ia enable row level security;
alter table public.uso_diario enable row level security;
alter table public.bncc enable row level security;

drop policy if exists "perfil próprio" on public.perfis;
create policy "perfil próprio" on public.perfis for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "turmas próprias" on public.turmas;
create policy "turmas próprias" on public.turmas for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "aulas próprias" on public.aulas;
create policy "aulas próprias" on public.aulas for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "aulas da comunidade" on public.aulas;
create policy "aulas da comunidade" on public.aulas for select to authenticated
  using (comunidade);

-- leitura das próprias tarefas (o app acompanha o progresso em tempo real)
drop policy if exists "tarefas próprias" on public.tarefas;
create policy "tarefas próprias" on public.tarefas for select to authenticated
  using (professor_id = auth.uid());

drop policy if exists "questões próprias" on public.questoes;
create policy "questões próprias" on public.questoes for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "sequências próprias" on public.sequencias;
create policy "sequências próprias" on public.sequencias for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "resultados das minhas aulas" on public.resultados;
create policy "resultados das minhas aulas" on public.resultados for select to authenticated
  using (exists (select 1 from public.aulas a where a.id = aula_id and a.professor_id = auth.uid()));

drop policy if exists "curtidas próprias" on public.curtidas;
create policy "curtidas próprias" on public.curtidas for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "avaliações próprias" on public.avaliacoes_conteudo;
create policy "avaliações próprias" on public.avaliacoes_conteudo for all to authenticated
  using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "bncc pública" on public.bncc;
create policy "bncc pública" on public.bncc for select to anon, authenticated using (true);
-- cache_ia, eventos_ia e uso_diario: sem políticas = ninguém acessa pelo navegador.

-- ---------------------------------------------------------------------------
-- Tempo real: o app recebe o progresso das tarefas na hora
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tarefas') then
    alter publication supabase_realtime add table public.tarefas;
  end if;
end;
$$;

-- limpeza (opcional): apague eventos e cache antigos de vez em quando
--   delete from public.eventos_ia where criado_em < now() - interval '30 days';
--   delete from public.cache_ia where criado_em < now() - interval '60 days';
