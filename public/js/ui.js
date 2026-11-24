// Utilidades de interface: criação de elementos, avisos, janelas e formatação.
// Todo texto entra por textContent (nunca innerHTML).

export { el, anexar, renderizarMatematica } from '../slides-render.js?v=mwvaocy';
import { el, anexar } from '../slides-render.js?v=mwvaocy';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function substituir(alvo, ...itens) {
  alvo.replaceChildren();
  anexar(alvo, ...itens);
  return alvo;
}

export function botao(texto, aoClicar, classe = 'botao') {
  const b = el('button', { type: 'button', classe, texto });
  if (aoClicar) b.addEventListener('click', aoClicar);
  return b;
}

/** Aviso rápido no canto da tela. */
export function aviso(mensagem, tipo = 'ok') {
  const caixa = el('div', { classe: `toast toast-${tipo}`, texto: mensagem, role: 'status' });
  document.body.append(caixa);
  setTimeout(() => caixa.classList.add('saindo'), 3200);
  setTimeout(() => caixa.remove(), 3700);
}

/** Janela modal simples. Devolve { fechar, corpo }. */
export function janela(titulo, conteudo, { acoes = [], larga = false } = {}) {
  const fundo = el('div', { classe: 'modal-fundo' });
  const fechar = () => fundo.remove();
  const caixa = el('div', { classe: `modal ${larga ? 'modal-larga' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo }, [
    el('div', { classe: 'modal-topo' }, [el('h2', { texto: titulo }), botao('✕', fechar, 'botao-icone')]),
    el('div', { classe: 'modal-corpo' }, conteudo),
    acoes.length ? el('div', { classe: 'modal-acoes' }, acoes) : null,
  ]);
  fundo.append(caixa);
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
  });
  document.body.append(fundo);
  caixa.querySelector('input, textarea, select, button.botao-primario')?.focus();
  return { fechar, corpo: caixa };
}

/** Confirmação em janela. Resolve true/false. */
export function confirmar(mensagem, textoOk = 'Confirmar') {
  return new Promise((resolve) => {
    const j = janela('Confirmar', [el('p', { texto: mensagem })], {
      acoes: [
        botao('Cancelar', () => { j.fechar(); resolve(false); }),
        botao(textoOk, () => { j.fechar(); resolve(true); }, 'botao botao-primario'),
      ],
    });
  });
}

/** Pergunta um texto opcional (ex.: "o que mudar neste slide?"). Resolve string ou null. */
export function perguntar(titulo, rotulo, { placeholder = '', textoOk = 'OK' } = {}) {
  return new Promise((resolve) => {
    const campo = el('textarea', { rows: 3, placeholder, maxlength: 500 });
    const j = janela(titulo, [el('label', { classe: 'campo' }, [el('span', { texto: rotulo }), campo])], {
      acoes: [
        botao('Cancelar', () => { j.fechar(); resolve(null); }),
        botao(textoOk, () => { j.fechar(); resolve(campo.value.trim()); }, 'botao botao-primario'),
      ],
    });
  });
}

export function campo(rotulo, controle, dica) {
  return el('label', { classe: 'campo' }, [el('span', { texto: rotulo }), controle, dica ? el('small', { classe: 'dica', texto: dica }) : null]);
}

export function seletor(opcoes, valor) {
  const s = el('select');
  for (const [v, t] of opcoes) s.append(el('option', { value: v, texto: t, selected: String(v) === String(valor ?? '') ? 'selected' : null }));
  return s;
}

export const NIVEIS = [['regular', 'Regular'], ['reforco', 'Reforço'], ['avancado', 'Avançado'], ['inclusao', 'Inclusão (DUA)']];
export const rotuloNivel = (n) => (NIVEIS.find(([v]) => v === n) || NIVEIS[0])[1];

export const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

export function carregando(texto = 'Carregando…') {
  return el('p', { classe: 'vazio', texto });
}

/** Mostra o erro na área indicada (sem travar a tela). */
export function mostrarErro(alvo, erro) {
  substituir(alvo, el('p', { classe: 'erro', texto: erro?.message || String(erro) }));
}
