// Fila de geração em segundo plano.
// Cada tarefa (plano, slides, prova, aula interativa, bimestre) é uma lista de etapas
// pequenas. Cada execução do worker faz UMA etapa, salva no banco e chama a próxima.
// Assim nenhuma execução passa do tempo máximo da Vercel, o professor pode fechar o
// app e, se algo travar, a tarefa continua de onde parou.

import { waitUntil } from '@vercel/functions';
import * as db from './db.js';
import { clienteServidor } from './ia.js';
import { SECOES } from '../public/core/estrutura.js';
import {
  gerarVisaoGeral,
  gerarPlano,
  gerarMaterial,
  formatarSlides,
  gerarQuestoes,
  montarProva,
  conferirProva,
  gerarArtigoSecao,
  gerarVisualizacoes,
  gerarJogos,
  gerarSequencia,
  gerarPlanejamento,
  montarApresentacao,
} from '../public/core/gerador.js';

const TRAVA_SEGUNDOS = 240;

// ---------------------------------------------------------------------------
// Etapas de cada tipo de tarefa
// ---------------------------------------------------------------------------
const etapa = (id, rotulo, extra = {}) => ({ id, rotulo, situacao: 'aguardando', detalhe: '', ...extra });

export function etapasDaTarefa(tipo, estado = {}) {
  switch (tipo) {
    case 'plano':
      return [etapa('visao', 'Visão geral do tema'), etapa('plano', 'Plano de aula')];
    case 'slides':
      return [
        ...SECOES.flatMap((s) => (estado.secoes?.[s.id]?.length
          ? []
          : [etapa(`material:${s.id}`, `Parte ${s.numero}: ${s.titulo} — material`), etapa(`formatar:${s.id}`, `Parte ${s.numero}: ${s.titulo} — slides`)])),
        etapa('montar-slides', 'Montando a apresentação'),
      ];
    case 'prova':
      return [
        ...(estado.questoes?.multipla ? [] : [etapa('questoes:multipla', 'Questões de múltipla escolha')]),
        ...(estado.questoes?.discursiva ? [] : [etapa('questoes:discursiva', 'Questões discursivas')]),
        etapa('conferir', 'Conferência do gabarito'),
      ];
    case 'interativa':
      return [
        ...SECOES.filter((s) => !estado.interativa?.secoes?.[s.id]).map((s) => etapa(`artigo:${s.id}`, `Texto da parte ${s.numero}: ${s.titulo}`)),
        ...(estado.interativa?.visualizacoes ? [] : [etapa('visualizacoes', 'Gráficos e visualizações', { opcional: true })]),
        ...(estado.interativa?.jogos ? [] : [etapa('jogos', 'Jogos de fixação')]),
      ];
    case 'sequencia':
      return [
        ...(estado.itens?.length ? [] : [etapa('sequencia', 'Sequência de aulas do bimestre')]),
        etapa('planejamento', 'Planejamento detalhado: BNCC, objetivos e conteúdos', { opcional: true }),
      ];
    default:
      throw new Error(`Tipo de tarefa desconhecido: ${tipo}`);
  }
}

const entradaDaAula = (a) => ({ serie: String(a.serie), assunto: a.assunto, observacoes: a.observacoes || '', nivel: a.nivel || 'regular' });

// ---------------------------------------------------------------------------
// Execução de uma etapa
// ---------------------------------------------------------------------------
async function compararSimbolico(pares) {
  const base = urlBase();
  if (!base || !process.env.WORKER_SECRET || db.usarMemoria()) return pares.map(() => null);
  const r = await fetch(`${base}/api/sympy_comparar`, {
    method: 'POST',
    headers: cabecalhosInternos(),
    body: JSON.stringify({ pares }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`SymPy HTTP ${r.status}`);
  return (await r.json()).resultados;
}

/** Executa a etapa `e` e devolve um texto curto para mostrar no progresso. */
async function executar(e, tarefa, alvo, llm) {
  const [nome, parametro] = e.id.split(':');

  if (tarefa.tipo === 'sequencia') {
    if (nome === 'planejamento') {
      const bncc = await db.listarBncc();
      const r = await gerarPlanejamento(llm, { serie: alvo.serie, bimestre: alvo.bimestre, conteudos: alvo.conteudos, itens: alvo.itens }, bncc);
      await db.atualizarSequencia(alvo.id, { detalhes: { ...(alvo.detalhes || {}), planejamento: r.planejamento } });
      return `${r.planejamento.habilidades.length} habilidades · ${r.planejamento.objetivos.length} objetivos · ${r.provedor}`;
    }
    const r = await gerarSequencia(llm, { serie: alvo.serie, bimestre: alvo.bimestre, conteudos: alvo.conteudos, quantidade: alvo.quantidade });
    await db.atualizarSequencia(alvo.id, { titulo: r.titulo, itens: r.itens });
    return `${r.itens.length} aulas · ${r.provedor}`;
  }

  const aula = alvo;
  const estado = aula.estado || {};
  const entrada = entradaDaAula(aula);
  const salvar = (campos = {}) => db.atualizarAula(aula.id, { estado, ...campos });

  switch (nome) {
    case 'visao': {
      const r = await gerarVisaoGeral(llm, entrada);
      estado.visao = r.visao;
      await salvar();
      return r.provedor;
    }
    case 'plano': {
      const [bncc, referencia] = await Promise.all([db.listarBncc(), db.aulaDeReferencia(aula.serie, aula.assunto).catch(() => null)]);
      const r = await gerarPlano(llm, entrada, estado.visao, { bncc, referencia });
      estado.plano = r.plano;
      await salvar({ titulo: r.plano.titulo || aula.assunto });
      return referencia ? `${r.provedor} · com aula de referência` : r.provedor;
    }
    case 'material': {
      const r = await gerarMaterial(llm, entrada, estado.plano, estado.visao, parametro);
      estado.materiais = { ...(estado.materiais || {}), [parametro]: r.material };
      await salvar();
      return r.provedor;
    }
    case 'formatar': {
      const material = estado.materiais?.[parametro];
      if (!material) throw new Error('O material desta parte não foi gerado.');
      const r = await formatarSlides(llm, entrada, parametro, material);
      estado.secoes = { ...(estado.secoes || {}), [parametro]: r.slides };
      await salvar();
      return `${r.slides.length} slide${r.slides.length > 1 ? 's' : ''} · ${r.provedor}`;
    }
    case 'montar-slides': {
      const faltam = SECOES.filter((s) => !estado.secoes?.[s.id]?.length);
      if (faltam.length) throw new Error(`Faltam partes: ${faltam.map((s) => s.titulo).join(', ')}.`);
      estado.slides = montarApresentacao(estado.plano, estado.secoes, entrada);
      await salvar();
      return `${estado.slides.slides.length} slides`;
    }
    case 'questoes': {
      const r = await gerarQuestoes(llm, entrada, estado.plano, estado.visao, parametro);
      estado.questoes = { ...(estado.questoes || {}), [parametro]: r.questoes };
      await salvar();
      return `${r.questoes.length} · ${r.provedor}`;
    }
    case 'conferir': {
      const todas = [...(estado.questoes?.multipla || []), ...(estado.questoes?.discursiva || [])];
      const prova = montarProva(todas, estado.plano, entrada);
      const { questoes, verificacao } = await conferirProva(llm, prova.questoes, { compararSimbolico });
      estado.prova = { ...prova, questoes };
      estado.verificacao = verificacao;
      estado.versoes = null; // versões A/B antigas deixam de valer
      await salvar();
      // guarda no banco de questões do professor
      await db.inserirQuestoes(questoes.map((q) => ({
        professor_id: aula.professor_id, aula_id: aula.id, serie: aula.serie, assunto: aula.assunto, tipo: q.tipo,
        nivel: q.nivel || null, enunciado: q.enunciado, alternativas: q.alternativas || [], resposta: String(q.resposta ?? ''), resolucao: q.resolucao || [],
      }))).catch((erro) => console.warn('[banco de questões]', erro.message));
      if (!verificacao.concluida) throw new Error('Não foi possível conferir o gabarito automaticamente.');
      return `${verificacao.metodo === 'sympy+ia' ? 'SymPy + ' : ''}${verificacao.provedor}`;
    }
    case 'artigo': {
      let material = estado.materiais?.[parametro];
      if (!material) {
        material = (await gerarMaterial(llm, entrada, estado.plano, estado.visao, parametro)).material;
        estado.materiais = { ...(estado.materiais || {}), [parametro]: material };
      }
      const r = await gerarArtigoSecao(llm, entrada, estado.plano, parametro, material, estado.secoes?.[parametro] || []);
      estado.interativa = { secoes: {}, visualizacoes: null, jogos: null, ...(estado.interativa || {}) };
      estado.interativa.secoes = { ...estado.interativa.secoes, [parametro]: r.artigo };
      await salvar();
      return r.provedor;
    }
    case 'visualizacoes': {
      estado.interativa = { secoes: {}, visualizacoes: null, jogos: null, ...(estado.interativa || {}) };
      try {
        const r = await gerarVisualizacoes(llm, entrada, estado.plano, estado.visao);
        estado.interativa.visualizacoes = r.visualizacoes;
        await salvar();
        return r.visualizacoes.length ? `${r.visualizacoes.length} · ${r.provedor}` : 'nenhum gráfico combina com o assunto';
      } catch (erro) {
        estado.interativa.visualizacoes = []; // opcional: a página sai sem gráficos
        await salvar();
        throw erro;
      }
    }
    case 'jogos': {
      const r = await gerarJogos(llm, entrada, estado.plano, estado.visao);
      estado.interativa = { secoes: {}, visualizacoes: null, jogos: null, ...(estado.interativa || {}) };
      estado.interativa.jogos = r.jogos;
      await salvar();
      return r.provedor;
    }
    default:
      throw new Error(`Etapa desconhecida: ${e.id}`);
  }
}

/** Etapa que depende de outra que falhou (ex.: slides de uma parte sem material). */
function dependeDeFalha(e, etapas) {
  const [nome, parametro] = e.id.split(':');
  if (nome === 'formatar') return etapas.some((x) => x.id === `material:${parametro}` && x.situacao === 'erro');
  if (nome === 'montar-slides' || nome === 'conferir') return etapas.some((x) => x.situacao === 'erro' && !x.opcional);
  return false;
}

/**
 * Faz a próxima etapa pendente da tarefa. Devolve true se ainda há etapas.
 * Seguro para chamar várias vezes ao mesmo tempo: só um worker pega a trava.
 */
export async function executarProximaEtapa(tarefaId) {
  const tarefa = await db.travarTarefa(tarefaId, TRAVA_SEGUNDOS);
  if (!tarefa) return false;

  const etapas = tarefa.etapas;
  // etapa que ficou "gerando" por queda de um worker anterior volta para a fila
  etapas.forEach((x) => { if (x.situacao === 'gerando') x.situacao = 'aguardando'; });
  const atual = etapas.find((x) => x.situacao === 'aguardando');

  if (!atual) {
    return finalizar(tarefa);
  }

  const alvo = tarefa.sequencia_id ? await db.obterSequencia(tarefa.sequencia_id) : await db.obterAula(tarefa.aula_id);
  if (!alvo) {
    await db.atualizarTarefa(tarefa.id, { status: 'erro', erro: 'A aula foi excluída.', travada_ate: null });
    return false;
  }

  if (dependeDeFalha(atual, etapas)) {
    Object.assign(atual, { situacao: 'erro', detalhe: 'depende de uma etapa que falhou' });
  } else {
    atual.situacao = 'gerando';
    await db.atualizarTarefa(tarefa.id, { etapas });
    try {
      const llm = await clienteServidor({ professorId: tarefa.professor_id, semCache: Boolean(tarefa.sem_cache) });
      atual.detalhe = await executar(atual, tarefa, alvo, llm);
      atual.situacao = 'pronto';
    } catch (erro) {
      console.warn(`[tarefa ${tarefa.id}] ${atual.id}:`, erro.message);
      Object.assign(atual, { situacao: 'erro', detalhe: String(erro.message).slice(0, 300) });
    }
  }

  const restam = etapas.some((x) => x.situacao === 'aguardando');
  if (!restam) return finalizar({ ...tarefa, etapas });
  await db.atualizarTarefa(tarefa.id, { etapas, travada_ate: null });
  return true;
}

async function finalizar(tarefa) {
  const falhas = tarefa.etapas.filter((x) => x.situacao === 'erro' && !x.opcional);
  await db.atualizarTarefa(tarefa.id, {
    etapas: tarefa.etapas,
    status: falhas.length ? 'erro' : 'pronta',
    erro: falhas.length ? `Não foi possível concluir: ${falhas.map((f) => f.rotulo).join(', ')}.` : null,
    travada_ate: null,
  });
  return false;
}

// ---------------------------------------------------------------------------
// Encadeamento: cada etapa chama a próxima em uma nova execução
// ---------------------------------------------------------------------------
export function urlBase() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

export function cabecalhosInternos() {
  const h = { 'Content-Type': 'application/json', 'x-worker-secret': process.env.WORKER_SECRET || '' };
  // previews protegidos da Vercel: libera chamadas internas (Protection Bypass for Automation)
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) h['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return h;
}

/** Mantém a execução viva depois de responder (Vercel) ou só deixa rodar (local). */
export function emSegundoPlano(promessa) {
  const segura = Promise.resolve(promessa).catch((erro) => console.error('[segundo plano]', erro));
  try {
    waitUntil(segura);
  } catch { /* fora da Vercel */ }
  return segura;
}

/** Agenda a próxima etapa da tarefa. */
export function agendar(tarefaId) {
  const base = urlBase();
  // FILA_HTTP=1 força o encadeamento por HTTP também no modo de demonstração (teste)
  if ((db.usarMemoria() && process.env.FILA_HTTP !== '1') || !base) {
    // desenvolvimento: roda no mesmo processo, uma etapa depois da outra
    return emSegundoPlano((async () => {
      while (await executarProximaEtapa(tarefaId)) { /* próxima */ }
    })());
  }
  return emSegundoPlano(
    fetch(`${base}/api/r?rota=worker`, {
      method: 'POST',
      headers: cabecalhosInternos(),
      body: JSON.stringify({ tarefa: tarefaId }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => {
      if (!r.ok) console.error('[agendar] worker respondeu', r.status);
    })
  );
}

/** Rodado pelo worker: faz uma etapa e, se ainda houver, chama a próxima. */
export function processar(tarefaId) {
  return emSegundoPlano((async () => {
    const continua = await executarProximaEtapa(tarefaId);
    if (continua) await agendar(tarefaId);
  })());
}

/** Cria a tarefa e começa a executar. */
export async function iniciarTarefa({ tipo, professorId, aula = null, sequencia = null, semCache = false }) {
  const etapas = etapasDaTarefa(tipo, aula?.estado || (sequencia ? { itens: sequencia.itens } : {}));
  const tarefa = await db.criarTarefa({
    tipo, professor_id: professorId, aula_id: aula?.id || null, sequencia_id: sequencia?.id || null, etapas,
    ...(semCache ? { sem_cache: true } : {}),
  });
  // a 1ª etapa roda já nesta execução; as próximas são encadeadas por agendar()
  processar(tarefa.id);
  return tarefa;
}

/** Tarefa parada (worker caiu): libera e continua. */
export async function retomarSeParada(tarefa) {
  if (!['pendente', 'rodando'].includes(tarefa.status)) return false;
  const travada = tarefa.travada_ate && new Date(tarefa.travada_ate) > new Date();
  const recente = Date.now() - new Date(tarefa.atualizado_em).getTime() < 20000;
  if (travada || recente) return false;
  // roda a etapa nesta execução (não depende da chamada interna, que pode ter sido bloqueada)
  processar(tarefa.id);
  return true;
}
