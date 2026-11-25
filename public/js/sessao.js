// Login do professor (Supabase Auth) e acompanhamento das tarefas em tempo real.
// No modo de demonstração (DB_MEMORIA=1), o login é só um e-mail, sem senha.

import { get, post, definirToken, quandoDeslogar } from './api.js?v=__VERSAO__';
import { el, $, substituir, campo, botao, aviso, janela } from './ui.js?v=__VERSAO__';

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
  // link de "esqueci minha senha" chega com type=recovery no endereço
  const veioDaRecuperacao = /type=recovery/.test(location.hash + location.search);
  let senhaPedida = false;
  const pedirSenha = () => {
    if (senhaPedida) return;
    senhaPedida = true;
    setTimeout(() => abrirDefinirSenha('Criar nova senha'), 0);
  };
  sessao.supabase = createClient(sessao.status.supabase.url, sessao.status.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let pronto = false;
  sessao.supabase.auth.onAuthStateChange((evento, s) => {
    // voltou pelo link de "esqueci minha senha": pede a nova senha
    if (evento === 'PASSWORD_RECOVERY') pedirSenha();
    const antes = sessao.usuario?.id;
    aplicarSessao(s);
    if (pronto && antes !== sessao.usuario?.id) aoMudar();
  });
  const { data } = await sessao.supabase.auth.getSession();
  aplicarSessao(data.session);
  pronto = true;
  if (veioDaRecuperacao && data.session) pedirSenha();
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

/** Mensagens do Supabase Auth em português. */
function traduzirErro(erro) {
  const m = String(erro?.message || erro || '');
  const tabela = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos. Se você sempre entrou pelo link, sua conta ainda não tem senha: use "Esqueci / criar senha".'],
    [/email not confirmed/i, 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos (veja também o spam) ou use "Entrar com link por e-mail".'],
    [/user already registered|already been registered/i, 'Este e-mail já tem conta. Clique em "Entrar" ou, se não lembrar a senha, em "Esqueci / criar senha".'],
    [/rate limit|too many requests|security purposes/i, 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.'],
    [/password should be at least|weak password|password is too weak/i, 'Senha fraca: use pelo menos 6 caracteres, misturando letras e números.'],
    [/signups not allowed|signup is disabled/i, 'O cadastro de novas contas está desativado no Supabase.'],
    [/unable to validate email|invalid email|email address .* is invalid/i, 'E-mail inválido.'],
    [/same password|different from the old/i, 'A nova senha precisa ser diferente da atual.'],
  ];
  const achado = tabela.find(([re]) => re.test(m));
  return new Error(achado ? achado[1] : m || 'Não foi possível concluir. Tente de novo.');
}

/** Janela para criar ou trocar a senha da conta (também usada após "esqueci minha senha"). */
export function abrirDefinirSenha(titulo = 'Definir senha') {
  if (!sessao.supabase) return;
  const nova = el('input', { type: 'password', autocomplete: 'new-password', minlength: 6, placeholder: 'mínimo 6 caracteres' });
  const repetir = el('input', { type: 'password', autocomplete: 'new-password', minlength: 6 });
  const msg = el('p', { classe: 'dica', texto: 'Depois disso você pode entrar com e-mail e senha, sem precisar do link.' });
  const j = janela(titulo, [campo('Nova senha', nova), campo('Repita a senha', repetir), msg], {
    acoes: [
      botao('Cancelar', () => j.fechar()),
      botao('Salvar senha', async () => {
        try {
          if (nova.value.length < 6) throw new Error('Use pelo menos 6 caracteres.');
          if (nova.value !== repetir.value) throw new Error('As senhas não são iguais.');
          const { error } = await sessao.supabase.auth.updateUser({ password: nova.value });
          if (error) throw traduzirErro(error);
          j.fechar();
          aviso('Senha salva! Na próxima vez, entre com e-mail e senha.');
        } catch (erro) {
          msg.textContent = erro.message;
          msg.className = 'erro';
        }
      }, 'botao botao-primario'),
    ],
  });
}

/** Tela de login. */
export function telaLogin(alvo, aoEntrar) {
  const demo = sessao.status?.autenticacao === 'demo';
  const email = el('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'professor@escola.com' });
  const senha = el('input', { type: 'password', autocomplete: 'current-password', minlength: 6, placeholder: 'mínimo 6 caracteres' });
  const mensagem = el('p', { classe: 'dica', role: 'status', 'aria-live': 'polite' });

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
        if (error) throw traduzirErro(error);
        mensagem.textContent = '📬 Enviamos um link de acesso para o seu e-mail.';
        return;
      }
      if (modo === 'esqueci') {
        const { error } = await auth.resetPasswordForEmail(email.value, { redirectTo });
        if (error) throw traduzirErro(error);
        mensagem.textContent = '📬 Enviamos um link para criar uma nova senha. Abra-o neste mesmo navegador (veja também o spam).';
        return;
      }
      if (!senha.value) throw new Error('Informe a senha (ou use "Entrar com link por e-mail").');
      if (modo === 'criar') {
        if (senha.value.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const { data, error } = await auth.signUp({ email: email.value, password: senha.value, options: { emailRedirectTo: redirectTo } });
        if (error) throw traduzirErro(error);
        // o Supabase não acusa erro quando o e-mail já existe: devolve um usuário sem identidades
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error('Este e-mail já tem conta. Clique em "Entrar" ou, se ela foi criada pelo link e ainda não tem senha, em "Esqueci / criar senha".');
        }
        if (!data.session) {
          mensagem.textContent = '📬 Conta criada! Abra o link de confirmação que enviamos ao seu e-mail (veja também o spam) e depois clique em "Entrar".';
          return;
        }
      } else {
        const { error } = await auth.signInWithPassword({ email: email.value, password: senha.value });
        if (error) throw traduzirErro(error);
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
      demo ? null : botao('Esqueci / criar senha', () => entrar('esqueci'), 'botao botao-link'),
    ]),
    mensagem,
    el('p', { classe: 'dica' }, [el('a', { href: 'conheca/', texto: 'Conheça o Proff: o que ele faz e como funciona' })]),
  ]);
  form.addEventListener('submit', (e) => { e.preventDefault(); entrar('senha'); });
  substituir(alvo, form);
  // veio do botão "Criar conta grátis" da página de apresentação
  if (!demo && new URLSearchParams(location.search).has('criar')) {
    mensagem.textContent = 'Para criar sua conta, digite seu e-mail e uma senha (mínimo 6 caracteres) e clique em "Criar conta".';
  }
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
