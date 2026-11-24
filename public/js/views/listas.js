// Telas de listas e cadastros: nova aula, minhas aulas, turmas, bimestre,
// banco de questões e comunidade.

import { get, post, del } from '../api.js?v=mwvaocy';
import { acompanharTarefa } from '../sessao.js?v=mwvaocy';
import {
  el, substituir, botao, aviso, confirmar, campo, seletor, NIVEIS, rotuloNivel, dataCurta,
  renderizarMatematica, carregando, mostrarErro,
} from '../ui.js?v=mwvaocy';
import { ASSUNTOS } from '../../assuntos.js?v=mwvaocy';

const SERIES = [['1', '1º ano'], ['2', '2º ano'], ['3', '3º ano']];
const BIMESTRES = [['', '—'], ['1', '1º bimestre'], ['2', '2º bimestre'], ['3', '3º bimestre'], ['4', '4º bimestre']];

const vazio = (texto) => el('p', { classe: 'vazio', texto });

function chips(tem) {
  const itens = [['plano', 'Plano'], ['slides', 'Slides'], ['prova', 'Avaliação'], ['interativa', 'Interativa']];
  return el('div', { classe: 'chips-status' }, itens.map(([k, r]) => el('span', { classe: `chip-status ${tem?.[k] ? 'feito' : ''}`, texto: `${tem?.[k] ? '✓' : '○'} ${r}` })));
}

function cartaoAula(a, extra = []) {
  return el('a', { classe: 'cartao cartao-aula', href: `#/aula/${a.id}` }, [
    el('div', { classe: 'cartao-aula-topo' }, [
      el('span', { classe: 'meta', texto: `${a.serie}º ano${a.bimestre ? ` · ${a.bimestre}º bim.` : ''}` }),
      el('span', { classe: `selo-nivel nivel-${a.nivel}`, texto: rotuloNivel(a.nivel) }),
    ]),
    el('h3', { texto: a.titulo || a.assunto }),
    a.titulo && a.titulo !== a.assunto ? el('p', { classe: 'meta', texto: a.assunto }) : null,
    chips(a.tem),
    el('p', { classe: 'meta', texto: `Atualizada em ${dataCurta(a.atualizado_em)}${a.publica ? ' · 🔗 link ativo' : ''}${a.comunidade ? ' · 🌎 comunidade' : ''}` }),
    ...extra,
  ]);
}

// ---------------------------------------------------------------------------
// Nova aula
// ---------------------------------------------------------------------------
export async function telaNovaAula(alvo, ctx, preenchido = {}) {
  substituir(alvo, carregando());
  let turmas = [];
  try {
    turmas = (await get('turmas')).turmas;
  } catch (erro) {
    return mostrarErro(alvo, erro);
  }
  const serie = seletor(SERIES, preenchido.serie || '1');
  const assunto = el('input', { list: 'lista-assuntos', required: true, maxlength: 150, autocomplete: 'off', placeholder: 'Escolha da lista ou digite, ex.: Função afim', value: preenchido.assunto || '' });
  const listaAssuntos = el('datalist', { id: 'lista-assuntos' });
  const preencher = () => substituir(listaAssuntos, ...ASSUNTOS[serie.value].map((a) => el('option', { value: a })));
  serie.addEventListener('change', preencher);
  preencher();
  const nivel = seletor(NIVEIS, preenchido.nivel || 'regular');
  const turma = seletor([['', 'Sem turma'], ...turmas.map((t) => [t.id, `${t.nome} (${t.serie}º ano)`])], preenchido.turma_id || '');
  turma.addEventListener('change', () => {
    const t = turmas.find((x) => x.id === turma.value);
    if (t) { serie.value = String(t.serie); preencher(); }
  });
  const bimestre = seletor(BIMESTRES, preenchido.bimestre || '');
  const observacoes = el('textarea', { rows: 3, maxlength: 1500, placeholder: 'Ex.: 1 aula de 50 min, exemplos com futebol, prova com 10 questões, turma com dificuldade em frações...' });
  observacoes.value = preenchido.observacoes || '';
  const enviar = el('button', { type: 'submit', classe: 'botao botao-primario', texto: 'Gerar plano de aula' });

  const form = el('form', { classe: 'cartao formulario' }, [
    el('h2', { classe: 'campo-inteiro', texto: preenchido.sequencia_id ? `Aula ${preenchido.ordem} da sequência do bimestre` : 'Nova aula' }),
    campo('Série', serie),
    el('div', { classe: 'campo-largo' }, [campo('Assunto', assunto), listaAssuntos]),
    campo('Nível da turma', nivel, 'Reforço, avançado ou inclusão adaptam a linguagem e as atividades.'),
    campo('Turma', turma),
    campo('Bimestre', bimestre),
    el('div', { classe: 'campo-inteiro' }, campo('Como você gostaria da aula? (opcional)', observacoes)),
    el('div', { classe: 'campo-inteiro' }, enviar),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    enviar.disabled = true;
    enviar.textContent = 'Criando…';
    try {
      const { aula } = await post('aulas', {
        serie: serie.value, assunto: assunto.value, nivel: nivel.value, turma_id: turma.value || null, bimestre: bimestre.value || null,
        observacoes: observacoes.value, sequencia_id: preenchido.sequencia_id || null, ordem: preenchido.ordem || null,
      });
      ctx.navegar(`#/aula/${aula.id}`);
    } catch (erro) {
      aviso(erro.message, 'erro');
      enviar.disabled = false;
      enviar.textContent = 'Gerar plano de aula';
    }
  });
  substituir(alvo, form);
}

// ---------------------------------------------------------------------------
// Minhas aulas (biblioteca)
// ---------------------------------------------------------------------------
export async function telaAulas(alvo) {
  substituir(alvo, carregando());
  let turmas = [];
  try {
    turmas = (await get('turmas')).turmas;
  } catch (erro) {
    return mostrarErro(alvo, erro);
  }
  const turma = seletor([['', 'Todas as turmas'], ...turmas.map((t) => [t.id, t.nome])], '');
  const bimestre = seletor([['', 'Todos os bimestres'], ...BIMESTRES.slice(1)], '');
  const busca = el('input', { type: 'search', placeholder: 'Buscar por assunto ou título' });
  const lista = el('div', { classe: 'grade-cartoes' });

  async function carregar() {
    substituir(lista, carregando());
    const q = new URLSearchParams();
    if (turma.value) q.set('turma', turma.value);
    if (bimestre.value) q.set('bimestre', bimestre.value);
    if (busca.value.trim()) q.set('busca', busca.value.trim());
    try {
      const { aulas } = await get(`aulas?${q}`);
      if (!aulas.length) return substituir(lista, vazio('Nenhuma aula encontrada. Crie a primeira em "Nova aula".'));
      substituir(lista, ...aulas.map((a) => cartaoAula(a)));
    } catch (erro) {
      mostrarErro(lista, erro);
    }
  }
  let espera;
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregar, 300); });
  turma.addEventListener('change', carregar);
  bimestre.addEventListener('change', carregar);

  substituir(alvo,
    el('div', { classe: 'titulo-tela' }, [el('h1', { texto: 'Minhas aulas' }), el('a', { classe: 'botao botao-primario', href: '#/nova', texto: '+ Nova aula' })]),
    el('div', { classe: 'filtros' }, [campo('Turma', turma), campo('Bimestre', bimestre), campo('Buscar', busca)]),
    lista
  );
  carregar();
}

// ---------------------------------------------------------------------------
// Turmas e painel de desempenho
// ---------------------------------------------------------------------------
export async function telaTurmas(alvo) {
  substituir(alvo, carregando());
  const nome = el('input', { maxlength: 80, required: true, placeholder: 'Ex.: 1º A — manhã' });
  const serie = seletor(SERIES, '1');
  const ano = el('input', { type: 'number', min: 2000, max: 2100, value: new Date().getFullYear() });
  const lista = el('div', { classe: 'grade-cartoes' });

  async function carregar() {
    try {
      const { turmas } = await get('turmas');
      if (!turmas.length) return substituir(lista, vazio('Nenhuma turma ainda. Cadastre acima para organizar as aulas e ver o desempenho dos alunos.'));
      substituir(lista, ...turmas.map((t) => el('div', { classe: 'cartao' }, [
        el('h3', { texto: t.nome }),
        el('p', { classe: 'meta', texto: `${t.serie}º ano · ${t.ano_letivo} · ${t.aulas} aula${t.aulas === 1 ? '' : 's'}` }),
        el('div', { classe: 'acoes acoes-esquerda' }, [
          el('a', { classe: 'botao botao-primario', href: `#/turma/${t.id}`, texto: 'Ver desempenho' }),
          botao('Excluir', async () => {
            if (!(await confirmar(`Excluir a turma "${t.nome}"? As aulas continuam na sua biblioteca, sem turma.`, 'Excluir'))) return;
            await del(`turmas/${t.id}`).then(carregar, (erro) => aviso(erro.message, 'erro'));
          }, 'botao botao-perigo'),
        ]),
      ])));
    } catch (erro) {
      mostrarErro(lista, erro);
    }
  }

  const form = el('form', { classe: 'cartao formulario formulario-linha' }, [
    campo('Nome da turma', nome), campo('Série', serie), campo('Ano letivo', ano),
    el('button', { type: 'submit', classe: 'botao botao-primario', texto: 'Cadastrar turma' }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('turmas', { nome: nome.value, serie: serie.value, ano_letivo: ano.value });
      nome.value = '';
      aviso('Turma cadastrada.');
      carregar();
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  });
  substituir(alvo, el('h1', { texto: 'Turmas' }), form, lista);
  carregar();
}

export async function telaPainelTurma(alvo, turmaId) {
  substituir(alvo, carregando());
  try {
    const { turma, aulas } = await get(`turmas/${turmaId}/painel`);
    const comEnvios = aulas.filter((a) => a.resumo.envios);
    const media = comEnvios.length ? comEnvios.reduce((s, a) => s + a.resumo.media, 0) / comEnvios.length : null;
    const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
    substituir(alvo,
      el('a', { href: '#/turmas', classe: 'voltar', texto: '← Turmas' }),
      el('h1', { texto: turma.nome }),
      el('p', { classe: 'meta', texto: `${turma.serie}º ano · ${turma.ano_letivo}` }),
      el('div', { classe: 'numeros' }, [
        el('div', { classe: 'numero' }, [el('strong', { texto: String(aulas.length) }), el('span', { texto: 'aulas' })]),
        el('div', { classe: 'numero' }, [el('strong', { texto: String(comEnvios.reduce((s, a) => s + a.resumo.envios, 0)) }), el('span', { texto: 'envios dos alunos' })]),
        el('div', { classe: 'numero' }, [el('strong', { texto: pct(media) }), el('span', { texto: 'média de acertos' })]),
      ]),
      aulas.length ? el('div', { classe: 'cartao' }, [
        el('h2', { texto: 'Desempenho por aula' }),
        el('table', { classe: 'tabela' }, [
          el('thead', {}, el('tr', {}, ['Aula', 'Bimestre', 'Envios', 'Média', 'Mais errado'].map((x) => el('th', { texto: x })))),
          el('tbody', {}, aulas.map((a) => el('tr', {}, [
            el('td', {}, el('a', { href: `#/aula/${a.id}`, texto: a.titulo })),
            el('td', { texto: a.bimestre ? `${a.bimestre}º` : '—' }),
            el('td', { texto: a.publica ? String(a.resumo.envios) : 'link desativado' }),
            el('td', { texto: pct(a.resumo.media) }),
            el('td', { texto: a.resumo.mais_errados[0] ? `${a.resumo.mais_errados[0].texto} (${Math.round(a.resumo.mais_errados[0].percentual * 100)}%)` : '—' }),
          ]))),
        ]),
        el('p', { classe: 'dica', texto: 'Os resultados vêm dos jogos da aula interativa aberta pelo link. Cada aluno informa só um apelido.' }),
      ]) : vazio('Nenhuma aula nesta turma. Escolha a turma ao criar uma aula ou na própria aula.'),
    );
    renderizarMatematica(alvo);
  } catch (erro) {
    mostrarErro(alvo, erro);
  }
}

// ---------------------------------------------------------------------------
// Bimestre (sequências didáticas)
// ---------------------------------------------------------------------------
export async function telaBimestre(alvo) {
  substituir(alvo, carregando());
  let turmas = [];
  try {
    turmas = (await get('turmas')).turmas;
  } catch (erro) {
    return mostrarErro(alvo, erro);
  }
  const serie = seletor(SERIES, '1');
  const turma = seletor([['', 'Sem turma'], ...turmas.map((t) => [t.id, t.nome])], '');
  turma.addEventListener('change', () => { const t = turmas.find((x) => x.id === turma.value); if (t) serie.value = String(t.serie); });
  const bimestre = seletor(BIMESTRES, '1');
  const quantidade = el('input', { type: 'number', min: 2, max: 20, value: 8 });
  const conteudos = el('textarea', { rows: 3, maxlength: 2000, required: true, placeholder: 'Ex.: Funções: conceito, função afim, função quadrática' });
  const lista = el('div', { classe: 'grade-cartoes' });

  async function carregar() {
    try {
      const { sequencias } = await get('sequencias');
      if (!sequencias.length) return substituir(lista, vazio('Nenhuma sequência ainda.'));
      substituir(lista, ...sequencias.map((s) => el('a', { classe: 'cartao cartao-aula', href: `#/sequencia/${s.id}` }, [
        el('span', { classe: 'meta', texto: `${s.serie}º ano${s.bimestre ? ` · ${s.bimestre}º bimestre` : ''}` }),
        el('h3', { texto: s.titulo || 'Gerando…' }),
        el('p', { classe: 'meta', texto: `${s.itens.length || s.quantidade} aulas · ${s.itens.filter((i) => i.aula_id).length} criadas` }),
      ])));
    } catch (erro) {
      mostrarErro(lista, erro);
    }
  }
  const form = el('form', { classe: 'cartao formulario' }, [
    el('p', { classe: 'campo-inteiro dica', texto: 'Informe os conteúdos do período e o Proff monta uma sequência de aulas encadeadas. Depois, gere cada aula com um clique.' }),
    campo('Série', serie), campo('Turma', turma), campo('Bimestre', bimestre), campo('Quantidade de aulas', quantidade),
    el('div', { classe: 'campo-inteiro' }, campo('Conteúdos do período', conteudos)),
    el('div', { classe: 'campo-inteiro' }, el('button', { type: 'submit', classe: 'botao botao-primario', texto: 'Planejar o bimestre' })),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { sequencia } = await post('sequencias', { serie: serie.value, turma_id: turma.value || null, bimestre: bimestre.value || null, quantidade: quantidade.value, conteudos: conteudos.value });
      location.hash = `#/sequencia/${sequencia.id}`;
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  });
  substituir(alvo, el('h1', { texto: 'Planejar o bimestre' }), form, el('h2', { texto: 'Sequências salvas' }), lista);
  carregar();
}

export async function telaSequencia(alvo, seqId, ctx) {
  substituir(alvo, carregando());
  let parar = null;
  async function desenhar() {
    try {
      const { sequencia: s, tarefas } = await get(`sequencias/${seqId}`);
      const ativa = tarefas.find((t) => ['pendente', 'rodando'].includes(t.status));
      substituir(alvo,
        el('a', { href: '#/bimestre', classe: 'voltar', texto: '← Bimestre' }),
        el('div', { classe: 'titulo-tela' }, [
          el('h1', { texto: s.titulo || 'Planejando o bimestre…' }),
          botao('Excluir', async () => {
            if (!(await confirmar('Excluir esta sequência? As aulas já criadas continuam na sua biblioteca.', 'Excluir'))) return;
            await del(`sequencias/${s.id}`).then(() => ctx.navegar('#/bimestre'), (erro) => aviso(erro.message, 'erro'));
          }, 'botao botao-perigo'),
        ]),
        el('p', { classe: 'meta', texto: `${s.serie}º ano${s.bimestre ? ` · ${s.bimestre}º bimestre` : ''} · Conteúdos: ${s.conteudos}` }),
        ativa ? el('p', { classe: 'vazio', texto: 'Montando a sequência de aulas…' }) : null,
        !ativa && !s.itens.length ? el('p', { classe: 'erro', texto: 'Não foi possível montar a sequência. Exclua e tente de novo.' }) : null,
        el('ol', { classe: 'sequencia' }, s.itens.map((i) => el('li', { classe: 'cartao' }, [
          el('div', {}, [el('strong', { texto: `Aula ${i.ordem}: ${i.assunto}` }), el('p', { texto: i.objetivo }), i.observacoes ? el('p', { classe: 'meta', texto: i.observacoes }) : null]),
          i.aula_id
            ? el('a', { classe: 'botao', href: `#/aula/${i.aula_id}`, texto: 'Abrir aula' })
            : botao('Gerar esta aula', () => ctx.novaAulaDe({
              serie: String(s.serie), assunto: i.assunto, turma_id: s.turma_id, bimestre: s.bimestre ? String(s.bimestre) : '',
              observacoes: `Aula ${i.ordem} de ${s.itens.length} da sequência "${s.titulo}". Objetivo: ${i.objetivo}. ${i.observacoes || ''}`.trim(),
              sequencia_id: s.id, ordem: i.ordem,
            }), 'botao botao-primario'),
        ]))),
      );
      if (ativa && !parar) {
        parar = acompanharTarefa(ativa.id, (t) => { if (['pronta', 'erro'].includes(t.status)) { parar = null; desenhar(); } });
      }
    } catch (erro) {
      mostrarErro(alvo, erro);
    }
  }
  await desenhar();
  return () => parar?.();
}

// ---------------------------------------------------------------------------
// Banco de questões
// ---------------------------------------------------------------------------
export async function telaBanco(alvo) {
  const serie = seletor([['', 'Todas as séries'], ...SERIES], '');
  const tipo = seletor([['', 'Todos os tipos'], ['multipla', 'Múltipla escolha'], ['discursiva', 'Discursiva']], '');
  const busca = el('input', { type: 'search', placeholder: 'Buscar no enunciado ou assunto' });
  const lista = el('div');
  async function carregar() {
    substituir(lista, carregando());
    const q = new URLSearchParams();
    if (serie.value) q.set('serie', serie.value);
    if (tipo.value) q.set('tipo', tipo.value);
    if (busca.value.trim()) q.set('busca', busca.value.trim());
    try {
      const { questoes } = await get(`questoes?${q}`);
      if (!questoes.length) return substituir(lista, vazio('Nenhuma questão. As questões das avaliações que você gera entram aqui automaticamente.'));
      substituir(lista, el('p', { classe: 'meta', texto: `${questoes.length} questões` }), ...questoes.map((x) => el('div', { classe: 'cartao questao-banco' }, [
        el('p', { classe: 'meta', texto: `${x.serie}º ano · ${x.assunto} · ${x.tipo === 'multipla' ? 'múltipla escolha' : 'discursiva'}${x.nivel ? ` · ${x.nivel}` : ''}` }),
        el('p', { texto: x.enunciado }),
        x.alternativas?.length ? el('ol', { classe: 'alternativas', type: 'A' }, x.alternativas.map((a) => el('li', { texto: a }))) : null,
        el('p', { classe: 'resposta', texto: `Resposta: ${x.resposta}` }),
        el('div', { classe: 'acoes acoes-esquerda' }, [
          x.aula_id ? el('a', { classe: 'botao botao-pequeno', href: `#/aula/${x.aula_id}`, texto: 'Ver aula de origem' }) : null,
          botao('Excluir', async () => {
            if (!(await confirmar('Excluir esta questão do banco?', 'Excluir'))) return;
            await del(`questoes/${x.id}`).then(carregar, (erro) => aviso(erro.message, 'erro'));
          }, 'botao botao-pequeno botao-perigo'),
        ]),
      ])));
      renderizarMatematica(lista);
    } catch (erro) {
      mostrarErro(lista, erro);
    }
  }
  let espera;
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregar, 300); });
  serie.addEventListener('change', carregar);
  tipo.addEventListener('change', carregar);
  substituir(alvo,
    el('h1', { texto: 'Banco de questões' }),
    el('p', { classe: 'dica', texto: 'Para montar uma prova com estas questões, abra a aula e use "Do banco de questões" na aba Avaliação.' }),
    el('div', { classe: 'filtros' }, [campo('Série', serie), campo('Tipo', tipo), campo('Buscar', busca)]),
    lista
  );
  carregar();
}

// ---------------------------------------------------------------------------
// Comunidade
// ---------------------------------------------------------------------------
export async function telaComunidade(alvo, ctx) {
  const serie = seletor([['', 'Todas as séries'], ...SERIES], '');
  const busca = el('input', { type: 'search', placeholder: 'Buscar por assunto' });
  const lista = el('div', { classe: 'grade-cartoes' });
  async function carregar() {
    substituir(lista, carregando());
    const q = new URLSearchParams();
    if (serie.value) q.set('serie', serie.value);
    if (busca.value.trim()) q.set('busca', busca.value.trim());
    try {
      const { aulas } = await get(`comunidade?${q}`);
      if (!aulas.length) return substituir(lista, vazio('Nenhuma aula compartilhada ainda. Compartilhe as suas na aba "Aula interativa" de cada aula.'));
      substituir(lista, ...aulas.map((a) => {
        const curtir = botao(`${a.curtida ? '❤️' : '🤍'} ${a.curtidas}`, async () => {
          try {
            const { curtida } = await post(`comunidade/${a.id}/curtir`);
            a.curtida = curtida;
            a.curtidas += curtida ? 1 : -1;
            curtir.textContent = `${a.curtida ? '❤️' : '🤍'} ${a.curtidas}`;
          } catch (erro) {
            aviso(erro.message, 'erro');
          }
        }, 'botao botao-pequeno');
        return el('div', { classe: 'cartao cartao-aula' }, [
          el('div', { classe: 'cartao-aula-topo' }, [el('span', { classe: 'meta', texto: `${a.serie}º ano` }), el('span', { classe: `selo-nivel nivel-${a.nivel}`, texto: rotuloNivel(a.nivel) })]),
          el('h3', { texto: a.titulo || a.assunto }),
          el('p', { classe: 'meta', texto: a.assunto }),
          chips(a.tem),
          el('div', { classe: 'acoes acoes-esquerda' }, [
            curtir,
            a.publica && a.slug ? el('a', { classe: 'botao botao-pequeno', href: `/a/${a.slug}`, target: '_blank', rel: 'noopener', texto: 'Ver aula interativa' }) : null,
            a.minha ? el('a', { classe: 'botao botao-pequeno', href: `#/aula/${a.id}`, texto: 'É sua: abrir' }) : botao('Usar esta aula', async () => {
              try {
                const { aula } = await post(`comunidade/${a.id}/usar`);
                aviso('Aula copiada para a sua biblioteca.');
                ctx.navegar(`#/aula/${aula.id}`);
              } catch (erro) {
                aviso(erro.message, 'erro');
              }
            }, 'botao botao-pequeno botao-primario'),
          ]),
        ]);
      }));
    } catch (erro) {
      mostrarErro(lista, erro);
    }
  }
  let espera;
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregar, 300); });
  serie.addEventListener('change', carregar);
  substituir(alvo,
    el('h1', { texto: 'Comunidade' }),
    el('p', { classe: 'dica', texto: 'Aulas que outros professores compartilharam. Use uma aula para copiá-la para a sua biblioteca e adaptar.' }),
    el('div', { classe: 'filtros' }, [campo('Série', serie), campo('Buscar', busca)]),
    lista
  );
  carregar();
}
