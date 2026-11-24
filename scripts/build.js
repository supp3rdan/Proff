// Build da Vercel: marca a versão nos endereços dos arquivos (cache do navegador).
// As chaves de API ficam só nas variáveis de ambiente do servidor.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const versao = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 7);
const raiz = new URL('../public', import.meta.url).pathname;

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((n) => {
    const c = join(pasta, n);
    return statSync(c).isDirectory() ? arquivos(c) : [c];
  });
}

let marcados = 0;
for (const arquivo of arquivos(raiz).filter((f) => /\.(js|html|css)$/.test(f))) {
  const texto = readFileSync(arquivo, 'utf8');
  if (texto.includes('__VERSAO__')) {
    writeFileSync(arquivo, texto.replaceAll('__VERSAO__', versao));
    marcados++;
  }
}

console.log(`Build: versão ${versao} marcada em ${marcados} arquivos.`);
