"""Testes da comparação exata com SymPy (api/sympy_comparar.py)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from sympy_comparar import equivalentes  # noqa: E402


class TestEquivalentes(unittest.TestCase):
    def test_equivalentes(self):
        for a, b in [("x = -1/2", "-0,5"), ("f(x) = 2x + 3", "2x+3"), ("2(x+1)", "2x+2"), ("\\frac{1}{2}", "0.5"),
                     ("R$ 30,00", "30"), ("x^2-1", "(x-1)(x+1)"), ("sqrt(16)", "4"), ("2π", "6,28"), ("1/3", "0,33")]:
            self.assertIs(equivalentes(a, b), True, (a, b))

    def test_diferentes(self):
        for a, b in [("3", "4"), ("2π", "6,30"), ("1/3", "0,34"), ("2x", "2x+1")]:
            self.assertIs(equivalentes(a, b), False, (a, b))

    def test_entradas_perigosas_ou_texto_livre(self):
        for a in ['__import__("os")', "x.real", "exec(1)", "lambda: 1", "2 maçãs", "x=2 ou x=3", "a" * 200]:
            self.assertIsNone(equivalentes(a, "1"), a)


if __name__ == "__main__":
    unittest.main()
