// Monta a aula interativa como UM arquivo HTML (CSS, scripts e dados embutidos),
// para abrir no navegador, mandar aos alunos ou usar offline.
// Só as fórmulas (KaTeX) vêm da internet; sem conexão, aparecem como texto.

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist';

async function lerArquivoPadrao(caminho) {
  const r = await fetch(new URL(`${caminho}?v=__VERSAO__`, import.meta.url));
  if (!r.ok) throw new Error(`não foi possível carregar ${caminho}`);
  return r.text();
}

/** JSON seguro para ficar dentro de <script>: nada de "</script>" no meio. */
function jsonSeguro(dados) {
  return JSON.stringify(dados)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * @param {object} dados  resultado de dadosDaPagina()
 * @param {object} [opcoes]
 * @param {(caminho: string) => Promise<string>} [opcoes.lerArquivo]  no servidor, lê do disco
 */
export async function montarPaginaInterativa(dados, { lerArquivo = lerArquivoPadrao } = {}) {
  const [css, runtime, expressao, latex] = await Promise.all([
    lerArquivo('./pagina.css'),
    lerArquivo('./runtime.js'),
    lerArquivo('../core/expressao.js'),
    lerArquivo('../core/latex.js'),
  ]);
  const expressaoSemExport = expressao.replace(/^export\s*\{[^}]*\};?\s*$/m, '');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aula interativa · Proff</title>
<link rel="stylesheet" href="${KATEX}/katex.min.css">
<script defer src="${KATEX}/katex.min.js"></script>
<script defer src="${KATEX}/contrib/auto-render.min.js"></script>
<style>
${css}
</style>
</head>
<body>
<script type="application/json" id="proff-dados">${jsonSeguro(dados)}</script>
<script>
window.addEventListener('DOMContentLoaded', function () {
${expressaoSemExport}
${latex.replace(/^export\s+function/m, 'function')}
${runtime}
});
</script>
</body>
</html>
`;
}
