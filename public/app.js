// Proff: aplicativo do professor (versão com servidor na Vercel e banco no Supabase).
// Navegação por rotas no endereço (#/aulas, #/aula/<id>, ...).

import { iniciarSessao, telaLogin, sair, sessao, nomeUsuario } from './js/sessao.js?v=__VERSAO__';
import { el, $, substituir, botao, aviso, mostrarErro } from './js/ui.js?v=__VERSAO__';
import { telaAula } from './js/views/aula.js?v=__VERSAO__';
import {
  telaNovaAula, telaAulas, telaTurmas, telaPainelTurma, telaBimestre, telaSequencia, telaBanco, telaComunidade,
} from './js/views/listas.js?v=__VERSAO__';

const app = $('#app');
const menu = $('#menu');
let sairDaTela = null; // limpeza da tela atual (ex.: parar de acompanhar tarefas)
let preenchimento = null; // dados para "nova aula" vindos do bimestre

const ITENS_MENU = [
  ['#/nova', 'Nova aula'],
  ['#/aulas', 'Minhas aulas'],
  ['#/bimestre', 'Bimestre'],
  ['#/turmas', 'Turmas'],
  ['#/banco', 'Banco de questões'],
  ['#/comunidade', 'Comunidade'],
];

const ctx = {
  navegar: (hash) => { location.hash = hash; },
  novaAulaDe: (dados) => { preenchimento = dados; location.hash = '#/nova'; },
};

function desenharMenu() {
  if (!sessao.usuario) return substituir(menu);
  const secao = location.hash.split('/')[1] || 'aulas';
  const atual = `#/${{ aula: 'aulas', turma: 'turmas', sequencia: 'bimestre' }[secao] || secao}`;
  substituir(menu,
    el('nav', { classe: 'menu-principal', 'aria-label': 'Menu' }, ITENS_MENU.map(([href, texto]) =>
      el('a', { href, texto, classe: atual === href ? 'ativo' : '' }))),
    el('div', { classe: 'usuario' }, [
      el('span', { classe: 'meta', texto: nomeUsuario() }),
      botao('Sair', async () => { await sair(); history.replaceState(null, '', '#/aulas'); rotear(); }, 'botao botao-pequeno'),
    ])
  );
}

async function rotear() {
  sairDaTela?.();
  sairDaTela = null;
  desenharMenu();
  if (!sessao.usuario) return telaLogin(app, () => { location.hash = location.hash || '#/aulas'; rotear(); });

  const [, rota, parametro] = (location.hash || '#/aulas').split('/');
  window.scrollTo(0, 0);
  try {
    switch (rota) {
      case 'nova': {
        const dados = preenchimento || {};
        preenchimento = null;
        return await telaNovaAula(app, ctx, dados);
      }
      case 'aula':
        sairDaTela = await telaAula(app, parametro, ctx);
        return;
      case 'turmas':
        return await telaTurmas(app);
      case 'turma':
        return await telaPainelTurma(app, parametro);
      case 'bimestre':
        return await telaBimestre(app);
      case 'sequencia':
        sairDaTela = await telaSequencia(app, parametro, ctx);
        return;
      case 'banco':
        return await telaBanco(app);
      case 'comunidade':
        return await telaComunidade(app, ctx);
      default:
        return await telaAulas(app);
    }
  } catch (erro) {
    mostrarErro(app, erro);
  }
}

// impressão: só o documento escolhido (plano, prova ou gabarito)
window.addEventListener('afterprint', () => delete document.body.dataset.imprimir);
window.addEventListener('hashchange', rotear);

(async () => {
  try {
    await iniciarSessao(rotear);
    const s = sessao.status;
    $('#status-provedores').textContent = s.provedores.length ? `IA: ${s.provedores.join(' → ')}` : 'IA não configurada';
    $('#status-provedores').classList.toggle('status-alerta', !s.provedores.length);
    if (s.autenticacao === 'demo') $('#faixa-demo').hidden = false;
  } catch (erro) {
    aviso('Não foi possível falar com o servidor.', 'erro');
    return mostrarErro(app, new Error(`O servidor do Proff não respondeu (${erro.message}). Confira a configuração da Vercel.`));
  }
  rotear();
})();
