// Ponto de entrada do sistema de métricas.
// Organiza as rotas e aplica as proteções que valem para todas as telas.

import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { html } from './lib/html.js';
import { pagina } from './lib/layout.js';
import { usuarioDaSessao } from './lib/acesso.js';
import { exigirLogin } from './lib/permissoes.js';
import entrada from './rotas/entrada.js';
import equipe from './rotas/equipe.js';
import chaves from './rotas/chaves.js';
import api from './rotas/api.js';
import leads from './rotas/leads.js';
import configuracoes from './rotas/configuracoes.js';

const app = new Hono();

// Cabeçalhos de segurança em toda resposta.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'");
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-cache');
});

// A API usa chave, não cookie: fica fora da proteção de formulário e da sessão.
app.route('/api/v1', api);
app.all('/api/*', (c) => c.json({ erro: 'nao_encontrado', mensagem: 'Rota da API inexistente.' }, 404));

// Formulários só são aceitos se vierem do próprio site (bloqueia ataque CSRF).
app.use('*', csrf());

// Descobre quem está logado, para todas as telas.
app.use('*', async (c, next) => {
  c.set('usuario', await usuarioDaSessao(c));
  await next();
});

app.get('/', (c) => c.redirect(c.get('usuario') ? '/painel' : '/entrar'));
app.route('/', entrada);

// Daqui para baixo, só com login.
app.use('*', exigirLogin);

app.get('/painel', async (c) => {
  const usuario = c.get('usuario');
  const aguardando = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM leads_com_etapa WHERE etapa = 'novo' AND anonimizado_em IS NULL"
  ).first('n');
  return c.html(
    pagina({
      titulo: 'Painel',
      usuario,
      atual: '/painel',
      conteudo: html`
        <h1>Olá, ${usuario.nome.split(' ')[0]}</h1>
        ${aguardando
          ? html`<a class="aviso ouro" style="display:block;text-decoration:none" href="/leads?etapa=novo">
              <strong>${aguardando} lead(s) aguardando o primeiro atendimento →</strong></a>`
          : ''}
        <div class="aviso ouro">O sistema está em construção. Já funcionam: acesso da equipe, chaves de API e o <strong>CRM</strong> (etapa 2).</div>
        <div class="card">
          <h2 style="margin-top:0">Etapas</h2>
          <ol>
            <li>Base: login, equipe e chaves de API ✓</li>
            <li><strong>CRM: registro de leads e API para a Naia</strong> ✓</li>
            <li>Importação de CSV do Google Ads e do Meta Ads</li>
            <li>CAC, ROAS e painel com funil</li>
            <li>Diagnóstico automático</li>
            <li>Coleta automática pelas APIs</li>
            <li>Alertas semanais</li>
          </ol>
        </div>`,
    })
  );
});

app.route('/', leads);
app.route('/', configuracoes);
app.route('/', equipe);
app.route('/', chaves);

app.notFound((c) =>
  c.html(pagina({ titulo: 'Não encontrado', usuario: c.get('usuario'), conteudo: html`<h1>Página não encontrada</h1><p><a href="/painel">Voltar ao painel</a></p>` }), 404)
);

app.onError((erro, c) => {
  // Recusas previstas (ex.: formulário enviado de fora do site) não são erro do sistema.
  if (erro instanceof HTTPException) return c.text('Requisição recusada.', erro.status);
  console.error(erro);
  if (c.req.path.startsWith('/api/')) return c.json({ erro: 'erro_interno', mensagem: 'Erro inesperado.' }, 500);
  return c.html(pagina({ titulo: 'Erro', conteudo: html`<h1>Algo deu errado</h1><p>Tente de novo em instantes.</p>` }), 500);
});

export default app;
