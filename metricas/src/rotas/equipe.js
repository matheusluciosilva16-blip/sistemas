// Equipe (só administrador) e "Minha conta" (qualquer usuário).

import { Hono } from 'hono';
import { html } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { hashSenha, verificarSenha, problemaNaSenha } from '../lib/seguranca.js';
import { auditar, abrirSessao } from '../lib/acesso.js';
import { exigirAdmin } from '../lib/permissoes.js';

const rotas = new Hono();

// ---------- Equipe ----------

async function telaEquipe(c, { erro = '', ok = '' } = {}) {
  const { results: usuarios } = await c.env.DB.prepare(
    'SELECT id, nome, email, papel, ativo, criado_em FROM usuarios ORDER BY ativo DESC, nome'
  ).all();
  const eu = c.get('usuario');

  return pagina({
    titulo: 'Equipe',
    usuario: eu,
    atual: '/equipe',
    conteudo: html`
      <h1>Equipe</h1>
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      ${ok ? html`<div class="aviso ok" role="status">${ok}</div>` : ''}
      <div class="card tabela"><table>
        <thead><tr><th>Nome</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
        <tbody>${usuarios.map(
          (u) => html`<tr>
            <td>${u.nome}<br><span class="fraco">${u.email}</span></td>
            <td>${u.papel === 'admin' ? 'Administrador' : 'Equipe'}</td>
            <td><span class="etiqueta ${u.ativo ? 'on' : 'off'}">${u.ativo ? 'Ativo' : 'Desativado'}</span></td>
            <td>${
              u.id === eu.id
                ? html`<span class="fraco">você</span>`
                : html`<form method="post" action="/equipe/${u.id}/${u.ativo ? 'desativar' : 'reativar'}">
                    <button class="botao sec mini" type="submit">${u.ativo ? 'Desativar' : 'Reativar'}</button></form>`
            }</td>
          </tr>`
        )}</tbody>
      </table></div>

      <h2>Adicionar pessoa</h2>
      <form method="post" action="/equipe" class="card">
        <label for="nome">Nome</label><input id="nome" name="nome" required>
        <label for="email">E-mail</label><input id="email" name="email" type="email" required>
        <label for="papel">Papel</label>
        <select id="papel" name="papel">
          <option value="equipe">Equipe: registra e consulta leads</option>
          <option value="admin">Administrador: também gerencia equipe e chaves</option>
        </select>
        <label for="senha">Senha inicial (mínimo 10 caracteres)</label>
        <input id="senha" name="senha" type="password" autocomplete="new-password" minlength="10" required>
        <p class="fraco">Passe a senha à pessoa por um canal seguro e peça que ela troque em "Minha conta".</p>
        <button class="botao" type="submit">Adicionar</button>
      </form>`,
  });
}

rotas.get('/equipe', exigirAdmin, async (c) => c.html(await telaEquipe(c)));

rotas.post('/equipe', exigirAdmin, async (c) => {
  const form = await c.req.parseBody();
  const nome = String(form.nome || '').trim();
  const email = String(form.email || '').trim().toLowerCase();
  const papel = form.papel === 'admin' ? 'admin' : 'equipe';
  const senha = String(form.senha || '');

  const problema = !nome || !email.includes('@') ? 'Preencha nome e e-mail.' : problemaNaSenha(senha);
  if (problema) return c.html(await telaEquipe(c, { erro: problema }), 400);

  const existe = await c.env.DB.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(email).first();
  if (existe) return c.html(await telaEquipe(c, { erro: 'Já existe uma conta com esse e-mail.' }), 409);

  const { meta } = await c.env.DB.prepare(
    'INSERT INTO usuarios (nome, email, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(nome, email, await hashSenha(senha), papel, Date.now())
    .run();
  await auditar(c.env.DB, {
    atorTipo: 'usuario',
    atorId: c.get('usuario').id,
    acao: 'usuario_criado',
    detalhe: `id=${meta.last_row_id} papel=${papel}`,
  });
  return c.html(await telaEquipe(c, { ok: `${nome} foi adicionado(a).` }));
});

rotas.post('/equipe/:id/:acao{desativar|reativar}', exigirAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const acao = c.req.param('acao');
  const eu = c.get('usuario');
  if (id === eu.id) return c.html(await telaEquipe(c, { erro: 'Você não pode desativar a própria conta.' }), 400);

  const db = c.env.DB;
  if (acao === 'desativar') {
    // Desativar derruba as sessões abertas: a pessoa perde o acesso na hora.
    await db.batch([
      db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').bind(id),
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id),
    ]);
  } else {
    await db.prepare('UPDATE usuarios SET ativo = 1 WHERE id = ?').bind(id).run();
  }
  await auditar(db, { atorTipo: 'usuario', atorId: eu.id, acao: `usuario_${acao}`, detalhe: `id=${id}` });
  return c.redirect('/equipe');
});

// ---------- Minha conta ----------

function telaConta(c, { erro = '', ok = '' } = {}) {
  const eu = c.get('usuario');
  return pagina({
    titulo: 'Minha conta',
    usuario: eu,
    atual: '/conta',
    conteudo: html`
      <h1>Minha conta</h1>
      <div class="card"><strong>${eu.nome}</strong><br><span class="fraco">${eu.email}</span></div>
      <h2>Trocar senha</h2>
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      ${ok ? html`<div class="aviso ok" role="status">${ok}</div>` : ''}
      <form method="post" action="/conta/senha" class="card">
        <label for="atual">Senha atual</label>
        <input id="atual" name="atual" type="password" autocomplete="current-password" required>
        <label for="nova">Nova senha (mínimo 10 caracteres)</label>
        <input id="nova" name="nova" type="password" autocomplete="new-password" minlength="10" required>
        <p class="fraco">Ao trocar, você sai de todos os outros aparelhos.</p>
        <button class="botao" type="submit">Trocar senha</button>
      </form>`,
  });
}

rotas.get('/conta', (c) => c.html(telaConta(c)));

rotas.post('/conta/senha', async (c) => {
  const eu = c.get('usuario');
  const form = await c.req.parseBody();
  const db = c.env.DB;
  const { senha_hash } = await db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').bind(eu.id).first();

  if (!(await verificarSenha(String(form.atual || ''), senha_hash))) {
    return c.html(telaConta(c, { erro: 'A senha atual está incorreta.' }), 400);
  }
  const problema = problemaNaSenha(String(form.nova || ''));
  if (problema) return c.html(telaConta(c, { erro: problema }), 400);

  await db.batch([
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').bind(await hashSenha(String(form.nova)), eu.id),
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(eu.id),
  ]);
  await abrirSessao(c, eu.id);
  await auditar(db, { atorTipo: 'usuario', atorId: eu.id, acao: 'senha_trocada' });
  return c.html(telaConta(c, { ok: 'Senha trocada.' }));
});

export default rotas;
