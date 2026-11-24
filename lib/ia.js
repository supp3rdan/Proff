// IA no servidor: as chaves ficam só aqui (variáveis de ambiente da Vercel).
// Em volta do cliente de IA, este módulo acrescenta:
//   - cache: o mesmo pedido não é feito duas vezes (rápido e sem gastar cota);
//   - monitor: cada tentativa é registrada e o provedor com mais erros vai para o fim da fila;
//   - limite diário por professor;
//   - nova tentativa com espera quando todos os provedores falham por instabilidade.

import { createHash } from 'node:crypto';
import { criarClienteLLM, corrigirChaves, ErroLLM } from '../public/core/llm.js';
import * as db from './db.js';

export class ErroLimite extends Error {}

const LIMITE_DIARIO = () => Number(process.env.LIMITE_DIARIO || 400);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// saúde dos provedores, consultada no máximo a cada minuto por instância
let saude = { em: 0, ordem: null };
async function ordemPorSaude() {
  if (Date.now() - saude.em < 60000) return saude.ordem;
  try {
    const s = await db.saudeProvedores(30);
    const base = ['groq', 'gemini', 'openrouter'];
    // provedor com 3+ chamadas e mais da metade com erro vai para o fim
    const ruins = base.filter((p) => s[p]?.total >= 3 && s[p].taxaErro > 0.5);
    saude = { em: Date.now(), ordem: [...base.filter((p) => !ruins.includes(p)), ...ruins] };
  } catch {
    saude = { em: Date.now(), ordem: null };
  }
  return saude.ordem;
}

export function chavesDoAmbiente() {
  const env = process.env;
  return corrigirChaves({
    gemini: env.GEMINI_API_KEY,
    groq: env.GROQ_API_KEY || env.GROK_API_SECRET_TRUE,
    openrouter: env.OPENROUTER_API_KEY || env.API_KEY_GROQ,
  }).chaves;
}

export function provedoresConfigurados() {
  if (process.env.LLM_MOCK === '1') return ['simulado'];
  return Object.keys(chavesDoAmbiente());
}

/**
 * Cliente de IA com cache, monitor e limite.
 * @param {object} o
 * @param {string} o.professorId  para o limite diário
 * @param {boolean} [o.semCache]  ignora o cache (ex.: "gerar de novo")
 */
export async function clienteServidor({ professorId, semCache = false }) {
  const env = process.env;
  const base = criarClienteLLM({
    chaves: chavesDoAmbiente(),
    modelos: { gemini: env.GEMINI_MODEL, groq: env.GROQ_MODEL, openrouter: env.OPENROUTER_MODEL },
    simulado: env.LLM_MOCK === '1',
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 90000),
    ordem: await ordemPorSaude(),
    aoChamar: (evento) => db.registrarEvento(evento),
  });

  async function gerarJSON(pedido) {
    const chave = createHash('sha256')
      .update(JSON.stringify([pedido.tarefa, pedido.perfil || 'texto', pedido.sistema, pedido.usuario]))
      .digest('hex');

    if (!semCache) {
      const salvo = await db.lerCache(chave).catch(() => null);
      if (salvo) return { dados: salvo, provedor: 'cache' };
    }

    if (professorId) {
      const usadas = await db.registrarUso(professorId);
      if (usadas > LIMITE_DIARIO()) {
        throw new ErroLimite(`Limite diário de ${LIMITE_DIARIO()} pedidos à IA atingido. Tente de novo amanhã.`);
      }
    }

    let resultado;
    try {
      resultado = await base.gerarJSON(pedido);
    } catch (erro) {
      // todos falharam: se parece instabilidade passageira, espera e tenta mais uma vez
      if (!(erro instanceof ErroLLM) || !/503|502|500|429|demorou|rede|high demand|overloaded/i.test(erro.message)) throw erro;
      await espera(Number(env.IA_ESPERA_MS || 4000));
      resultado = await base.gerarJSON(pedido);
    }

    if (resultado.provedor !== 'simulado') db.gravarCache(chave, pedido.tarefa, resultado.dados).catch(() => {});
    return resultado;
  }

  return { gerarJSON, provedores: base.provedores };
}
