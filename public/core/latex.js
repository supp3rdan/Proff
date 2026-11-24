// Conserta fórmulas que a IA escreveu em LaTeX sem os delimitadores $...$.
// Ex.: "aplique \frac{f_i}{N} = \frac{50}{200} = 0,25." → "aplique $\frac{f_i}{N} = \frac{50}{200} = 0{,}25$."
// A função é autocontida (sem referências externas) porque também é embutida na página interativa.

export function delimitarLatex(texto) {
  if (typeof texto !== 'string' || !/\\[a-zA-Z]|[A-Za-z0-9}\)][_^]/.test(texto)) return texto;
  const TOKEN = new RegExp([
    '\\\\[a-zA-Z]+(?:\\s*\\{(?:[^{}]|\\{[^{}]*\\})*\\})*', // \frac{a}{b}, \sqrt{x}, \cdot
    '(?<![A-Za-zÀ-ÿ])[A-Za-z](?:[_^](?:\\{[^{}]*\\}|[A-Za-z0-9]))+(?![A-Za-zÀ-ÿ])', // f_i, x^2, a_{n}
    '\\d+(?:[.,]\\d+)?(?:\\^(?:\\{[^{}]*\\}|[0-9]))?', // 50, 0,25, 10^3
    '(?<![A-Za-zÀ-ÿ])[A-Za-z](?![A-Za-zÀ-ÿ])', // letra isolada (N, x)
    '[=+\\-*/<>()\\[\\]|]', // operadores
    '[ \\t]+',
    '[\\s\\S]', // qualquer outra coisa encerra a fórmula
  ].map((p) => `(${p})`).join('|'), 'g');
  const TIPOS = ['forte', 'forte', 'numero', 'letra', 'op', 'espaco', 'outro'];

  function consertar(trecho) {
    const toks = [];
    for (const m of trecho.matchAll(TOKEN)) {
      let tipo = TIPOS[m.slice(1).findIndex((g) => g !== undefined)];
      if (tipo === 'numero' && m[0].includes('^')) tipo = 'forte';
      toks.push({ t: m[0], tipo });
    }
    // letra isolada só conta como matemática se estiver colada a um operador ou a outra fórmula
    const vizinho = (i, passo) => {
      for (let j = i + passo; j >= 0 && j < toks.length; j += passo) if (toks[j].tipo !== 'espaco') return toks[j];
      return null;
    };
    toks.forEach((k, i) => {
      if (k.tipo !== 'letra') return;
      const a = vizinho(i, -1);
      const d = vizinho(i, 1);
      if (![a, d].some((v) => v && (v.tipo === 'op' || v.tipo === 'forte'))) k.tipo = 'outro';
    });
    let saida = '';
    let grupo = [];
    const fechar = () => {
      if (!grupo.length) return;
      let ini = 0;
      let fim = grupo.length;
      while (ini < fim && (grupo[ini].tipo === 'espaco' || (grupo[ini].tipo === 'op' && /[=+*/<>|)\]]/.test(grupo[ini].t)))) ini++;
      while (fim > ini && (grupo[fim - 1].tipo === 'espaco' || (grupo[fim - 1].tipo === 'op' && /[=+\-*/<>(\[|]/.test(grupo[fim - 1].t)))) fim--;
      const meio = grupo.slice(ini, fim);
      const texto = (lista) => lista.map((k) => k.t).join('');
      if (meio.some((k) => k.tipo === 'forte')) {
        saida += texto(grupo.slice(0, ini)) + `$${texto(meio).replace(/(\d),(\d)/g, '$1{,}$2')}$` + texto(grupo.slice(fim));
      } else {
        saida += texto(grupo);
      }
      grupo = [];
    };
    for (const k of toks) {
      if (k.tipo === 'outro') {
        fechar();
        saida += k.t;
      } else {
        grupo.push(k);
      }
    }
    fechar();
    return saida;
  }

  // só mexe no que está fora de $...$ / $$...$$ (e não confunde com R$)
  return texto
    .split(/(\$\$[\s\S]+?\$\$|(?<!R)\$[^$\n]+?\$)/)
    .map((parte, i) => (i % 2 ? parte : consertar(parte)))
    .join('');
}
