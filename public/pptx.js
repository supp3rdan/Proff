// Exporta a aula para PowerPoint com a biblioteca pptxgenjs.
//
// O visual é 100% definido aqui (tema e layouts fixos por tipo de slide).
// A IA só fornece o conteúdo (títulos, tópicos, passos, respostas); nada do
// arquivo é gerado por ela. As cores seguem as da interface (style.css/slides.css).

import { latexParaTexto, segmentar, soMatematica, formulaParaImagem } from './pptx-matematica.js';

export { latexParaTexto };

// ---------- tema ----------
const C = {
  azul: '1F4E79',
  azulEscuro: '163A5C',
  azulMedio: '2B6299',
  azulClaro: 'EEF4FA',
  amarelo: 'FFD166',
  laranja: 'E07A1F',
  laranjaClaro: 'FDF1E6',
  verde: '2E7D4F',
  verdeClaro: 'E8F5EE',
  texto: '1D2733',
  suave: '5B6876',
  borda: 'D9E1EA',
  branco: 'FFFFFF',
  fundoResumo: 'F4F8FC',
};
const F = { texto: 'Calibri', titulo: 'Calibri', mat: 'Cambria Math', destaque: 'Georgia' };
const W = 13.333; // LAYOUT_WIDE, polegadas
const H = 7.5;
const M = 0.75; // margem esquerda do conteúdo
const LARGURA = W - M - 0.7;

// ---------- utilidades ----------
/** Texto com matemática inline → trechos (runs) do pptxgenjs. */
function runs(texto, opcoes = {}) {
  return segmentar(texto).map((p) =>
    p.mat
      ? { text: latexParaTexto(p.mat), options: { ...opcoes, fontFace: F.mat } }
      : { text: p.texto, options: { fontFace: F.texto, ...opcoes } }
  );
}

const tamanhoPlano = (t) => latexParaTexto(t || '').length;

/** Diminui a fonte conforme o texto cresce, para caber na caixa. */
function fonte(texto, base, passos = [[50, 0], [80, 2], [120, 4], [180, 6], [Infinity, 8]]) {
  const n = tamanhoPlano(texto);
  for (const [limite, menos] of passos) if (n <= limite) return base - menos;
  return base - 8;
}

const encurtar = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Fórmula como imagem, já com tamanho em polegadas e cabendo na caixa. */
async function imagemFormula(latex, cor, { pt = 32, maxW = 9, maxH = 1.4 } = {}) {
  const img = await formulaParaImagem(latex, `#${cor}`);
  if (!img) return null;
  const exPol = (0.43 * pt) / 72; // 1 ex ≈ 0,43 em
  let w = img.larguraEx * exPol;
  let h = img.alturaEx * exPol;
  const k = Math.min(1, maxW / w, maxH / h);
  w *= k;
  h *= k;
  return { data: img.data, w, h };
}

// ---------- elementos comuns ----------
function moldura(pptx, slide, { indice, total, entrada, fundo = C.branco }) {
  slide.background = { color: fundo };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: H, fill: { color: C.azul }, line: { color: C.azul } });
  slide.addShape(pptx.ShapeType.line, { x: M, y: H - 0.62, w: LARGURA, h: 0, line: { color: C.borda, width: 0.75 } });
  slide.addText(encurtar(`Matemática · ${entrada.serie}º ano · ${entrada.assunto}`, 80), {
    x: M, y: H - 0.55, w: 9, h: 0.35, fontFace: F.texto, fontSize: 10, color: C.suave, margin: 0,
  });
  slide.addText(`${indice} / ${total}`, {
    x: W - 2.2, y: H - 0.55, w: 1.5, h: 0.35, fontFace: F.texto, fontSize: 10, color: C.suave, align: 'right', margin: 0,
  });
}

function etiqueta(pptx, slide, texto, cor, y = 0.42) {
  const w = 0.5 + texto.length * 0.105;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: M, y, w, h: 0.34, fill: { color: cor }, line: { color: cor }, rectRadius: 0.17,
  });
  slide.addText(texto.toUpperCase(), {
    x: M, y, w, h: 0.34, fontFace: F.texto, fontSize: 11, bold: true, color: C.branco,
    align: 'center', valign: 'middle', charSpacing: 1.5, margin: 0,
  });
}

/** Título com o traço amarelo embaixo. Devolve o y onde o conteúdo começa. */
function titulo(pptx, slide, texto, { comEtiqueta = false, cor = C.azul } = {}) {
  const y = comEtiqueta ? 0.86 : 0.5;
  slide.addText(runs(texto, { bold: true, color: cor, fontFace: F.titulo }), {
    x: M, y, w: LARGURA, h: 0.85, fontSize: fonte(texto, 34, [[40, 0], [60, 4], [Infinity, 8]]),
    valign: 'middle', margin: 0, fit: 'shrink',
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: M, y: y + 0.92, w: 1.1, h: 0.07, fill: { color: C.amarelo }, line: { color: C.amarelo },
  });
  return y + 1.25;
}

async function caixaFormula(pptx, slide, latex, { y, h = 1.5 }) {
  const w = Math.min(9.5, LARGURA);
  const x = M + (LARGURA - w) / 2;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, fill: { color: C.azulClaro }, line: { color: C.azulClaro }, rectRadius: 0.15,
  });
  slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.2, w: 0.08, h: h - 0.4, fill: { color: C.azul }, line: { color: C.azul } });

  const img = await imagemFormula(latex, C.azul, { pt: 36, maxW: w - 0.8, maxH: h - 0.35 });
  if (img) {
    slide.addImage({ data: img.data, x: x + (w - img.w) / 2, y: y + (h - img.h) / 2, w: img.w, h: img.h });
  } else {
    slide.addText(latexParaTexto(latex), {
      x, y, w, h, fontFace: F.mat, fontSize: 30, color: C.azul, align: 'center', valign: 'middle',
    });
  }
}

/** Linha de texto que pode ser só fórmula (vira imagem) ou texto com matemática. */
async function linha(slide, texto, { x, y, w, h, tamanho, cor = C.texto, negrito = false }) {
  const mat = soMatematica(texto);
  if (mat) {
    const img = await imagemFormula(mat, cor, { pt: tamanho * 1.1, maxW: w, maxH: h * 0.8 });
    if (img) {
      slide.addImage({ data: img.data, x, y: y + (h - img.h) / 2, w: img.w, h: img.h });
      return;
    }
  }
  slide.addText(runs(texto, { color: cor, bold: negrito }), {
    x, y, w, h, fontSize: tamanho, valign: 'middle', margin: 0, fit: 'shrink',
  });
}

function pilulaResposta(pptx, slide, texto, { y, cor = C.verde, fundo = C.verdeClaro }) {
  const tamanho = fonte(texto, 22, [[30, 0], [60, 2], [Infinity, 4]]);
  const w = Math.min(LARGURA, 2.2 + tamanhoPlano(texto) * 0.15);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: M, y, w, h: 0.7, fill: { color: fundo }, line: { color: cor, width: 1.25 }, rectRadius: 0.12,
  });
  slide.addText([{ text: 'Resposta: ', options: { bold: true, color: cor, fontFace: F.texto } }, ...runs(texto, { bold: true, color: cor })], {
    x: M + 0.25, y, w: w - 0.4, h: 0.7, fontSize: tamanho, valign: 'middle', margin: 0, fit: 'shrink',
  });
}

// ---------- layouts por tipo ----------
function slideCapa(pptx, deck, s, entrada) {
  const slide = pptx.addSlide();
  slide.background = { color: C.azul };
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.4, y: -1.6, w: 7, h: 7, fill: { color: C.azulMedio, transparency: 55 }, line: { color: C.azul, transparency: 100 },
  });
  slide.addText('π', {
    x: 8.3, y: 0.6, w: 4.6, h: 6, fontFace: F.destaque, fontSize: 320, color: C.amarelo,
    transparency: 75, align: 'center', valign: 'middle', margin: 0,
  });
  slide.addText(`MATEMÁTICA · ${entrada.serie}º ANO DO ENSINO MÉDIO`, {
    x: 0.9, y: 1.7, w: 8, h: 0.4, fontFace: F.texto, fontSize: 14, bold: true, color: C.amarelo, charSpacing: 3, margin: 0,
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.9, y: 2.25, w: 1.4, h: 0.1, fill: { color: C.amarelo }, line: { color: C.amarelo } });
  const t = s.titulo || deck.titulo;
  slide.addText(runs(t, { bold: true, color: C.branco, fontFace: F.titulo }), {
    x: 0.9, y: 2.5, w: 8, h: 2.1, fontSize: fonte(t, 52, [[20, 0], [35, 6], [55, 12], [Infinity, 18]]),
    valign: 'top', margin: 0, fit: 'shrink',
  });
  if (s.subtitulo) {
    slide.addText(runs(s.subtitulo, { color: 'D6E4F0' }), {
      x: 0.9, y: 4.7, w: 8, h: 0.9, fontSize: 22, valign: 'top', margin: 0, fit: 'shrink',
    });
  }
  slide.addText('Proff', { x: 0.9, y: H - 0.8, w: 3, h: 0.4, fontFace: F.texto, fontSize: 12, color: '9FBAD3', margin: 0 });
  if (s.notas) slide.addNotes(latexParaTexto(s.notas));
}

async function slideConteudo(pptx, s, ctx) {
  const slide = pptx.addSlide();
  moldura(pptx, slide, ctx);
  let y = titulo(pptx, slide, s.titulo);

  const topicos = s.topicos || [];
  const fim = s.formula ? H - 2.55 : H - 0.95;
  const altura = topicos.length ? Math.min(1.15, (fim - y) / topicos.length) : 0;
  const tamanho = Math.min(...topicos.map((t) => fonte(t, topicos.length <= 3 ? 30 : 26)), 30);

  for (const t of topicos) {
    slide.addShape(pptx.ShapeType.rect, {
      x: M + 0.05, y: y + altura / 2 - 0.07, w: 0.14, h: 0.14, fill: { color: C.laranja }, line: { color: C.laranja },
    });
    await linha(slide, t, { x: M + 0.4, y, w: LARGURA - 0.4, h: altura, tamanho });
    y += altura;
  }
  if (s.formula) await caixaFormula(pptx, slide, s.formula, { y: H - 2.4, h: 1.55 });
  if (s.notas) slide.addNotes(latexParaTexto(s.notas));
}

async function slideExemplo(pptx, s, ctx) {
  const slide = pptx.addSlide();
  moldura(pptx, slide, ctx);
  etiqueta(pptx, slide, 'Exemplo resolvido', C.laranja);
  let y = titulo(pptx, slide, s.titulo, { comEtiqueta: true });

  if (s.enunciado) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: M, y, w: LARGURA, h: 0.9, fill: { color: C.azulClaro }, line: { color: C.azulClaro }, rectRadius: 0.1,
    });
    slide.addText(runs(s.enunciado, { bold: true, color: C.texto }), {
      x: M + 0.3, y, w: LARGURA - 0.6, h: 0.9, fontSize: fonte(s.enunciado, 22), valign: 'middle', margin: 0, fit: 'shrink',
    });
    y += 1.1;
  }

  const passos = s.passos || [];
  const fim = s.resposta ? H - 1.6 : H - 0.95;
  const altura = passos.length ? Math.min(0.85, (fim - y) / passos.length) : 0;
  const tamanho = Math.min(...passos.map((p) => fonte(p, 22)), 22);

  passos.forEach((_, i) => {
    const cy = y + i * altura + altura / 2;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: M, y: cy - 0.21, w: 0.42, h: 0.42, fill: { color: C.azul }, line: { color: C.azul },
    });
    slide.addText(String(i + 1), {
      x: M, y: cy - 0.21, w: 0.42, h: 0.42, fontFace: F.texto, fontSize: 14, bold: true, color: C.branco,
      align: 'center', valign: 'middle', margin: 0,
    });
    if (i < passos.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: M + 0.21, y: cy + 0.21, w: 0, h: altura - 0.42, line: { color: C.borda, width: 1.5 },
      });
    }
  });
  for (const [i, p] of passos.entries()) {
    await linha(slide, p, { x: M + 0.65, y: y + i * altura, w: LARGURA - 0.65, h: altura, tamanho });
  }

  if (s.resposta) pilulaResposta(pptx, slide, s.resposta, { y: H - 1.5 });
  if (s.notas) slide.addNotes(latexParaTexto(s.notas));
}

/** Exercício vira dois slides: o enunciado e, em seguida, o mesmo com a resposta. */
async function slidesExercicio(pptx, s, ctx, comResposta) {
  const slide = pptx.addSlide();
  moldura(pptx, slide, ctx);
  etiqueta(pptx, slide, comResposta ? 'Exercício · resposta' : 'Exercício', C.verde);
  const y = titulo(pptx, slide, s.titulo, { comEtiqueta: true });

  const h = comResposta ? 2.9 : 3.4;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: M, y, w: LARGURA, h, fill: { color: C.branco }, line: { color: C.borda, width: 1.25 }, rectRadius: 0.12,
  });
  slide.addShape(pptx.ShapeType.rect, { x: M, y: y + 0.25, w: 0.08, h: h - 0.5, fill: { color: C.verde }, line: { color: C.verde } });
  await linha(slide, s.enunciado || '', {
    x: M + 0.45, y: y + 0.2, w: LARGURA - 0.9, h: h - 0.4, tamanho: fonte(s.enunciado, 30, [[60, 0], [100, 4], [160, 8], [Infinity, 12]]),
  });

  if (comResposta && s.resposta) {
    pilulaResposta(pptx, slide, s.resposta, { y: y + h + 0.3 });
  } else if (!comResposta) {
    slide.addText('Resolva no caderno. A resposta está no próximo slide.', {
      x: M, y: y + h + 0.25, w: LARGURA, h: 0.4, fontFace: F.texto, fontSize: 14, italic: true, color: C.suave, margin: 0,
    });
  }
  if (s.notas) slide.addNotes(latexParaTexto(s.notas));
}

async function slideResumo(pptx, s, ctx) {
  const slide = pptx.addSlide();
  moldura(pptx, slide, { ...ctx, fundo: C.fundoResumo });
  etiqueta(pptx, slide, 'Resumo', C.azul);
  const y = titulo(pptx, slide, s.titulo, { comEtiqueta: true });

  const topicos = s.topicos || [];
  const colunas = topicos.length > 3 ? 2 : 1;
  const linhas = Math.ceil(topicos.length / colunas);
  const gap = 0.25;
  const wCartao = (LARGURA - gap * (colunas - 1)) / colunas;
  const hCartao = Math.min(1.15, (H - 1.0 - y - gap * (linhas - 1)) / Math.max(linhas, 1));
  const tamanho = Math.min(...topicos.map((t) => fonte(t, colunas === 2 ? 20 : 24)), 24);

  for (const [i, t] of topicos.entries()) {
    const x = M + (i % colunas) * (wCartao + gap);
    const yy = y + Math.floor(i / colunas) * (hCartao + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: yy, w: wCartao, h: hCartao, fill: { color: C.branco }, line: { color: C.borda, width: 1 }, rectRadius: 0.1,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.25, y: yy + hCartao / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: C.verde }, line: { color: C.verde },
    });
    slide.addText('✓', {
      x: x + 0.25, y: yy + hCartao / 2 - 0.22, w: 0.44, h: 0.44, fontFace: F.texto, fontSize: 16, bold: true,
      color: C.branco, align: 'center', valign: 'middle', margin: 0,
    });
    await linha(slide, t, { x: x + 0.9, y: yy, w: wCartao - 1.1, h: hCartao, tamanho });
  }
  if (s.notas) slide.addNotes(latexParaTexto(s.notas));
}

// ---------- exportação ----------
export async function exportarPptx(deck, entrada) {
  if (!window.PptxGenJS) throw new Error('biblioteca pptxgenjs não carregou (verifique a internet).');
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.titulo;
  pptx.subject = `Matemática · ${entrada.serie}º ano · ${entrada.assunto}`;
  pptx.company = 'Proff';
  pptx.theme = { headFontFace: F.titulo, bodyFontFace: F.texto };

  const slides = deck.slides || [];
  const total = slides.reduce((n, s) => n + (s.tipo === 'exercicio' ? 2 : 1), 0);
  let indice = 0;
  const ctx = () => ({ indice: ++indice, total, entrada });

  for (const s of slides) {
    switch (s.tipo) {
      case 'capa':
        indice++;
        slideCapa(pptx, deck, s, entrada);
        break;
      case 'exemplo':
        await slideExemplo(pptx, s, ctx());
        break;
      case 'exercicio':
        await slidesExercicio(pptx, s, ctx(), false);
        await slidesExercicio(pptx, s, ctx(), true);
        break;
      case 'resumo':
        await slideResumo(pptx, s, ctx());
        break;
      default:
        await slideConteudo(pptx, s, ctx());
    }
  }

  const nome = `Proff - ${entrada.assunto} - ${entrada.serie}º ano`.replace(/[\\/:*?"<>|]/g, '');
  await pptx.writeFile({ fileName: `${nome}.pptx` });
}
