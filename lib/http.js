import { timingSafeEqual } from 'node:crypto';

const LIMITE_CORPO = 800_000; // bytes (a apresentação editada pode ser grande)

export function enviarJSON(res, status, dados) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(dados));
}

/** Na Vercel o corpo já vem em req.body; no servidor local lemos o stream. */
export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  let texto = '';
  for await (const parte of req) {
    texto += parte;
    if (texto.length > LIMITE_CORPO) throw new Error('Corpo da requisição muito grande.');
  }
  try {
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
}

/** Se APP_SENHA estiver definida, exige o mesmo valor no cabeçalho x-proff-senha. */
export function senhaConfere(req) {
  const esperada = process.env.APP_SENHA;
  if (!esperada) return true;
  const recebida = String(req.headers['x-proff-senha'] || '');
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function enviarHTML(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(html);
}

export function tokenDaRequisicao(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
