// GET /api/status — informa quais provedores estão configurados e se há código de acesso.

import { provedoresAtivos, modoSimulado } from '../lib/llm.js';
import { enviarJSON } from '../lib/http.js';

export default function handler(req, res) {
  enviarJSON(res, 200, {
    provedores: modoSimulado() ? ['simulado'] : provedoresAtivos().map((p) => p.nome),
    pedeSenha: Boolean(process.env.APP_SENHA),
  });
}
