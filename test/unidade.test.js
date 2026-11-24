import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairJSON } from '../public/core/llm.js';
import { validarEntrada, ErroEntrada } from '../public/core/gerador.js';
import { latexParaTexto } from '../public/pptx.js';

test('extrairJSON conserta LaTeX com barra simples', () => {
  const bruto = String.raw`{"f": "$\frac{1}{2} \times 3 \neq \theta$", "g": "\(x\)"}`;
  const dados = extrairJSON(bruto);
  assert.equal(dados.f, String.raw`$\frac{1}{2} \times 3 \neq \theta$`);
  assert.equal(dados.g, String.raw`\(x\)`);
});

test('extrairJSON mantém LaTeX já escapado e acentos em \\u', () => {
  const bruto = '{"f": "$\\\\frac{a}{b}$", "t": "fun\\u00e7\\u00e3o"}';
  assert.deepEqual(extrairJSON(bruto), { f: '$\\frac{a}{b}$', t: 'função' });
});

test('extrairJSON aceita bloco ```json', () => {
  assert.deepEqual(extrairJSON('Aqui está:\n```json\n{"a": 1}\n```'), { a: 1 });
});

test('validarEntrada', () => {
  assert.deepEqual(validarEntrada({ serie: 2, assunto: ' Matrizes ' }), { serie: '2', assunto: 'Matrizes', observacoes: '', nivel: 'regular' });
  assert.throws(() => validarEntrada({ serie: '1', assunto: 'x', nivel: 'hacker' }), ErroEntrada);
  assert.throws(() => validarEntrada({ serie: '4', assunto: 'x' }), ErroEntrada);
  assert.throws(() => validarEntrada({ serie: '1', assunto: '' }), ErroEntrada);
});

test('latexParaTexto deixa fórmulas legíveis no PowerPoint', () => {
  assert.equal(latexParaTexto('$\\frac{a}{b} \\cdot x^2$'), 'a/b · x²');
  assert.equal(latexParaTexto('$\\frac{x+1}{2}$'), '(x+1)/2');
  assert.equal(latexParaTexto('Custa R$ 5,00 e $\\sqrt{16} = 4$'), 'Custa R$ 5,00 e √(16) = 4');
  assert.equal(latexParaTexto('$2{,}5x \\neq 0$'), '2,5x ≠ 0');
});

test('troca de modelo quando o modelo foi desativado', async () => {
  const { criarClienteLLM } = await import('../public/core/llm.js');
  const usados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const { model } = JSON.parse(opcoes.body);
    usados.push(model);
    if (model === 'modelo-velho') {
      return new Response(
        JSON.stringify([{ error: { code: 404, message: 'This model is no longer available. Please update your code to use models/gemini-9-flash.' } }]),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { gemini: 'x' }, modelos: { gemini: 'modelo-velho' } });
    const r = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't' });
    assert.deepEqual(r.dados, { ok: true });
    assert.deepEqual(usados, ['modelo-velho', 'gemini-9-flash']);
  } finally {
    globalThis.fetch = original;
  }
});

test('envia reasoning_effort e repete sem ele se o modelo recusar', async () => {
  const { criarClienteLLM, limparCacheDeModelos } = await import('../public/core/llm.js');
  limparCacheDeModelos();
  const corpos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    corpos.push(corpo);
    if ('reasoning_effort' in corpo) {
      return new Response(JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "reasoning_effort"' } }), { status: 400 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 1}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { gemini: 'x' } });
    const r = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't' });
    assert.deepEqual(r.dados, { ok: 1 });
    assert.equal(corpos[0].reasoning_effort, 'low');
    assert.equal('reasoning_effort' in corpos[1], false);
    assert.equal(corpos[1].model, corpos[0].model);
  } finally {
    globalThis.fetch = original;
  }
});

test('tempo esgotado tenta o próximo modelo', async () => {
  const { criarClienteLLM } = await import('../public/core/llm.js');
  const usados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const { model } = JSON.parse(opcoes.body);
    usados.push(model);
    if (model === 'lento') {
      await new Promise((_, rej) => opcoes.signal.addEventListener('abort', () => rej(opcoes.signal.reason)));
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 2}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { openrouter: 'x' }, modelos: { openrouter: 'lento' }, timeoutMs: 50 });
    const vivo = setInterval(() => {}, 10); // o timer do AbortSignal.timeout não segura o processo no Node
    const r = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't' }).finally(() => clearInterval(vivo));
    assert.deepEqual(r.dados, { ok: 2 });
    assert.deepEqual(usados, ['lento', 'openrouter/free']);
  } finally {
    globalThis.fetch = original;
  }
});

test('organizarAula segue o roteiro padrão e insere os divisores', async () => {
  const { organizarAula } = await import('../public/core/estrutura.js');
  const deck = {
    titulo: 'Teste',
    slides: [
      { tipo: 'exercicio', titulo: 'E1', secao: 'teoria' }, // exercício fora do lugar
      { tipo: 'conteudo', titulo: 'F1', formula: 'x' }, // sem seção: vira fórmulas
      { tipo: 'resumo', titulo: 'R' },
      { tipo: 'conteudo', titulo: 'T1', secao: 'teoria' },
      { tipo: 'conteudo', titulo: 'I1', secao: 'introducao' },
      { tipo: 'exemplo', titulo: 'X1', secao: 'introducao' }, // exemplo vai para aplicações
    ],
  };
  const r = organizarAula(deck).slides.map((s) => (s.tipo === 'secao' ? `#${s.numero}` : s.titulo));
  assert.deepEqual(r, ['Teste', '#1', 'I1', '#2', 'T1', '#3', 'F1', '#4', 'X1', '#5', 'E1', 'R']);
});

test('chave colada no campo errado vai para o provedor certo', async () => {
  const { corrigirChaves, provedorDaChave } = await import('../public/core/llm.js');
  assert.equal(provedorDaChave('sk-or-v1-abc'), 'openrouter');
  assert.equal(provedorDaChave('gsk_abc'), 'groq');
  assert.equal(provedorDaChave('AQ.Ab8abc'), 'gemini');
  assert.equal(provedorDaChave('AIzaXYZ'), 'gemini');
  const r = corrigirChaves({ gemini: 'AQ.x', groq: 'sk-or-v1-y' });
  assert.deepEqual(r.chaves, { gemini: 'AQ.x', openrouter: 'sk-or-v1-y' });
  assert.deepEqual(r.avisos, [{ campo: 'groq', dono: 'openrouter' }]);
});

test('modelo sobrecarregado (503) tenta o próximo modelo', async () => {
  const { criarClienteLLM, limparCacheDeModelos } = await import('../public/core/llm.js');
  limparCacheDeModelos();
  const usados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const { model } = JSON.parse(opcoes.body);
    usados.push(model);
    if (model === 'cheio') {
      return new Response(JSON.stringify({ error: { code: 503, message: 'This model is currently experiencing high demand. Please try again later.' } }), { status: 503 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 3}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { gemini: 'x' }, modelos: { gemini: 'cheio' } });
    const r = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't' });
    assert.deepEqual(r.dados, { ok: 3 });
    assert.equal(usados[0], 'cheio');
    assert.equal(usados.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('Groq: Llama para texto e gpt-oss (raciocínio médio) para matemática', async () => {
  const { criarClienteLLM, limparCacheDeModelos } = await import('../public/core/llm.js');
  limparCacheDeModelos();
  const corpos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    corpos.push(JSON.parse(opcoes.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 4}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { gemini: 'g', groq: 'x' } });
    const r1 = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't', perfil: 'texto' });
    const r2 = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't', perfil: 'matematica' });
    assert.equal(corpos[0].model, 'llama-3.3-70b-versatile');
    assert.equal('reasoning_effort' in corpos[0], false);
    assert.equal(corpos[1].model, 'openai/gpt-oss-120b');
    assert.equal(corpos[1].reasoning_effort, 'medium');
    assert.equal(r1.provedor, 'groq · llama-3.3-70b');
    assert.equal(r2.provedor, 'groq · gpt-oss-120b');
  } finally {
    globalThis.fetch = original;
  }
});

test('limite por minuto (429 "try again in") espera e repete o mesmo modelo', async () => {
  const { criarClienteLLM, limparCacheDeModelos } = await import('../public/core/llm.js');
  limparCacheDeModelos();
  const usados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const { model } = JSON.parse(opcoes.body);
    usados.push(model);
    if (usados.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached for tokens per minute (TPM). Please try again in 20ms.' } }), { status: 429 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 5}' } }] }), { status: 200 });
  };
  try {
    const llm = criarClienteLLM({ chaves: { groq: 'x' } });
    const r = await llm.gerarJSON({ sistema: 's', usuario: 'u', tarefa: 't' });
    assert.deepEqual(r.dados, { ok: 5 });
    assert.deepEqual(usados, ['llama-3.3-70b-versatile', 'llama-3.3-70b-versatile']);
  } finally {
    globalThis.fetch = original;
  }
});

test('avaliador de expressões: contas, multiplicação implícita e segurança', async () => {
  const { compilarExpressao: c } = await import('../public/core/expressao.js');
  assert.equal(c('a*x^2 + b*x + c').avaliar({ x: 2, a: 1, b: -3, c: 2 }), 0);
  assert.equal(c('2x + 1').avaliar({ x: 3 }), 7);
  assert.equal(c('3(x+1)').avaliar({ x: 1 }), 6);
  assert.equal(c('-x^2').avaliar({ x: 3 }), -9);
  assert.equal(c('2,5x').avaliar({ x: 2 }), 5);
  assert.ok(Math.abs(c('sin(pi/2)').avaliar() - 1) < 1e-12);
  assert.ok(Number.isNaN(c('1/0').avaliar()));
  assert.throws(() => c('x; alert(1)'));
  assert.throws(() => c('(x+1'));
  assert.deepEqual(c('alert(1)').variaveis.sort(), ['a', 'l', 'r', 't']); // vira letras soltas, nunca código
});

test('validação de visualizações e jogos descarta o que não serve', async () => {
  const { validarVisualizacoes, validarJogos } = await import('../public/core/interativa.js');
  const v = validarVisualizacoes([
    { tipo: 'funcao', titulo: 'ok', params: { expressao: 'a*x+b', parametros: [{ nome: 'a', min: -2, max: 2, valor: 1 }, { nome: 'b', min: 0, max: 5, valor: 9 }] } },
    { tipo: 'funcao', params: { expressao: 'alert(1)' } }, // letras que não são parâmetros
    { tipo: 'funcao', params: { expressao: 'y+1' } }, // sem x
    { tipo: 'inexistente', params: {} },
    { tipo: 'barras', params: { rotulos: ['a'], valores: [1] } }, // poucas barras
    { tipo: 'geometria', params: { figura: 'hexagono' } }, // figura desconhecida vira retângulo
  ]);
  assert.equal(v.length, 2);
  assert.equal(v[0].params.parametros[1].valor, 5); // valor limitado ao máximo
  assert.equal(v[1].params.figura, 'retangulo');

  const j = validarJogos({
    quiz: [{ pergunta: 'p', alternativas: ['a', 'b'], correta: 1 }, { pergunta: 'p', alternativas: ['a', 'b'], correta: 5 }],
    verdadeiro_falso: [{ afirmacao: 'x', verdadeiro: 'sim' }, { afirmacao: 'y', verdadeiro: false }],
    pares: [{ termo: 'a', significado: 'b' }],
    desafios: [{ pergunta: 'q', resposta: '12.5' }, { pergunta: 'q', resposta: 'doze' }],
  });
  assert.equal(j.quiz.length, 1);
  assert.equal(j.verdadeiro_falso.length, 1);
  assert.equal(j.pares.length, 0); // menos de 3 pares não vira jogo
  assert.deepEqual(j.desafios.map((d) => d.resposta), [12.5]);
});

test('lista da BNCC no código é a mesma do SQL', async () => {
  const { readFileSync } = await import('node:fs');
  const { BNCC_PADRAO } = await import('../lib/bncc.js');
  const sql = readFileSync(new URL('../supabase/migrations/20261124000000_proff.sql', import.meta.url), 'utf8');
  const doSql = [...sql.matchAll(/\('(EM13MAT\d{3})', (\d), '([^']*)'\)/g)].map((m) => ({ codigo: m[1], competencia: Number(m[2]), resumo: m[3] }));
  assert.equal(doSql.length, 43);
  assert.deepEqual(BNCC_PADRAO, doSql);
});

test('BNCC: só códigos da lista oficial ficam no plano', async () => {
  const { conferirBncc } = await import('../public/core/gerador.js');
  const lista = [{ codigo: 'EM13MAT302', resumo: 'Funções de 1º e 2º graus' }];
  assert.deepEqual(conferirBncc([{ codigo: 'em13mat302' }, { codigo: 'EM13MAT999' }, { codigo: 'EM13MAT302' }], lista), [{ codigo: 'EM13MAT302', descricao: 'Funções de 1º e 2º graus' }]);
});

test('versões A/B: gabarito acompanha as alternativas embaralhadas', async () => {
  const { criarVersoes } = await import('../public/core/versoes.js');
  const prova = { questoes: [
    { numero: 1, tipo: 'multipla', alternativas: ['1', '2', '3', '4', '5'], resposta: 'C' },
    { numero: 2, tipo: 'discursiva', alternativas: [], resposta: 'x = 2' },
    { numero: 3, tipo: 'multipla', alternativas: ['a', 'b', 'c', 'd', 'e'], resposta: 'A' },
  ] };
  const v = criarVersoes(prova, 'semente');
  assert.deepEqual(v.A.map((q) => q.resposta), ['C', 'x = 2', 'A']);
  for (const q of v.B.filter((x) => x.tipo === 'multipla')) {
    const original = prova.questoes.find((x) => x.numero === q.original);
    assert.equal(q.alternativas['ABCDE'.indexOf(q.resposta)], original.alternativas['ABCDE'.indexOf(original.resposta)]);
  }
  assert.deepEqual(criarVersoes(prova, 'semente').B, v.B); // mesma semente, mesmas versões
});
