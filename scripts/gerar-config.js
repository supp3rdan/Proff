// Gera public/config.js com as chaves padrão a partir das variáveis de ambiente.
// Usado pelo workflow do GitHub Pages (as chaves vêm dos segredos do repositório).
//   GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/gerar-config.js
//
// Cada chave é conferida pelo começo e colocada no provedor certo, mesmo que o
// segredo tenha sido cadastrado com o nome trocado. Nenhuma chave é impressa no log.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corrigirChaves, PROVEDORES } from '../public/core/llm.js';

const recebidas = {
  gemini: (process.env.GEMINI_API_KEY || '').trim(),
  groq: (process.env.GROQ_API_KEY || '').trim(),
  openrouter: (process.env.OPENROUTER_API_KEY || '').trim(),
};

const { chaves, avisos } = corrigirChaves(recebidas);
for (const { campo, dono } of avisos) {
  console.log(`Aviso: a chave cadastrada para "${campo}" é do ${dono}; usando como chave do ${dono}.`);
}

const config = { chaves: Object.fromEntries(PROVEDORES.map((p) => [p.nome, chaves[p.nome] || ''])) };
const conteudo = `// Arquivo gerado na publicação (scripts/gerar-config.js). Não edite.
window.PROFF_CONFIG = ${JSON.stringify(config, null, 2)};
`;

const destino = fileURLToPath(new URL('../public/config.js', import.meta.url));
writeFileSync(destino, conteudo);

const configuradas = PROVEDORES.filter((p) => chaves[p.nome]).map((p) => p.nome);
console.log(`config.js gerado. Chaves padrão: ${configuradas.join(', ') || 'nenhuma'}`);
