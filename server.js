// Servidor local de desenvolvimento: serve public/ e as rotas de api/.
// Na Vercel este arquivo não é usado; lá cada arquivo de api/ vira uma função.
//   npm run dev   →  http://localhost:3000

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
carregarEnv(join(RAIZ, '.env'));

const PUBLICO = resolve(RAIZ, 'public');
const PORTA = Number(process.env.PORT || 3000);

// Mesmas regras de reescrita do vercel.json:
//   /v1/<rota>  → api/r.js?rota=<rota>
//   /a/<slug>   → api/r.js?rota=publica/<slug>
function rotaDaApi(caminho, busca) {
  let rota = null;
  if (caminho.startsWith('/v1/')) rota = caminho.slice(4);
  else if (caminho.startsWith('/a/')) rota = `publica/${caminho.slice(3)}`;
  else if (caminho === '/api/r') rota = new URLSearchParams(busca).get('rota');
  return rota;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  try {
    const url = new URL(req.url, 'http://localhost');
    const rota = rotaDaApi(caminho, url.search);
    if (rota !== null) {
      url.searchParams.set('rota', rota);
      req.url = `/api/r?${url.searchParams}`;
      const { default: handler } = await import('./api/r.js');
      return await handler(req, res);
    }
    if (caminho === '/api/sympy_comparar') {
      res.statusCode = 501; // a função Python só roda na Vercel; localmente a IA compara
      return res.end('{"erro":"SymPy só na Vercel"}');
    }

    let arquivo = normalize(join(PUBLICO, caminho));
    if (!arquivo.startsWith(PUBLICO)) {
      res.statusCode = 403;
      return res.end('Proibido');
    }
    if (existsSync(arquivo) && (await stat(arquivo)).isDirectory()) arquivo = join(arquivo, 'index.html');
    if (!existsSync(arquivo)) {
      res.statusCode = 404;
      return res.end('Não encontrado');
    }
    res.setHeader('Content-Type', TIPOS[extname(arquivo)] || 'application/octet-stream');
    res.end(await readFile(arquivo));
  } catch (erro) {
    console.error(erro);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Erro interno');
  }
}).listen(PORTA, () => {
  console.log(`Proff rodando em http://localhost:${PORTA}`);
  if (process.env.LLM_MOCK === '1') console.log('Modo simulado ativo (LLM_MOCK=1): nenhuma API de IA será chamada.');
  if (process.env.DB_MEMORIA === '1') console.log('Banco em memória (DB_MEMORIA=1): login de demonstração, nada é salvo de verdade.');
});

/** Leitor simples de .env (sem dependências). Não sobrescreve variáveis já definidas. */
function carregarEnv(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}
