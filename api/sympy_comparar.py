"""Comparação exata de respostas com SymPy (função Python da Vercel).

POST /api/sympy_comparar   cabeçalho x-worker-secret: <WORKER_SECRET>
corpo:    {"pares": [{"a": "x = -1/2", "b": "-0,5"}, ...]}
resposta: {"resultados": [true, false, null, ...]}   (null = não deu para comparar)

Segurança: o SymPy interpreta texto como Python, então só aceitamos respostas com
caracteres e nomes de uma lista fechada (números, x, y, a, b, c, n, pi, sqrt, sin...).
Qualquer outra coisa volta null e a comparação fica com a IA.
"""

import json
import os
import re
import hmac
from http.server import BaseHTTPRequestHandler

from sympy import simplify, nsimplify, Eq, solve, Symbol, pi, E, sqrt, sin, cos, tan, log, exp, Abs
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

PERMITIDOS = re.compile(r"^[0-9a-z+\-*/^().,=\s√π]+$")
NOMES = {"x", "y", "a", "b", "c", "n", "t", "pi", "e", "sqrt", "raiz", "sin", "sen", "cos", "tan", "tg", "log", "ln", "exp", "abs"}
LOCAIS = {
    "x": Symbol("x"), "y": Symbol("y"), "a": Symbol("a"), "b": Symbol("b"), "c": Symbol("c"),
    "n": Symbol("n"), "t": Symbol("t"), "pi": pi, "e": E, "sqrt": sqrt, "raiz": sqrt,
    "sin": sin, "sen": sin, "cos": cos, "tan": tan, "tg": tan, "log": log, "ln": log, "exp": exp, "abs": Abs,
}
TRANSFORMACOES = standard_transformations + (implicit_multiplication_application, convert_xor)


def limpar(texto):
    """'f(x) = 2x + 3' -> '2x+3'; 'x = -1/2' -> '-1/2'; '-0,5' -> '-0.5'; 'R$ 30,00' -> '30.00'."""
    t = str(texto).strip().lower()
    t = re.sub(r"^r\$\s*", "", t)  # R$ 30,00
    t = t.replace("$", "").replace("\\cdot", "*").replace("\\times", "*").replace("·", "*").replace("×", "*")
    t = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", t)
    t = t.replace("\\sqrt", "sqrt").replace("{", "(").replace("}", ")").replace("\\pi", "pi").replace("π", "pi").replace("√", "sqrt")
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)  # vírgula decimal
    t = re.sub(r"^\s*[a-z]\s*\(\s*[a-z]\s*\)\s*=", "", t)  # f(x) =
    t = re.sub(r"^\s*[a-z]\s*=", "", t)  # x =
    t = re.sub(r"\s+(reais|metros|cm|m|km|unidades|graus)$", "", t)
    return t.strip()


def interpretar(texto):
    t = limpar(texto)
    if not t or len(t) > 80 or not PERMITIDOS.match(t) or "=" in t or "__" in t:
        return None
    if any(nome not in NOMES for nome in re.findall(r"[a-z]+", t)):
        return None
    try:
        return parse_expr(t, local_dict=LOCAIS, transformations=TRANSFORMACOES, evaluate=True)
    except Exception:
        return None


def casas_decimais(texto):
    """Casas decimais de um número escrito (ex.: '6,28' -> 2); None se não for um número simples."""
    m = re.fullmatch(r"-?\d+(?:\.(\d+))?", limpar(texto))
    return len(m.group(1) or "") if m else None


def equivalentes(a, b):
    ea, eb = interpretar(a), interpretar(b)
    if ea is None or eb is None:
        return None
    try:
        diferenca = simplify(ea - eb)
        if diferenca == 0:
            return True
        if diferenca.free_symbols:
            return False
        # resposta arredondada ("6,28" para 2π): tolerância conforme as casas decimais escritas
        casas = [c for c in (casas_decimais(a), casas_decimais(b)) if c is not None]
        tolerancia = 0.5 * 10 ** (-min(casas)) if casas else 1e-9
        return abs(float(diferenca)) <= tolerancia + 1e-12
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def _responder(self, status, dados):
        corpo = json.dumps(dados).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        segredo = os.environ.get("WORKER_SECRET", "")
        recebido = self.headers.get("x-worker-secret", "")
        if not segredo or not hmac.compare_digest(segredo, recebido):
            return self._responder(401, {"erro": "não autorizado"})
        try:
            tamanho = min(int(self.headers.get("Content-Length", 0)), 50000)
            pares = json.loads(self.rfile.read(tamanho) or b"{}").get("pares", [])[:20]
            resultados = [equivalentes(p.get("a", ""), p.get("b", "")) for p in pares]
            return self._responder(200, {"resultados": resultados})
        except Exception as erro:  # nunca devolve erro 500 com detalhes internos
            return self._responder(400, {"erro": "pedido inválido", "detalhe": type(erro).__name__})
