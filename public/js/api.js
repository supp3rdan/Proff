// Chamadas ao backend (/v1/...). O token de login vai no cabeçalho Authorization.

let token = null;
let aoDeslogar = () => {};

export function definirToken(novo) {
  token = novo;
}
export function quandoDeslogar(fn) {
  aoDeslogar = fn;
}

export async function api(metodo, rota, corpo) {
  const resposta = await fetch(`/v1/${rota}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && rota !== 'login-demo') aoDeslogar();
  if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
  return dados;
}

export const get = (rota) => api('GET', rota);
export const post = (rota, corpo = {}) => api('POST', rota, corpo);
export const patch = (rota, corpo = {}) => api('PATCH', rota, corpo);
export const del = (rota) => api('DELETE', rota);
