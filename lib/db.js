// Camada de dados do Proff.
// - Produção (Vercel): Supabase, com a chave service_role (só no servidor).
// - Desenvolvimento/demonstração (DB_MEMORIA=1): tudo em memória, sem Supabase.
// O resto do backend só conversa com as funções exportadas aqui.

import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { BNCC_PADRAO } from './bncc.js';

export const usarMemoria = () => process.env.DB_MEMORIA === '1';

/**
 * Endereço do projeto Supabase limpo: aceita o valor colado com espaços, sem "https://",
 * com barra no fim ou com caminhos como /rest/v1/ ou /auth/v1 (que causam "Invalid path").
 */
export function urlSupabase(valor = process.env.SUPABASE_URL) {
  let url = String(valor || '').trim().replace(/^["']|["']$/g, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // link do painel (supabase.com/dashboard/project/<ref>) → endereço da API do projeto
  const painel = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (painel) return `https://${painel[1]}.supabase.co`;
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/** Chave do ambiente sem espaços, quebras de linha ou aspas coladas por engano. */
export const chaveAmbiente = (nome) => String(process.env[nome] || '').trim().replace(/^["']|["']$/g, '');

let cliente = null;
function sb() {
  if (!cliente) {
    const url = urlSupabase();
    const chave = chaveAmbiente('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou DB_MEMORIA=1 para testar).');
    cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cliente;
}

/** Erro do Supabase vira exceção com mensagem legível. */
/** O banco ainda não tem a coluna sequencias.detalhes (migration de 25/11/2026 não rodada). */
export class ErroBancoDesatualizado extends Error {
  constructor() {
    super('O banco de dados precisa ser atualizado: rode supabase/migrations/20261125000000_planejamento_detalhado.sql no SQL Editor do Supabase.');
  }
}
const faltaColunaDetalhes = (error) => /detalhes/i.test(error?.message || '') && /column|coluna|schema cache/i.test(error?.message || '');

function ok({ data, error }) {
  if (error) throw new Error(`Banco de dados: ${error.message}`);
  return data;
}

export const novoSlug = () => randomBytes(6).toString('base64url');

// ===========================================================================
// Implementação em memória (desenvolvimento e testes)
// ===========================================================================
const M = {
  usuarios: new Map(), // token -> {id, email}
  aulas: new Map(),
  tarefas: new Map(),
  turmas: new Map(),
  questoes: new Map(),
  sequencias: new Map(),
  resultados: [],
  curtidas: new Set(), // `${aula}:${prof}`
  avaliacoes: new Map(), // `${aula}:${prof}:${parte}` -> {...}
  cache: new Map(),
  eventos: [],
  uso: new Map(),
};
const agora = () => new Date().toISOString();
const copia = (o) => (o == null ? o : structuredClone(o));

/** Login de mentira para a demonstração: qualquer e-mail vira um professor. */
export function loginMemoria(email) {
  const existente = [...M.usuarios.values()].find((u) => u.email === email);
  const usuario = existente || { id: randomUUID(), email };
  const token = `demo-${randomBytes(12).toString('hex')}`;
  M.usuarios.set(token, usuario);
  return { token, usuario };
}

// ===========================================================================
// Autenticação
// ===========================================================================
export async function usuarioDoToken(token) {
  if (!token) return null;
  if (usarMemoria()) return M.usuarios.get(token) || null;
  const { data, error } = await sb().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email };
}

// ===========================================================================
// Aulas
// ===========================================================================
const CAMPOS_LISTA = 'id, turma_id, serie, assunto, nivel, bimestre, titulo, publica, comunidade, slug, origem_id, criado_em, atualizado_em';

function resumoAula(a) {
  const e = a.estado || {};
  return {
    ...a,
    estado: undefined,
    tem: {
      plano: Boolean(e.plano),
      slides: Boolean(e.slides?.slides?.length),
      prova: Boolean(e.prova),
      interativa: Boolean(e.interativa?.jogos),
    },
  };
}

export async function listarAulas(professorId, { turmaId, bimestre, busca } = {}) {
  if (usarMemoria()) {
    return [...M.aulas.values()]
      .filter((a) => a.professor_id === professorId)
      .filter((a) => !turmaId || a.turma_id === turmaId)
      .filter((a) => !bimestre || a.bimestre === Number(bimestre))
      .filter((a) => !busca || `${a.assunto} ${a.titulo || ''}`.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))
      .map((a) => resumoAula(copia(a)));
  }
  let q = sb().from('aulas').select(`${CAMPOS_LISTA}, estado`).eq('professor_id', professorId).order('atualizado_em', { ascending: false }).limit(200);
  if (turmaId) q = q.eq('turma_id', turmaId);
  if (bimestre) q = q.eq('bimestre', Number(bimestre));
  if (busca) q = q.or(`assunto.ilike.%${busca.replace(/[%,()]/g, ' ')}%,titulo.ilike.%${busca.replace(/[%,()]/g, ' ')}%`);
  return ok(await q).map(resumoAula);
}

export async function obterAula(id) {
  if (usarMemoria()) return copia(M.aulas.get(id)) || null;
  return ok(await sb().from('aulas').select('*').eq('id', id).maybeSingle());
}

export async function obterAulaPorSlug(slug) {
  if (usarMemoria()) return copia([...M.aulas.values()].find((a) => a.slug === slug && a.publica)) || null;
  return ok(await sb().from('aulas').select('*').eq('slug', slug).eq('publica', true).maybeSingle());
}

export async function criarAula(dados) {
  const aula = {
    id: randomUUID(), turma_id: null, observacoes: '', nivel: 'regular', bimestre: null, titulo: null,
    estado: {}, origem_id: null, publica: false, comunidade: false, slug: null,
    criado_em: agora(), atualizado_em: agora(), ...dados,
  };
  if (usarMemoria()) {
    M.aulas.set(aula.id, copia(aula));
    return aula;
  }
  const { id, criado_em, atualizado_em, ...campos } = aula;
  return ok(await sb().from('aulas').insert(campos).select('*').single());
}

export async function atualizarAula(id, campos) {
  if (usarMemoria()) {
    const a = M.aulas.get(id);
    if (!a) return null;
    Object.assign(a, copia(campos), { atualizado_em: agora() });
    return copia(a);
  }
  return ok(await sb().from('aulas').update(campos).eq('id', id).select('*').single());
}

export async function excluirAula(id) {
  if (usarMemoria()) {
    M.aulas.delete(id);
    return;
  }
  ok(await sb().from('aulas').delete().eq('id', id));
}

export async function listarComunidade({ serie, busca } = {}) {
  let lista;
  if (usarMemoria()) {
    lista = [...M.aulas.values()].filter((a) => a.comunidade).map(copia);
  } else {
    let q = sb().from('aulas').select(`${CAMPOS_LISTA}, estado, professor_id`).eq('comunidade', true).order('atualizado_em', { ascending: false }).limit(100);
    if (serie) q = q.eq('serie', Number(serie));
    if (busca) q = q.ilike('assunto', `%${busca.replace(/[%,()]/g, ' ')}%`);
    lista = ok(await q);
  }
  lista = lista
    .filter((a) => !serie || a.serie === Number(serie))
    .filter((a) => !busca || a.assunto.toLowerCase().includes(busca.toLowerCase()));
  const curtidas = await contarCurtidas(lista.map((a) => a.id));
  return lista.map((a) => ({ ...resumoAula(a), professor_id: a.professor_id, curtidas: curtidas[a.id] || 0 }));
}

// ===========================================================================
// Tarefas (fila)
// ===========================================================================
export async function criarTarefa(dados) {
  const t = { id: randomUUID(), status: 'pendente', etapas: [], erro: null, travada_ate: null, aula_id: null, sequencia_id: null, criado_em: agora(), atualizado_em: agora(), ...dados };
  if (usarMemoria()) {
    M.tarefas.set(t.id, copia(t));
    return t;
  }
  const { id, criado_em, atualizado_em, ...campos } = t;
  return ok(await sb().from('tarefas').insert(campos).select('*').single());
}

export async function obterTarefa(id) {
  if (usarMemoria()) return copia(M.tarefas.get(id)) || null;
  return ok(await sb().from('tarefas').select('*').eq('id', id).maybeSingle());
}

export async function atualizarTarefa(id, campos) {
  if (usarMemoria()) {
    const t = M.tarefas.get(id);
    Object.assign(t, copia(campos), { atualizado_em: agora() });
    return copia(t);
  }
  return ok(await sb().from('tarefas').update(campos).eq('id', id).select('*').single());
}

/** Pega a tarefa para executar uma etapa; null se outro worker já estiver nela. */
export async function travarTarefa(id, segundos) {
  if (usarMemoria()) {
    const t = M.tarefas.get(id);
    if (!t || !['pendente', 'rodando'].includes(t.status)) return null;
    if (t.travada_ate && new Date(t.travada_ate) > new Date()) return null;
    Object.assign(t, { status: 'rodando', travada_ate: new Date(Date.now() + segundos * 1000).toISOString(), atualizado_em: agora() });
    return copia(t);
  }
  const linhas = ok(await sb().rpc('travar_tarefa', { p_tarefa: id, p_segundos: segundos }));
  return linhas?.[0] || null;
}

export async function tarefasAtivas({ aulaId, sequenciaId }) {
  if (usarMemoria()) {
    return [...M.tarefas.values()]
      .filter((t) => ['pendente', 'rodando'].includes(t.status) && (aulaId ? t.aula_id === aulaId : t.sequencia_id === sequenciaId))
      .map(copia);
  }
  let q = sb().from('tarefas').select('*').in('status', ['pendente', 'rodando']);
  q = aulaId ? q.eq('aula_id', aulaId) : q.eq('sequencia_id', sequenciaId);
  return ok(await q);
}

// ===========================================================================
// Turmas
// ===========================================================================
export async function listarTurmas(professorId) {
  if (usarMemoria()) return [...M.turmas.values()].filter((t) => t.professor_id === professorId).map(copia);
  return ok(await sb().from('turmas').select('*').eq('professor_id', professorId).order('nome'));
}

export async function obterTurma(id) {
  if (usarMemoria()) return copia(M.turmas.get(id)) || null;
  return ok(await sb().from('turmas').select('*').eq('id', id).maybeSingle());
}

export async function criarTurma(dados) {
  const t = { id: randomUUID(), ano_letivo: new Date().getFullYear(), criado_em: agora(), ...dados };
  if (usarMemoria()) {
    M.turmas.set(t.id, copia(t));
    return t;
  }
  const { id, criado_em, ...campos } = t;
  return ok(await sb().from('turmas').insert(campos).select('*').single());
}

export async function excluirTurma(id) {
  if (usarMemoria()) {
    M.turmas.delete(id);
    for (const a of M.aulas.values()) if (a.turma_id === id) a.turma_id = null;
    return;
  }
  ok(await sb().from('turmas').delete().eq('id', id));
}

// ===========================================================================
// Banco de questões
// ===========================================================================
export async function inserirQuestoes(lista) {
  if (!lista.length) return [];
  const linhas = lista.map((q) => ({ id: randomUUID(), criado_em: agora(), ...q }));
  if (usarMemoria()) {
    linhas.forEach((q) => M.questoes.set(q.id, copia(q)));
    return linhas;
  }
  return ok(await sb().from('questoes').insert(linhas.map(({ id, criado_em, ...q }) => q)).select('*'));
}

export async function listarQuestoes(professorId, { serie, busca, tipo } = {}) {
  if (usarMemoria()) {
    return [...M.questoes.values()]
      .filter((q) => q.professor_id === professorId)
      .filter((q) => !serie || q.serie === Number(serie))
      .filter((q) => !tipo || q.tipo === tipo)
      .filter((q) => !busca || `${q.assunto} ${q.enunciado}`.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .slice(0, 200)
      .map(copia);
  }
  let q = sb().from('questoes').select('*').eq('professor_id', professorId).order('criado_em', { ascending: false }).limit(200);
  if (serie) q = q.eq('serie', Number(serie));
  if (tipo) q = q.eq('tipo', tipo);
  if (busca) {
    const b = busca.replace(/[%,()]/g, ' ');
    q = q.or(`assunto.ilike.%${b}%,enunciado.ilike.%${b}%`);
  }
  return ok(await q);
}

export async function obterQuestoes(ids, professorId) {
  if (!ids.length) return [];
  if (usarMemoria()) return ids.map((id) => M.questoes.get(id)).filter((q) => q && q.professor_id === professorId).map(copia);
  return ok(await sb().from('questoes').select('*').in('id', ids).eq('professor_id', professorId));
}

export async function excluirQuestao(id, professorId) {
  if (usarMemoria()) {
    if (M.questoes.get(id)?.professor_id === professorId) M.questoes.delete(id);
    return;
  }
  ok(await sb().from('questoes').delete().eq('id', id).eq('professor_id', professorId));
}

// ===========================================================================
// Sequências (bimestre)
// ===========================================================================
export async function criarSequencia(dados) {
  const s = { id: randomUUID(), itens: [], titulo: null, turma_id: null, bimestre: null, detalhes: {}, criado_em: agora(), ...dados };
  if (usarMemoria()) {
    M.sequencias.set(s.id, copia(s));
    return s;
  }
  const { id, criado_em, ...campos } = s;
  const r = await sb().from('sequencias').insert(campos).select('*').single();
  if (r.error && faltaColunaDetalhes(r.error)) {
    // banco antigo: cria sem a coluna nova (a lista de aulas continua funcionando)
    const { detalhes, ...semDetalhes } = campos;
    return { detalhes: {}, ...ok(await sb().from('sequencias').insert(semDetalhes).select('*').single()) };
  }
  return { detalhes: {}, ...ok(r) };
}

export async function listarSequencias(professorId) {
  if (usarMemoria()) return [...M.sequencias.values()].filter((s) => s.professor_id === professorId).sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map(copia);
  return ok(await sb().from('sequencias').select('*').eq('professor_id', professorId).order('criado_em', { ascending: false }));
}

export async function obterSequencia(id) {
  if (usarMemoria()) return copia(M.sequencias.get(id)) || null;
  return ok(await sb().from('sequencias').select('*').eq('id', id).maybeSingle());
}

export async function atualizarSequencia(id, campos) {
  if (usarMemoria()) {
    Object.assign(M.sequencias.get(id), copia(campos));
    return copia(M.sequencias.get(id));
  }
  const r = await sb().from('sequencias').update(campos).eq('id', id).select('*').single();
  if (r.error && faltaColunaDetalhes(r.error)) throw new ErroBancoDesatualizado();
  return { detalhes: {}, ...ok(r) };
}

export async function excluirSequencia(id) {
  if (usarMemoria()) {
    M.sequencias.delete(id);
    return;
  }
  ok(await sb().from('sequencias').delete().eq('id', id));
}

// ===========================================================================
// Resultados dos alunos
// ===========================================================================
export async function inserirResultado(r) {
  const linha = { id: randomUUID(), criado_em: agora(), ...r };
  if (usarMemoria()) {
    M.resultados.push(copia(linha));
    return linha;
  }
  const { id, criado_em, ...campos } = linha;
  return ok(await sb().from('resultados').insert(campos).select('id').single());
}

export async function contarResultadosRecentes(aulaId, minutos) {
  const desde = new Date(Date.now() - minutos * 60000).toISOString();
  if (usarMemoria()) return M.resultados.filter((r) => r.aula_id === aulaId && r.criado_em > desde).length;
  const { count, error } = await sb().from('resultados').select('id', { count: 'exact', head: true }).eq('aula_id', aulaId).gt('criado_em', desde);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function listarResultados(aulaIds) {
  if (!aulaIds.length) return [];
  if (usarMemoria()) return M.resultados.filter((r) => aulaIds.includes(r.aula_id)).map(copia);
  return ok(await sb().from('resultados').select('*').in('aula_id', aulaIds).order('criado_em', { ascending: false }).limit(2000));
}

// ===========================================================================
// Comunidade: curtidas
// ===========================================================================
export async function alternarCurtida(aulaId, professorId) {
  const chave = `${aulaId}:${professorId}`;
  if (usarMemoria()) {
    if (M.curtidas.has(chave)) M.curtidas.delete(chave);
    else M.curtidas.add(chave);
    return M.curtidas.has(chave);
  }
  const existe = ok(await sb().from('curtidas').select('aula_id').eq('aula_id', aulaId).eq('professor_id', professorId).maybeSingle());
  if (existe) {
    ok(await sb().from('curtidas').delete().eq('aula_id', aulaId).eq('professor_id', professorId));
    return false;
  }
  ok(await sb().from('curtidas').insert({ aula_id: aulaId, professor_id: professorId }));
  return true;
}

export async function contarCurtidas(aulaIds) {
  const contagem = {};
  if (!aulaIds.length) return contagem;
  if (usarMemoria()) {
    for (const c of M.curtidas) {
      const [aula] = c.split(':');
      if (aulaIds.includes(aula)) contagem[aula] = (contagem[aula] || 0) + 1;
    }
    return contagem;
  }
  for (const { aula_id } of ok(await sb().from('curtidas').select('aula_id').in('aula_id', aulaIds))) {
    contagem[aula_id] = (contagem[aula_id] || 0) + 1;
  }
  return contagem;
}

export async function minhasCurtidas(professorId) {
  if (usarMemoria()) return [...M.curtidas].filter((c) => c.endsWith(`:${professorId}`)).map((c) => c.split(':')[0]);
  return ok(await sb().from('curtidas').select('aula_id').eq('professor_id', professorId)).map((c) => c.aula_id);
}

// ===========================================================================
// Avaliação do conteúdo (👍/👎) e referências para os prompts
// ===========================================================================
export async function salvarAvaliacao({ aula_id, professor_id, parte, nota, comentario }) {
  const linha = { aula_id, professor_id, parte, nota, comentario: comentario || null };
  if (usarMemoria()) {
    M.avaliacoes.set(`${aula_id}:${professor_id}:${parte}`, { ...linha, criado_em: agora() });
    return linha;
  }
  return ok(await sb().from('avaliacoes_conteudo').upsert(linha, { onConflict: 'aula_id,professor_id,parte' }).select('*').single());
}

export async function avaliacoesDaAula(aulaId, professorId) {
  if (usarMemoria()) return [...M.avaliacoes.values()].filter((a) => a.aula_id === aulaId && a.professor_id === professorId).map(copia);
  return ok(await sb().from('avaliacoes_conteudo').select('parte, nota, comentario').eq('aula_id', aulaId).eq('professor_id', professorId));
}

/**
 * Aula bem avaliada (👍 no plano) da mesma série e assunto parecido, de qualquer
 * professor, para servir de exemplo no prompt do plano.
 */
export async function aulaDeReferencia(serie, assunto) {
  const termo = assunto.split(/\s+/).filter((p) => p.length > 3)[0] || assunto;
  let candidatas;
  if (usarMemoria()) {
    const boas = new Set([...M.avaliacoes.values()].filter((a) => a.parte === 'plano' && a.nota === 1).map((a) => a.aula_id));
    candidatas = [...M.aulas.values()].filter((a) => boas.has(a.id));
  } else {
    const boas = ok(await sb().from('avaliacoes_conteudo').select('aula_id').eq('parte', 'plano').eq('nota', 1).limit(500)).map((a) => a.aula_id);
    if (!boas.length) return null;
    candidatas = ok(await sb().from('aulas').select('id, serie, assunto, estado').in('id', boas.slice(0, 200)).eq('serie', Number(serie)).ilike('assunto', `%${termo.replace(/[%,()]/g, ' ')}%`).limit(5));
  }
  const a = candidatas.find((c) => c.serie === Number(serie) && c.assunto.toLowerCase().includes(termo.toLowerCase()) && c.estado?.plano);
  return a ? copia(a.estado.plano) : null;
}

// ===========================================================================
// IA: cache, eventos e uso diário
// ===========================================================================
export async function lerCache(chave) {
  if (usarMemoria()) return copia(M.cache.get(chave)?.resposta) ?? null;
  const linha = ok(await sb().from('cache_ia').select('resposta, usos').eq('chave', chave).maybeSingle());
  if (!linha) return null;
  sb().from('cache_ia').update({ usos: linha.usos + 1 }).eq('chave', chave).then(() => {}, () => {});
  return linha.resposta;
}

export async function gravarCache(chave, tarefa, resposta) {
  if (usarMemoria()) {
    M.cache.set(chave, { tarefa, resposta: copia(resposta) });
    return;
  }
  ok(await sb().from('cache_ia').upsert({ chave, tarefa, resposta }, { onConflict: 'chave' }));
}

export async function registrarEvento(evento) {
  if (usarMemoria()) {
    M.eventos.push({ ...evento, criado_em: agora() });
    return;
  }
  ok(await sb().from('eventos_ia').insert(evento));
}

/** {provedor: taxa de erro 0..1} nos últimos minutos. */
export async function saudeProvedores(minutos = 30) {
  let linhas;
  if (usarMemoria()) {
    const desde = new Date(Date.now() - minutos * 60000).toISOString();
    const grupos = {};
    for (const e of M.eventos.filter((e) => e.criado_em > desde)) {
      grupos[e.provedor] ||= { provedor: e.provedor, total: 0, erros: 0 };
      grupos[e.provedor].total++;
      if (!e.ok) grupos[e.provedor].erros++;
    }
    linhas = Object.values(grupos);
  } else {
    linhas = ok(await sb().rpc('saude_provedores', { p_minutos: minutos }));
  }
  return Object.fromEntries(linhas.map((l) => [l.provedor, { total: Number(l.total), taxaErro: Number(l.erros) / Math.max(1, Number(l.total)) }]));
}

export async function registrarUso(professorId) {
  if (usarMemoria()) {
    const chave = `${professorId}:${new Date().toISOString().slice(0, 10)}`;
    M.uso.set(chave, (M.uso.get(chave) || 0) + 1);
    return M.uso.get(chave);
  }
  return ok(await sb().rpc('registrar_uso', { p_professor: professorId }));
}

// ===========================================================================
// BNCC
// ===========================================================================
let bnccCache = null;
export async function listarBncc() {
  if (bnccCache) return bnccCache;
  if (usarMemoria()) {
    bnccCache = BNCC_PADRAO;
  } else {
    const linhas = ok(await sb().from('bncc').select('codigo, competencia, resumo').order('codigo'));
    bnccCache = linhas.length ? linhas : BNCC_PADRAO;
  }
  return bnccCache;
}
