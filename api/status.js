// GET /api/status — informa quais provedores estão configurados e se há código de acesso.
// O front usa esta rota para saber se há servidor; sem ela (GitHub Pages), gera no navegador.

import { clienteDoAmbiente } from '../lib/ambiente.js';
import { enviarJSON } from '../lib/http.js';

export default function handler(req, res) {
  enviarJSON(res, 200, {
    proff: true,
    provedores: clienteDoAmbiente().provedores,
    pedeSenha: Boolean(process.env.APP_SENHA),
  });
}
