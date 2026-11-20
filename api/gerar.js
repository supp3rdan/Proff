// POST /api/gerar
// Corpo: { tipo: "plano" | "slides" | "prova", serie, assunto, observacoes?, plano? }
// Funciona como função serverless da Vercel e também pelo server.js local.

import { gerarPlano, gerarSlides, gerarProva, validarEntrada, ErroEntrada } from '../public/core/gerador.js';
import { ErroLLM } from '../public/core/llm.js';
import { clienteDoAmbiente } from '../lib/ambiente.js';
import { senhaConfere, enviarJSON, lerCorpo } from '../lib/http.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return enviarJSON(res, 405, { erro: 'Use POST.' });
  if (!senhaConfere(req)) return enviarJSON(res, 401, { erro: 'Código de acesso inválido.' });

  try {
    const corpo = await lerCorpo(req);
    const entrada = validarEntrada(corpo);
    const tipo = corpo.tipo;
    const llm = clienteDoAmbiente();

    if (tipo === 'plano') return enviarJSON(res, 200, await gerarPlano(llm, entrada));

    if (tipo === 'slides' || tipo === 'prova') {
      if (!corpo.plano || typeof corpo.plano !== 'object') {
        throw new ErroEntrada('Gere o plano de aula antes.');
      }
      const plano = corpo.plano;
      const resultado = tipo === 'slides' ? await gerarSlides(llm, entrada, plano) : await gerarProva(llm, entrada, plano);
      return enviarJSON(res, 200, resultado);
    }

    throw new ErroEntrada('Tipo inválido. Use "plano", "slides" ou "prova".');
  } catch (erro) {
    if (erro instanceof ErroEntrada) return enviarJSON(res, 400, { erro: erro.message });
    if (erro instanceof ErroLLM) return enviarJSON(res, 503, { erro: erro.message });
    console.error('[api/gerar]', erro);
    return enviarJSON(res, 500, { erro: erro.message || 'Erro inesperado.' });
  }
}
