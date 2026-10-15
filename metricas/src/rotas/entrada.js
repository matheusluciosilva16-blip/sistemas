// Telas de entrada: login, saída e criação do primeiro administrador.

import { Hono } from 'hono';
import { html } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { hashSenha, verificarSenha, problemaNaSenha, igualSeguro } from '../lib/seguranca.js';
import { abrirSessao, fecharSessao, auditar, bloqueado, registrarFalha, limparFalhas } from '../lib/acesso.js';

const rotas = new Hono();

function telaLogin({ erro = '', email = '' } = {}) {
  return pagina({
    titulo: 'Entrar',
    conteudo: html`<div class="estreito">
      <h1>Entrar</h1>
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      <form method="post" action="/entrar" class="card">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required value="${email}">
        <label for="senha">Senha</label>
        <input id="senha" name="senha" type="password" autocomplete="current-password" required>
        <button class="botao" type="submit">Entrar</button>
      </form>
    </div>`,
  });
}

rotas.get('/entrar', async (c) => {
  if (c.get('usuario')) return c.redirect('/painel');
  const { n } = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
  if (n === 0) return c.redirect('/primeiro-acesso');
  return c.html(telaLogin());
});

rotas.post('/entrar', async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email || '').trim().toLowerCase();
  const senha = String(form.senha || '');
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const chaves = [`email:${email}`, `ip:${ip}`];
  const db = c.env.DB;

  if (await bloqueado(db, chaves)) {
    return c.html(telaLogin({ erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.', email }), 429);
  }

  const usuario = await db.prepare('SELECT id, senha_hash, ativo FROM usuarios WHERE email = ?').bind(email).first();
  const senhaOk = usuario ? await verificarSenha(senha, usuario.senha_hash) : false;

  if (!usuario || !senhaOk || !usuario.ativo) {
    await registrarFalha(db, chaves);
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta.
    return c.html(telaLogin({ erro: 'E-mail ou senha incorretos.', email }), 401);
  }

  await limparFalhas(db, `email:${email}`);
  await abrirSessao(c, usuario.id);
  await auditar(db, { atorTipo: 'usuario', atorId: usuario.id, acao: 'login' });
  return c.redirect('/painel');
});

rotas.post('/sair', async (c) => {
  await fecharSessao(c);
  return c.redirect('/entrar');
});

// ---------- Primeiro acesso ----------
// Só funciona enquanto não existe nenhum usuário, e exige a chave de instalação
// configurada no Cloudflare. Sem ela, ninguém de fora consegue se cadastrar antes de você.

function telaPrimeiroAcesso({ erro = '', nome = '', email = '' } = {}) {
  return pagina({
    titulo: 'Primeiro acesso',
    conteudo: html`<div class="estreito">
      <h1>Primeiro acesso</h1>
      <p>Crie a conta de administrador. Esta tela some depois que a primeira conta existir.</p>
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      <form method="post" action="/primeiro-acesso" class="card">
        <label for="chave">Chave de instalação</label>
        <input id="chave" name="chave" type="password" autocomplete="off" required>
        <p class="fraco">É o valor que você cadastrou como CHAVE_INSTALACAO no Cloudflare.</p>
        <label for="nome">Seu nome</label>
        <input id="nome" name="nome" required value="${nome}">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required value="${email}">
        <label for="senha">Senha (mínimo 10 caracteres)</label>
        <input id="senha" name="senha" type="password" autocomplete="new-password" minlength="10" required>
        <button class="botao" type="submit">Criar conta</button>
      </form>
    </div>`,
  });
}

async function existeUsuario(db) {
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
  return n > 0;
}

rotas.get('/primeiro-acesso', async (c) => {
  if (await existeUsuario(c.env.DB)) return c.redirect('/entrar');
  if (!c.env.CHAVE_INSTALACAO) {
    return c.html(
      pagina({
        titulo: 'Configuração pendente',
        conteudo: html`<div class="estreito"><h1>Configuração pendente</h1>
          <div class="aviso ouro">Falta cadastrar o segredo <strong>CHAVE_INSTALACAO</strong> no Cloudflare
          (Worker → Settings → Variables and Secrets). Veja o README, passo 4.</div></div>`,
      }),
      503
    );
  }
  return c.html(telaPrimeiroAcesso());
});

rotas.post('/primeiro-acesso', async (c) => {
  const db = c.env.DB;
  if (await existeUsuario(db)) return c.redirect('/entrar');
  if (!c.env.CHAVE_INSTALACAO) return c.redirect('/primeiro-acesso');

  const form = await c.req.parseBody();
  const nome = String(form.nome || '').trim();
  const email = String(form.email || '').trim().toLowerCase();
  const senha = String(form.senha || '');
  const ip = c.req.header('CF-Connecting-IP') || 'local';

  if (await bloqueado(db, [`ip:${ip}`])) {
    return c.html(telaPrimeiroAcesso({ erro: 'Muitas tentativas. Aguarde 15 minutos.', nome, email }), 429);
  }
  if (!igualSeguro(String(form.chave || ''), c.env.CHAVE_INSTALACAO)) {
    await registrarFalha(db, [`ip:${ip}`]);
    return c.html(telaPrimeiroAcesso({ erro: 'Chave de instalação incorreta.', nome, email }), 401);
  }
  const problema = !nome || !email.includes('@') ? 'Preencha nome e e-mail.' : problemaNaSenha(senha);
  if (problema) return c.html(telaPrimeiroAcesso({ erro: problema, nome, email }), 400);

  const { meta } = await db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash, papel, criado_em) VALUES (?, ?, ?, 'admin', ?)")
    .bind(nome, email, await hashSenha(senha), Date.now())
    .run();
  await auditar(db, { atorTipo: 'usuario', atorId: meta.last_row_id, acao: 'primeiro_admin_criado' });
  await abrirSessao(c, meta.last_row_id);
  return c.redirect('/painel');
});

export default rotas;
