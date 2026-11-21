import { ASSUNTOS } from './assuntos.js?v=__VERSAO__';
import { el, anexar, montarSlide, renderizarMatematica } from './slides-render.js?v=__VERSAO__';
import { exportarPptx } from './pptx.js?v=__VERSAO__';
import { criarClienteLLM, PROVEDORES, corrigirChaves, provedorDaChave } from './core/llm.js?v=__VERSAO__';
import {
  gerarVisaoGeral, gerarPlano, gerarMaterial, formatarSlides, gerarQuestoes, conferirProva,
  montarProva, montarApresentacao, validarEntrada,
} from './core/gerador.js?v=__VERSAO__';
import { SECOES } from './core/estrutura.js?v=__VERSAO__';

const CHAVE_ULTIMA = 'proff:ultima';
const CHAVE_SENHA = 'proff:senha';
const CHAVE_CONFIG = 'proff:config';
const $ = (sel) => document.querySelector(sel);

// visao/plano: plano de aula · secoes → slides: apresentação · questoes → prova: avaliação
const estado = {
  entrada: null, visao: null, plano: null,
  secoes: {}, slides: null,
  questoes: {}, prova: null, verificacao: null,
};

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

// Chaves padrão do projeto: vêm de config.js (gerado na publicação a partir dos
// segredos do repositório). As chaves que o professor colar têm prioridade.
function chavesPadrao() {
  const chaves = window.PROFF_CONFIG?.chaves || {};
  return Object.fromEntries(PROVEDORES.filter((p) => chaves[p.nome]).map((p) => [p.nome, chaves[p.nome]]));
}

function lerConfigNavegador() {
  return { chaves: {}, demo: false, ...(armazenamento.ler(CHAVE_CONFIG) || {}) };
}

/** Chaves do professor, se ele colou alguma; senão, as chaves padrão do projeto. */
function chavesEfetivas(config) {
  const proprias = Object.keys(config.chaves).length > 0;
  const { chaves } = corrigirChaves(proprias ? config.chaves : chavesPadrao());
  return { chaves, proprias };
}

/** Aviso embaixo do campo quando a chave parece ser de outro provedor. */
function avisarChaveTrocada(campo) {
  const valor = $(`#chave-${campo}`).value.trim();
  const dono = provedorDaChave(valor);
  const aviso = $(`#aviso-chave-${campo}`);
  if (valor && dono && dono !== campo) {
    const rotulo = PROVEDORES.find((p) => p.nome === dono).rotulo;
    aviso.textContent = `Esta chave é do ${rotulo}. Ela será usada como chave do ${rotulo}.`;
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
}

function montarConfigChaves() {
  const config = lerConfigNavegador();
  const painel = $('#config-chaves');
  painel.hidden = false;

  $('#campos-chaves').replaceChildren(
    ...PROVEDORES.map((p) =>
      el('div', { classe: 'campo' }, [
        el('label', { for: `chave-${p.nome}`, texto: p.rotulo }),
        el('input', {
          id: `chave-${p.nome}`, type: 'password', autocomplete: 'off', spellcheck: 'false',
          placeholder: `começa com ${p.prefixos.join(' ou ')}`, value: config.chaves[p.nome] || '',
        }),
        el('small', { id: `aviso-chave-${p.nome}`, classe: 'aviso-chave', hidden: true }),
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
    PROVEDORES.forEach((p) => avisarChaveTrocada(p.nome));
    resumirConfig(nova);
  };
  painel.addEventListener('input', salvar);
  painel.addEventListener('change', salvar);

  $('#botao-limpar-chaves').addEventListener('click', () => {
    PROVEDORES.forEach((p) => ($(`#chave-${p.nome}`).value = ''));
    salvar();
  });

  PROVEDORES.forEach((p) => avisarChaveTrocada(p.nome));
  resumirConfig(config);
  const { chaves } = chavesEfetivas(config);
  if (!config.demo && Object.keys(chaves).length === 0) painel.open = true;
}

function resumirConfig(config) {
  const { chaves, proprias } = chavesEfetivas(config);
  const nomes = Object.keys(chaves);
  const temPadrao = Object.keys(chavesPadrao()).length > 0;

  let resumo;
  if (config.demo) resumo = '(modo demonstração)';
  else if (proprias) resumo = `(usando as suas: ${nomes.join(', ')})`;
  else if (nomes.length) resumo = `(usando as chaves padrão do Proff: ${nomes.join(', ')})`;
  else resumo = '(nenhuma configurada)';
  $('#resumo-chaves').textContent = resumo;

  $('#aviso-padrao').textContent = temPadrao
    ? 'Este Proff já vem com chaves padrão. Deixe os campos vazios para usá-las, ou cole as suas para usar a sua própria cota.'
    : 'Cole pelo menos uma chave para gerar aulas.';
  $('#botao-limpar-chaves').hidden = !proprias;

  atualizarStatus(config.demo ? ['demonstração'] : nomes.map((n) => (proprias ? n : `${n} (padrão)`)));
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
  const { chaves } = chavesEfetivas(config);
  if (!config.demo && Object.keys(chaves).length === 0) {
    $('#config-chaves').open = true;
    throw new Error('Cole pelo menos uma chave de API em "Chaves de API" ou marque o modo demonstração.');
  }
  const llm = criarClienteLLM({ chaves, simulado: config.demo });
  const e = validarEntrada(estado.entrada);
  switch (tipo) {
    case 'visao': return gerarVisaoGeral(llm, e);
    case 'plano': return gerarPlano(llm, e, extra.visao);
    case 'material': return gerarMaterial(llm, e, extra.plano, extra.visao, extra.secao);
    case 'formatar': return formatarSlides(llm, e, extra.secao, extra.material);
    case 'questoes': return gerarQuestoes(llm, e, extra.plano, extra.visao, extra.tipoQuestao);
    case 'conferir': return conferirProva(llm, extra.questoes);
    default: throw new Error(`Etapa desconhecida: ${tipo}`);
  }
}

// ---------- progresso ----------
const cronometros = {};

/** Recria a lista de etapas para a ação atual. */
function iniciarProgresso(itens) {
  Object.values(cronometros).forEach(clearInterval);
  $('#progresso').replaceChildren(...itens.map(([id, rotulo]) => el('li', { 'data-etapa': id, 'data-situacao': 'aguardando', texto: rotulo })));
  $('#progresso').hidden = false;
  $('#erro-geral').hidden = true;
  $('#progresso').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function marcarEtapa(etapa, situacao, mensagem = '') {
  const item = document.querySelector(`#progresso [data-etapa="${etapa}"]`);
  if (!item) return;
  item.dataset.situacao = situacao;
  item.title = mensagem;
  item.querySelector('.detalhe')?.remove();
  clearInterval(cronometros[etapa]);

  const detalhe = el('span', { classe: 'detalhe' });
  item.append(detalhe);
  if (situacao === 'gerando') {
    // mostrar o tempo evita parecer travado
    const inicio = Date.now();
    const rotulo = mensagem || 'gerando';
    const atualizar = () => (detalhe.textContent = ` — ${rotulo}… ${Math.round((Date.now() - inicio) / 1000)} s`);
    atualizar();
    cronometros[etapa] = setInterval(atualizar, 1000);
  } else if (mensagem) {
    detalhe.textContent = ` — ${mensagem}`;
  }
}

function mostrarErro(mensagem) {
  $('#erro-geral').textContent = mensagem;
  $('#erro-geral').hidden = false;
}

// Uma ação por vez (plano, slides ou avaliação).
let ocupado = false;
async function comBloqueio(botao, textoOcupado, acao) {
  if (ocupado) return;
  ocupado = true;
  const original = botao.textContent;
  document.querySelectorAll('.botao-gerar').forEach((b) => (b.disabled = true));
  botao.textContent = textoOcupado;
  if ($('#senha').value) armazenamento.gravar(CHAVE_SENHA, $('#senha').value);
  await statusPronto;
  try {
    await acao();
  } catch (erro) {
    mostrarErro(erro.message);
  } finally {
    ocupado = false;
    botao.textContent = original;
    document.querySelectorAll('.botao-gerar').forEach((b) => (b.disabled = false));
    armazenamento.gravar(CHAVE_ULTIMA, estado);
    mostrarResultado();
  }
}

/** Executa uma etapa marcando o progresso; devolve null se falhar. */
async function etapa(id, rotulo, tipo, extra) {
  marcarEtapa(id, 'gerando', rotulo);
  try {
    const r = await executar(tipo, extra);
    return r;
  } catch (erro) {
    marcarEtapa(id, 'erro', erro.message);
    throw erro;
  }
}

// ---------- 1. plano de aula: visão geral → plano ----------
$('#form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  comBloqueio($('#botao-gerar'), 'Gerando o plano…', async () => {
    Object.assign(estado, {
      entrada: {
        serie: $('#serie').value,
        assunto: $('#assunto').value.trim(),
        observacoes: $('#observacoes').value.trim(),
      },
      visao: null, plano: null, secoes: {}, slides: null, questoes: {}, prova: null, verificacao: null,
    });
    $('#resultado').hidden = true;
    iniciarProgresso([['visao', 'Visão geral do tema'], ['plano', 'Plano de aula']]);

    const { visao, provedor: p1 } = await etapa('visao', 'pesquisando o tema', 'visao');
    estado.visao = visao;
    marcarEtapa('visao', 'pronto', p1);

    const { plano, provedor: p2 } = await etapa('plano', 'montando o plano', 'plano', { visao });
    estado.plano = plano;
    marcarEtapa('plano', 'pronto', p2);
    abrirAba('plano');
  });
});

// ---------- 2. slides: para cada parte, material → formatação ----------
const faltamSecoes = () => SECOES.filter((s) => !estado.secoes?.[s.id]?.length);

$('#botao-gerar-slides').addEventListener('click', () => {
  comBloqueio($('#botao-gerar-slides'), 'Gerando os slides…', async () => {
    if (faltamSecoes().length === 0) {
      estado.secoes = {}; // já estava completo: gera tudo de novo
      estado.slides = null;
    }
    const pendentes = faltamSecoes();
    iniciarProgresso(SECOES.map((s) => [s.id, `Parte ${s.numero}: ${s.titulo}`]));
    SECOES.filter((s) => !pendentes.includes(s)).forEach((s) => marcarEtapa(s.id, 'pronto', 'já gerada'));

    const falhas = [];
    for (const s of pendentes) {
      try {
        const extra = { plano: estado.plano, visao: estado.visao, secao: s.id };
        const { material } = await etapa(s.id, 'escrevendo o material', 'material', extra);
        const { slides, provedor } = await etapa(s.id, 'montando os slides', 'formatar', { secao: s.id, material });
        estado.secoes[s.id] = slides;
        armazenamento.gravar(CHAVE_ULTIMA, estado);
        marcarEtapa(s.id, 'pronto', `${slides.length} slide${slides.length > 1 ? 's' : ''} · ${provedor}`);
      } catch {
        falhas.push(s.titulo); // segue para as outras partes
      }
    }

    if (falhas.length) {
      throw new Error(`Não foi possível gerar: ${falhas.join(', ')}. Clique em "Gerar partes que faltam" para tentar de novo.`);
    }
    estado.slides = montarApresentacao(estado.plano, estado.secoes, estado.entrada);
    abrirAba('slides');
  });
});

// ---------- 3. avaliação: objetivas → discursivas → conferência ----------
const TIPOS_QUESTAO = [['multipla', 'Questões de múltipla escolha'], ['discursiva', 'Questões discursivas']];

$('#botao-gerar-prova').addEventListener('click', () => {
  comBloqueio($('#botao-gerar-prova'), 'Gerando a avaliação…', async () => {
    if (estado.prova) {
      estado.questoes = {}; // já existia: gera outra
      estado.prova = null;
      estado.verificacao = null;
    }
    iniciarProgresso([...TIPOS_QUESTAO, ['conferencia', 'Conferência do gabarito']]);

    for (const [tipo, rotulo] of TIPOS_QUESTAO) {
      if (estado.questoes[tipo]) {
        marcarEtapa(tipo, 'pronto', 'já gerada');
        continue;
      }
      const extra = { plano: estado.plano, visao: estado.visao, tipoQuestao: tipo };
      const { questoes, provedor } = await etapa(tipo, `criando ${rotulo.toLowerCase()}`, 'questoes', extra);
      estado.questoes[tipo] = questoes;
      armazenamento.gravar(CHAVE_ULTIMA, estado);
      marcarEtapa(tipo, 'pronto', `${questoes.length} · ${provedor}`);
    }

    const prova = montarProva([...estado.questoes.multipla, ...estado.questoes.discursiva], estado.plano, estado.entrada);
    const { questoes, verificacao } = await etapa('conferencia', 'resolvendo de novo para conferir', 'conferir', { questoes: prova.questoes });
    estado.prova = { ...prova, questoes };
    estado.verificacao = verificacao;
    marcarEtapa('conferencia', verificacao.concluida ? 'pronto' : 'erro', verificacao.concluida ? verificacao.provedor : 'não foi possível conferir');
    abrirAba('prova');
  });
});

// ---------- abas ----------
function abrirAba(nome) {
  document.querySelectorAll('.aba').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => (p.hidden = p.dataset.painel !== nome));
}
document.querySelectorAll('.aba').forEach((aba) => aba.addEventListener('click', () => abrirAba(aba.dataset.aba)));

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
  if (!p) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: 'Gere o plano de aula pelo formulário acima.' }));

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
  const feitas = SECOES.length - faltamSecoes().length;
  $('#botao-apresentar').hidden = !prontos;
  $('#botao-pptx').hidden = !prontos;
  $('#botao-gerar-slides').hidden = !estado.plano;
  $('#botao-gerar-slides').textContent = prontos
    ? 'Gerar slides de novo'
    : feitas > 0 ? `Gerar partes que faltam (${SECOES.length - feitas})` : 'Gerar slides';
  $('#dica-slides').hidden = !prontos;
  if (!prontos) {
    return alvo.replaceChildren(el('p', { classe: 'vazio', texto: estado.plano
      ? 'Os slides são criados a partir do plano de aula, uma parte por vez: introdução, teoria, fórmulas, aplicações e prática.'
      : 'Gere o plano de aula primeiro.' }));
  }

  substituir(alvo,
    ...estado.slides.slides.map((s, i) => {
      const sec = montarSlide(s, { fragmentos: false });
      const notas = sec.querySelector('.notes');
      notas?.remove();
      return el('figure', { classe: 'miniatura' }, [
        el('div', { classe: `miniatura-slide miniatura-${s.tipo || 'conteudo'}` }, [...sec.childNodes]),
        el('figcaption', {}, [el('strong', { texto: `${i + 1}. ` }), document.createTextNode(s.notas || '')]),
      ]);
    })
  );
}

function renderizarProva() {
  const prova = estado.prova;
  const alvo = $('#conteudo-prova');
  $('#botao-gerar-prova').hidden = !estado.plano;
  $('#botao-gerar-prova').textContent = prova
    ? 'Gerar outra avaliação'
    : Object.keys(estado.questoes || {}).length ? 'Continuar a avaliação' : 'Gerar avaliação';
  $('#botao-imprimir-prova').hidden = !prova;
  if (!prova) {
    return alvo.replaceChildren(el('p', { classe: 'vazio', texto: estado.plano
      ? 'A avaliação é criada a partir do plano de aula, com gabarito conferido automaticamente.'
      : 'Gere o plano de aula primeiro.' }));
  }

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
  $('#botao-imprimir-gabarito').hidden = !prova;
  if (!prova) return alvo.replaceChildren(el('p', { classe: 'vazio', texto: 'O gabarito aparece depois que a avaliação for gerada.' }));

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
  Object.assign(estado, { secoes: {}, questoes: {} }, anterior);
  $('#serie').value = anterior.entrada.serie;
  preencherAssuntos();
  $('#assunto').value = anterior.entrada.assunto;
  $('#observacoes').value = anterior.entrada.observacoes || '';
  mostrarResultado();
}
