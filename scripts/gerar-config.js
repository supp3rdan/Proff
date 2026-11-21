// Gera public/config.js com as chaves padrão a partir das variáveis de ambiente.
// Usado pelo workflow do GitHub Pages (as chaves vêm dos segredos do repositório).
//   GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/gerar-config.js

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chaves = {
  gemini: process.env.GEMINI_API_KEY || '',
  groq: process.env.GROQ_API_KEY || '',
  openrouter: process.env.OPENROUTER_API_KEY || '',
};

const conteudo = `// Arquivo gerado na publicação (scripts/gerar-config.js). Não edite.
window.PROFF_CONFIG = ${JSON.stringify({ chaves }, null, 2)};
`;

const destino = fileURLToPath(new URL('../public/config.js', import.meta.url));
writeFileSync(destino, conteudo);

const configuradas = Object.entries(chaves).filter(([, v]) => v).map(([k]) => k);
console.log(`config.js gerado. Chaves padrão: ${configuradas.join(', ') || 'nenhuma'}`);
