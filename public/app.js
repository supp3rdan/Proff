import { ASSUNTOS } from './assuntos.js';
import { el, anexar, montarSlide, renderizarMatematica } from './slides-render.js';
import { exportarPptx } from './pptx.js';
import { criarClienteLLM, PROVEDORES } from './core/llm.js';
import { gerarPlano, gerarSlides, gerarProva, validarEntrada } from './core/gerador.js';

const CHAVE_ULTIMA = 'proff:ultima';
const CHAVE_SENHA = 'proff:senha';
const CHAVE_CONFIG = 'proff:config';
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

// ---------- modo de execução ----------
// "servidor": há backend (server.js ou Vercel) com as chaves no ambiente.
// "navegador": site estático (GitHub Pages); as chaves ficam no localStorage
// deste navegador e a IA é chamada direto daqui.
let modo = 'navegador';

async function verificarStatus() {
  try {
    const r = await fetch('api/status', { cache: 'no-store' });
    const s = await r.json();
    if (s?.proff !== true) throw new Error('sem servidor');
    modo = 'servidor';
    atualizarStatus(s.provedores);
    if (s.pedeSenha) {
      $('#campo-senha').hidden = false;
      $('#senha').value = armazenamento.ler(CHAVE_SENHA) || '';
    }
  } catch {
    modo = 'navegador';
    montarConfigChaves();
  }
}

function atualizarStatus(provedores) {
  const alvo = $('#status-provedores');
  alvo.textContent = provedores.length ? `IA: ${provedores.join(' → ')}` : 'Nenhuma chave de API configurada';
  alvo.classList.toggle('status-alerta', provedores.length === 0);
}

function lerConfigNavegador() {
  return { chaves: {}, demo: false, ...(armazenamento.ler(CHAVE_CONFIG) || {}) };
}

function montarConfigChaves() {
  const config = lerConfigNavegador();
  const painel = $('#config-chaves');
  painel.hidden = false;

  $('#campos-chaves').replaceChildren(
    ...PROVEDORES.map((p) =>
      el('div', { classe: 'campo' }, [
        el('label', { for: `chave-${p.nome}` }, [
          document.createTextNode(`${p.rotulo} `),
          el('a', { href: p.ondeCriarChave, target: '_blank', rel: 'noopener', texto: 'criar chave' }),
        ]),
        el('input', {
          id: `chave-${p.nome}`, type: 'password', autocomplete: 'off', spellcheck: 'false',
          placeholder: 'cole a chave aqui', value: config.chaves[p.nome] || '',
        }),
      ])
    )
  );
  $('#modo-demo').checked = config.demo;

  const salvar = () => {
    const nova = { chaves: {}, demo: $('#modo-demo').checked };
    for (const p of PROVEDORES) {
      const v = $(`#chave-${p.nome}`).value.trim();
      if (v) nova.chaves[p.nome] = v;
    }
    armazenamento.gravar(CHAVE_CONFIG, nova);
    resumirConfig(nova);
  };
  painel.addEventListener('input', salvar);
  painel.addEventListener('change', salvar);

  resumirConfig(config);
  if (!config.demo && Object.keys(config.chaves).length === 0) painel.open = true;
}

function resumirConfig(config) {
  const nomes = PROVEDORES.filter((p) => config.chaves[p.nome]).map((p) => p.nome);
  const provedores = config.demo ? ['demonstração'] : nomes;
  $('#resumo-chaves').textContent = provedores.length ? `(${provedores.join(', ')})` : '(nenhuma configurada)';
  atualizarStatus(provedores);
}

$('#serie').addEventListener('change', preencherAssuntos);
preencherAssuntos();
const statusPronto = verificarStatus();

// ---------- geração ----------
async function executar(tipo, extra = {}) {
  return modo === 'servidor' ? chamarAPI(tipo, extra) : gerarNoNavegador(tipo, extra);
}

async function chamarAPI(tipo, extra) {
  const senha = $('#senha').value;
  const resposta = await fetch('api/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(senha ? { 'x-proff-senha': senha } : {}) },
    body: JSON.stringify({ tipo, ...estado.entrada, ...extra }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
  return dados;
}

async function gerarNoNavegador(tipo, extra) {
  const config = lerConfigNavegador();
  if (!config.demo && Object.keys(config.chaves).length === 0) {
    $('#config-chaves').open = true;
    throw new Error('Cole pelo menos uma chave de API em "Chaves de API" ou marque o modo demonstração.');
  }
  const llm = criarClienteLLM({ chaves: config.chaves, simulado: config.demo });
  const entrada = validarEntrada(estado.entrada);
  if (tipo === 'plano') return gerarPlano(llm, entrada);
  if (tipo === 'slides') return gerarSlides(llm, entrada, extra.plano);
  return gerarProva(llm, entrada, extra.plano);
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
  await statusPronto;

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
    const { plano, provedor } = await executar('plano');
    estado.plano = plano;
    marcarEtapa('plano', 'pronto', provedor);
    mostrarResultado();

    marcarEtapa('slides', 'gerando');
    marcarEtapa('prova', 'gerando');
    const [rSlides, rProva] = await Promise.allSettled([
      executar('slides', { plano }),
      executar('prova', { plano }),
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
