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
