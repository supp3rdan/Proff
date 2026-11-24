// Versões A e B da prova: mesmas questões, em outra ordem e com as alternativas
// embaralhadas (o gabarito acompanha). Feito por código, sem IA.

/** Gerador de números aleatórios com semente (mesma semente = mesmas versões). */
function aleatorio(semente) {
  let s = 0;
  for (const c of String(semente)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(lista, rnd) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETRAS = 'ABCDE';

function letraCorreta(resposta) {
  const m = String(resposta).trim().toUpperCase().match(/^\(?([A-E])\b/);
  return m ? LETRAS.indexOf(m[1]) : -1;
}

/** Uma versão da prova a partir da semente. A versão "A" mantém a ordem original. */
export function criarVersao(questoes, rotulo, semente) {
  if (rotulo === 'A') return questoes.map((q, i) => ({ ...q, numero: i + 1, original: q.numero }));
  const rnd = aleatorio(`${semente}:${rotulo}`);
  return embaralhar(questoes, rnd).map((q, i) => {
    const base = { ...q, numero: i + 1, original: q.numero };
    const certa = letraCorreta(q.resposta);
    if (q.tipo !== 'multipla' || certa < 0 || !q.alternativas?.length) return base;
    const ordem = embaralhar(q.alternativas.map((_, k) => k), rnd);
    return {
      ...base,
      alternativas: ordem.map((k) => q.alternativas[k]),
      resposta: LETRAS[ordem.indexOf(certa)],
    };
  });
}

export function criarVersoes(prova, semente = Date.now()) {
  return { semente: String(semente), A: criarVersao(prova.questoes, 'A', semente), B: criarVersao(prova.questoes, 'B', semente) };
}
