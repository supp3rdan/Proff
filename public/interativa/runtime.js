// Runtime da aula interativa do Proff.
// Lê os dados (JSON embutido na página) e monta tudo com textContent: nenhum texto
// vira HTML. Os gráficos são desenhados aqui; a IA só escolheu tipo e parâmetros.
// Depende de compilarExpressao (core/expressao.js), embutido antes deste arquivo.
(function () {
  'use strict';

  const DADOS = JSON.parse(document.getElementById('proff-dados').textContent);
  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  // ---------- utilidades ----------
  function el(tag, atributos = {}, filhos = []) {
    const no = document.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) {
      if (v == null || v === false) continue;
      if (k === 'texto') no.textContent = v;
      else if (k === 'classe') no.className = v;
      else if (k.startsWith('on')) no.addEventListener(k.slice(2), v);
      else no.setAttribute(k, v);
    }
    for (const f of [].concat(filhos)) if (f) no.append(f);
    return no;
  }
  const fmt = (n, casas = 2) =>
    Number.isFinite(n) ? Number(n.toFixed(casas)).toLocaleString('pt-BR', { maximumFractionDigits: casas }) : '—';
  const embaralhar = (lista) => {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function lerArmazenado(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
  }

  // Fórmulas com KaTeX (CDN). Sem internet, mostra o texto sem os cifrões.
  const MARCADOR = '';
  function trocarTextos(raiz, de, para) {
    const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nos = [];
    while (andador.nextNode()) nos.push(andador.currentNode);
    for (const no of nos) {
      const novo = no.nodeValue.replace(de, para);
      if (novo !== no.nodeValue) no.nodeValue = novo;
    }
  }
  function matematica(raiz) {
    trocarTextos(raiz, /R\$/g, 'R' + MARCADOR);
    if (typeof delimitarLatex === 'function') {
      // fórmula escrita sem $...$ pela IA passa a ser desenhada também
      const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && n.parentElement.closest('script, style, textarea, input, .katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nos = [];
      while (andador.nextNode()) nos.push(andador.currentNode);
      nos.forEach((no) => { const novo = delimitarLatex(no.nodeValue); if (novo !== no.nodeValue) no.nodeValue = novo; });
    }
    if (window.renderMathInElement) {
      window.renderMathInElement(raiz, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
      });
    } else {
      trocarTextos(raiz, /\$\$?([^$]+)\$\$?/g, '$1');
    }
    trocarTextos(raiz, new RegExp(MARCADOR, 'g'), '$');
  }

  // ---------- progresso ("Entendi!") ----------
  const CHAVE = 'proff-aula:' + DADOS.meta.titulo + ':' + DADOS.meta.gerado_em;
  const feitas = new Set(lerArmazenado(CHAVE, []));
  const totalPartes = DADOS.secoes.length + (temJogos() ? 1 : 0);

  function atualizarMedidor() {
    const n = [...feitas].length;
    $('.medidor-barra span').style.width = (100 * n) / totalPartes + '%';
    $('.medidor small').textContent = n === totalPartes
      ? '🏆 Você concluiu a aula inteira!'
      : `Você concluiu ${n} de ${totalPartes} partes`;
    document.querySelectorAll('.sumario a').forEach((a) => a.classList.toggle('feito', feitas.has(a.dataset.alvo)));
  }
  function marcarFeito(id) {
    feitas.add(id);
    gravar(CHAVE, [...feitas]);
    atualizarMedidor();
  }
  function botaoEntendi(id) {
    const botao = el('button', { classe: 'botao botao-pequeno' + (feitas.has(id) ? ' feito' : ''), texto: feitas.has(id) ? '✅ Entendi!' : 'Entendi esta parte 👍' });
    botao.addEventListener('click', () => {
      marcarFeito(id);
      botao.classList.add('feito');
      botao.textContent = '✅ Entendi!';
    });
    return el('div', { classe: 'entendi' }, botao);
  }

  // ---------- capa, sumário e introdução ----------
  function montarCapa() {
    const palavras = JSON.stringify(DADOS.secoes).split(/\s+/).length;
    const minutos = Math.max(5, Math.round(palavras / 180));
    return el('header', { classe: 'capa' }, el('div', { classe: 'capa-conteudo' }, [
      el('span', { classe: 'selo', texto: 'Aula de Matemática · ' + DADOS.meta.serie }),
      el('h1', { texto: DADOS.meta.titulo }),
      DADOS.resumo ? el('p', { classe: 'resumo', texto: DADOS.resumo }) : null,
      el('div', { classe: 'chips' }, [
        el('span', { classe: 'chip', texto: '📚 ' + DADOS.meta.assunto }),
        el('span', { classe: 'chip', texto: `⏱ cerca de ${minutos} min de leitura` }),
        DADOS.jogos.quiz.length || DADOS.jogos.desafios.length ? el('span', { classe: 'chip', texto: '🎮 com jogos' }) : null,
        DADOS.visualizacoes.length ? el('span', { classe: 'chip', texto: '📊 gráficos interativos' }) : null,
      ]),
      el('div', { classe: 'medidor' }, [el('div', { classe: 'medidor-barra' }, el('span')), el('small')]),
    ]));
  }

  function montarSumario() {
    const itens = [
      ...DADOS.secoes.map((s) => ({ id: 'parte-' + s.id, alvo: s.id, texto: `${s.icone} ${s.artigo.titulo || s.rotulo}` })),
      ...(temJogos() ? [{ id: 'jogos', alvo: 'jogos', texto: '🎮 Teste seus conhecimentos' }] : []),
      { id: 'conclusao', alvo: 'conclusao', texto: '🏁 Conclusão' },
    ];
    return el('nav', { classe: 'sumario', 'aria-label': 'Sumário' }, [
      el('h2', { texto: 'Nesta aula' }),
      el('ol', {}, itens.map((i) => el('li', {}, el('a', { href: '#' + i.id, 'data-alvo': i.alvo, texto: i.texto })))),
    ]);
  }

  function montarAprender() {
    if (!DADOS.objetivos.length) return null;
    return el('section', { classe: 'cartao aprender' }, [
      el('h2', { texto: 'Nesta aula você vai aprender' }),
      el('ul', {}, DADOS.objetivos.map((o) => el('li', { texto: o }))),
      DADOS.prerequisitos.length
        ? el('p', { classe: 'previos', texto: '📌 É bom já saber: ' + DADOS.prerequisitos.join(' · ') })
        : null,
    ]);
  }

  // ---------- partes da aula ----------
  function montarSecao(s) {
    const a = s.artigo;
    const corpo = [
      el('div', { classe: 'secao-cabecalho' }, [
        el('div', { classe: 'secao-icone', texto: s.icone }),
        el('div', {}, [el('small', { texto: `Parte ${s.numero} · ${s.rotulo}` }), el('h2', { texto: a.titulo || s.rotulo })]),
      ]),
      ...a.paragrafos.map((p) => el('p', { texto: p })),
      ...a.formulas.map((f) => el('div', { classe: 'formula' }, [el('div', { texto: '$$' + f.latex + '$$' }), f.explicacao ? el('p', { texto: f.explicacao }) : null])),
      ...DADOS.visualizacoes.filter((v) => v.secao === s.id).map(montarVisualizacao),
      ...a.caixas.map((c) => el('div', { classe: 'caixa caixa-' + c.tipo }, [c.titulo ? el('strong', { texto: c.titulo }) : null, el('span', { texto: c.texto })])),
      ...a.exemplos.map(montarExemplo),
      ...a.exercicios.map(montarExercicio),
      botaoEntendi(s.id),
    ];
    return el('section', { classe: 'cartao secao', id: 'parte-' + s.id, 'data-alvo': s.id }, corpo);
  }

  function montarExemplo(e, i) {
    const lista = el('ol', { classe: 'passos' });
    const resposta = el('div');
    let mostrados = 0;
    const botao = el('button', { classe: 'botao botao-pequeno botao-cheio', texto: e.passos.length ? 'Mostrar o 1º passo ▶' : 'Ver resposta' });
    const tudo = el('button', { classe: 'botao botao-pequeno', texto: 'Mostrar tudo' });
    function avancar() {
      if (mostrados < e.passos.length) {
        const li = el('li', { texto: e.passos[mostrados++] });
        lista.append(li);
        matematica(li);
      }
      if (mostrados >= e.passos.length) {
        if (e.resposta && !resposta.childNodes.length) {
          resposta.append(el('span', { classe: 'resposta', texto: '✔ Resposta: ' + e.resposta }));
          matematica(resposta);
        }
        botao.remove();
        tudo.remove();
      } else {
        botao.textContent = `Próximo passo (${mostrados + 1}/${e.passos.length}) ▶`;
      }
    }
    botao.addEventListener('click', avancar);
    tudo.addEventListener('click', () => { while (botao.isConnected) avancar(); });
    return el('div', { classe: 'exemplo' }, [
      el('span', { classe: 'exemplo-rotulo', texto: `Exemplo resolvido ${i + 1}` }),
      el('p', { classe: 'enunciado', texto: e.enunciado }),
      lista, resposta,
      el('div', { classe: 'acoes' }, [botao, e.passos.length > 1 ? tudo : null]),
    ]);
  }

  function montarExercicio(e, i) {
    const area = el('div');
    const mostrar = (titulo, conteudo, classe) => {
      area.replaceChildren(el('div', { classe: 'revelar ' + (classe || '') }, [el('strong', { texto: titulo + ' ' }), el('span', { texto: conteudo })]));
      matematica(area);
    };
    return el('div', { classe: 'exercicio' }, [
      el('span', { classe: 'exemplo-rotulo', texto: `✏️ Exercício ${i + 1}` }),
      el('p', { classe: 'enunciado', texto: e.enunciado }),
      el('div', { classe: 'acoes' }, [
        e.dica ? el('button', { classe: 'botao botao-pequeno', texto: '💡 Dica', onclick: () => mostrar('Dica:', e.dica) }) : null,
        e.resposta ? el('button', { classe: 'botao botao-pequeno botao-cheio', texto: 'Ver resposta', onclick: () => mostrar('Resposta:', e.resposta) }) : null,
      ]),
      area,
    ]);
  }

  // ---------- visualizações ----------
  function controle({ rotulo, min, max, passo, valor, aoMudar, formato = (v) => fmt(v) }) {
    const saida = el('output', { texto: formato(valor) });
    const entrada = el('input', { type: 'range', min, max, step: passo, value: valor, 'aria-label': rotulo });
    entrada.addEventListener('input', () => {
      saida.textContent = formato(Number(entrada.value));
      aoMudar(Number(entrada.value));
    });
    return el('div', { classe: 'controle' }, [el('label', {}, [el('span', { texto: rotulo }), saida]), entrada]);
  }

  /** Canvas nítido em qualquer tela; devolve contexto e medidas lógicas. */
  function criarCanvas(largura = 640, altura = 380) {
    const canvas = el('canvas', { width: largura * 2, height: altura * 2, role: 'img' });
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    return { canvas, ctx, largura, altura };
  }

  function montarVisualizacao(v) {
    const caixa = el('div', { classe: 'visual' }, [el('h3', { texto: v.titulo }), v.explicacao ? el('p', { texto: v.explicacao }) : null]);
    const construir = VISUAIS[v.tipo];
    if (construir) {
      try { construir(caixa, v.params); } catch (erro) { caixa.append(el('p', { texto: 'Não foi possível desenhar este gráfico.' })); }
    }
    return caixa;
  }

  function eixos(ctx, L, A, xMin, xMax, yMin, yMax) {
    const X = (x) => ((x - xMin) / (xMax - xMin)) * L;
    const Y = (y) => A - ((y - yMin) / (yMax - yMin)) * A;
    ctx.clearRect(0, 0, L, A);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, L, A);
    const passo = (faixa) => {
      const bruto = faixa / 10;
      const p = Math.pow(10, Math.floor(Math.log10(bruto)));
      return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= bruto) || p * 10;
    };
    const px = passo(xMax - xMin);
    const py = passo(yMax - yMin);
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#5b6876';
    for (let x = Math.ceil(xMin / px) * px; x <= xMax; x += px) {
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? '#1d2733' : '#eef2f6';
      ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), A); ctx.stroke();
      if (Math.abs(x) > 1e-9) ctx.fillText(fmt(x, 2), X(x) + 3, Math.min(A - 4, Math.max(12, Y(0) + 13)));
    }
    for (let y = Math.ceil(yMin / py) * py; y <= yMax; y += py) {
      ctx.strokeStyle = Math.abs(y) < 1e-9 ? '#1d2733' : '#eef2f6';
      ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(L, Y(y)); ctx.stroke();
      if (Math.abs(y) > 1e-9) ctx.fillText(fmt(y, 2), Math.min(L - 30, Math.max(3, X(0) + 4)), Y(y) - 3);
    }
    return { X, Y };
  }

  const VISUAIS = {
    funcao(caixa, p) {
      const expr = compilarExpressao(p.expressao);
      const valores = Object.fromEntries(p.parametros.map((q) => [q.nome, q.valor]));
      const { canvas, ctx, largura: L, altura: A } = criarCanvas();
      const leitura = el('div', { classe: 'leitura-valor' });
      let cursor = null;

      function limitesY() {
        let min = Infinity, max = -Infinity;
        for (let i = 0; i <= 200; i++) {
          const y = expr.avaliar({ ...valores, x: p.x_min + ((p.x_max - p.x_min) * i) / 200 });
          if (Number.isFinite(y)) { min = Math.min(min, y); max = Math.max(max, y); }
        }
        if (!Number.isFinite(min)) return [-10, 10];
        min = Math.max(min, -1000); max = Math.min(max, 1000);
        if (max - min < 1) { min -= 1; max += 1; }
        const folga = (max - min) * 0.12;
        return [Math.min(min - folga, 0 - folga * 0.2), Math.max(max + folga, folga * 0.2)];
      }

      function desenhar() {
        const [yMin, yMax] = limitesY();
        const { X, Y } = eixos(ctx, L, A, p.x_min, p.x_max, yMin, yMax);
        ctx.strokeStyle = '#e07a1f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        let caneta = false;
        const raizes = [];
        let anterior = null;
        for (let i = 0; i <= 600; i++) {
          const x = p.x_min + ((p.x_max - p.x_min) * i) / 600;
          const y = expr.avaliar({ ...valores, x });
          if (!Number.isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) { caneta = false; anterior = null; continue; }
          if (caneta) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
          caneta = true;
          if (anterior && Math.sign(anterior.y) !== Math.sign(y) && raizes.length < 4) {
            raizes.push(anterior.x - (anterior.y * (x - anterior.x)) / (y - anterior.y));
          }
          anterior = { x, y };
        }
        ctx.stroke();

        // rótulo com fundo branco; "lado" evita sobrepor a raiz e o ponto no eixo y
        const ponto = (x, y, cor, texto, lado = 'direita-cima') => {
          ctx.fillStyle = cor;
          ctx.beginPath(); ctx.arc(X(x), Y(y), 5, 0, Math.PI * 2); ctx.fill();
          ctx.font = 'bold 12px system-ui, sans-serif';
          const w = ctx.measureText(texto).width + 8;
          let tx = lado.startsWith('esquerda') ? X(x) - w - 6 : X(x) + 8;
          let ty = lado.endsWith('baixo') ? Y(y) + 22 : Y(y) - 10;
          tx = Math.min(L - w - 2, Math.max(2, tx));
          ty = Math.min(A - 4, Math.max(14, ty));
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.fillRect(tx - 2, ty - 12, w, 16);
          ctx.fillStyle = cor;
          ctx.fillText(texto, tx + 2, ty);
        };
        raizes.forEach((r) => ponto(r, 0, '#2e7d4f', `raiz ≈ ${fmt(r)}`, r < 0 ? 'esquerda-baixo' : 'direita-baixo'));
        const y0 = expr.avaliar({ ...valores, x: 0 });
        if (p.x_min <= 0 && p.x_max >= 0 && Number.isFinite(y0)) ponto(0, y0, '#1f4e79', `(0; ${fmt(y0)})`, raizes.some((r) => r < 0) ? 'direita-cima' : 'esquerda-cima');
        if (cursor !== null) {
          const yc = expr.avaliar({ ...valores, x: cursor });
          if (Number.isFinite(yc)) ponto(cursor, yc, '#6c4ab6', `(${fmt(cursor)}; ${fmt(yc)})`);
        }

        const params = p.parametros.map((q) => `${q.nome} = ${fmt(valores[q.nome])}`).join(', ');
        leitura.replaceChildren(
          el('b', { texto: 'f(x) = ' + p.expressao.replace(/\*/g, '·') }),
          document.createTextNode(params ? '  com  ' + params : ''),
          el('br'),
          document.createTextNode('Toque ou passe o mouse no gráfico para ver os pontos.')
        );
      }

      function mover(evento) {
        const r = canvas.getBoundingClientRect();
        cursor = p.x_min + ((evento.clientX - r.left) / r.width) * (p.x_max - p.x_min);
        desenhar();
      }
      canvas.addEventListener('pointermove', mover);
      canvas.addEventListener('pointerdown', mover);
      canvas.addEventListener('pointerleave', () => { cursor = null; desenhar(); });

      caixa.append(canvas, leitura, el('div', { classe: 'controles' }, p.parametros.map((q) =>
        controle({ rotulo: q.rotulo, min: q.min, max: q.max, passo: q.passo, valor: q.valor, aoMudar: (v) => { valores[q.nome] = v; desenhar(); } }))));
      desenhar();
    },

    barras(caixa, p) {
      barrasSVG(caixa, p.rotulos, p.valores, p.unidade);
    },

    sequencia(caixa, p) {
      const estado = { primeiro: p.primeiro, razao: p.razao };
      const area = el('div');
      const leitura = el('div', { classe: 'leitura-valor' });
      function desenhar() {
        const termos = Array.from({ length: p.termos }, (_, i) =>
          p.tipo === 'PA' ? estado.primeiro + i * estado.razao : estado.primeiro * Math.pow(estado.razao, i));
        area.replaceChildren();
        barrasSVG(area, termos.map((_, i) => `a${i + 1}`), termos, '');
        const soma = termos.reduce((s, t) => s + t, 0);
        leitura.replaceChildren(
          el('b', { texto: p.tipo === 'PA' ? `aₙ = a₁ + (n − 1)·r` : `aₙ = a₁ · qⁿ⁻¹` }),
          document.createTextNode(`   Termos: ${termos.map((t) => fmt(t)).join(' ; ')}   ·   Soma: ${fmt(soma)}`)
        );
      }
      caixa.append(area, leitura, el('div', { classe: 'controles' }, [
        controle({ rotulo: 'Primeiro termo (a₁)', min: -20, max: 20, passo: 1, valor: estado.primeiro, aoMudar: (v) => { estado.primeiro = v; desenhar(); } }),
        controle({
          rotulo: p.tipo === 'PA' ? 'Razão (r)' : 'Razão (q)', min: p.tipo === 'PA' ? -10 : -3, max: p.tipo === 'PA' ? 10 : 3,
          passo: p.tipo === 'PA' ? 1 : 0.5, valor: estado.razao, aoMudar: (v) => { estado.razao = v; desenhar(); },
        }),
      ]));
      desenhar();
    },

    triangulo(caixa, p) {
      const { canvas, ctx, largura: L, altura: A } = criarCanvas(640, 360);
      const leitura = el('div', { classe: 'leitura-valor' });
      let angulo = p.angulo;
      function desenhar() {
        ctx.clearRect(0, 0, L, A);
        const rad = (angulo * Math.PI) / 180;
        const hip = 10;
        const adj = hip * Math.cos(rad);
        const op = hip * Math.sin(rad);
        const escala = Math.min((L - 120) / adj, (A - 70) / op, 40);
        const ox = 60, oy = A - 35;
        const B = [ox + adj * escala, oy];
        const C = [ox + adj * escala, oy - op * escala];
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(255, 209, 102, .25)';
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(...B); ctx.lineTo(...C); ctx.closePath(); ctx.fill();
        const lado = (a, b, cor) => { ctx.strokeStyle = cor; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
        lado([ox, oy], B, '#1f4e79');
        lado(B, C, '#2e7d4f');
        lado([ox, oy], C, '#e07a1f');
        ctx.strokeStyle = '#1d2733'; ctx.lineWidth = 1.5;
        ctx.strokeRect(B[0] - 14, B[1] - 14, 14, 14);
        ctx.beginPath(); ctx.arc(ox, oy, 34, -rad, 0); ctx.stroke();
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = '#1d2733'; ctx.fillText(`${fmt(angulo, 0)}°`, ox + 40, oy - 8);
        ctx.fillStyle = '#1f4e79'; ctx.fillText(`adjacente = ${fmt(adj)}`, ox + (adj * escala) / 2 - 50, oy + 22);
        ctx.fillStyle = '#2e7d4f'; ctx.fillText(`oposto = ${fmt(op)}`, Math.min(L - 115, B[0] + 8), oy - (op * escala) / 2);
        ctx.fillStyle = '#e07a1f'; ctx.fillText(`hipotenusa = ${hip}`, ox + (adj * escala) / 2 - 90, oy - (op * escala) / 2 - 8);
        leitura.replaceChildren(
          el('b', { texto: 'sen = oposto ÷ hipotenusa' }), document.createTextNode(` = ${fmt(Math.sin(rad), 3)}   ·   `),
          el('b', { texto: 'cos = adjacente ÷ hipotenusa' }), document.createTextNode(` = ${fmt(Math.cos(rad), 3)}   ·   `),
          el('b', { texto: 'tg = oposto ÷ adjacente' }), document.createTextNode(` = ${fmt(Math.tan(rad), 3)}`)
        );
      }
      caixa.append(canvas, leitura, el('div', { classe: 'controles' }, [
        controle({ rotulo: 'Ângulo', min: 5, max: 85, passo: 1, valor: angulo, formato: (v) => fmt(v, 0) + '°', aoMudar: (v) => { angulo = v; desenhar(); } }),
      ]));
      desenhar();
    },

    probabilidade(caixa, p) {
      const faces = p.experimento === 'moeda' ? ['Cara', 'Coroa']
        : p.experimento === 'dado' ? ['1', '2', '3', '4', '5', '6']
          : Array.from({ length: 11 }, (_, i) => String(i + 2));
      const teorica = p.experimento === 'dois_dados'
        ? faces.map((f) => (6 - Math.abs(7 - Number(f))) / 36)
        : faces.map(() => 1 / faces.length);
      const contagem = faces.map(() => 0);
      let total = 0;
      const ultimo = el('div', { classe: 'leitura-valor', texto: 'Clique em lançar para começar!' });
      const area = el('div');
      const DADO = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      function lancar(n) {
        let texto = '';
        for (let i = 0; i < n; i++) {
          let k;
          if (p.experimento === 'dois_dados') {
            const d1 = Math.floor(Math.random() * 6), d2 = Math.floor(Math.random() * 6);
            k = d1 + d2; texto = `${DADO[d1]} ${DADO[d2]} soma ${k + 2}`;
          } else {
            k = Math.floor(Math.random() * faces.length);
            texto = p.experimento === 'moeda' ? `🪙 ${faces[k]}` : `🎲 ${DADO[k]} (${faces[k]})`;
          }
          contagem[k]++; total++;
        }
        ultimo.textContent = `Último: ${texto}   ·   Total de lançamentos: ${total}`;
        desenhar();
      }
      function desenhar() {
        area.replaceChildren();
        const freq = contagem.map((c) => (total ? (100 * c) / total : 0));
        barrasSVG(area, faces, freq, '%', teorica.map((t) => 100 * t));
      }
      caixa.append(area, ultimo, el('div', { classe: 'acoes' }, [
        el('button', { classe: 'botao botao-cheio botao-pequeno', texto: 'Lançar 1', onclick: () => lancar(1) }),
        el('button', { classe: 'botao botao-pequeno', texto: 'Lançar 10', onclick: () => lancar(10) }),
        el('button', { classe: 'botao botao-pequeno', texto: 'Lançar 100', onclick: () => lancar(100) }),
        el('button', { classe: 'botao botao-pequeno', texto: 'Zerar', onclick: () => { contagem.fill(0); total = 0; ultimo.textContent = 'Clique em lançar para começar!'; desenhar(); } }),
      ]), el('p', { classe: 'previos', texto: 'A linha tracejada mostra a probabilidade teórica. Quanto mais lançamentos, mais perto dela as barras ficam.' }));
      desenhar();
    },

    geometria(caixa, p) {
      const medidas = { retangulo: { base: 8, altura: 5 }, quadrado: { lado: 6 }, triangulo: { base: 8, altura: 5 }, circulo: { raio: 4 } }[p.figura];
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 640 340');
      const leitura = el('div', { classe: 'leitura-valor' });
      const forma = (tag, atr) => { const n = document.createElementNS(NS, tag); for (const k in atr) n.setAttribute(k, atr[k]); svg.append(n); return n; };
      function desenhar() {
        svg.replaceChildren();
        const esc = 26, cx = 320, cy = 175;
        const estilo = { fill: 'rgba(255,209,102,.35)', stroke: '#e07a1f', 'stroke-width': 3 };
        let area, perimetro, fArea, fPer;
        if (p.figura === 'circulo') {
          forma('circle', { cx, cy, r: medidas.raio * esc, ...estilo });
          forma('line', { x1: cx, y1: cy, x2: cx + medidas.raio * esc, y2: cy, stroke: '#1f4e79', 'stroke-width': 2 });
          area = Math.PI * medidas.raio ** 2; perimetro = 2 * Math.PI * medidas.raio;
          fArea = `A = π · r² = π · ${fmt(medidas.raio)}²`; fPer = `C = 2 · π · r`;
        } else {
          const b = (medidas.base ?? medidas.lado) * esc, h = (medidas.altura ?? medidas.lado) * esc;
          const x0 = cx - b / 2, y0 = cy + h / 2;
          if (p.figura === 'triangulo') {
            forma('polygon', { points: `${x0},${y0} ${x0 + b},${y0} ${cx},${y0 - h}`, ...estilo });
            forma('line', { x1: cx, y1: y0, x2: cx, y2: y0 - h, stroke: '#1f4e79', 'stroke-width': 2, 'stroke-dasharray': '6 5' });
            const lado = Math.hypot(medidas.base / 2, medidas.altura);
            area = (medidas.base * medidas.altura) / 2; perimetro = medidas.base + 2 * lado;
            fArea = `A = (b · h) ÷ 2 = (${fmt(medidas.base)} · ${fmt(medidas.altura)}) ÷ 2`; fPer = 'P = soma dos lados (triângulo isósceles)';
          } else {
            forma('rect', { x: x0, y: y0 - h, width: b, height: h, ...estilo });
            const bb = medidas.base ?? medidas.lado, hh = medidas.altura ?? medidas.lado;
            area = bb * hh; perimetro = 2 * (bb + hh);
            fArea = p.figura === 'quadrado' ? `A = l² = ${fmt(bb)}²` : `A = b · h = ${fmt(bb)} · ${fmt(hh)}`;
            fPer = p.figura === 'quadrado' ? 'P = 4 · l' : 'P = 2 · (b + h)';
          }
        }
        leitura.replaceChildren(el('b', { texto: fArea }), document.createTextNode(` = ${fmt(area)}   ·   `),
          el('b', { texto: fPer }), document.createTextNode(` = ${fmt(perimetro)}`));
      }
      const rotulos = { base: 'Base (b)', altura: 'Altura (h)', lado: 'Lado (l)', raio: 'Raio (r)' };
      caixa.append(svg, leitura, el('div', { classe: 'controles' }, Object.keys(medidas).map((k) =>
        controle({ rotulo: rotulos[k], min: 1, max: k === 'raio' ? 6 : k === 'altura' ? 10 : 18, passo: 0.5, valor: medidas[k], aoMudar: (v) => { medidas[k] = v; desenhar(); } }))));
      desenhar();
    },
  };

  /** Gráfico de barras em SVG (também usado por sequência e probabilidade). */
  function barrasSVG(caixa, rotulos, valores, unidade, referencia) {
    const NS = 'http://www.w3.org/2000/svg';
    const L = 640, A = 300, m = { e: 50, d: 16, t: 24, b: 40 };
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    const todos = [...valores, ...(referencia || []), 0];
    const max = Math.max(...todos), min = Math.min(...todos);
    const faixa = max - min || 1;
    const Y = (v) => m.t + ((max - v) / faixa) * (A - m.t - m.b);
    const larg = (L - m.e - m.d) / valores.length;
    const novo = (tag, atr, texto) => { const n = document.createElementNS(NS, tag); for (const k in atr) n.setAttribute(k, atr[k]); if (texto != null) n.textContent = texto; svg.append(n); return n; };
    novo('line', { x1: m.e, x2: L - m.d, y1: Y(0), y2: Y(0), stroke: '#1d2733' });
    const cores = ['#1f4e79', '#e07a1f', '#2e7d4f', '#6c4ab6', '#2b6299', '#c0392b'];
    valores.forEach((v, i) => {
      const x = m.e + i * larg + larg * 0.15, w = larg * 0.7;
      const y = Math.min(Y(v), Y(0)), h = Math.abs(Y(v) - Y(0));
      const r = novo('rect', { x, y: Y(0), width: w, height: 0, rx: 6, fill: cores[i % cores.length] });
      requestAnimationFrame(() => { r.style.transition = 'all .6s ease'; r.setAttribute('y', y); r.setAttribute('height', Math.max(h, 1)); });
      novo('text', { x: x + w / 2, y: v >= 0 ? y - 6 : y + h + 14, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#1d2733' }, fmt(v, 1) + (unidade === '%' ? '%' : ''));
      novo('text', { x: x + w / 2, y: A - m.b + 18, 'text-anchor': 'middle', 'font-size': 12, fill: '#5b6876' }, rotulos[i]);
      if (referencia) {
        novo('line', { x1: x - 4, x2: x + w + 4, y1: Y(referencia[i]), y2: Y(referencia[i]), stroke: '#b3261e', 'stroke-width': 2, 'stroke-dasharray': '5 4' });
      }
    });
    if (unidade && unidade !== '%') novo('text', { x: 6, y: 16, 'font-size': 12, fill: '#5b6876' }, unidade);
    caixa.append(svg);
  }

  // ---------- jogos ----------
  function temJogos() {
    const j = DADOS.jogos;
    return j.quiz.length || j.verdadeiro_falso.length || j.pares.length || j.desafios.length;
  }

  const placar = { pontos: 0, max: 0, jogosFeitos: 0, totalJogos: 0, erros: [] };
  function atualizarPlacar() {
    const pct = placar.max ? placar.pontos / placar.max : 0;
    const estrelas = '⭐'.repeat(Math.round(pct * 5)) + '☆'.repeat(5 - Math.round(pct * 5));
    $('.jogos-placar .pontos').textContent = `${placar.pontos} de ${placar.max} pontos`;
    $('.jogos-placar .estrelas').textContent = estrelas;
    if (placar.jogosFeitos === placar.totalJogos && placar.totalJogos > 0) {
      $('.jogos-placar .mensagem').textContent = pct >= 0.8 ? '🏆 Mandou muito bem!' : pct >= 0.5 ? '👏 Bom trabalho! Revise o que errou.' : '💪 Releia a aula e tente de novo!';
      marcarFeito('jogos');
      if (pct >= 0.8) festa();
      if (DADOS.envio) mostrarEnvio();
    }
  }
  /** item: identificador do que foi respondido (ex.: "quiz:2"), para o professor ver o que a turma mais errou */
  function pontuar(acertou, item) {
    placar.pontos += acertou ? 1 : 0;
    if (!acertou && item) placar.erros.push(item);
    atualizarPlacar();
  }

  // ---------- envio do resultado ao professor (só quando a aula foi aberta pelo link) ----------
  function mostrarEnvio() {
    const area = $('.envio-resultado');
    if (!area || area.dataset.mostrado) return;
    area.dataset.mostrado = '1';
    const chaveEnvio = CHAVE + ':enviado';
    if (lerArmazenado(chaveEnvio, false)) {
      area.replaceChildren(el('p', { classe: 'feedback ok', texto: '✅ Seu resultado já foi enviado ao professor.' }));
      return;
    }
    const apelido = el('input', { type: 'text', maxlength: 40, placeholder: 'seu nome ou apelido', 'aria-label': 'Seu nome ou apelido', autocomplete: 'nickname' });
    const enviar = el('button', { classe: 'botao botao-cheio botao-pequeno', type: 'submit', texto: 'Enviar ao professor' });
    const aviso = el('div');
    const form = el('form', {}, [apelido, enviar]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!apelido.value.trim()) return apelido.focus();
      enviar.disabled = true;
      try {
        const r = await fetch(DADOS.envio.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apelido: apelido.value.trim(), acertos: placar.pontos, total: placar.max, erros: placar.erros }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'falha no envio');
        gravar(chaveEnvio, true);
        area.replaceChildren(el('p', { classe: 'feedback ok', texto: '✅ Resultado enviado! Seu professor vai ver como foi a turma.' }));
      } catch (erro) {
        enviar.disabled = false;
        aviso.replaceChildren(el('p', { classe: 'feedback nao', texto: `Não foi possível enviar (${erro.message}). Tente de novo.` }));
      }
    });
    area.replaceChildren(el('h3', { texto: '📨 Envie seu resultado ao professor' }), el('p', { texto: 'Só o seu apelido e a sua pontuação são enviados.' }), form, aviso);
  }
  function jogoConcluido() {
    placar.jogosFeitos++;
    atualizarPlacar();
  }
  function festa() {
    const camada = el('div', { classe: 'festa' });
    for (let i = 0; i < 40; i++) {
      const s = el('span', { texto: ['🎉', '⭐', '✨', '🏆', 'π'][i % 5] });
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDelay = Math.random() * 0.8 + 's';
      camada.append(s);
    }
    document.body.append(camada);
    setTimeout(() => camada.remove(), 3500);
  }

  function jogoQuiz(lista) {
    let i = 0;
    const area = el('div');
    function mostrar() {
      const q = lista[i];
      const feedback = el('div');
      const botoes = q.alternativas.map((a, k) => el('button', { classe: 'alternativa', texto: `${'ABCDE'[k]}) ${a}` }));
      botoes.forEach((b, k) => b.addEventListener('click', () => {
        botoes.forEach((x) => (x.disabled = true));
        const acertou = k === q.correta;
        b.classList.add(acertou ? 'certa' : 'errada');
        botoes[q.correta].classList.add('certa');
        pontuar(acertou, `quiz:${i}`);
        feedback.replaceChildren(el('div', { classe: 'feedback ' + (acertou ? 'ok' : 'nao') }, [
          el('strong', { texto: acertou ? '✅ Acertou! ' : '❌ Quase! ' }), el('span', { texto: q.explicacao || '' }),
        ]), el('div', { classe: 'acoes' }, el('button', {
          classe: 'botao botao-cheio botao-pequeno',
          texto: i < lista.length - 1 ? 'Próxima pergunta ▶' : 'Concluir quiz',
          onclick: () => { if (i < lista.length - 1) { i++; mostrar(); } else { area.replaceChildren(el('p', { texto: '✔ Quiz concluído!' })); jogoConcluido(); } },
        })));
        matematica(feedback);
      }));
      area.replaceChildren(el('p', { classe: 'contador', texto: `Pergunta ${i + 1} de ${lista.length}` }), el('p', { classe: 'enunciado', texto: q.pergunta }), el('div', { classe: 'alternativas' }, botoes), feedback);
      matematica(area);
    }
    mostrar();
    return area;
  }

  function jogoVF(lista) {
    let respondidas = 0;
    return el('div', {}, lista.map((v, indice) => {
      const linha = el('div', { classe: 'vf' });
      const responder = (resposta) => {
        linha.querySelectorAll('button').forEach((b) => (b.disabled = true));
        const acertou = resposta === v.verdadeiro;
        pontuar(acertou, `vf:${indice}`);
        const fb = el('div', { classe: 'feedback ' + (acertou ? 'ok' : 'nao') }, [
          el('strong', { texto: (acertou ? '✅ ' : '❌ ') + (v.verdadeiro ? 'Verdadeiro. ' : 'Falso. ') }), el('span', { texto: v.explicacao || '' }),
        ]);
        linha.append(fb);
        matematica(fb);
        if (++respondidas === lista.length) jogoConcluido();
      };
      linha.append(el('span', { classe: 'afirmacao', texto: v.afirmacao }), el('span', { classe: 'acoes' }, [
        el('button', { classe: 'botao botao-pequeno', texto: '👍 Verdadeiro', onclick: () => responder(true) }),
        el('button', { classe: 'botao botao-pequeno', texto: '👎 Falso', onclick: () => responder(false) }),
      ]));
      return linha;
    }));
  }

  function jogoPares(lista) {
    let selecionado = null;
    let feitos = 0;
    let errosNoPar = 0;
    const esquerda = lista.map((p, i) => el('button', { classe: 'par', 'data-i': i, texto: p.termo }));
    const direita = embaralhar(lista.map((p, i) => el('button', { classe: 'par', 'data-i': i, texto: p.significado })));
    esquerda.forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('feito')) return;
      esquerda.forEach((x) => x.classList.remove('selecionado'));
      b.classList.add('selecionado');
      selecionado = b;
    }));
    direita.forEach((b) => b.addEventListener('click', () => {
      if (!selecionado || b.classList.contains('feito')) return;
      if (b.dataset.i === selecionado.dataset.i) {
        [b, selecionado].forEach((x) => { x.classList.remove('selecionado'); x.classList.add('feito'); x.disabled = true; });
        pontuar(errosNoPar === 0, `par:${b.dataset.i}`);
        errosNoPar = 0;
        selecionado = null;
        if (++feitos === lista.length) jogoConcluido();
      } else {
        errosNoPar++;
        b.classList.add('tremer');
        setTimeout(() => b.classList.remove('tremer'), 400);
      }
    }));
    const area = el('div', { classe: 'pares' }, [el('div', { classe: 'coluna' }, esquerda), el('div', { classe: 'coluna' }, direita)]);
    return area;
  }

  function jogoDesafios(lista) {
    let feitos = 0;
    return el('div', {}, lista.map((d, indice) => {
      const fb = el('div');
      const entrada = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'sua resposta', 'aria-label': 'Resposta' });
      let tentativas = 0;
      let encerrado = false;
      const form = el('form', {}, [entrada, el('button', { classe: 'botao botao-cheio botao-pequeno', type: 'submit', texto: 'Conferir' }),
        d.dica ? el('button', { classe: 'botao botao-pequeno', type: 'button', texto: '💡 Dica', onclick: () => { fb.replaceChildren(el('div', { classe: 'revelar', texto: d.dica })); matematica(fb); } }) : null]);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (encerrado) return;
        const valor = Number(entrada.value.replace(/\s/g, '').replace('R$', '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        if (!Number.isFinite(valor)) return;
        tentativas++;
        const acertou = Math.abs(valor - d.resposta) <= Math.max(d.tolerancia, 1e-9);
        if (acertou || tentativas >= 2) {
          encerrado = true;
          entrada.disabled = true;
          pontuar(acertou && tentativas === 1, `desafio:${indice}`);
          fb.replaceChildren(el('div', { classe: 'feedback ' + (acertou ? 'ok' : 'nao'), texto: acertou ? `✅ Isso mesmo! A resposta é ${fmt(d.resposta, 4)}.` : `❌ A resposta é ${fmt(d.resposta, 4)}.` }));
          if (++feitos === lista.length) jogoConcluido();
        } else {
          fb.replaceChildren(el('div', { classe: 'feedback nao', texto: '🤔 Ainda não. Confira a conta e tente mais uma vez!' }));
        }
      });
      return el('div', { classe: 'desafio' }, [el('p', { classe: 'enunciado', texto: d.pergunta }), form, fb]);
    }));
  }

  function montarJogos() {
    if (!temJogos()) return null;
    const j = DADOS.jogos;
    const jogos = [];
    if (j.quiz.length) { placar.max += j.quiz.length; jogos.push(['🧠 Quiz', 'Escolha a alternativa correta.', jogoQuiz(j.quiz)]); }
    if (j.verdadeiro_falso.length) { placar.max += j.verdadeiro_falso.length; jogos.push(['✅ Verdadeiro ou falso?', 'Decida se cada afirmação está certa.', jogoVF(j.verdadeiro_falso)]); }
    if (j.pares.length) { placar.max += j.pares.length; jogos.push(['🔗 Associe os pares', 'Toque em um item da esquerda e depois no correspondente da direita.', jogoPares(j.pares)]); }
    if (j.desafios.length) { placar.max += j.desafios.length; jogos.push(['🧮 Desafios de cálculo', 'Calcule e digite a resposta (você tem 2 tentativas).', jogoDesafios(j.desafios)]); }
    placar.totalJogos = jogos.length;
    return el('section', { classe: 'cartao secao', id: 'jogos', 'data-alvo': 'jogos' }, [
      el('div', { classe: 'secao-cabecalho' }, [el('div', { classe: 'secao-icone', texto: '🎮' }), el('div', {}, [el('small', { texto: 'Fixação' }), el('h2', { texto: 'Teste seus conhecimentos' })])]),
      el('div', { classe: 'jogos-placar' }, [el('span', { classe: 'estrelas' }), el('span', { classe: 'pontos' }), el('span', { classe: 'mensagem' })]),
      ...jogos.map(([titulo, ajuda, corpo]) => el('div', { classe: 'jogo' }, [el('h3', { texto: titulo }), el('p', { texto: ajuda }), corpo])),
      DADOS.envio ? el('div', { classe: 'jogo envio-resultado' }, el('p', { classe: 'previos', texto: '📨 Termine os jogos para enviar o seu resultado ao professor.' })) : null,
    ]);
  }

  function montarConclusao() {
    const c = DADOS.conclusao;
    return el('section', { classe: 'cartao secao conclusao', id: 'conclusao', 'data-alvo': 'conclusao' }, [
      el('div', { classe: 'secao-cabecalho' }, [el('div', { classe: 'secao-icone', texto: '🏁' }), el('div', {}, [el('small', { texto: 'Para fechar' }), el('h2', { texto: 'Conclusão' })])]),
      el('p', { texto: 'Recapitulando o que você aprendeu nesta aula:' }),
      c.topicos.length ? el('ul', {}, c.topicos.map((t) => el('li', { texto: t }))) : null,
      c.tarefa ? el('div', { classe: 'caixa caixa-dica' }, [el('strong', { texto: 'Para casa' }), el('span', { texto: c.tarefa })]) : null,
    ]);
  }

  // ---------- montagem ----------
  document.title = DADOS.meta.titulo + ' · Aula interativa';
  const leitura = el('div', { classe: 'leitura' }, el('span'));
  const conteudo = el('main', { classe: 'conteudo' }, [montarAprender(), ...DADOS.secoes.map(montarSecao), montarJogos(), montarConclusao()]);
  document.body.append(
    leitura,
    montarCapa(),
    el('div', { classe: 'pagina' }, [montarSumario(), conteudo]),
    el('footer', { classe: 'rodape', texto: `Aula gerada com o Proff em ${DADOS.meta.gerado_em.split('-').reverse().join('/')}. Conteúdo produzido com IA: o professor deve revisar antes de usar.` })
  );
  atualizarMedidor();
  if (temJogos()) atualizarPlacar();
  matematica(document.body);

  // barra de leitura e item ativo do sumário
  const secoes = [...document.querySelectorAll('section[data-alvo]')];
  function aoRolar() {
    const max = document.documentElement.scrollHeight - innerHeight;
    leitura.firstChild.style.width = (max > 0 ? (100 * scrollY) / max : 0) + '%';
    let atual = secoes[0];
    for (const s of secoes) if (s.getBoundingClientRect().top < 140) atual = s;
    document.querySelectorAll('.sumario a').forEach((a) => a.classList.toggle('ativo', atual && a.dataset.alvo === atual.dataset.alvo));
  }
  addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();
})();
