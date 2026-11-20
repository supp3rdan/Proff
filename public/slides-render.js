// Monta cada slide (JSON vindo da API) como uma <section> do Reveal.js.
// Usado tanto na pré-visualização quanto na apresentação.
// Todo texto entra via textContent (nunca innerHTML) para evitar HTML injetado.

export function el(tag, atributos = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v == null || v === false) continue;
    if (k === 'texto') no.textContent = v;
    else if (k === 'classe') no.className = v;
    else no.setAttribute(k, v);
  }
  for (const f of [].concat(filhos)) if (f) no.append(f);
  return no;
}

const lista = (itens, ordenada, fragmentos) =>
  el(
    ordenada ? 'ol' : 'ul',
    {},
    (itens || []).map((t) => el('li', { texto: t, classe: fragmentos ? 'fragment' : null }))
  );

// append() de nós DOM escreve "null" se receber null; aqui filtramos.
export function anexar(no, ...filhos) {
  no.append(...filhos.filter(Boolean));
  return no;
}

export function montarSlide(slide, { fragmentos = true } = {}) {
  const sec = el('section', { classe: `slide slide-${slide.tipo || 'conteudo'}` });
  const frag = fragmentos ? 'fragment' : null;

  switch (slide.tipo) {
    case 'capa':
      anexar(sec, el('h1', { texto: slide.titulo }), el('p', { classe: 'subtitulo', texto: slide.subtitulo }));
      break;

    case 'exemplo':
      anexar(sec, 
        el('span', { classe: 'etiqueta', texto: 'Exemplo resolvido' }),
        el('h2', { texto: slide.titulo }),
        el('p', { classe: 'enunciado', texto: slide.enunciado }),
        lista(slide.passos, true, fragmentos),
        slide.resposta ? el('p', { classe: `resposta ${frag || ''}`, texto: `Resposta: ${slide.resposta}` }) : null
      );
      break;

    case 'exercicio':
      anexar(sec, 
        el('span', { classe: 'etiqueta etiqueta-exercicio', texto: 'Exercício' }),
        el('h2', { texto: slide.titulo }),
        el('p', { classe: 'enunciado', texto: slide.enunciado }),
        slide.resposta ? el('p', { classe: `resposta ${frag || ''}`, texto: `Resposta: ${slide.resposta}` }) : null
      );
      break;

    default: // conteudo e resumo
      anexar(sec, 
        slide.tipo === 'resumo' ? el('span', { classe: 'etiqueta', texto: 'Resumo' }) : null,
        el('h2', { texto: slide.titulo }),
        lista(slide.topicos, false, fragmentos),
        slide.formula ? el('div', { classe: 'formula', texto: `$$${slide.formula}$$` }) : null
      );
  }

  if (slide.notas) anexar(sec, el('aside', { classe: 'notes', texto: slide.notas }));
  return sec;
}

// "R$" (real) usa o mesmo cifrão das fórmulas. Trocamos por um marcador
// antes do KaTeX e devolvemos o cifrão depois, para não virar fórmula.
const MARCADOR = '';

function trocarNosTextos(raiz, de, para) {
  const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const nos = [];
  while (andador.nextNode()) nos.push(andador.currentNode);
  for (const no of nos) {
    const novo = no.nodeValue.replace(de, para);
    if (novo !== no.nodeValue) no.nodeValue = novo;
  }
}

export function renderizarMatematica(raiz) {
  if (!window.renderMathInElement) return;
  trocarNosTextos(raiz, /R\$/g, `R${MARCADOR}`);
  window.renderMathInElement(raiz, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });
  trocarNosTextos(raiz, new RegExp(MARCADOR, 'g'), '$');
}
