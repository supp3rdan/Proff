// Matemática no PowerPoint (sem IA):
// - fórmulas em destaque viram imagem PNG nítida desenhada pelo MathJax;
// - fórmulas no meio do texto viram texto Unicode na fonte Cambria Math (continua editável).

const SOBRESCRITOS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', n: 'ⁿ', '-': '⁻', '+': '⁺' };
const SIMBOLOS = {
  cdot: '·', times: '×', div: '÷', neq: '≠', leq: '≤', geq: '≥', le: '≤', ge: '≥', pm: '±',
  approx: '≈', infty: '∞', pi: 'π', alpha: 'α', beta: 'β', theta: 'θ', Delta: 'Δ', delta: 'δ',
  Rightarrow: '⇒', rightarrow: '→', Leftrightarrow: '⇔', in: '∈', notin: '∉', cup: '∪', cap: '∩',
  subset: '⊂', emptyset: '∅', mathbb: '', circ: '°', sum: 'Σ', ldots: '…', dots: '…', quad: ' ', qquad: '  ',
};

// Só põe parênteses quando o termo tem mais de um elemento: 1/2, mas (x+1)/2.
const parenteses = (t) => (/^[\w.,]+$/.test(t.trim()) || /^\\[a-zA-Z]+$/.test(t.trim()) ? t.trim() : `(${t.trim()})`);

/** Converte LaTeX simples em texto legível: \frac{a}{b} → a/b, x^2 → x². */
export function latexParaTexto(texto = '') {
  let t = String(texto);
  for (let i = 0; i < 5; i++) {
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `${parenteses(a)}/${parenteses(b)}`);
    t = t.replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, '$1√($2)');
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
    t = t.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1');
  }
  t = t
    .replace(/\\left|\\right/g, '')
    .replace(/\^\{([0-9n+-]+)\}|\^([0-9n])/g, (_, a, b) => [...(a || b)].map((c) => SOBRESCRITOS[c] ?? c).join(''))
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\([a-zA-Z]+)/g, (_, cmd) => (Object.hasOwn(SIMBOLOS, cmd) ? SIMBOLOS[cmd] : cmd))
    .replace(/\{,\}/g, ',')
    .replace(/\\[,;!]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/R\$/g, 'R\u0000')
    .replace(/\$/g, '')
    .replace(/R\u0000/g, 'R$');
  return t.replace(/\s{2,}/g, ' ').trim();
}

const MARCADOR_REAL = '';

/**
 * Divide um texto em trechos de texto comum e de matemática.
 * "Custa R$ 5 e $x^2$" → [{texto:'Custa R$ 5 e '}, {mat:'x^2'}]
 */
export function segmentar(texto = '') {
  const protegido = String(texto).replace(/R\$/g, `R${MARCADOR_REAL}`);
  const partes = protegido.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/).filter((p) => p !== '');
  return partes.map((p) => {
    const volta = (s) => s.replaceAll(MARCADOR_REAL, '$');
    if (p.startsWith('$$')) return { mat: volta(p.slice(2, -2)) };
    if (p.startsWith('$') && p.endsWith('$') && p.length > 1) return { mat: volta(p.slice(1, -1)) };
    return { texto: volta(p) };
  });
}

/** Verdadeiro quando o texto é só uma fórmula (pode ter pontuação em volta). */
export function soMatematica(texto = '') {
  const partes = segmentar(texto);
  const mats = partes.filter((p) => p.mat);
  if (mats.length !== 1) return null;
  const resto = partes.filter((p) => p.texto).map((p) => p.texto).join('');
  return /^[\s.,;:]*$/.test(resto) ? mats[0].mat : null;
}

// ---------- MathJax (carregado só na hora de exportar) ----------
const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';
let carregando = null;

function carregarMathJax() {
  if (window.MathJax?.tex2svg) return Promise.resolve();
  if (carregando) return carregando;
  window.MathJax = {
    startup: { typeset: false },
    svg: { fontCache: 'none' }, // SVG independente, pode virar imagem sozinho
  };
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MATHJAX_URL;
    s.async = true;
    s.onload = () => window.MathJax.startup.promise.then(resolve, reject);
    s.onerror = () => reject(new Error('não foi possível carregar o MathJax'));
    document.head.append(s);
  });
  return carregando;
}

const PX_POR_EX = 8; // tamanho de referência do "ex" ao rasterizar
const ESCALA = 4; // resolução extra para a imagem ficar nítida no projetor

/**
 * Desenha uma fórmula LaTeX como PNG.
 * @returns {Promise<{data: string, larguraEx: number, alturaEx: number} | null>}
 *          null se não der para desenhar (o chamador usa texto no lugar).
 */
export async function formulaParaImagem(latex, cor = '#1F4E79') {
  try {
    await carregarMathJax();
    const no = window.MathJax.tex2svg(latex, { display: true });
    const svg = no.querySelector('svg');
    if (!svg || no.querySelector('[data-mjx-error]')) return null;

    const larguraEx = parseFloat(svg.getAttribute('width'));
    const alturaEx = parseFloat(svg.getAttribute('height'));
    const w = Math.ceil(larguraEx * PX_POR_EX * ESCALA);
    const h = Math.ceil(alturaEx * PX_POR_EX * ESCALA);
    svg.setAttribute('width', `${w}px`);
    svg.setAttribute('height', `${h}px`);
    svg.setAttribute('color', cor);
    svg.style.color = cor;

    const xml = new XMLSerializer().serializeToString(svg).replaceAll('currentColor', cor);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('svg inválido'));
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL('image/png'), larguraEx, alturaEx };
  } catch (erro) {
    console.warn('[pptx] fórmula como texto:', latex, erro.message);
    return null;
  }
}
