// API do Proff (uma função só na Vercel, para caber no limite do plano grátis).
// Rota no parâmetro ?rota=... (a Vercel reescreve /v1/<rota> para cá; ver vercel.json).
//
// Tudo exige login (Supabase Auth), menos: status, login-demo, publica/* e worker (segredo interno).

import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import * as db from '../lib/db.js';
import { enviarJSON, enviarHTML, lerCorpo, tokenDaRequisicao } from '../lib/http.js';
import { clienteServidor, provedoresConfigurados, ErroLimite } from '../lib/ia.js';
import { iniciarTarefa, processar, retomarSeParada } from '../lib/tarefas.js';
import { resumirResultados } from '../lib/resultados.js';
import { validarEntrada, ErroEntrada, regerarSlide, regerarQuestao, NIVEIS_VALIDOS } from '../public/core/gerador.js';
import { ErroLLM } from '../public/core/llm.js';
import { dadosDaPagina } from '../public/core/interativa.js';
import { criarVersoes } from '../public/core/versoes.js';
import { montarPaginaInterativa } from '../public/interativa/montar.js';

export const config = { maxDuration: 300 };

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}
const naoEncontrado = (o = 'Item') => new ErroHttp(404, `${o} não encontrado.`);

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v) => {
  if (!UUID.test(String(v || ''))) throw new ErroHttp(400, 'Identificador inválido.');
  return String(v);
};
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const inteiro = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new ErroHttp(400, `Valor fora do intervalo (${min} a ${max}).`);
  return n;
};
const tamanhoJson = (v) => JSON.stringify(v ?? null).length;

async function exigirUsuario(req) {
  const usuario = await db.usuarioDoToken(tokenDaRequisicao(req));
  if (!usuario) throw new ErroHttp(401, 'Faça login para continuar.');
  return usuario;
}

async function aulaDoProfessor(aulaId, usuario) {
  const aula = await db.obterAula(id(aulaId));
  if (!aula || aula.professor_id !== usuario.id) throw naoEncontrado('Aula');
  return aula;
}

async function turmaDoProfessor(turmaId, usuario) {
  if (!turmaId) return null;
  const turma = await db.obterTurma(id(turmaId));
  if (!turma || turma.professor_id !== usuario.id) throw naoEncontrado('Turma');
  return turma;
}

function segredoInterno(req) {
  const esperado = Buffer.from(process.env.WORKER_SECRET || '');
  const recebido = Buffer.from(String(req.headers['x-worker-secret'] || ''));
  return esperado.length > 0 && esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const entradaDaAula = (a) => ({ serie: String(a.serie), assunto: a.assunto, observacoes: a.observacoes || '', nivel: a.nivel });

/** Lê os arquivos da página interativa do disco (no servidor). */
const lerArquivoDaPagina = (caminho) => readFile(new URL(`../public/interativa/${caminho}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// rotas
// ---------------------------------------------------------------------------
const ROTAS = [];
const rota = (metodo, padrao, fn) => ROTAS.push({ metodo, partes: padrao.split('/'), fn });

function casar(metodo, caminho) {
  const partes = caminho.split('/').filter(Boolean);
  for (const r of ROTAS) {
    if (r.metodo !== metodo || r.partes.length !== partes.length) continue;
    const params = {};
    if (r.partes.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(partes[i])), true) : p === partes[i]))) {
      return { fn: r.fn, params };
    }
  }
  return null;
}

// ---------- público ----------
rota('GET', 'status', async () => ({
  proff: true,
  modo: 'servidor',
  autenticacao: db.usarMemoria() ? 'demo' : 'supabase',
  supabase: db.usarMemoria() ? null : { url: db.urlSupabase(), anonKey: db.chaveAmbiente('SUPABASE_ANON_KEY') },
  provedores: provedoresConfigurados(),
  limiteDiario: Number(process.env.LIMITE_DIARIO || 400),
}));

rota('POST', 'login-demo', async ({ corpo }) => {
  if (!db.usarMemoria()) throw new ErroHttp(404, 'Indisponível.');
  const email = texto(corpo.email, 120).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroHttp(400, 'E-mail inválido.');
  return db.loginMemoria(email);
});

rota('GET', 'bncc', async () => ({ habilidades: await db.listarBncc() }));

// worker: só chamadas internas com o segredo
rota('POST', 'worker', async ({ req, corpo }) => {
  if (!segredoInterno(req)) throw new ErroHttp(401, 'Não autorizado.');
  processar(id(corpo.tarefa));
  return { aceito: true, _status: 202 };
});

// página pública da aula interativa (link e QR Code)
rota('GET', 'publica/:slug', async ({ params, res }) => {
  const aula = await db.obterAulaPorSlug(texto(params.slug, 20));
  if (!aula?.estado?.interativa?.jogos) {
    enviarHTML(res, 404, '<!DOCTYPE html><meta charset="utf-8"><title>Aula não encontrada</title><p style="font-family:system-ui;padding:2rem">Esta aula não está mais disponível.</p>');
    return null;
  }
  const dados = dadosDaPagina({ entrada: entradaDaAula(aula), plano: aula.estado.plano, visao: aula.estado.visao, deck: aula.estado.slides, interativa: aula.estado.interativa });
  dados.envio = { url: `/v1/publica/${encodeURIComponent(aula.slug)}/resultado` };
  enviarHTML(res, 200, await montarPaginaInterativa(dados, { lerArquivo: lerArquivoDaPagina }));
  return null;
});

rota('POST', 'publica/:slug/resultado', async ({ params, corpo }) => {
  const aula = await db.obterAulaPorSlug(texto(params.slug, 20));
  if (!aula) throw naoEncontrado('Aula');
  if ((await db.contarResultadosRecentes(aula.id, 10)) > 300) throw new ErroHttp(429, 'Muitos envios agora. Tente em alguns minutos.');
  const apelido = texto(corpo.apelido, 40).replace(/[<>]/g, '');
  const total = inteiro(corpo.total, 1, 100);
  const acertos = inteiro(corpo.acertos, 0, 100);
  if (!apelido || !total || acertos === null || acertos > total) throw new ErroHttp(400, 'Envio inválido.');
  const erros = (Array.isArray(corpo.erros) ? corpo.erros : []).map((e) => texto(e, 20)).filter((e) => /^(quiz|vf|par|desafio):\d{1,2}$/.test(e)).slice(0, 50);
  await db.inserirResultado({ aula_id: aula.id, apelido, acertos, total, detalhes: { erros } });
  return { ok: true };
});

// ---------- aulas ----------
rota('GET', 'aulas', async ({ usuario, query }) => ({
  aulas: await db.listarAulas(usuario.id, {
    turmaId: query.turma ? id(query.turma) : null,
    bimestre: query.bimestre ? inteiro(query.bimestre, 1, 4) : null,
    busca: texto(query.busca, 60),
  }),
}));

rota('POST', 'aulas', async ({ usuario, corpo }) => {
  const entrada = validarEntrada(corpo);
  const turma = await turmaDoProfessor(corpo.turma_id, usuario);
  let sequencia = null;
  if (corpo.sequencia_id) {
    sequencia = await db.obterSequencia(id(corpo.sequencia_id));
    if (!sequencia || sequencia.professor_id !== usuario.id) throw naoEncontrado('Sequência');
  }
  const aula = await db.criarAula({
    professor_id: usuario.id,
    turma_id: turma?.id || null,
    serie: Number(entrada.serie),
    assunto: entrada.assunto,
    observacoes: entrada.observacoes,
    nivel: entrada.nivel,
    bimestre: inteiro(corpo.bimestre, 1, 4),
  });
  if (sequencia) {
    const ordem = inteiro(corpo.ordem, 1, 20);
    const itens = sequencia.itens.map((i) => (i.ordem === ordem ? { ...i, aula_id: aula.id } : i));
    await db.atualizarSequencia(sequencia.id, { itens });
  }
  const tarefa = await iniciarTarefa({ tipo: 'plano', professorId: usuario.id, aula });
  return { aula, tarefa };
});

rota('GET', 'aulas/:id', async ({ usuario, params }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const [tarefas, avaliacoes] = await Promise.all([db.tarefasAtivas({ aulaId: aula.id }), db.avaliacoesDaAula(aula.id, usuario.id)]);
  for (const t of tarefas) await retomarSeParada(t);
  return { aula, tarefas, avaliacoes };
});

rota('PATCH', 'aulas/:id', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const campos = {};
  if ('titulo' in corpo) campos.titulo = texto(corpo.titulo, 150) || aula.assunto;
  if ('turma_id' in corpo) campos.turma_id = (await turmaDoProfessor(corpo.turma_id, usuario))?.id || null;
  if ('bimestre' in corpo) campos.bimestre = inteiro(corpo.bimestre, 1, 4);
  // edições do professor: substitui partes do conteúdo gerado
  const estado = { ...aula.estado };
  for (const parte of ['plano', 'slides', 'prova']) {
    if (!(parte in corpo)) continue;
    if (!corpo[parte] || typeof corpo[parte] !== 'object' || tamanhoJson(corpo[parte]) > 400000) throw new ErroHttp(400, `Conteúdo inválido: ${parte}.`);
    estado[parte] = corpo[parte];
    if (parte === 'prova') estado.versoes = null;
    if (parte === 'plano' && corpo.plano.titulo) campos.titulo = texto(corpo.plano.titulo, 150);
  }
  if (Object.keys(estado).length) campos.estado = estado;
  return { aula: await db.atualizarAula(aula.id, campos) };
});

rota('DELETE', 'aulas/:id', async ({ usuario, params }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  await db.excluirAula(aula.id);
  return { ok: true };
});

const PRE_REQUISITO = { slides: 'plano', prova: 'plano', interativa: 'slides' };

rota('POST', 'aulas/:id/gerar', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const tipo = corpo.tipo;
  if (!['plano', 'slides', 'prova', 'interativa'].includes(tipo)) throw new ErroHttp(400, 'Tipo inválido.');
  const ativas = await db.tarefasAtivas({ aulaId: aula.id });
  const mesma = ativas.find((t) => t.tipo === tipo);
  if (mesma) return { tarefa: mesma };

  const e = aula.estado || {};
  const pre = PRE_REQUISITO[tipo];
  if (pre === 'plano' && !e.plano) throw new ErroHttp(409, 'Gere o plano de aula primeiro.');
  if (pre === 'slides' && !e.slides?.slides?.length) throw new ErroHttp(409, 'Gere os slides primeiro.');

  const completo = { plano: Boolean(e.plano), slides: Boolean(e.slides), prova: Boolean(e.prova), interativa: Boolean(e.interativa?.jogos) }[tipo];
  const novo = Boolean(corpo.novo) || completo; // já estava pronto: gera outra versão
  if (novo) {
    const limpo = { ...e };
    if (tipo === 'plano') Object.assign(limpo, { visao: null, plano: null });
    if (tipo === 'slides') Object.assign(limpo, { secoes: {}, materiais: {}, slides: null, interativa: null });
    if (tipo === 'prova') Object.assign(limpo, { questoes: {}, prova: null, verificacao: null, versoes: null });
    if (tipo === 'interativa') limpo.interativa = null;
    aula.estado = limpo;
    await db.atualizarAula(aula.id, { estado: limpo });
  }
  const tarefa = await iniciarTarefa({ tipo, professorId: usuario.id, aula, semCache: novo });
  return { tarefa };
});

rota('POST', 'aulas/:id/duplicar', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const nivel = corpo.nivel || aula.nivel;
  if (!NIVEIS_VALIDOS.includes(nivel)) throw new ErroHttp(400, 'Nível inválido.');
  const mesmaVersao = nivel === aula.nivel;
  const nova = await db.criarAula({
    professor_id: usuario.id, turma_id: aula.turma_id, serie: aula.serie, assunto: aula.assunto, observacoes: aula.observacoes,
    nivel, bimestre: aula.bimestre, titulo: mesmaVersao ? `${aula.titulo || aula.assunto} (cópia)` : null,
    estado: mesmaVersao ? aula.estado : {}, origem_id: aula.id,
  });
  const tarefa = mesmaVersao ? null : await iniciarTarefa({ tipo: 'plano', professorId: usuario.id, aula: nova });
  return { aula: nova, tarefa };
});

rota('POST', 'aulas/:id/regerar-slide', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const estado = aula.estado;
  const indice = inteiro(corpo.indice, 0, 200);
  const slide = estado.slides?.slides?.[indice];
  if (!slide) throw naoEncontrado('Slide');
  const llm = await clienteServidor({ professorId: usuario.id, semCache: true });
  const { slide: novo, provedor } = await regerarSlide(llm, entradaDaAula(aula), slide, estado.materiais?.[slide.secao], texto(corpo.pedido, 500));
  estado.slides.slides[indice] = novo;
  const lista = estado.secoes?.[slide.secao];
  const k = lista?.findIndex((s) => s.titulo === slide.titulo) ?? -1;
  if (k >= 0) lista[k] = novo;
  await db.atualizarAula(aula.id, { estado });
  return { slide: novo, provedor };
});

rota('POST', 'aulas/:id/regerar-questao', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const estado = aula.estado;
  const numero = inteiro(corpo.numero, 1, 100);
  const k = estado.prova?.questoes?.findIndex((q) => q.numero === numero) ?? -1;
  if (k < 0) throw naoEncontrado('Questão');
  const llm = await clienteServidor({ professorId: usuario.id, semCache: true });
  const { questao, provedor } = await regerarQuestao(llm, entradaDaAula(aula), estado.prova.questoes[k], texto(corpo.pedido, 500));
  questao.verificacao = { confere: null, resposta_verificador: null, nova: true };
  estado.prova.questoes[k] = questao;
  estado.versoes = null;
  await db.atualizarAula(aula.id, { estado });
  await db.inserirQuestoes([{
    professor_id: usuario.id, aula_id: aula.id, serie: aula.serie, assunto: aula.assunto, tipo: questao.tipo, nivel: questao.nivel || null,
    enunciado: questao.enunciado, alternativas: questao.alternativas, resposta: questao.resposta, resolucao: questao.resolucao,
  }]).catch(() => {});
  return { questao, provedor };
});

rota('POST', 'aulas/:id/versoes', async ({ usuario, params }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  if (!aula.estado?.prova) throw new ErroHttp(409, 'Gere a avaliação primeiro.');
  const versoes = criarVersoes(aula.estado.prova, `${aula.id}:${Date.now()}`);
  await db.atualizarAula(aula.id, { estado: { ...aula.estado, versoes } });
  return { versoes };
});

rota('POST', 'aulas/:id/questoes-do-banco', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const ids = (Array.isArray(corpo.ids) ? corpo.ids : []).slice(0, 30).map(id);
  const escolhidas = await db.obterQuestoes(ids, usuario.id);
  if (!escolhidas.length) throw new ErroHttp(400, 'Nenhuma questão selecionada.');
  const estado = aula.estado || {};
  const atuais = estado.prova?.questoes || [];
  const novas = escolhidas.map((q) => ({
    tipo: q.tipo, nivel: q.nivel, enunciado: q.enunciado, alternativas: q.alternativas || [], resposta: q.resposta,
    resolucao: q.resolucao || [], verificacao: { confere: null, resposta_verificador: null, do_banco: true },
  }));
  estado.prova = {
    titulo: estado.prova?.titulo || `Avaliação: ${aula.titulo || aula.assunto}`,
    instrucoes: estado.prova?.instrucoes || 'Leia com atenção. Nas questões discursivas, mostre os cálculos.',
    questoes: [...atuais, ...novas].map((q, i) => ({ ...q, numero: i + 1 })),
  };
  estado.versoes = null;
  await db.atualizarAula(aula.id, { estado });
  return { prova: estado.prova };
});

rota('POST', 'aulas/:id/avaliar', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  if (!['plano', 'slides', 'prova', 'interativa'].includes(corpo.parte)) throw new ErroHttp(400, 'Parte inválida.');
  const nota = Number(corpo.nota) === -1 ? -1 : 1;
  return { avaliacao: await db.salvarAvaliacao({ aula_id: aula.id, professor_id: usuario.id, parte: corpo.parte, nota, comentario: texto(corpo.comentario, 1000) }) };
});

rota('POST', 'aulas/:id/publicar', async ({ usuario, params, corpo }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  const campos = {};
  if ('publica' in corpo) {
    if (corpo.publica && !aula.estado?.interativa?.jogos) throw new ErroHttp(409, 'Gere a aula interativa primeiro.');
    campos.publica = Boolean(corpo.publica);
  }
  if ('comunidade' in corpo) {
    if (corpo.comunidade && !aula.estado?.plano) throw new ErroHttp(409, 'Gere o plano de aula primeiro.');
    campos.comunidade = Boolean(corpo.comunidade);
  }
  if ((campos.publica || campos.comunidade) && !aula.slug) campos.slug = db.novoSlug();
  return { aula: await db.atualizarAula(aula.id, campos) };
});

rota('GET', 'aulas/:id/resultados', async ({ usuario, params }) => {
  const aula = await aulaDoProfessor(params.id, usuario);
  return resumirResultados(await db.listarResultados([aula.id]), aula.estado?.interativa?.jogos);
});

// ---------- tarefas ----------
async function tarefaDoProfessor(tarefaId, usuario) {
  const t = await db.obterTarefa(id(tarefaId));
  if (!t || t.professor_id !== usuario.id) throw naoEncontrado('Tarefa');
  return t;
}

rota('GET', 'tarefas/:id', async ({ usuario, params }) => {
  const tarefa = await tarefaDoProfessor(params.id, usuario);
  await retomarSeParada(tarefa);
  return { tarefa };
});

rota('POST', 'tarefas/:id/continuar', async ({ usuario, params }) => {
  const tarefa = await tarefaDoProfessor(params.id, usuario);
  return { retomada: await retomarSeParada(tarefa), tarefa };
});

// ---------- turmas ----------
rota('GET', 'turmas', async ({ usuario }) => {
  const [turmas, aulas] = await Promise.all([db.listarTurmas(usuario.id), db.listarAulas(usuario.id)]);
  return { turmas: turmas.map((t) => ({ ...t, aulas: aulas.filter((a) => a.turma_id === t.id).length })) };
});

rota('POST', 'turmas', async ({ usuario, corpo }) => {
  const nome = texto(corpo.nome, 80);
  if (!nome) throw new ErroHttp(400, 'Dê um nome para a turma.');
  return {
    turma: await db.criarTurma({
      professor_id: usuario.id, nome, serie: inteiro(corpo.serie, 1, 3) || 1,
      ano_letivo: inteiro(corpo.ano_letivo, 2000, 2100) || new Date().getFullYear(),
    }),
  };
});

rota('DELETE', 'turmas/:id', async ({ usuario, params }) => {
  const turma = await turmaDoProfessor(params.id, usuario);
  await db.excluirTurma(turma.id);
  return { ok: true };
});

rota('GET', 'turmas/:id/painel', async ({ usuario, params }) => {
  const turma = await turmaDoProfessor(params.id, usuario);
  const aulas = (await db.listarAulas(usuario.id, { turmaId: turma.id }));
  const completas = await Promise.all(aulas.map((a) => db.obterAula(a.id)));
  const resultados = await db.listarResultados(aulas.map((a) => a.id));
  return {
    turma,
    aulas: completas.map((a) => ({
      id: a.id, titulo: a.titulo || a.assunto, assunto: a.assunto, bimestre: a.bimestre, publica: a.publica, slug: a.slug,
      resumo: resumirResultados(resultados.filter((r) => r.aula_id === a.id), a.estado?.interativa?.jogos),
    })),
  };
});

// ---------- banco de questões ----------
rota('GET', 'questoes', async ({ usuario, query }) => ({
  questoes: await db.listarQuestoes(usuario.id, {
    serie: query.serie ? inteiro(query.serie, 1, 3) : null,
    tipo: ['multipla', 'discursiva'].includes(query.tipo) ? query.tipo : null,
    busca: texto(query.busca, 60),
  }),
}));

rota('DELETE', 'questoes/:id', async ({ usuario, params }) => {
  await db.excluirQuestao(id(params.id), usuario.id);
  return { ok: true };
});

// ---------- bimestre (sequências) ----------
rota('GET', 'sequencias', async ({ usuario }) => ({ sequencias: await db.listarSequencias(usuario.id) }));

rota('POST', 'sequencias', async ({ usuario, corpo }) => {
  const conteudos = texto(corpo.conteudos, 2000);
  if (conteudos.length < 3) throw new ErroHttp(400, 'Informe os conteúdos do período.');
  const turma = await turmaDoProfessor(corpo.turma_id, usuario);
  const sequencia = await db.criarSequencia({
    professor_id: usuario.id, turma_id: turma?.id || null, serie: inteiro(corpo.serie, 1, 3) || turma?.serie || 1,
    bimestre: inteiro(corpo.bimestre, 1, 4), conteudos, quantidade: inteiro(corpo.quantidade, 2, 20) || 8,
  });
  const tarefa = await iniciarTarefa({ tipo: 'sequencia', professorId: usuario.id, sequencia });
  return { sequencia, tarefa };
});

async function sequenciaDoProfessor(seqId, usuario) {
  const s = await db.obterSequencia(id(seqId));
  if (!s || s.professor_id !== usuario.id) throw naoEncontrado('Sequência');
  return s;
}

rota('GET', 'sequencias/:id', async ({ usuario, params }) => {
  const sequencia = await sequenciaDoProfessor(params.id, usuario);
  const tarefas = await db.tarefasAtivas({ sequenciaId: sequencia.id });
  for (const t of tarefas) await retomarSeParada(t);
  return { sequencia, tarefas };
});

/** Gera (ou gera de novo) só o planejamento detalhado de uma sequência que já tem a lista de aulas. */
rota('POST', 'sequencias/:id/detalhar', async ({ usuario, params }) => {
  const sequencia = await sequenciaDoProfessor(params.id, usuario);
  if (!sequencia.itens?.length) throw new ErroHttp(409, 'Espere a sequência de aulas ficar pronta.');
  const ativa = (await db.tarefasAtivas({ sequenciaId: sequencia.id }))[0];
  if (ativa) return { tarefa: ativa };
  const tarefa = await iniciarTarefa({ tipo: 'sequencia', professorId: usuario.id, sequencia, semCache: Boolean(sequencia.detalhes?.planejamento) });
  return { tarefa };
});

/** Cabeçalho do documento .docx do planejamento (professor, escola, turma). */
rota('PATCH', 'sequencias/:id', async ({ usuario, params, corpo }) => {
  const s = await sequenciaDoProfessor(params.id, usuario);
  const cabecalho = { professor: texto(corpo.professor, 120), escola: texto(corpo.escola, 160), turma: texto(corpo.turma, 60) };
  const sequencia = await db.atualizarSequencia(s.id, { detalhes: { ...(s.detalhes || {}), cabecalho } });
  return { sequencia };
});

rota('DELETE', 'sequencias/:id', async ({ usuario, params }) => {
  const s = await sequenciaDoProfessor(params.id, usuario);
  await db.excluirSequencia(s.id);
  return { ok: true };
});

// ---------- comunidade ----------
rota('GET', 'comunidade', async ({ usuario, query }) => {
  const [aulas, minhas] = await Promise.all([
    db.listarComunidade({ serie: query.serie ? inteiro(query.serie, 1, 3) : null, busca: texto(query.busca, 60) }),
    db.minhasCurtidas(usuario.id),
  ]);
  return {
    aulas: aulas
      .map(({ professor_id, ...a }) => ({ ...a, minha: professor_id === usuario.id, curtida: minhas.includes(a.id) }))
      .sort((a, b) => b.curtidas - a.curtidas),
  };
});

async function aulaDaComunidade(aulaId) {
  const aula = await db.obterAula(id(aulaId));
  if (!aula?.comunidade) throw naoEncontrado('Aula');
  return aula;
}

rota('POST', 'comunidade/:id/curtir', async ({ usuario, params }) => {
  const aula = await aulaDaComunidade(params.id);
  return { curtida: await db.alternarCurtida(aula.id, usuario.id) };
});

rota('POST', 'comunidade/:id/usar', async ({ usuario, params }) => {
  const origem = await aulaDaComunidade(params.id);
  const aula = await db.criarAula({
    professor_id: usuario.id, serie: origem.serie, assunto: origem.assunto, observacoes: origem.observacoes, nivel: origem.nivel,
    titulo: origem.titulo, estado: origem.estado, origem_id: origem.id,
  });
  return { aula };
});

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  const caminho = String(req.query?.rota ?? url.searchParams.get('rota') ?? '').replace(/^\/+|\/+$/g, '');
  const query = Object.fromEntries(url.searchParams);
  const achado = casar(req.method, caminho);
  if (!achado) return enviarJSON(res, 404, { erro: 'Rota não encontrada.' });

  try {
    const corpo = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
    const publico = ['status', 'login-demo', 'bncc', 'worker'].includes(caminho) || caminho.startsWith('publica/');
    const usuario = publico ? null : await exigirUsuario(req);
    const resposta = await achado.fn({ req, res, usuario, params: achado.params, corpo, query });
    if (resposta === null) return; // já respondeu (HTML)
    const { _status = 200, ...dados } = resposta;
    return enviarJSON(res, _status, dados);
  } catch (erro) {
    if (erro instanceof ErroHttp) return enviarJSON(res, erro.status, { erro: erro.message });
    if (erro instanceof ErroEntrada) return enviarJSON(res, 400, { erro: erro.message });
    if (erro instanceof ErroLimite) return enviarJSON(res, 429, { erro: erro.message });
    if (erro instanceof ErroLLM) return enviarJSON(res, 503, { erro: erro.message });
    if (erro instanceof db.ErroBancoDesatualizado) return enviarJSON(res, 503, { erro: erro.message });
    console.error(`[api ${req.method} ${caminho}]`, erro);
    return enviarJSON(res, 500, { erro: 'Erro inesperado no servidor. Tente de novo.' });
  }
}
