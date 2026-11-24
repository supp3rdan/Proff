// Login do professor (Supabase Auth) e acompanhamento das tarefas em tempo real.
// No modo de demonstração (DB_MEMORIA=1), o login é só um e-mail, sem senha.

import { get, post, definirToken, quandoDeslogar } from './api.js?v=__VERSAO__';
import { el, $, substituir, campo, botao, aviso } from './ui.js?v=__VERSAO__';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const CHAVE_DEMO = 'proff:sessao-demo';

export const sessao = { status: null, usuario: null, supabase: null };

function lerDemo() {
  try { return JSON.parse(localStorage.getItem(CHAVE_DEMO)); } catch { return null; }
}

/** Descobre o modo do servidor e restaura o login. Resolve true se logado. */
export async function iniciarSessao(aoMudar) {
  sessao.status = await get('status');
  quandoDeslogar(() => sair().then(aoMudar));

  if (sessao.status.autenticacao === 'demo') {
    const salvo = lerDemo();
    if (salvo?.token) {
      definirToken(salvo.token);
      sessao.usuario = salvo.usuario;
    }
    return Boolean(sessao.usuario);
  }

  const { createClient } = await import(SUPABASE_JS);
  sessao.supabase = createClient(sessao.status.supabase.url, sessao.status.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await sessao.supabase.auth.getSession();
  aplicarSessao(data.session);
  sessao.supabase.auth.onAuthStateChange((_evento, s) => {
    const antes = sessao.usuario?.id;
    aplicarSessao(s);
    if (antes !== sessao.usuario?.id) aoMudar();
  });
  return Boolean(sessao.usuario);
}

function aplicarSessao(s) {
  definirToken(s?.access_token || null);
  sessao.usuario = s?.user ? { id: s.user.id, email: s.user.email } : null;
}

export async function sair() {
  if (sessao.supabase) await sessao.supabase.auth.signOut().catch(() => {});
  try { localStorage.removeItem(CHAVE_DEMO); } catch { /* sem armazenamento */ }
  definirToken(null);
  sessao.usuario = null;
}

/** Tela de login. */
export function telaLogin(alvo, aoEntrar) {
  const demo = sessao.status?.autenticacao === 'demo';
  const email = el('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'professor@escola.com' });
  const senha = el('input', { type: 'password', autocomplete: 'current-password', minlength: 6, placeholder: 'mínimo 6 caracteres' });
  const mensagem = el('p', { classe: 'dica' });

  const entrar = async (modo) => {
    mensagem.textContent = '';
    mensagem.className = 'dica';
    try {
      if (!email.value) throw new Error('Informe o e-mail.');
      if (demo) {
        const r = await post('login-demo', { email: email.value });
        localStorage.setItem(CHAVE_DEMO, JSON.stringify(r));
        definirToken(r.token);
        sessao.usuario = r.usuario;
        return aoEntrar();
      }
      const auth = sessao.supabase.auth;
      const redirectTo = `${location.origin}${location.pathname}`;
      if (modo === 'link') {
        const { error } = await auth.signInWithOtp({ email: email.value, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        mensagem.textContent = '📬 Enviamos um link de acesso para o seu e-mail.';
        return;
      }
      if (!senha.value) throw new Error('Informe a senha (ou use "Entrar com link por e-mail").');
      if (modo === 'criar') {
        const { data, error } = await auth.signUp({ email: email.value, password: senha.value, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) {
          mensagem.textContent = '📬 Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.';
          return;
        }
      } else {
        const { error } = await auth.signInWithPassword({ email: email.value, password: senha.value });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      }
      aoEntrar();
    } catch (erro) {
      mensagem.textContent = erro.message;
      mensagem.className = 'erro';
    }
  };

  const form = el('form', { classe: 'cartao login' }, [
    el('h2', { texto: 'Entrar no Proff' }),
    el('p', { classe: 'dica', texto: demo
      ? 'Modo de demonstração: informe qualquer e-mail para testar (nada é salvo de verdade).'
      : 'Suas aulas, turmas e avaliações ficam salvas na sua conta.' }),
    campo('E-mail', email),
    demo ? null : campo('Senha', senha),
    el('div', { classe: 'acoes acoes-esquerda' }, [
      el('button', { type: 'submit', classe: 'botao botao-primario', texto: 'Entrar' }),
      demo ? null : botao('Criar conta', () => entrar('criar')),
      demo ? null : botao('Entrar com link por e-mail', () => entrar('link'), 'botao botao-link'),
    ]),
    mensagem,
  ]);
  form.addEventListener('submit', (e) => { e.preventDefault(); entrar('senha'); });
  substituir(alvo, form);
  email.focus();
}

/**
 * Acompanha uma tarefa até terminar: tempo real (Supabase) + consulta a cada 3 s.
 * Chama aoAtualizar(tarefa) a cada mudança. Devolve uma função para parar.
 */
export function acompanharTarefa(tarefaId, aoAtualizar) {
  let parado = false;
  let canal = null;
  let ultimo = '';
  const entregar = (t) => {
    if (parado || !t) return;
    const assinatura = JSON.stringify([t.status, t.etapas]);
    if (assinatura === ultimo) return;
    ultimo = assinatura;
    aoAtualizar(t);
    if (['pronta', 'erro'].includes(t.status)) parar();
  };
  const consultar = async () => {
    if (parado) return;
    try {
      entregar((await get(`tarefas/${tarefaId}`)).tarefa);
    } catch (erro) {
      aviso(erro.message, 'erro');
    }
  };
  const intervalo = setInterval(consultar, 3000);
  consultar();
  if (sessao.supabase) {
    canal = sessao.supabase
      .channel(`tarefa-${tarefaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tarefas', filter: `id=eq.${tarefaId}` }, (p) => entregar(p.new))
      .subscribe();
  }
  function parar() {
    parado = true;
    clearInterval(intervalo);
    if (canal) sessao.supabase.removeChannel(canal);
  }
  return parar;
}

export function nomeUsuario() {
  return sessao.usuario?.email?.split('@')[0] || '';
}

export { $ };
