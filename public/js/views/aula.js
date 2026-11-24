// Tela de uma aula: plano, slides, avaliação, gabarito, aula interativa e resultados.
// A geração roda no servidor em segundo plano; aqui só acompanhamos o progresso.

import { get, post, patch, del } from '../api.js?v=__VERSAO__';
import { acompanharTarefa } from '../sessao.js?v=__VERSAO__';
import {
  el, $, substituir, botao, aviso, janela, confirmar, perguntar, campo, seletor, NIVEIS, rotuloNivel,
  renderizarMatematica, carregando, mostrarErro,
} from '../ui.js?v=__VERSAO__';
import { montarSlide } from '../../slides-render.js?v=__VERSAO__';
import { exportarPptx } from '../../pptx.js?v=__VERSAO__';
import { SECOES } from '../../core/estrutura.js?v=__VERSAO__';
import { dadosDaPagina } from '../../core/interativa.js?v=__VERSAO__';
import { montarPaginaInterativa } from '../../interativa/montar.js?v=__VERSAO__';

const ABAS = [
  ['plano', 'Plano de aula'],
  ['slides', 'Slides'],
  ['avaliacao', 'Avaliação'],
  ['gabarito', 'Gabarito'],
  ['interativa', 'Aula interativa'],
  ['resultados', 'Resultados dos alunos'],
];
const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

export async function telaAula(alvo, aulaId, ctx) {
  const t = { aula: null, tarefas: [], avaliacoes: [], aba: ctx.aba || 'plano', paradas: [], turmas: [], html: null, versao: 'original' };
  substituir(alvo, carregando());

  async function recarregar() {
    const r = await get(`aulas/${aulaId}`);
    Object.assign(t, { aula: r.aula, tarefas: r.tarefas, avaliacoes: r.avaliacoes, html: null });
  }

  try {
    await recarregar();
    t.turmas = (await get('turmas')).turmas;
  } catch (erro) {
    return mostrarErro(alvo, erro);
  }

  const estado = () => t.aula.estado || {};
  const entrada = () => ({ serie: String(t.aula.serie), assunto: t.aula.assunto });
  const ativa = (tipo) => t.tarefas.find((x) => x.tipo === tipo && ['pendente', 'rodando'].includes(x.status));

  // ---------- estrutura da tela ----------
  const progresso = el('div', { classe: 'progresso-aula' });
  const conteudo = el('div', { classe: 'painel cartao' });
  const abas = el('nav', { classe: 'abas', role: 'tablist' });

  function desenharTudo() {
    const a = t.aula;
    substituir(alvo,
      el('div', { classe: 'cartao cabecalho-aula' }, [
        el('div', {}, [
          el('a', { href: '#/aulas', classe: 'voltar', texto: '← Minhas aulas' }),
          el('h1', { texto: a.titulo || a.assunto }),
          el('p', { classe: 'meta' }, [
            document.createTextNode(`${a.serie}º ano · ${a.assunto} · `),
            el('span', { classe: `selo-nivel nivel-${a.nivel}`, texto: rotuloNivel(a.nivel) }),
            a.origem_id ? el('span', { classe: 'meta', texto: ' · versão de outra aula' }) : null,
          ]),
        ]),
        el('div', { classe: 'controles-aula' }, [
          campo('Turma', seletorTurma()),
          campo('Bimestre', seletorBimestre()),
          el('div', { classe: 'acoes' }, [
            botao('Criar versão…', criarVersao),
            botao('Excluir', excluir, 'botao botao-perigo'),
          ]),
        ]),
      ]),
      progresso,
      abas,
      conteudo
    );
    desenharAbas();
    desenharProgresso();
    desenharAba();
  }

  function seletorTurma() {
    const s = seletor([['', 'Sem turma'], ...t.turmas.map((x) => [x.id, x.nome])], t.aula.turma_id);
    s.addEventListener('change', () => salvarCampos({ turma_id: s.value || null }));
    return s;
  }
  function seletorBimestre() {
    const s = seletor([['', '—'], ['1', '1º'], ['2', '2º'], ['3', '3º'], ['4', '4º']], t.aula.bimestre);
    s.addEventListener('change', () => salvarCampos({ bimestre: s.value || null }));
    return s;
  }
  async function salvarCampos(campos) {
    try {
      t.aula = (await patch(`aulas/${t.aula.id}`, campos)).aula;
      aviso('Salvo.');
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  function desenharAbas() {
    substituir(abas, ...ABAS.map(([id, rotulo]) => {
      const b = botao(rotulo, () => { t.aba = id; desenharAbas(); desenharAba(); }, `aba ${t.aba === id ? 'ativa' : ''}`);
      b.setAttribute('role', 'tab');
      return b;
    }));
  }

  // ---------- progresso das tarefas ----------
  function desenharProgresso() {
    const ativas = t.tarefas.filter((x) => ['pendente', 'rodando'].includes(x.status) || x._recente);
    if (!ativas.length) return substituir(progresso);
    substituir(progresso, ...ativas.map((tarefa) => el('div', { classe: 'cartao' }, [
      el('strong', { texto: { plano: 'Gerando o plano de aula', slides: 'Gerando os slides', prova: 'Gerando a avaliação', interativa: 'Gerando a aula interativa' }[tarefa.tipo] }),
      el('p', { classe: 'dica', texto: 'Pode fechar ou sair desta tela: a geração continua no servidor.' }),
      el('ol', { classe: 'progresso' }, tarefa.etapas.map((e) => el('li', { 'data-situacao': e.situacao }, [
        document.createTextNode(e.rotulo),
        e.detalhe || e.situacao === 'gerando' ? el('span', { classe: 'detalhe', texto: ` — ${e.situacao === 'gerando' ? 'gerando…' : e.detalhe}` }) : null,
      ]))),
      tarefa.status === 'erro' ? el('p', { classe: 'erro', texto: tarefa.erro || 'Algumas etapas falharam.' }) : null,
    ])));
  }

  function acompanhar(tarefa) {
    t.tarefas = [...t.tarefas.filter((x) => x.id !== tarefa.id), tarefa];
    desenharProgresso();
    const parar = acompanharTarefa(tarefa.id, async (atualizada) => {
      t.tarefas = t.tarefas.map((x) => (x.id === atualizada.id ? atualizada : x));
      desenharProgresso();
      if (['pronta', 'erro'].includes(atualizada.status)) {
        atualizada._recente = atualizada.status === 'erro';
        await recarregar().catch(() => {});
        t.tarefas = t.tarefas.map((x) => (x.id === atualizada.id ? atualizada : x));
        desenharTudo();
        aviso(atualizada.status === 'pronta' ? 'Pronto!' : 'Algumas partes falharam. Você pode tentar de novo.', atualizada.status === 'pronta' ? 'ok' : 'erro');
      }
    });
    t.paradas.push(parar);
  }

  async function gerar(tipo, novo = false) {
    if (novo && !(await confirmar('Gerar de novo substitui o conteúdo atual desta parte. Continuar?', 'Gerar de novo'))) return;
    try {
      const { tarefa } = await post(`aulas/${t.aula.id}/gerar`, { tipo, novo });
      acompanhar(tarefa);
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  // ---------- conteúdo de cada aba ----------
  function desenharAba() {
    const desenhar = { plano: abaPlano, slides: abaSlides, avaliacao: abaAvaliacao, gabarito: abaGabarito, interativa: abaInterativa, resultados: abaResultados }[t.aba];
    substituir(conteudo);
    desenhar();
    renderizarMatematica(conteudo);
  }

  const vazio = (texto) => el('p', { classe: 'vazio', texto });
  const lista = (itens, ordenada = false) => (itens?.length ? el(ordenada ? 'ol' : 'ul', {}, itens.map((x) => el('li', { texto: x }))) : null);
  const secaoDoc = (titulo, corpo) => (corpo ? [el('h3', { texto: titulo }), corpo] : []);
  const paragrafo = (x) => (x ? el('p', { texto: x }) : null);
  const cabecalhoDoc = (titulo) => [el('h2', { texto: titulo }), el('p', { classe: 'meta', texto: `${t.aula.serie}º ano · ${t.aula.assunto}` })];

  function barraAcoes(...itens) {
    return el('div', { classe: 'acoes' }, itens.filter(Boolean));
  }

  function avaliar(parte) {
    const atual = t.avaliacoes.find((a) => a.parte === parte)?.nota;
    const enviar = async (nota) => {
      const comentario = nota === -1 ? await perguntar('O que não ficou bom?', 'Conte rapidamente (opcional). Isso ajuda a melhorar as próximas aulas.', { textoOk: 'Enviar' }) : '';
      if (comentario === null) return;
      try {
        const { avaliacao } = await post(`aulas/${t.aula.id}/avaliar`, { parte, nota, comentario });
        t.avaliacoes = [...t.avaliacoes.filter((a) => a.parte !== parte), avaliacao];
        aviso('Obrigado pela avaliação!');
        desenharAba();
      } catch (erro) {
        aviso(erro.message, 'erro');
      }
    };
    return el('div', { classe: 'avaliacao-conteudo' }, [
      el('span', { texto: 'Este conteúdo ficou bom?' }),
      botao('👍', () => enviar(1), `botao-icone ${atual === 1 ? 'marcado' : ''}`),
      botao('👎', () => enviar(-1), `botao-icone ${atual === -1 ? 'marcado' : ''}`),
      el('small', { classe: 'dica', texto: 'Planos bem avaliados viram exemplo para as próximas aulas.' }),
    ]);
  }

  // ---------- plano ----------
  function abaPlano() {
    const p = estado().plano;
    if (!p) {
      conteudo.append(ativa('plano') ? vazio('O plano está sendo gerado…') : el('div', {}, [vazio('O plano ainda não foi gerado.'), botao('Gerar plano de aula', () => gerar('plano'), 'botao botao-primario')]));
      return;
    }
    const habilidades = p.habilidades_bncc?.length
      ? el('ul', {}, p.habilidades_bncc.map((h) => el('li', {}, [el('strong', { texto: h.codigo }), document.createTextNode(` ${h.descricao}`)])))
      : null;
    const etapas = p.etapas?.length
      ? el('table', { classe: 'tabela' }, [
          el('thead', {}, el('tr', {}, ['Etapa', 'Tempo', 'Como fazer'].map((x) => el('th', { texto: x })))),
          el('tbody', {}, p.etapas.map((e) => el('tr', {}, [el('td', { texto: e.nome }), el('td', { texto: e.duracao }), el('td', { texto: e.descricao })]))),
        ])
      : null;
    conteudo.append(
      barraAcoes(
        botao('✏️ Editar plano', editarPlano),
        botao('Imprimir / PDF', () => imprimir('plano')),
        ativa('plano') ? null : botao('Gerar outro plano', () => gerar('plano', true)),
      ),
      el('div', { classe: 'documento', 'data-imprimir': 'plano' }, [
        ...cabecalhoDoc(p.titulo),
        el('p', { classe: 'meta', texto: `Duração: ${p.duracao || '—'} · Nível: ${rotuloNivel(t.aula.nivel)}` }),
        ...secaoDoc('Habilidades da BNCC', habilidades),
        habilidades ? el('p', { classe: 'dica' }, [document.createTextNode('Códigos conferidos com a lista da BNCC. Texto oficial: '), el('a', { href: 'http://basenacionalcomum.mec.gov.br/', target: '_blank', rel: 'noopener', texto: 'basenacionalcomum.mec.gov.br' })]) : null,
        ...secaoDoc('Objetivos', lista(p.objetivos)),
        ...secaoDoc('Conhecimentos prévios', lista(p.conhecimentos_previos)),
        ...secaoDoc('Recursos', lista(p.recursos)),
        ...secaoDoc('Desenvolvimento', etapas),
        ...secaoDoc('Avaliação', paragrafo(p.avaliacao)),
        ...secaoDoc('Tarefa de casa', paragrafo(p.tarefa_casa)),
        ...secaoDoc('Adaptações', paragrafo(p.adaptacoes)),
      ]),
      avaliar('plano')
    );
  }

  function editarPlano() {
    const p = structuredClone(estado().plano);
    const linhas = (v) => (v || []).join('\n');
    const area = (v, rows = 3) => el('textarea', { rows }, []).valueOf();
    const c = {
      titulo: el('input', { value: p.titulo || '' }),
      duracao: el('input', { value: p.duracao || '' }),
      objetivos: area(),
      previos: area(),
      recursos: area(),
      avaliacao: area(),
      tarefa: area(2),
      adaptacoes: area(),
    };
    c.objetivos.value = linhas(p.objetivos);
    c.previos.value = linhas(p.conhecimentos_previos);
    c.recursos.value = linhas(p.recursos);
    c.avaliacao.value = p.avaliacao || '';
    c.tarefa.value = p.tarefa_casa || '';
    c.adaptacoes.value = p.adaptacoes || '';
    const etapas = (p.etapas || []).map((e) => {
      const tempo = el('input', { value: e.duracao || '' });
      const desc = el('textarea', { rows: 2 });
      desc.value = e.descricao || '';
      return { e, tempo, desc };
    });
    const j = janela('Editar plano de aula', [
      campo('Título', c.titulo), campo('Duração', c.duracao),
      campo('Objetivos (um por linha)', c.objetivos), campo('Conhecimentos prévios (um por linha)', c.previos), campo('Recursos (um por linha)', c.recursos),
      el('h3', { texto: 'Etapas' }),
      ...etapas.map(({ e, tempo, desc }) => el('fieldset', { classe: 'etapa-edicao' }, [el('legend', { texto: e.nome }), campo('Tempo', tempo), campo('Como fazer', desc)])),
      campo('Avaliação', c.avaliacao), campo('Tarefa de casa', c.tarefa), campo('Adaptações', c.adaptacoes),
    ], {
      larga: true,
      acoes: [botao('Cancelar', () => j.fechar()), botao('Salvar', async () => {
        const separar = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
        const plano = {
          ...p, titulo: c.titulo.value.trim(), duracao: c.duracao.value.trim(), objetivos: separar(c.objetivos.value),
          conhecimentos_previos: separar(c.previos.value), recursos: separar(c.recursos.value), avaliacao: c.avaliacao.value.trim(),
          tarefa_casa: c.tarefa.value.trim(), adaptacoes: c.adaptacoes.value.trim(),
          etapas: etapas.map(({ e, tempo, desc }) => ({ ...e, duracao: tempo.value.trim(), descricao: desc.value.trim() })),
        };
        try {
          t.aula = (await patch(`aulas/${t.aula.id}`, { plano })).aula;
          j.fechar();
          aviso('Plano salvo.');
          desenharTudo();
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      }, 'botao botao-primario')],
    });
  }

  // ---------- slides ----------
  function abaSlides() {
    const e = estado();
    const deck = e.slides;
    const feitas = SECOES.filter((s) => e.secoes?.[s.id]?.length).length;
    const gerando = ativa('slides');
    const textoGerar = deck ? 'Gerar slides de novo' : feitas ? `Gerar partes que faltam (${SECOES.length - feitas})` : 'Gerar slides';
    conteudo.append(barraAcoes(
      e.plano && !gerando ? botao(textoGerar, () => gerar('slides', Boolean(deck)), deck ? 'botao' : 'botao botao-primario') : null,
      deck ? botao('▶ Apresentar', apresentar, 'botao botao-primario') : null,
      deck ? botao('Baixar .pptx', () => exportarPptx(deck, entrada()).catch((erro) => aviso(erro.message, 'erro'))) : null,
    ));
    if (!deck) {
      conteudo.append(vazio(!e.plano ? 'Gere o plano de aula primeiro.' : gerando ? 'Os slides estão sendo gerados, uma parte por vez…' : 'Os slides são criados a partir do plano: introdução, teoria, fórmulas, aplicações e prática.'));
      return;
    }
    conteudo.append(
      el('p', { classe: 'dica', texto: 'Na apresentação, aperte S para as anotações do professor e F para tela cheia. Use ✏️ para editar e 🔄 para pedir outra versão de um slide.' }),
      el('div', { classe: 'grade-slides' }, deck.slides.map((s, i) => {
        const sec = montarSlide(s, { fragmentos: false });
        sec.querySelector('.notes')?.remove();
        const editavel = !['capa', 'secao'].includes(s.tipo);
        return el('figure', { classe: 'miniatura' }, [
          el('div', { classe: `miniatura-slide miniatura-${s.tipo || 'conteudo'}` }, [...sec.childNodes]),
          el('figcaption', {}, [
            el('div', { classe: 'acoes-slide' }, [
              el('strong', { texto: `${i + 1}` }),
              editavel ? botao('✏️', () => editarSlide(i), 'botao-icone') : null,
              ['conteudo', 'exemplo', 'exercicio'].includes(s.tipo) ? botao('🔄', () => refazerSlide(i), 'botao-icone') : null,
            ]),
            el('span', { texto: s.notas || '' }),
          ]),
        ]);
      })),
      avaliar('slides')
    );
  }

  function apresentar() {
    try { localStorage.setItem('proff:ultima', JSON.stringify({ slides: estado().slides })); } catch { /* sem armazenamento */ }
    window.open('slides.html', '_blank');
  }

  function editarSlide(i) {
    const deck = structuredClone(estado().slides);
    const s = deck.slides[i];
    const linhas = (v) => (v || []).join('\n');
    const campos = {};
    const add = (chave, rotulo, valor, multiline = false) => {
      const c = multiline ? el('textarea', { rows: 4 }) : el('input');
      c.value = valor || '';
      campos[chave] = c;
      return campo(rotulo, c);
    };
    const corpo = [add('titulo', 'Título', s.titulo)];
    if (['conteudo', 'resumo'].includes(s.tipo)) corpo.push(add('topicos', 'Tópicos (um por linha)', linhas(s.topicos), true));
    if (s.tipo === 'conteudo') corpo.push(add('destaque', 'Ideia-chave (opcional)', s.destaque), add('formula', 'Fórmula em LaTeX (opcional)', s.formula));
    if (['exemplo', 'exercicio'].includes(s.tipo)) corpo.push(add('enunciado', 'Enunciado', s.enunciado, true));
    if (s.tipo === 'exemplo') corpo.push(add('passos', 'Passos (um por linha)', linhas(s.passos), true));
    if (['exemplo', 'exercicio'].includes(s.tipo)) corpo.push(add('resposta', 'Resposta', s.resposta));
    corpo.push(add('notas', 'Anotações do professor', s.notas, true));
    corpo.push(el('p', { classe: 'dica', texto: 'Fórmulas no meio do texto: escreva entre cifrões, ex.: $x^2 + 1$.' }));
    const j = janela(`Editar slide ${i + 1}`, corpo, {
      larga: true,
      acoes: [botao('Cancelar', () => j.fechar()), botao('Salvar', async () => {
        const separar = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
        for (const [k, c] of Object.entries(campos)) {
          const v = c.value.trim();
          s[k] = ['topicos', 'passos'].includes(k) ? separar(v) : v || undefined;
        }
        try {
          t.aula = (await patch(`aulas/${t.aula.id}`, { slides: deck })).aula;
          j.fechar();
          aviso('Slide salvo.');
          desenharAba();
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      }, 'botao botao-primario')],
    });
  }

  async function refazerSlide(i) {
    const pedido = await perguntar(`Refazer o slide ${i + 1}`, 'O que mudar? (opcional)', { placeholder: 'Ex.: usar um exemplo com dinheiro; deixar mais simples', textoOk: 'Refazer' });
    if (pedido === null) return;
    aviso('Refazendo o slide…');
    try {
      const { slide } = await post(`aulas/${t.aula.id}/regerar-slide`, { indice: i, pedido });
      t.aula.estado.slides.slides[i] = slide;
      aviso('Slide refeito.');
      desenharAba();
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  // ---------- avaliação ----------
  const questoesDaVersao = () => {
    const e = estado();
    if (t.versao !== 'original' && e.versoes?.[t.versao]) return e.versoes[t.versao];
    return e.prova?.questoes || [];
  };

  function abaAvaliacao() {
    const e = estado();
    const prova = e.prova;
    const gerando = ativa('prova');
    const iniciada = Object.keys(e.questoes || {}).length > 0;
    conteudo.append(barraAcoes(
      e.plano && !gerando ? botao(prova ? 'Gerar outra avaliação' : iniciada ? 'Continuar a avaliação' : 'Gerar avaliação', () => gerar('prova', Boolean(prova)), prova ? 'botao' : 'botao botao-primario') : null,
      e.plano ? botao('➕ Do banco de questões', adicionarDoBanco) : null,
      prova ? botao('🔀 Versões A e B', criarVersoes) : null,
      prova ? botao('Imprimir para os alunos', () => imprimir('prova')) : null,
    ));
    if (!prova) {
      conteudo.append(vazio(!e.plano ? 'Gere o plano de aula primeiro.' : gerando ? 'A avaliação está sendo gerada…' : 'A avaliação é criada a partir do plano, com gabarito conferido automaticamente (SymPy + IA).'));
      return;
    }
    if (e.versoes) {
      const s = seletor([['original', 'Original'], ['A', 'Versão A'], ['B', 'Versão B']], t.versao);
      s.addEventListener('change', () => { t.versao = s.value; desenharAba(); });
      conteudo.append(el('div', { classe: 'linha-versao' }, [campo('Mostrar', s), el('p', { classe: 'dica', texto: 'A versão B tem as mesmas questões em outra ordem e com as alternativas embaralhadas.' })]));
    }
    const original = t.versao === 'original';
    conteudo.append(
      el('div', { classe: 'documento', 'data-imprimir': 'prova' }, [
        ...cabecalhoDoc(`${prova.titulo}${original ? '' : ` — Versão ${t.versao}`}`),
        el('div', { classe: 'linha-aluno' }, [el('span', { texto: 'Nome: ' }), el('span', { texto: 'Data:' })]),
        paragrafo(prova.instrucoes),
        el('ol', { classe: 'questoes' }, questoesDaVersao().map((q) => el('li', { classe: 'questao' }, [
          el('p', { texto: q.enunciado }),
          q.alternativas?.length ? el('ol', { classe: 'alternativas', type: 'A' }, q.alternativas.map((x) => el('li', { texto: x }))) : el('div', { classe: 'espaco-resposta' }),
          original ? el('div', { classe: 'acoes-questao' }, [botao('✏️ Editar', () => editarQuestao(q.numero), 'botao botao-pequeno'), botao('🔄 Trocar', () => trocarQuestao(q.numero), 'botao botao-pequeno')]) : null,
        ]))),
      ]),
      avaliar('prova')
    );
  }

  function editarQuestao(numero) {
    const prova = structuredClone(estado().prova);
    const q = prova.questoes.find((x) => x.numero === numero);
    const enunciado = el('textarea', { rows: 4 });
    enunciado.value = q.enunciado;
    const alternativas = el('textarea', { rows: 5 });
    alternativas.value = (q.alternativas || []).join('\n');
    const resposta = el('input', { value: q.resposta || '' });
    const resolucao = el('textarea', { rows: 4 });
    resolucao.value = (q.resolucao || []).join('\n');
    const j = janela(`Editar questão ${numero}`, [
      campo('Enunciado', enunciado),
      q.tipo === 'multipla' ? campo('Alternativas (uma por linha, de A a E)', alternativas) : null,
      campo(q.tipo === 'multipla' ? 'Resposta (letra)' : 'Resposta', resposta),
      campo('Resolução (um passo por linha)', resolucao),
    ], {
      larga: true,
      acoes: [botao('Cancelar', () => j.fechar()), botao('Salvar', async () => {
        const separar = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
        Object.assign(q, {
          enunciado: enunciado.value.trim(), resposta: resposta.value.trim(), resolucao: separar(resolucao.value),
          ...(q.tipo === 'multipla' ? { alternativas: separar(alternativas.value) } : {}),
          verificacao: { confere: true, editada: true },
        });
        try {
          t.aula = (await patch(`aulas/${t.aula.id}`, { prova })).aula;
          j.fechar();
          aviso('Questão salva.');
          desenharAba();
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      }, 'botao botao-primario')],
    });
  }

  async function trocarQuestao(numero) {
    const pedido = await perguntar(`Trocar a questão ${numero}`, 'Algum pedido? (opcional)', { placeholder: 'Ex.: mais fácil; contextualizada com esportes', textoOk: 'Trocar' });
    if (pedido === null) return;
    aviso('Criando outra questão…');
    try {
      const { questao } = await post(`aulas/${t.aula.id}/regerar-questao`, { numero, pedido });
      const lista_ = t.aula.estado.prova.questoes;
      lista_[lista_.findIndex((x) => x.numero === numero)] = questao;
      t.aula.estado.versoes = null;
      aviso('Questão trocada. Confira a resposta no gabarito.');
      desenharAba();
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  async function criarVersoes() {
    try {
      const { versoes } = await post(`aulas/${t.aula.id}/versoes`);
      t.aula.estado.versoes = versoes;
      t.versao = 'B';
      aviso('Versões A e B criadas.');
      desenharAba();
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  async function adicionarDoBanco() {
    let questoes;
    try {
      questoes = (await get(`questoes?serie=${t.aula.serie}`)).questoes.filter((q) => q.aula_id !== t.aula.id);
    } catch (erro) {
      return aviso(erro.message, 'erro');
    }
    if (!questoes.length) return aviso('Seu banco ainda não tem questões de outras aulas desta série.');
    const marcadas = new Set();
    const j = janela('Adicionar questões do banco', [
      el('p', { classe: 'dica', texto: `Questões do ${t.aula.serie}º ano das suas outras avaliações.` }),
      el('div', { classe: 'lista-banco' }, questoes.map((q) => {
        const caixa = el('input', { type: 'checkbox' });
        caixa.addEventListener('change', () => (caixa.checked ? marcadas.add(q.id) : marcadas.delete(q.id)));
        return el('label', { classe: 'item-banco' }, [caixa, el('span', {}, [el('small', { classe: 'meta', texto: `${q.assunto} · ${q.tipo === 'multipla' ? 'múltipla escolha' : 'discursiva'}${q.nivel ? ` · ${q.nivel}` : ''}` }), el('span', { texto: q.enunciado })])]);
      })),
    ], {
      larga: true,
      acoes: [botao('Cancelar', () => j.fechar()), botao('Adicionar', async () => {
        try {
          const { prova } = await post(`aulas/${t.aula.id}/questoes-do-banco`, { ids: [...marcadas] });
          t.aula.estado.prova = prova;
          t.aula.estado.versoes = null;
          j.fechar();
          aviso('Questões adicionadas.');
          desenharAba();
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      }, 'botao botao-primario')],
    });
    renderizarMatematica(j.corpo);
  }

  // ---------- gabarito ----------
  function abaGabarito() {
    const e = estado();
    const prova = e.prova;
    if (!prova) return conteudo.append(vazio('O gabarito aparece depois que a avaliação for gerada.'));
    const v = e.verificacao;
    const revisar = prova.questoes.filter((q) => q.verificacao && q.verificacao.confere !== true).map((q) => q.numero);
    const metodo = v?.metodo === 'sympy+ia' ? 'SymPy + IA' : 'IA';
    conteudo.append(
      barraAcoes(botao('Imprimir gabarito', () => imprimir('gabarito'))),
      !v?.concluida
        ? el('p', { classe: 'aviso aviso-atencao', texto: 'Não foi possível conferir o gabarito automaticamente. Revise todas as respostas.' })
        : revisar.length
          ? el('p', { classe: 'aviso aviso-atencao', texto: `Revise ${revisar.length === 1 ? 'a questão' : 'as questões'} ${revisar.join(', ')}: a conferência (${metodo}) chegou a outra resposta ou a questão é nova.` })
          : el('p', { classe: 'aviso aviso-ok', texto: `Gabarito conferido por uma segunda resolução (${metodo}). Todas as respostas bateram.` }),
      el('div', { classe: 'documento', 'data-imprimir': 'gabarito' }, [
        ...cabecalhoDoc(`Gabarito: ${prova.titulo}`),
        e.versoes ? el('table', { classe: 'tabela tabela-versoes' }, [
          el('thead', {}, el('tr', {}, ['Versão', ...e.versoes.A.map((q) => String(q.numero))].map((x) => el('th', { texto: x })))),
          el('tbody', {}, ['A', 'B'].map((r) => el('tr', {}, [el('td', { texto: r }), ...e.versoes[r].map((q) => el('td', { texto: q.tipo === 'multipla' ? q.resposta : '✎' }))]))),
        ]) : null,
        el('ol', { classe: 'questoes' }, prova.questoes.map((q) => {
          const r = q.verificacao && q.verificacao.confere !== true;
          return el('li', { classe: `questao ${r ? 'questao-revisar' : ''}` }, [
            el('p', { classe: 'meta', texto: `${q.tipo === 'multipla' ? 'Múltipla escolha' : 'Discursiva'}${q.nivel ? ` · ${q.nivel}` : ''}` }),
            el('p', { texto: q.enunciado }),
            el('p', { classe: 'resposta', texto: `Resposta: ${q.resposta}` }),
            r && q.verificacao.resposta_verificador ? el('p', { classe: 'divergencia', texto: `A conferência encontrou: ${q.verificacao.resposta_verificador}` }) : null,
            lista(q.resolucao, true),
          ]);
        })),
      ])
    );
  }

  // ---------- aula interativa ----------
  async function htmlInterativa() {
    if (!t.html) {
      const e = estado();
      t.html = await montarPaginaInterativa(dadosDaPagina({ entrada: entrada(), plano: e.plano, visao: e.visao, deck: e.slides, interativa: e.interativa }));
    }
    return t.html;
  }

  function abaInterativa() {
    const e = estado();
    const pronta = Boolean(e.interativa?.jogos) && SECOES.every((s) => e.interativa?.secoes?.[s.id]);
    const iniciada = Boolean(e.interativa && (Object.keys(e.interativa.secoes || {}).length || e.interativa.jogos));
    const gerando = ativa('interativa');
    conteudo.append(barraAcoes(
      e.slides && !gerando ? botao(pronta ? 'Gerar de novo' : iniciada ? 'Gerar partes que faltam' : 'Gerar aula interativa', () => gerar('interativa', pronta), pronta ? 'botao' : 'botao botao-primario') : null,
      pronta ? botao('Abrir em nova aba', abrirInterativa, 'botao botao-primario') : null,
      pronta ? botao('Baixar .html', baixarInterativa) : null,
    ));
    if (!pronta) {
      conteudo.append(vazio(!e.slides ? 'Gere o plano e os slides primeiro: a aula interativa é feita a partir deles.' : gerando ? 'A aula interativa está sendo gerada…' : 'Uma página com a aula em formato de artigo, gráficos que o aluno pode mexer e joguinhos para fixar o assunto.'));
      return;
    }
    conteudo.append(caixaCompartilhar(), avaliar('interativa'));
    const previa = el('iframe', { classe: 'previa-interativa', title: 'Prévia da aula interativa', sandbox: 'allow-scripts allow-popups' });
    conteudo.append(previa);
    htmlInterativa().then((h) => (previa.srcdoc = h)).catch((erro) => aviso(erro.message, 'erro'));
  }

  async function abrirInterativa() {
    const janelaNova = window.open('', '_blank');
    const url = URL.createObjectURL(new Blob([await htmlInterativa()], { type: 'text/html' }));
    if (janelaNova) janelaNova.location.href = url;
    else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function baixarInterativa() {
    const url = URL.createObjectURL(new Blob([await htmlInterativa()], { type: 'text/html' }));
    const link = el('a', { href: url, download: `Aula interativa - ${t.aula.assunto} - ${t.aula.serie}º ano.html`.replace(/[\\/:*?"<>|]/g, '') });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function caixaCompartilhar() {
    const a = t.aula;
    const link = a.slug ? `${location.origin}/a/${a.slug}` : '';
    const alternarPublica = el('input', { type: 'checkbox', checked: a.publica ? 'checked' : null });
    const alternarComunidade = el('input', { type: 'checkbox', checked: a.comunidade ? 'checked' : null });
    const publicar = async (campos) => {
      try {
        t.aula = (await post(`aulas/${a.id}/publicar`, campos)).aula;
        aviso('Atualizado.');
        desenharAba();
      } catch (erro) {
        aviso(erro.message, 'erro');
        desenharAba();
      }
    };
    alternarPublica.addEventListener('change', () => publicar({ publica: alternarPublica.checked }));
    alternarComunidade.addEventListener('change', () => publicar({ comunidade: alternarComunidade.checked }));

    const qr = el('canvas', { classe: 'qr', width: 220, height: 220, 'aria-label': 'QR Code do link da aula' });
    if (a.publica && link) desenharQr(qr, link);
    const titulo = a.titulo || a.assunto;
    return el('div', { classe: 'compartilhar' }, [
      el('label', { classe: 'opcao' }, [alternarPublica, el('strong', { texto: 'Link para os alunos' }), el('span', { classe: 'dica', texto: ' (os alunos abrem no celular, sem login; os resultados dos jogos chegam para você)' })]),
      a.publica ? el('div', { classe: 'link-publico' }, [
        el('div', {}, [
          el('input', { value: link, readonly: 'readonly', 'aria-label': 'Link da aula' }),
          el('div', { classe: 'acoes acoes-esquerda' }, [
            botao('Copiar link', () => navigator.clipboard.writeText(link).then(() => aviso('Link copiado.'), () => aviso('Não foi possível copiar.', 'erro'))),
            el('a', { classe: 'botao', target: '_blank', rel: 'noopener', href: `https://classroom.google.com/share?url=${encodeURIComponent(link)}&title=${encodeURIComponent(titulo)}`, texto: 'Postar no Google Classroom' }),
            el('a', { classe: 'botao', target: '_blank', rel: 'noopener', href: `https://wa.me/?text=${encodeURIComponent(`${titulo}: ${link}`)}`, texto: 'Enviar no WhatsApp' }),
            botao('Baixar QR Code', () => { const l = el('a', { href: qr.toDataURL('image/png'), download: `QR - ${titulo}.png` }); l.click(); }),
          ]),
        ]),
        qr,
      ]) : null,
      el('label', { classe: 'opcao' }, [alternarComunidade, el('strong', { texto: 'Compartilhar na comunidade' }), el('span', { classe: 'dica', texto: ' (outros professores podem ver, curtir e usar esta aula)' })]),
    ]);
  }

  async function desenharQr(canvas, texto) {
    try {
      if (!window.qrcode) {
        await new Promise((ok, falha) => {
          const s = el('script', { src: QR_JS });
          s.onload = ok;
          s.onerror = () => falha(new Error('Não foi possível carregar o gerador de QR Code.'));
          document.head.append(s);
        });
      }
      const qr = window.qrcode(0, 'M');
      qr.addData(texto);
      qr.make();
      const n = qr.getModuleCount();
      const ctx2 = canvas.getContext('2d');
      const margem = 4;
      const tam = canvas.width / (n + margem * 2);
      ctx2.fillStyle = '#fff';
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.fillStyle = '#1d2733';
      for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (qr.isDark(l, c)) ctx2.fillRect((c + margem) * tam, (l + margem) * tam, Math.ceil(tam), Math.ceil(tam));
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  // ---------- resultados ----------
  async function abaResultados() {
    if (!t.aula.publica) {
      conteudo.append(vazio('Ative o "Link para os alunos" na aba Aula interativa. Quando os alunos terminarem os jogos, os resultados aparecem aqui.'));
      return;
    }
    const area = el('div', {}, carregando());
    conteudo.append(area);
    try {
      const r = await get(`aulas/${t.aula.id}/resultados`);
      if (!r.envios) return substituir(area, vazio('Nenhum aluno enviou resultados ainda.'));
      substituir(area,
        el('div', { classe: 'numeros' }, [
          el('div', { classe: 'numero' }, [el('strong', { texto: String(r.envios) }), el('span', { texto: 'envios' })]),
          el('div', { classe: 'numero' }, [el('strong', { texto: `${Math.round(r.media * 100)}%` }), el('span', { texto: 'média de acertos' })]),
        ]),
        r.mais_errados.length ? el('div', {}, [
          el('h3', { texto: 'O que a turma mais errou' }),
          el('ol', { classe: 'mais-errados' }, r.mais_errados.map((m) => el('li', {}, [el('span', { texto: m.texto }), el('strong', { texto: ` — ${Math.round(m.percentual * 100)}% erraram` })]))),
          el('p', { classe: 'dica', texto: 'Use estes itens para retomar o conteúdo na próxima aula.' }),
        ]) : null,
        el('h3', { texto: 'Alunos' }),
        el('table', { classe: 'tabela' }, [
          el('thead', {}, el('tr', {}, ['Aluno', 'Acertos', 'Quando'].map((x) => el('th', { texto: x })))),
          el('tbody', {}, r.alunos.map((x) => el('tr', {}, [el('td', { texto: x.apelido }), el('td', { texto: `${x.acertos} de ${x.total}` }), el('td', { texto: new Date(x.em).toLocaleString('pt-BR') })]))),
        ])
      );
      renderizarMatematica(area);
    } catch (erro) {
      mostrarErro(area, erro);
    }
  }

  // ---------- ações gerais ----------
  function imprimir(qual) {
    document.body.dataset.imprimir = qual;
    window.print();
  }

  function criarVersao() {
    const nivel = seletor([['copia', 'Cópia idêntica (para editar)'], ...NIVEIS.filter(([v]) => v !== t.aula.nivel).map(([v, r]) => [v, `Versão ${r}`])], 'copia');
    const j = janela('Criar versão desta aula', [
      campo('Tipo', nivel, 'Uma versão de outro nível gera um novo plano adaptado; depois você gera os slides, a avaliação e a aula interativa dela.'),
    ], {
      acoes: [botao('Cancelar', () => j.fechar()), botao('Criar', async () => {
        try {
          const { aula } = await post(`aulas/${t.aula.id}/duplicar`, { nivel: nivel.value === 'copia' ? t.aula.nivel : nivel.value });
          j.fechar();
          aviso('Versão criada.');
          ctx.navegar(`#/aula/${aula.id}`);
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      }, 'botao botao-primario')],
    });
  }

  async function excluir() {
    if (!(await confirmar('Excluir esta aula? Os resultados dos alunos também serão apagados.', 'Excluir'))) return;
    try {
      await del(`aulas/${t.aula.id}`);
      aviso('Aula excluída.');
      ctx.navegar('#/aulas');
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  }

  // ---------- início ----------
  desenharTudo();
  t.tarefas.filter((x) => ['pendente', 'rodando'].includes(x.status)).forEach(acompanhar);
  return () => t.paradas.forEach((p) => p()); // ao sair da tela, para de acompanhar
}
