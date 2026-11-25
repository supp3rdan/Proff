-- Planejamento detalhado do bimestre (habilidades BNCC, objetivos, conteúdos, avaliação)
-- e cabeçalho do documento .docx (professor, escola, turma).
-- Para projetos criados antes de 25/11/2026. Pode ser rodado mais de uma vez.
-- (O arquivo 20261124000000_proff.sql já inclui esta coluna para projetos novos.)
alter table public.sequencias add column if not exists detalhes jsonb not null default '{}'::jsonb;
