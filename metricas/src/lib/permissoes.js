// Porteiros das rotas: quem pode entrar onde.

import { chaveDaRequisicao } from './acesso.js';

/** Exige usuário logado. Sem login, manda para a tela de entrada. */
export async function exigirLogin(c, next) {
  if (!c.get('usuario')) return c.redirect('/entrar');
  await next();
}

/** Exige administrador. */
export async function exigirAdmin(c, next) {
  const usuario = c.get('usuario');
  if (!usuario) return c.redirect('/entrar');
  if (usuario.papel !== 'admin') return c.text('Acesso restrito ao administrador.', 403);
  await next();
}

/** Exige chave de API válida. Com escopo, exige também a permissão correspondente. */
export function exigirChave(escopo) {
  return async (c, next) => {
    const chave = await chaveDaRequisicao(c);
    if (!chave) return c.json({ erro: 'chave_invalida', mensagem: 'Chave de API ausente, inválida ou revogada.' }, 401);
    if (escopo && !chave.escopos.includes(escopo)) {
      return c.json({ erro: 'sem_permissao', mensagem: `Esta chave não tem o escopo "${escopo}".` }, 403);
    }
    c.set('chave', chave);
    await next();
  };
}
