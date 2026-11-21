// Avaliador SEGURO de expressões matemáticas (sem eval/Function).
// Usado para desenhar os gráficos da aula interativa a partir do que a IA sugerir.
// Aceita: números (2.5 ou 2,5), x, parâmetros de uma letra (a, b, c, k, m, n...),
// pi, e, + - * / ^, parênteses, multiplicação implícita (2x, 3(x+1)) e as funções
// sin, cos, tan, sqrt, abs, log (base 10), ln, exp.
//
// Este arquivo também é embutido na página HTML gerada (sem a linha "export").

const FUNCOES_EXPR = {
  sin: Math.sin, sen: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs, log: Math.log10, ln: Math.log, exp: Math.exp,
};
const CONSTANTES_EXPR = { pi: Math.PI, e: Math.E };

function tokenizarExpressao(texto) {
  const s = String(texto).replace(/\s+/g, '').replace(/·|×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = s.slice(i).match(/^\d+([.,]\d+)?/);
    if (num) {
      tokens.push({ t: 'num', v: Number(num[0].replace(',', '.')) });
      i += num[0].length;
    } else if (/[a-zA-Z]/.test(c)) {
      const nome = s.slice(i).match(/^[a-zA-Z]+/)[0].toLowerCase();
      // nome conhecido inteiro (sin, pi...) ou letras soltas (ax → a * x)
      if (FUNCOES_EXPR[nome] || CONSTANTES_EXPR[nome]) {
        tokens.push({ t: FUNCOES_EXPR[nome] ? 'fn' : 'const', v: nome });
        i += nome.length;
      } else {
        const prefixo = Object.keys({ ...FUNCOES_EXPR, ...CONSTANTES_EXPR })
          .filter((k) => nome.startsWith(k) && nome.length > k.length)
          .sort((a, b) => b.length - a.length)[0];
        if (prefixo) {
          tokens.push({ t: FUNCOES_EXPR[prefixo] ? 'fn' : 'const', v: prefixo });
          i += prefixo.length;
        } else {
          tokens.push({ t: 'var', v: nome[0] });
          i += 1;
        }
      }
    } else if ('+-*/^()'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i += 1;
    } else {
      throw new Error(`símbolo não permitido: ${c}`);
    }
  }
  // multiplicação implícita: 2x, 2(x), )(, x(, )x, 2pi, x sin(x)
  const saida = [];
  for (const tk of tokens) {
    const ant = saida[saida.length - 1];
    const antFecha = ant && (ant.t === 'num' || ant.t === 'var' || ant.t === 'const' || (ant.t === 'op' && ant.v === ')'));
    const atualAbre = tk.t === 'num' || tk.t === 'var' || tk.t === 'const' || tk.t === 'fn' || (tk.t === 'op' && tk.v === '(');
    if (antFecha && atualAbre) saida.push({ t: 'op', v: '*' });
    saida.push(tk);
  }
  return saida;
}

/**
 * Compila a expressão. Devolve { avaliar(valores), variaveis } ou lança erro.
 * @example compilarExpressao('a*x^2 + b').avaliar({ x: 2, a: 1, b: 3 }) // 7
 */
function compilarExpressao(texto) {
  const tokens = tokenizarExpressao(texto);
  if (tokens.length === 0 || tokens.length > 200) throw new Error('expressão vazia ou longa demais');
  let p = 0;
  const variaveis = new Set();
  const olhar = () => tokens[p];
  const pegar = () => tokens[p++];
  const esperar = (v) => {
    const tk = pegar();
    if (!tk || tk.v !== v) throw new Error(`esperava "${v}"`);
  };

  // soma := produto (('+'|'-') produto)*
  function soma() {
    let no = produto();
    while (olhar()?.t === 'op' && (olhar().v === '+' || olhar().v === '-')) {
      const op = pegar().v;
      const dir = produto();
      const esq = no;
      no = op === '+' ? (v) => esq(v) + dir(v) : (v) => esq(v) - dir(v);
    }
    return no;
  }
  // produto := unario (('*'|'/') unario)*
  function produto() {
    let no = unario();
    while (olhar()?.t === 'op' && (olhar().v === '*' || olhar().v === '/')) {
      const op = pegar().v;
      const dir = unario();
      const esq = no;
      no = op === '*' ? (v) => esq(v) * dir(v) : (v) => esq(v) / dir(v);
    }
    return no;
  }
  // unario := '-' unario | potencia
  function unario() {
    if (olhar()?.t === 'op' && (olhar().v === '-' || olhar().v === '+')) {
      const op = pegar().v;
      const dentro = unario();
      return op === '-' ? (v) => -dentro(v) : dentro;
    }
    return potencia();
  }
  // potencia := atomo ('^' unario)?   (associativa à direita)
  function potencia() {
    const base = atomo();
    if (olhar()?.t === 'op' && olhar().v === '^') {
      pegar();
      const exp = unario();
      return (v) => Math.pow(base(v), exp(v));
    }
    return base;
  }
  function atomo() {
    const tk = pegar();
    if (!tk) throw new Error('expressão incompleta');
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === 'const') return () => CONSTANTES_EXPR[tk.v];
    if (tk.t === 'var') {
      variaveis.add(tk.v);
      return (v) => (tk.v in v ? v[tk.v] : NaN);
    }
    if (tk.t === 'fn') {
      const f = FUNCOES_EXPR[tk.v];
      let arg;
      if (olhar()?.v === '(') {
        pegar();
        arg = soma();
        esperar(')');
      } else {
        arg = potencia(); // sin x
      }
      return (v) => f(arg(v));
    }
    if (tk.v === '(') {
      const dentro = soma();
      esperar(')');
      return dentro;
    }
    throw new Error(`símbolo inesperado: ${tk.v}`);
  }

  const raiz = soma();
  if (p !== tokens.length) throw new Error('sobrou algo no fim da expressão');
  return {
    variaveis: [...variaveis],
    avaliar: (valores = {}) => {
      const r = raiz(valores);
      return Number.isFinite(r) ? r : NaN;
    },
  };
}

export { compilarExpressao };
