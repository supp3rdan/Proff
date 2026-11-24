// Cliente único para APIs compatíveis com a OpenAI (Groq, Gemini, OpenRouter).
// Tenta os provedores em ordem e passa para o próximo quando um falha
// (limite de uso, erro do servidor, tempo esgotado ou JSON inválido).
//
// Cada pedido tem um PERFIL, que escolhe o modelo mais adequado:
//   "texto"      → redação da aula e dos slides (Llama 3.3 70B no Groq: muito rápido)
//   "matematica" → contas, questões e gabarito (gpt-oss-120b no Groq: raciocina antes de responder)
//
// Este arquivo não usa nada específico do Node: roda no servidor (Vercel /
// server.js) e também direto no navegador (GitHub Pages).

import { respostaSimulada } from './mock.js?v=__VERSAO__';

export const PROVEDORES = [
  {
    nome: 'gemini',
    rotulo: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    // Em ordem de preferência. Se um modelo for desativado ou não tiver cota
    // grátis, o Proff tenta o próximo (e também o modelo que o erro sugerir).
    modelos: {
      texto: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'],
      matematica: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'],
    },
    // Raciocínio curto: os modelos novos "pensam" bastante por padrão e demoram.
    extras: () => ({ reasoning_effort: 'low' }),
    ondeCriarChave: 'https://aistudio.google.com/app/apikey',
    prefixos: ['AIza', 'AQ.'],
  },
  {
    nome: 'groq',
    rotulo: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelos: {
      texto: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
      matematica: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    },
    // Só o gpt-oss aceita reasoning_effort; nas contas ele raciocina um pouco mais.
    extras: (modelo, perfil) =>
      modelo.includes('gpt-oss') ? { reasoning_effort: perfil === 'matematica' ? 'medium' : 'low' } : {},
    ondeCriarChave: 'https://console.groq.com/keys',
    prefixos: ['gsk_'],
  },
  {
    nome: 'openrouter',
    rotulo: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelos: { texto: ['openrouter/free'], matematica: ['openrouter/free'] },
    ondeCriarChave: 'https://openrouter.ai/keys',
    prefixos: ['sk-or-'],
  },
];

// Ordem de uso: Groq primeiro (mais rápido), depois Gemini e OpenRouter como reserva.
const ORDEM_DE_USO = ['groq', 'gemini', 'openrouter'];

export class ErroLLM extends Error {}

/** Descobre de qual provedor é uma chave pelo começo dela (null se não reconhecer). */
export function provedorDaChave(chave = '') {
  const c = String(chave).trim();
  return PROVEDORES.find((p) => p.prefixos?.some((pre) => c.startsWith(pre)))?.nome || null;
}

/**
 * Coloca cada chave no provedor certo quando foi colada no campo errado
 * (ex.: chave "sk-or-..." do OpenRouter no campo do Groq).
 */
export function corrigirChaves(chaves = {}) {
  const certas = {};
  const avisos = [];
  for (const [campo, chave] of Object.entries(chaves)) {
    if (!chave) continue;
    const dono = provedorDaChave(chave);
    if (dono && dono !== campo && !chaves[dono]) {
      certas[dono] = chave;
      avisos.push({ campo, dono });
    } else if (!certas[campo]) {
      certas[campo] = chave;
    }
  }
  return { chaves: certas, avisos };
}

// Modelo que funcionou por provedor e perfil (evita repetir tentativas na mesma sessão).
const MODELO_QUE_FUNCIONOU = new Map();
// Modelos que recusaram os parâmetros extras (ex.: reasoning_effort).
const SEM_EXTRAS = new Set();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Esquece o que foi aprendido na sessão (usado nos testes). */
export function limparCacheDeModelos() {
  MODELO_QUE_FUNCIONOU.clear();
  SEM_EXTRAS.clear();
}

/** Tempo esgotado vira erro legível e faz tentar um modelo mais leve. */
function erroDeTempo(erro, modelo) {
  if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError') {
    const e = new Error(`${modelo}: demorou demais para responder`);
    e.trocarModelo = true;
    return e;
  }
  return erro;
}

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
  erro.semExtras = status === 400 && /reasoning|thinking|unknown name|unrecognized|invalid argument/i.test(texto);
  if (status === 401 || status === 403) {
    erro.message = `${modelo}: chave inválida ou sem permissão (HTTP ${status}). Confira se colou a chave no campo do provedor certo.`;
  }
  // sobrecarga/instabilidade do provedor: vale tentar outro modelo
  const sobrecarga = [500, 502, 503, 504].includes(status) || /high demand|overloaded|unavailable|try again later/i.test(texto);
  erro.trocarModelo =
    sobrecarga ||
    status === 404 ||
    /no longer available|not found|does not exist|decommissioned|deprecated|not supported/i.test(texto) ||
    (status === 429 && /limit:\s*0\b|per day|\bTPD\b|\bRPD\b|daily/i.test(texto));
  // limite por minuto ("try again in 7.5s"): vale esperar um pouco e repetir
  const aguardar = texto.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (status === 429 && aguardar && !erro.trocarModelo) {
    const ms = Number(aguardar[1]) * (aguardar[2].toLowerCase() === 'ms' ? 1 : 1000);
    if (ms <= 20000) erro.esperarMs = Math.ceil(ms) + 500;
  }
  if (status === 429 && !erro.esperarMs) erro.trocarModelo = true;
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
export function criarClienteLLM({ chaves = {}, modelos = {}, simulado = false, timeoutMs = 120000, ordem = null, aoChamar = null } = {}) {
  // ordem: nomes dos provedores na ordem de preferência (o servidor usa a saúde recente de cada um)
  // aoChamar: recebe {provedor, modelo, tarefa, ok, ms, erro} de cada tentativa (monitor no servidor)
  const ordemUso = [...new Set([...(ordem || []), ...ORDEM_DE_USO])].filter((n) => ORDEM_DE_USO.includes(n));
  const ativos = ordemUso.map((n) => PROVEDORES.find((p) => p.nome === n)).filter((p) => chaves[p.nome]);
  const registrar = (evento) => {
    if (!aoChamar) return;
    try {
      Promise.resolve(aoChamar(evento)).catch(() => {});
    } catch { /* o registro nunca derruba a geração */ }
  };

  /**
   * Envia um pedido e devolve o JSON já interpretado.
   * @param {object} o
   * @param {string} o.sistema    instruções de sistema
   * @param {string} o.usuario    pedido
   * @param {string} o.tarefa     nome da tarefa (usado no modo simulado e nos logs)
   * @param {number} [o.comecarPor] índice do provedor inicial (para variar o modelo na verificação)
   * @param {number} [o.temperatura]
   * @param {'texto'|'matematica'} [o.perfil] escolhe o modelo (ver topo do arquivo)
   */
  async function gerarJSON({ sistema, usuario, tarefa, comecarPor = 0, temperatura = 0.6, perfil = 'texto' }) {
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
        const { texto, modelo } = await chamar(provedor, sistema, usuario, temperatura, perfil, tarefa);
        return { dados: extrairJSON(texto), provedor: `${provedor.nome} · ${nomeCurto(modelo)}` };
      } catch (erro) {
        const motivo = erro.name === 'TypeError' ? 'falha de rede (internet ou bloqueio do navegador)' : erro.message;
        falhas.push(`${provedor.nome}: ${motivo}`);
        console.warn(`[llm] ${provedor.nome} falhou (${tarefa}): ${motivo}`);
      }
    }
    throw new ErroLLM(`Todos os provedores falharam. ${falhas.join(' | ')}`);
  }

  /** Tenta os modelos do provedor em ordem; lembra qual funcionou. */
  async function chamar(provedor, sistema, usuario, temperatura, perfil, tarefa) {
    const candidatos = listaDeModelos(provedor, perfil);
    const esperou = new Set();
    let ultimoErro;
    for (let i = 0; i < candidatos.length; i++) {
      const modelo = candidatos[i];
      const inicio = Date.now();
      try {
        const texto = await chamarModelo(provedor, modelo, sistema, usuario, temperatura, perfil);
        MODELO_QUE_FUNCIONOU.set(`${provedor.nome}:${perfil}`, modelo);
        registrar({ provedor: provedor.nome, modelo, tarefa, ok: true, ms: Date.now() - inicio });
        return { texto, modelo };
      } catch (erro) {
        registrar({ provedor: provedor.nome, modelo, tarefa, ok: false, ms: Date.now() - inicio, erro: String(erro.message).slice(0, 300) });
        ultimoErro = erro;
        if (erro.semExtras && !SEM_EXTRAS.has(modelo)) {
          // o modelo não aceitou reasoning_effort: repete o mesmo modelo sem ele
          SEM_EXTRAS.add(modelo);
          i--;
          continue;
        }
        if (erro.esperarMs && !esperou.has(modelo)) {
          // limite por minuto: espera o tempo pedido e repete uma vez
          esperou.add(modelo);
          await espera(erro.esperarMs);
          i--;
          continue;
        }
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

  function listaDeModelos(provedor, perfil) {
    const lista = [
      modelos[provedor.nome], // escolhido pelo usuário (ex.: GROQ_MODEL), vale para os dois perfis
      MODELO_QUE_FUNCIONOU.get(`${provedor.nome}:${perfil}`),
      ...(provedor.modelos[perfil] || provedor.modelos.texto),
    ];
    return [...new Set(lista.filter(Boolean))];
  }

  async function chamarModelo(provedor, modelo, sistema, usuario, temperatura, perfil) {
    const extras = SEM_EXTRAS.has(modelo) || !provedor.extras ? {} : provedor.extras(modelo, perfil);
    const corpo = {
      model: modelo,
      temperature: temperatura,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      response_format: { type: 'json_object' },
      ...extras,
    };

    let json;
    try {
      const resposta = await fetch(provedor.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chaves[provedor.nome]}`,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resposta.ok) throw erroHTTP(resposta.status, await resposta.text(), modelo);
      json = await resposta.json();
    } catch (erro) {
      throw erroDeTempo(erro, modelo);
    }

    const texto = json?.choices?.[0]?.message?.content;
    if (!texto) throw new Error(`${modelo}: resposta vazia`);
    return texto;
  }

  return {
    gerarJSON,
    provedores: simulado ? ['simulado'] : ativos.map((p) => p.nome),
  };
}

/** "openai/gpt-oss-120b" → "gpt-oss-120b"; "llama-3.3-70b-versatile" → "llama-3.3-70b". */
function nomeCurto(modelo) {
  return String(modelo).split('/').pop().replace(/-versatile$|-instruct$/, '');
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
