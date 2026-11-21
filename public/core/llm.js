// Cliente único para APIs compatíveis com a OpenAI (Gemini, Groq, OpenRouter).
// Tenta os provedores em ordem e passa para o próximo quando um falha
// (limite de uso, erro do servidor, tempo esgotado ou JSON inválido).
//
// Este arquivo não usa nada específico do Node: roda no servidor (Vercel /
// server.js) e também direto no navegador (GitHub Pages).

import { respostaSimulada } from './mock.js';

export const PROVEDORES = [
  {
    nome: 'gemini',
    rotulo: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    // Em ordem de preferência. Se um modelo for desativado ou não tiver cota
    // grátis, o Proff tenta o próximo (e também o modelo que o erro sugerir).
    modelos: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'],
    ondeCriarChave: 'https://aistudio.google.com/app/apikey',
  },
  {
    nome: 'groq',
    rotulo: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelos: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    ondeCriarChave: 'https://console.groq.com/keys',
  },
  {
    nome: 'openrouter',
    rotulo: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelos: ['openrouter/free'],
    ondeCriarChave: 'https://openrouter.ai/keys',
  },
];

export class ErroLLM extends Error {}

// Modelo que funcionou por provedor (evita repetir tentativas na mesma sessão).
const MODELO_QUE_FUNCIONOU = new Map();

/**
 * Monta um erro curto e legível. Marca quando vale tentar outro modelo:
 * modelo inexistente/desativado (404, "no longer available") ou sem cota
 * grátis para aquele modelo ("limit: 0").
 */
export function erroHTTP(status, corpo, modelo) {
  let mensagem = corpo;
  try {
    const j = JSON.parse(corpo);
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    mensagem = e?.message || corpo;
  } catch { /* corpo não é JSON */ }

  const erro = new Error(`${modelo}: HTTP ${status} ${String(mensagem).slice(0, 160)}`);
  const texto = String(corpo);
  erro.trocarModelo =
    status === 404 ||
    /no longer available|not found|does not exist|decommissioned|deprecated|not supported/i.test(texto) ||
    (status === 429 && /limit:\s*0\b/.test(texto));
  const sugerido = texto.match(/use (?:models\/)?([a-z0-9][\w.-]*\w)/i);
  if (sugerido && /gemini|llama|gpt|gemma|qwen|mistral/i.test(sugerido[1])) erro.modeloSugerido = sugerido[1];
  return erro;
}

/**
 * @param {object} config
 * @param {{gemini?: string, groq?: string, openrouter?: string}} config.chaves
 * @param {{gemini?: string, groq?: string, openrouter?: string}} [config.modelos]
 * @param {boolean} [config.simulado]  responde com a aula de exemplo, sem chamar API
 * @param {number}  [config.timeoutMs]
 */
export function criarClienteLLM({ chaves = {}, modelos = {}, simulado = false, timeoutMs = 60000 } = {}) {
  const ativos = PROVEDORES.filter((p) => chaves[p.nome]);

  /**
   * Envia um pedido e devolve o JSON já interpretado.
   * @param {object} o
   * @param {string} o.sistema    instruções de sistema
   * @param {string} o.usuario    pedido
   * @param {string} o.tarefa     nome da tarefa (usado no modo simulado e nos logs)
   * @param {number} [o.comecarPor] índice do provedor inicial (para variar o modelo na verificação)
   * @param {number} [o.temperatura]
   */
  async function gerarJSON({ sistema, usuario, tarefa, comecarPor = 0, temperatura = 0.6 }) {
    if (simulado) {
      await new Promise((r) => setTimeout(r, 400));
      return { dados: extrairJSON(respostaSimulada(tarefa, usuario)), provedor: 'simulado' };
    }
    if (ativos.length === 0) {
      throw new ErroLLM('Nenhuma chave de API configurada. Informe a chave do Gemini, do Groq ou do OpenRouter.');
    }

    const inicio = comecarPor % ativos.length;
    const ordem = [...ativos.slice(inicio), ...ativos.slice(0, inicio)];
    const falhas = [];

    for (const provedor of ordem) {
      try {
        const texto = await chamar(provedor, sistema, usuario, temperatura);
        return { dados: extrairJSON(texto), provedor: provedor.nome };
      } catch (erro) {
        const motivo = erro.name === 'TypeError' ? 'falha de rede (internet ou bloqueio do navegador)' : erro.message;
        falhas.push(`${provedor.nome}: ${motivo}`);
        console.warn(`[llm] ${provedor.nome} falhou (${tarefa}): ${motivo}`);
      }
    }
    throw new ErroLLM(`Todos os provedores falharam. ${falhas.join(' | ')}`);
  }

  /** Tenta os modelos do provedor em ordem; lembra qual funcionou. */
  async function chamar(provedor, sistema, usuario, temperatura) {
    const candidatos = listaDeModelos(provedor);
    let ultimoErro;
    for (let i = 0; i < candidatos.length; i++) {
      const modelo = candidatos[i];
      try {
        const texto = await chamarModelo(provedor, modelo, sistema, usuario, temperatura);
        MODELO_QUE_FUNCIONOU.set(provedor.nome, modelo);
        return texto;
      } catch (erro) {
        ultimoErro = erro;
        if (!erro.trocarModelo) throw erro;
        // o próprio erro às vezes indica o modelo novo ("use models/gemini-x-flash")
        if (erro.modeloSugerido && !candidatos.includes(erro.modeloSugerido)) {
          candidatos.splice(i + 1, 0, erro.modeloSugerido);
        }
        console.warn(`[llm] ${provedor.nome}/${modelo} indisponível, tentando outro modelo.`);
      }
    }
    throw ultimoErro;
  }

  function listaDeModelos(provedor) {
    const lista = [MODELO_QUE_FUNCIONOU.get(provedor.nome), modelos[provedor.nome], ...provedor.modelos];
    return [...new Set(lista.filter(Boolean))];
  }

  async function chamarModelo(provedor, modelo, sistema, usuario, temperatura) {
    const resposta = await fetch(provedor.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${chaves[provedor.nome]}`,
      },
      body: JSON.stringify({
        model: modelo,
        temperature: temperatura,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      throw erroHTTP(resposta.status, detalhe, modelo);
    }
    const json = await resposta.json();
    const texto = json?.choices?.[0]?.message?.content;
    if (!texto) throw new Error(`${modelo}: resposta vazia`);
    return texto;
  }

  return {
    gerarJSON,
    provedores: simulado ? ['simulado'] : ativos.map((p) => p.nome),
  };
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
