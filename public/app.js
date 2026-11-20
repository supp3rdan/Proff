import { ASSUNTOS } from './assuntos.js';
import { el, anexar, montarSlide, renderizarMatematica } from './slides-render.js';
import { exportarPptx } from './pptx.js';

const CHAVE_ULTIMA = 'proff:ultima';
const CHAVE_SENHA = 'proff:senha';
const $ = (sel) => document.querySelector(sel);

const estado = { entrada: null, plano: null, slides: null, prova: null, verificacao: null };

// ---------- armazenamento local (pode falhar em modo privado) ----------
const armazenamento = {
  ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
  },
};

// ---------- inicialização ----------
function preencherAssuntos() {
  const serie = $('#serie').value;
  $('#lista-assuntos').replaceChildren(...ASSUNTOS[serie].map((a) => el('option', { value: a })));
}

async function verificarStatus() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    const alvo = $('#status-provedores');
    alvo.textContent = s.provedores.length
      ? `IA: ${s.provedores.join(' → ')}`
      : 'Nenhuma chave de API configurada';
    alvo.classList.toggle('status-alerta', s.provedores.length === 0);
    if (s.pedeSenha) {
      $('#campo-senha').hidden = false;
      $('#senha').value = armazenamento.ler(CHAVE_SENHA) || '';
    }
  } catch {
    $('#status-provedores').textContent = 'Servidor indisponível';
  }
}

$('#serie').addEventListener('change', preencherAssuntos);
preencherAssuntos();
verificarStatus();

// ---------- chamadas à API ----------
async function chamarAPI(tipo, extra = {}) {
  const senha = $('#senha').value;
  const resposta = await fetch('/api/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(senha ? { 'x-proff-senha': senha } : {}) },
    body: JSON.stringify({ tipo, ...estado.entrada, ...extra }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
  return dados;
}

function marcarEtapa(etapa, situacao, mensagem = '') {
  const item = document.querySelector(`#progresso [data-etapa="${etapa}"]`);
  item.dataset.situacao = situacao;
  item.title = mensagem;
  item.querySelector('.detalhe')?.remove();
  if (mensagem) item.append(el('span', { classe: 'detalhe', texto: ` — ${mensagem}` }));
}

$('#form').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const botao = $('#botao-gerar');
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  $('#erro-geral').hidden = true;
  $('#resultado').hidden = true;
  $('#progresso').hidden = false;
  ['plano', 'slides', 'prova'].forEach((e) => marcarEtapa(e, 'aguardando'));
  if ($('#senha').value) armazenamento.gravar(CHAVE_SENHA, $('#senha').value);

  Object.assign(estado, {
    entrada: {
      serie: $('#serie').value,
      assunto: $('#assunto').value.trim(),
      observacoes: $('#observacoes').value.trim(),
    },
    plano: null, slides: null, prova: null, verificacao: null,
  });

  try {
    marcarEtapa('plano', 'gerando');
    const { plano, provedor } = await chamarAPI('plano');
    estado.plano = plano;
    marcarEtapa('plano', 'pronto', provedor);
    mostrarResultado();

    marcarEtapa('slides', 'gerando');
    marcarEtapa('prova', 'gerando');
    const [rSlides, rProva] = await Promise.allSettled([
      chamarAPI('slides', { plano }),
      chamarAPI('prova', { plano }),
    ]);

    if (rSlides.status === 'fulfilled') {
      estado.slides = rSlides.value.slides;
      marcarEtapa('slides', 'pronto', rSlides.value.provedor);
    } else {
      marcarEtapa('slides', 'erro', rSlides.reason.message);
    }

    if (rProva.status === 'fulfilled') {
      estado.prova = rProva.value.prova;
      estado.verificacao = rProva.value.verificacao;
      marcarEtapa('prova', 'pronto', rProva.value.provedor);
    } else {
      marcarEtapa('prova', 'erro', rProva.reason.message);
    }

    armazenamento.gravar(CHAVE_ULTIMA, estado);
    mostrarResultado();
  } catch (erro) {
    marcarEtapa('plano', 'erro', erro.message);
    $('#erro-geral').textContent = erro.message;
    $('#erro-geral').hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Gerar aula e prova';
  }
});

// ---------- abas ----------
document.querySelectorAll('.aba').forEach((aba) =>
  aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((a) => a.classList.toggle('ativa', a === aba));
    document.querySelectorAll('.painel').forEach((p) => (p.hidden = p.dataset.painel !== aba.dataset.aba));
  })
);

// ---------- impressão ----------
document.querySelectorAll('[data-imprimir]').forEach((botao) =>
  botao.addEventListener('click', () => {
    document.body.dataset.imprimir = botao.dataset.imprimir;
    window.print();
  })
);
window.addEventListener('afterprint', () => delete document.body.dataset.imprimir);

// ---------- renderização ----------
function substituir(alvo, ...itens) {
  alvo.replaceChildren();
  anexar(alvo, ...itens);
}
function mostrarResultado() {
  $('#resultado').hidden = false;
  renderizarPlano();
  renderizarSlides();
  renderizarProva();
  renderizarGabarito();
  renderizarMatematica($('#resultado'));
}

const secao = (titulo, conteudo) => (conteudo ? [el('h3', { texto: titulo }), conteudo] : []);
const listaSimples = (itens, ordenada = false) =>
  itens?.length ? el(ordenada ? 'ol' : 'ul', {}, itens.map((t) => el('li', { texto: t }))) : null;
const paragrafo = (t) => (t ? el('p', { texto: t }) : null);

function cabecalhoDocumento(titulo) {
  const { serie, assunto } = estado.entrada;
  return [el('h2', { texto: titulo }), el('p', { classe: 'meta', texto: `${serie}º ano · ${assunto}` })];
}

function renderizarPlano() {
  const p = estado.plano;
  const alvo = $('#conteudo-plano');
  if (!p) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: 'Gerando…' }));

  const habilidades = p.habilidades_bncc?.length
    ? el('ul', {}, p.habilidades_bncc.map((h) =>
        el('li', {}, [el('strong', { texto: h.codigo }), document.createTextNode(` ${h.descricao}`)])))
    : null;

  const etapas = p.etapas?.length
    ? el('table', { classe: 'tabela' }, [
        el('thead', {}, el('tr', {}, ['Etapa', 'Tempo', 'Como fazer'].map((t) => el('th', { texto: t })))),
        el('tbody', {}, p.etapas.map((e) =>
          el('tr', {}, [el('td', { texto: e.nome }), el('td', { texto: e.duracao }), el('td', { texto: e.descricao })]))),
      ])
    : null;

  substituir(alvo,
    ...cabecalhoDocumento(p.titulo),
    el('p', { classe: 'meta', texto: `Duração: ${p.duracao || '—'}` }),
    ...secao('Habilidades da BNCC', habilidades),
    habilidades ? el('p', { classe: 'dica', texto: 'Confira os códigos da BNCC antes de usar no planejamento oficial.' }) : null,
    ...secao('Objetivos', listaSimples(p.objetivos)),
    ...secao('Conhecimentos prévios', listaSimples(p.conhecimentos_previos)),
    ...secao('Recursos', listaSimples(p.recursos)),
    ...secao('Desenvolvimento', etapas),
    ...secao('Avaliação', paragrafo(p.avaliacao)),
    ...secao('Tarefa de casa', paragrafo(p.tarefa_casa)),
    ...secao('Adaptações', paragrafo(p.adaptacoes))
  );
}

function renderizarSlides() {
  const alvo = $('#conteudo-slides');
  const prontos = Boolean(estado.slides?.slides?.length);
  $('#botao-apresentar').disabled = !prontos;
  $('#botao-pptx').disabled = !prontos;
  if (!prontos) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: estado.plano ? 'Slides não gerados.' : 'Gerando…' }));

  substituir(alvo,
    ...estado.slides.slides.map((s, i) => {
      const sec = montarSlide(s, { fragmentos: false });
      const notas = sec.querySelector('.notes');
      notas?.remove();
      return el('figure', { classe: 'miniatura' }, [
        el('div', { classe: 'miniatura-slide' }, [...sec.childNodes]),
        el('figcaption', {}, [el('strong', { texto: `${i + 1}. ` }), document.createTextNode(s.notas || '')]),
      ]);
    })
  );
}

function renderizarProva() {
  const prova = estado.prova;
  const alvo = $('#conteudo-prova');
  if (!prova) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: estado.plano ? 'Prova não gerada.' : 'Gerando…' }));

  substituir(alvo,
    ...cabecalhoDocumento(prova.titulo),
    el('div', { classe: 'linha-aluno' }, [el('span', { texto: 'Nome: ' }), el('span', { texto: 'Data:' })]),
    paragrafo(prova.instrucoes),
    el('ol', { classe: 'questoes' }, prova.questoes.map((q) =>
      el('li', { classe: 'questao' }, [
        el('p', { texto: q.enunciado }),
        q.alternativas.length
          ? el('ol', { classe: 'alternativas', type: 'A' }, q.alternativas.map((a) => el('li', { texto: a })))
          : el('div', { classe: 'espaco-resposta' }),
      ])))
  );
}

function renderizarGabarito() {
  const prova = estado.prova;
  const alvo = $('#conteudo-gabarito');
  const aviso = $('#aviso-verificacao');
  aviso.replaceChildren();
  if (!prova) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: estado.plano ? 'Prova não gerada.' : 'Gerando…' }));

  const v = estado.verificacao;
  if (v?.concluida && v.revisar.length === 0) {
    aviso.append(el('p', { classe: 'aviso aviso-ok', texto: `Gabarito conferido por uma segunda resolução (${v.provedor}). Todas as respostas bateram.` }));
  } else if (v?.concluida) {
    aviso.append(el('p', { classe: 'aviso aviso-atencao', texto: `Revise ${v.revisar.length === 1 ? 'a questão' : 'as questões'} ${v.revisar.join(', ')}: a segunda resolução (${v.provedor}) chegou a outra resposta.` }));
  } else {
    aviso.append(el('p', { classe: 'aviso aviso-atencao', texto: 'Não foi possível conferir o gabarito automaticamente. Revise todas as respostas.' }));
  }

  substituir(alvo,
    ...cabecalhoDocumento(`Gabarito: ${prova.titulo}`),
    el('ol', { classe: 'questoes' }, prova.questoes.map((q) => {
      const revisar = q.verificacao && q.verificacao.confere !== true;
      return el('li', { classe: `questao ${revisar ? 'questao-revisar' : ''}` }, [
        el('p', { classe: 'meta', texto: `${q.tipo === 'multipla' ? 'Múltipla escolha' : 'Discursiva'} · ${q.nivel || ''}` }),
        el('p', { texto: q.enunciado }),
        el('p', { classe: 'resposta', texto: `Resposta: ${q.resposta}` }),
        revisar && q.verificacao.resposta_verificador
          ? el('p', { classe: 'divergencia', texto: `Segunda resolução encontrou: ${q.verificacao.resposta_verificador}` })
          : null,
        listaSimples(q.resolucao, true),
      ]);
    }))
  );
}

// ---------- slides ----------
$('#botao-apresentar').addEventListener('click', () => {
  armazenamento.gravar(CHAVE_ULTIMA, estado);
  window.open('slides.html', '_blank');
});

$('#botao-pptx').addEventListener('click', async () => {
  try {
    await exportarPptx(estado.slides, estado.entrada);
  } catch (erro) {
    alert(`Não foi possível gerar o .pptx: ${erro.message}`);
  }
});

// ---------- restaura a última geração (fica no fim: usa funções e constantes acima) ----------
const anterior = armazenamento.ler(CHAVE_ULTIMA);
if (anterior?.plano) {
  Object.assign(estado, anterior);
  $('#serie').value = anterior.entrada.serie;
  preencherAssuntos();
  $('#assunto').value = anterior.entrada.assunto;
  $('#observacoes').value = anterior.entrada.observacoes || '';
  mostrarResultado();
}
