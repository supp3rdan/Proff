// Monta o cliente de IA do servidor a partir das variáveis de ambiente.

import { criarClienteLLM } from '../public/core/llm.js';

export function clienteDoAmbiente() {
  const env = process.env;
  return criarClienteLLM({
    chaves: { gemini: env.GEMINI_API_KEY, groq: env.GROQ_API_KEY, openrouter: env.OPENROUTER_API_KEY },
    modelos: { gemini: env.GEMINI_MODEL, groq: env.GROQ_MODEL, openrouter: env.OPENROUTER_MODEL },
    simulado: env.LLM_MOCK === '1',
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 120000),
  });
}
