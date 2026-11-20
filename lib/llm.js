// Cliente único para APIs compatíveis com a OpenAI (Gemini, Groq, OpenRouter).
// Tenta os provedores em ordem e passa para o próximo quando um falha
// (limite de uso, erro do servidor, tempo esgotado ou JSON inválido).

import { respostaSimulada } from './mock.js';

const PROVEDORES = [
  {
    nome: 'gemini',
    chave: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modeloEnv: 'GEMINI_MODEL',
    modeloPadrao: 'gemini-2.5-flash',
  },
  {
    nome: 'groq',
    chave: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modeloEnv: 'GROQ_MODEL',
    modeloPadrao: 'openai/gpt-oss-120b',
  },
  {
    nome: 'openrouter',
    chave: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modeloEnv: 'OPENROUTER_MODEL',
    modeloPadrao: 'openrouter/free',
  },
];

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);

export function provedoresAtivos() {
  return PROVEDORES.filter((p) => process.env[p.chave]);
}

export function modoSimulado() {
  return process.env.LLM_MOCK === '1';
}

/**
 * Envia um pedido e devolve o JSON já interpretado.
 * @param {object} opcoes
 * @param {string} opcoes.sistema  instruções de sistema
 * @param {string} opcoes.usuario  pedido
 * @param {string} opcoes.tarefa   nome da tarefa (usado no modo simulado)
 * @param {number} [opcoes.comecarPor] índice do provedor inicial (para variar o modelo na verificação)
 * @param {number} [opcoes.temperatura]
 */
export async function gerarJSON({ sistema, usuario, tarefa, comecarPor = 0, temperatura = 0.6 }) {
  if (modoSimulado()) {
    await new Promise((r) => setTimeout(r, 400));
    return { dados: extrairJSON(respostaSimulada(tarefa, usuario)), provedor: 'simulado' };
  }

  const ativos = provedoresAtivos();
  if (ativos.length === 0) {
    throw new ErroLLM(
      'Nenhuma chave de API configurada. Defina GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY (ou LLM_MOCK=1 para testar).'
    );
  }

  const inicio = comecarPor % ativos.length;
  const ordem = [...ativos.slice(inicio), ...ativos.slice(0, inicio)];
  const falhas = [];

  for (const provedor of ordem) {
    try {
      const texto = await chamar(provedor, sistema, usuario, temperatura);
      const dados = extrairJSON(texto);
      return { dados, provedor: provedor.nome };
    } catch (erro) {
      falhas.push(`${provedor.nome}: ${erro.message}`);
      console.warn(`[llm] ${provedor.nome} falhou (${tarefa}): ${erro.message}`);
    }
  }

  throw new ErroLLM(`Todos os provedores falharam. ${falhas.join(' | ')}`);
}

async function chamar(provedor, sistema, usuario, temperatura) {
  const modelo = process.env[provedor.modeloEnv] || provedor.modeloPadrao;
  const corpo = {
    model: modelo,
    temperature: temperatura,
    messages: [
      { role: 'system', content: sistema },
      { role: 'user', content: usuario },
    ],
    response_format: { type: 'json_object' },
  };

  const resposta = await fetch(provedor.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env[provedor.chave]}`,
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 300);
    throw new Error(`HTTP ${resposta.status} ${detalhe}`);
  }

  const json = await resposta.json();
  const texto = json?.choices?.[0]?.message?.content;
  if (!texto) throw new Error('resposta vazia');
  return texto;
}

/** Aceita JSON puro ou JSON dentro de bloco ```json ... ```. */
export function extrairJSON(texto) {
  let limpo = String(texto).trim();
  const bloco = limpo.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) limpo = bloco[1].trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim === -1) throw new Error('resposta sem JSON');
  try {
    return JSON.parse(repararLatex(limpo.slice(inicio, fim + 1)));
  } catch {
    throw new Error('JSON inválido na resposta');
  }
}

/**
 * Modelos costumam escrever LaTeX com barra simples dentro do JSON ("\frac").
 * Em JSON, "\f", "\t", "\n", "\b" e "\r" viram caracteres de controle e
 * "\(" é inválido. Aqui dobramos a barra antes de comandos LaTeX (barra +
 * duas ou mais letras) e antes de qualquer caractere que não seja escape JSON.
 */
export function repararLatex(json) {
  return json
    .replace(/(?<!\\)\\(?=[a-zA-Z]{2,})(?!u[0-9a-fA-F]{4})/g, '\\\\')
    .replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');
}

export class ErroLLM extends Error {}
