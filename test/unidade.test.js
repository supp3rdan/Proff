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
  assert.deepEqual(validarEntrada({ serie: 2, assunto: ' Matrizes ' }), { serie: '2', assunto: 'Matrizes', observacoes: '' });
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
  const { criarClienteLLM } = await import('../public/core/llm.js');
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
    const llm = criarClienteLLM({ chaves: { groq: 'x' } });
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
