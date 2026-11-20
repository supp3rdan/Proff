// Exporta os slides para PowerPoint com a biblioteca pptxgenjs (carregada via CDN).
// O PowerPoint não entende LaTeX, então as fórmulas viram texto legível (ex.: \frac{a}{b} → (a)/(b)).

const COR = { fundo: 'FFFFFF', titulo: '1F4E79', texto: '222222', destaque: 'E07A1F', caixa: 'EEF4FA' };

const SOBRESCRITOS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', n: 'ⁿ', '-': '⁻', '+': '⁺' };
const SIMBOLOS = {
  cdot: '·', times: '×', div: '÷', neq: '≠', leq: '≤', geq: '≥', le: '≤', ge: '≥', pm: '±',
  approx: '≈', infty: '∞', pi: 'π', alpha: 'α', beta: 'β', theta: 'θ', Delta: 'Δ', delta: 'δ',
  Rightarrow: '⇒', rightarrow: '→', Leftrightarrow: '⇔', in: '∈', notin: '∉', cup: '∪', cap: '∩',
  subset: '⊂', emptyset: '∅', mathbb: '', circ: '°', sum: 'Σ', ldots: '…', dots: '…', quad: ' ', qquad: '  ',
};

export function latexParaTexto(texto = '') {
  let t = String(texto);
  for (let i = 0; i < 5; i++) {
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
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

export async function exportarPptx(deck, entrada) {
  if (!window.PptxGenJS) throw new Error('biblioteca pptxgenjs não carregou (verifique a internet).');
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13,33 x 7,5 pol.
  pptx.title = deck.titulo;

  const T = latexParaTexto;
  const caixaTitulo = { x: 0.6, y: 0.4, w: 12.1, h: 1, fontSize: 32, bold: true, color: COR.titulo, fontFace: 'Calibri' };
  const corpo = { x: 0.8, y: 1.6, w: 11.7, h: 5.2, fontSize: 22, color: COR.texto, fontFace: 'Calibri', valign: 'top' };

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: COR.fundo };

    if (s.tipo === 'capa') {
      slide.background = { color: COR.titulo };
      slide.addText(T(s.titulo), { x: 0.8, y: 2.3, w: 11.7, h: 1.5, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center' });
      slide.addText(T(s.subtitulo || `${entrada.serie}º ano do Ensino Médio`), { x: 0.8, y: 3.9, w: 11.7, h: 0.8, fontSize: 24, color: 'FFD166', align: 'center' });
    } else {
      const etiqueta = { exemplo: 'Exemplo resolvido', exercicio: 'Exercício', resumo: 'Resumo' }[s.tipo];
      if (etiqueta) slide.addText(etiqueta.toUpperCase(), { x: 0.6, y: 0.15, w: 6, h: 0.4, fontSize: 12, bold: true, color: COR.destaque });
      slide.addText(T(s.titulo), caixaTitulo);

      const linhas = [];
      if (s.enunciado) linhas.push({ text: T(s.enunciado), options: { bold: true, breakLine: true, paraSpaceAfter: 12 } });
      (s.topicos || []).forEach((t) => linhas.push({ text: T(t), options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } }));
      (s.passos || []).forEach((t) => linhas.push({ text: T(t), options: { bullet: { type: 'number' }, breakLine: true, paraSpaceAfter: 8 } }));
      if (s.resposta) linhas.push({ text: `Resposta: ${T(s.resposta)}`, options: { bold: true, color: COR.destaque, breakLine: true } });
      if (linhas.length) slide.addText(linhas, { ...corpo, h: s.formula ? 3.8 : 5.2 });

      if (s.formula) {
        slide.addText(T(s.formula), {
          x: 2.5, y: 5.6, w: 8.3, h: 1.1, fontSize: 28, bold: true, align: 'center',
          color: COR.titulo, fill: { color: COR.caixa }, rectRadius: 0.1,
        });
      }
    }

    if (s.notas) slide.addNotes(T(s.notas));
  }

  const nome = `Proff - ${entrada.assunto} - ${entrada.serie}º ano`.replace(/[\\/:*?"<>|]/g, '');
  await pptx.writeFile({ fileName: `${nome}.pptx` });
}
