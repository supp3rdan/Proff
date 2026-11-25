// Teste de integração da API (banco em memória + IA simulada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.DB_MEMORIA = '1';
process.env.LLM_MOCK = '1';
process.env.WORKER_SECRET = 'segredo-de-teste';

const { default: handler } = await import('../api/r.js');

let servidor;
let base;
before(async () => {
  servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rota = null;
    if (url.pathname.startsWith('/v1/')) rota = url.pathname.slice(4);
    if (url.pathname.startsWith('/a/')) rota = `publica/${url.pathname.slice(3)}`;
    url.searchParams.set('rota', rota);
    req.url = `/api/r?${url.searchParams}`;
    handler(req, res);
  });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

async function chamar(metodo, rota, { token, corpo, cabecalhos = {} } = {}) {
  const r = await fetch(`${base}/v1/${rota}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabecalhos },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { dados = texto; }
  return { status: r.status, dados };
}

const login = async (email) => (await chamar('POST', 'login-demo', { corpo: { email } })).dados.token;

async function esperarTarefa(token, tarefaId) {
  for (let i = 0; i < 100; i++) {
    const { dados } = await chamar('GET', `tarefas/${tarefaId}`, { token });
    if (['pronta', 'erro'].includes(dados.tarefa.status)) return dados.tarefa;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('tarefa não terminou');
}

test('fluxo completo, segurança entre professores e funções novas', async () => {
  const ana = await login('ana@escola.br');
  const bia = await login('bia@escola.br');

  // sem login
  assert.equal((await chamar('GET', 'aulas')).status, 401);
  assert.equal((await chamar('GET', 'aulas', { token: 'inventado' })).status, 401);

  // turma + aula
  const turma = (await chamar('POST', 'turmas', { token: ana, corpo: { nome: '1º A', serie: 1 } })).dados.turma;
  const criada = await chamar('POST', 'aulas', { token: ana, corpo: { serie: '1', assunto: 'Função afim', turma_id: turma.id, bimestre: 1 } });
  assert.equal(criada.status, 200);
  const aulaId = criada.dados.aula.id;
  assert.equal((await esperarTarefa(ana, criada.dados.tarefa.id)).status, 'pronta');

  // pré-requisito: interativa antes dos slides
  assert.equal((await chamar('POST', `aulas/${aulaId}/gerar`, { token: ana, corpo: { tipo: 'interativa' } })).status, 409);

  for (const tipo of ['slides', 'prova', 'interativa']) {
    const { dados } = await chamar('POST', `aulas/${aulaId}/gerar`, { token: ana, corpo: { tipo } });
    assert.equal((await esperarTarefa(ana, dados.tarefa.id)).status, 'pronta', tipo);
  }

  // Bia não vê nem mexe na aula da Ana
  assert.equal((await chamar('GET', `aulas/${aulaId}`, { token: bia })).status, 404);
  assert.equal((await chamar('PATCH', `aulas/${aulaId}`, { token: bia, corpo: { titulo: 'hack' } })).status, 404);
  assert.equal((await chamar('DELETE', `aulas/${aulaId}`, { token: bia })).status, 404);
  assert.equal((await chamar('POST', 'aulas', { token: bia, corpo: { serie: '1', assunto: 'x', turma_id: turma.id } })).status, 404);

  // editor: salva plano editado
  let aula = (await chamar('GET', `aulas/${aulaId}`, { token: ana })).dados.aula;
  const plano = { ...aula.estado.plano, titulo: 'Título editado' };
  const editada = await chamar('PATCH', `aulas/${aulaId}`, { token: ana, corpo: { plano } });
  assert.equal(editada.dados.aula.titulo, 'Título editado');

  // refazer um slide e trocar uma questão
  const indice = aula.estado.slides.slides.findIndex((s) => s.tipo === 'conteudo');
  const slide = await chamar('POST', `aulas/${aulaId}/regerar-slide`, { token: ana, corpo: { indice, pedido: 'mais simples' } });
  assert.equal(slide.status, 200);
  assert.match(slide.dados.slide.titulo, /nova versão/);
  const questao = await chamar('POST', `aulas/${aulaId}/regerar-questao`, { token: ana, corpo: { numero: 1 } });
  assert.equal(questao.status, 200);
  assert.equal(questao.dados.questao.verificacao.confere, null);

  // versões A/B: mesmas questões, gabarito acompanha o embaralhamento
  const { versoes } = (await chamar('POST', `aulas/${aulaId}/versoes`, { token: ana })).dados;
  assert.equal(versoes.A.length, versoes.B.length);
  for (const q of versoes.B.filter((x) => x.tipo === 'multipla')) {
    const original = versoes.A.find((x) => x.original === q.original);
    const textoCertoA = original.alternativas['ABCDE'.indexOf(original.resposta)];
    const textoCertoB = q.alternativas['ABCDE'.indexOf(q.resposta)];
    assert.equal(textoCertoB, textoCertoA);
  }

  // banco de questões: a prova entrou no banco; adiciona numa outra aula
  const banco = (await chamar('GET', 'questoes?serie=1', { token: ana })).dados.questoes;
  assert.ok(banco.length >= 6);
  assert.equal((await chamar('GET', 'questoes', { token: bia })).dados.questoes.length, 0);
  const outra = (await chamar('POST', 'aulas', { token: ana, corpo: { serie: '1', assunto: 'Revisão' } })).dados;
  await esperarTarefa(ana, outra.tarefa.id);
  const doBanco = await chamar('POST', `aulas/${outra.aula.id}/questoes-do-banco`, { token: ana, corpo: { ids: banco.slice(0, 2).map((q) => q.id) } });
  assert.equal(doBanco.dados.prova.questoes.length, 2);

  // avaliação 👍 vira referência para o próximo plano do mesmo assunto
  assert.equal((await chamar('POST', `aulas/${aulaId}/avaliar`, { token: ana, corpo: { parte: 'plano', nota: 1 } })).status, 200);
  const terceira = (await chamar('POST', 'aulas', { token: bia, corpo: { serie: '1', assunto: 'Função afim e gráficos' } })).dados;
  const tarefaRef = await esperarTarefa(bia, terceira.tarefa.id);
  assert.match(tarefaRef.etapas.find((e) => e.id === 'plano').detalhe, /referência/);

  // link público + resultados dos alunos
  const pub = await chamar('POST', `aulas/${aulaId}/publicar`, { token: ana, corpo: { publica: true } });
  const slug = pub.dados.aula.slug;
  assert.ok(slug);
  const pagina = await fetch(`${base}/a/${slug}`);
  assert.equal(pagina.status, 200);
  const html = await pagina.text();
  assert.match(html, /proff-dados/);
  assert.match(html, /\/v1\/publica\/.+\/resultado/);
  const envio = await chamar('POST', `publica/${slug}/resultado`, { corpo: { apelido: 'Joana <b>', acertos: 10, total: 15, erros: ['quiz:1', 'vf:2', 'hack:1'] } });
  assert.equal(envio.status, 200);
  assert.equal((await chamar('POST', `publica/${slug}/resultado`, { corpo: { apelido: 'x', acertos: 9, total: 3 } })).status, 400);
  const res = (await chamar('GET', `aulas/${aulaId}/resultados`, { token: ana })).dados;
  assert.equal(res.envios, 1);
  assert.equal(res.alunos[0].apelido, 'Joana b');
  assert.deepEqual(res.mais_errados.map((m) => m.item).sort(), ['quiz:1', 'vf:2']);
  const painel = (await chamar('GET', `turmas/${turma.id}/painel`, { token: ana })).dados;
  assert.equal(painel.aulas[0].resumo.envios, 1);
  assert.equal((await chamar('GET', `turmas/${turma.id}/painel`, { token: bia })).status, 404);

  // despublicar: link deixa de funcionar
  await chamar('POST', `aulas/${aulaId}/publicar`, { token: ana, corpo: { publica: false } });
  assert.equal((await fetch(`${base}/a/${slug}`)).status, 404);

  // comunidade: compartilhar, curtir e usar
  await chamar('POST', `aulas/${aulaId}/publicar`, { token: ana, corpo: { comunidade: true } });
  const lista = (await chamar('GET', 'comunidade', { token: bia })).dados.aulas;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].minha, false);
  assert.equal((await chamar('POST', `comunidade/${aulaId}/curtir`, { token: bia })).dados.curtida, true);
  const usada = (await chamar('POST', `comunidade/${aulaId}/usar`, { token: bia })).dados.aula;
  assert.equal(usada.origem_id, aulaId);
  assert.equal((await chamar('GET', `aulas/${usada.id}`, { token: bia })).dados.aula.estado.slides.slides.length > 0, true);

  // versão de outro nível: novo plano
  const versao = (await chamar('POST', `aulas/${aulaId}/duplicar`, { token: ana, corpo: { nivel: 'inclusao' } })).dados;
  assert.equal(versao.aula.nivel, 'inclusao');
  assert.equal((await esperarTarefa(ana, versao.tarefa.id)).status, 'pronta');

  // bimestre
  const seq = (await chamar('POST', 'sequencias', { token: ana, corpo: { serie: 1, bimestre: 1, conteudos: 'Funções', quantidade: 4, turma_id: turma.id } })).dados;
  assert.equal((await esperarTarefa(ana, seq.tarefa.id)).status, 'pronta');
  const s = (await chamar('GET', `sequencias/${seq.sequencia.id}`, { token: ana })).dados.sequencia;
  assert.equal(s.itens.length, 4);
  // planejamento detalhado: só códigos BNCC da lista oficial, competências válidas
  const pl = s.detalhes.planejamento;
  assert.deepEqual(pl.habilidades.map((h) => h.codigo), ['EM13MAT302', 'EM13MAT401', 'EM13MAT501']);
  assert.deepEqual(pl.competencias_gerais, [1, 2, 4, 7]);
  assert.deepEqual(pl.competencias_especificas, [3, 4, 5]);
  assert.ok(pl.objetivos.length >= 6 && pl.conteudos.length === 2);
  // cabeçalho do documento .docx
  const cab = (await chamar('PATCH', `sequencias/${s.id}`, { token: ana, corpo: { professor: 'Ana Souza', escola: 'E. E. Teste', turma: '1º A' } })).dados.sequencia;
  assert.equal(cab.detalhes.cabecalho.professor, 'Ana Souza');
  assert.ok(cab.detalhes.planejamento, 'salvar o cabeçalho não apaga o planejamento');
  assert.equal((await chamar('PATCH', `sequencias/${s.id}`, { token: bia, corpo: { professor: 'X' } })).status, 404);
  // refazer só o planejamento (sem refazer a lista de aulas)
  const refazer = (await chamar('POST', `sequencias/${s.id}/detalhar`, { token: ana })).dados;
  assert.deepEqual(refazer.tarefa.etapas.map((e) => e.id), ['planejamento']);
  assert.equal((await esperarTarefa(ana, refazer.tarefa.id)).status, 'pronta');
  const daSequencia = (await chamar('POST', 'aulas', { token: ana, corpo: { serie: '1', assunto: s.itens[1].assunto, sequencia_id: s.id, ordem: 2 } })).dados;
  const s2 = (await chamar('GET', `sequencias/${s.id}`, { token: ana })).dados.sequencia;
  assert.equal(s2.itens[1].aula_id, daSequencia.aula.id);

  // worker exige o segredo interno
  assert.equal((await chamar('POST', 'worker', { corpo: { tarefa: seq.tarefa.id } })).status, 401);
  assert.equal((await chamar('POST', 'worker', { corpo: { tarefa: seq.tarefa.id }, cabecalhos: { 'x-worker-secret': 'segredo-de-teste' } })).status, 202);

  // entradas inválidas
  assert.equal((await chamar('GET', 'aulas/nao-e-uuid', { token: ana })).status, 400);
  assert.equal((await chamar('POST', 'aulas', { token: ana, corpo: { serie: '9', assunto: 'x' } })).status, 400);
  assert.equal((await chamar('GET', 'rota/inexistente', { token: ana })).status, 404);

  // excluir
  assert.equal((await chamar('DELETE', `aulas/${aulaId}`, { token: ana })).status, 200);
  assert.equal((await chamar('GET', `aulas/${aulaId}`, { token: ana })).status, 404);
});
