// Chaves de API (só administrador): criar, listar e revogar.

import { Hono } from 'hono';
import { html, dataHora } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { ESCOPOS, criarChave, auditar } from '../lib/acesso.js';
import { exigirAdmin } from '../lib/permissoes.js';

const rotas = new Hono();
rotas.use('/chaves', exigirAdmin);
rotas.use('/chaves/*', exigirAdmin);

async function telaChaves(c, { erro = '', novaChave = '', nomeNova = '' } = {}) {
  const { results: chaves } = await c.env.DB.prepare(
    'SELECT id, nome, prefixo, escopos, criado_em, ultimo_uso, revogada_em FROM chaves_api ORDER BY revogada_em IS NOT NULL, criado_em DESC'
  ).all();
  const origem = new URL(c.req.url).origin;

  return pagina({
    titulo: 'Chaves de API',
    usuario: c.get('usuario'),
    atual: '/chaves',
    conteudo: html`
      <h1>Chaves de API</h1>
      <p>Cada sistema que alimenta o CRM (como a Naia) recebe a sua própria chave.
      Se uma chave vazar, revogue e crie outra. As demais continuam funcionando.</p>

      ${novaChave
        ? html`<div class="aviso ouro" role="status">
            <strong>Chave "${nomeNova}" criada.</strong> Copie agora: ela não será mostrada de novo.
            <p class="segredo">${novaChave}</p>
            <p class="fraco">Guarde no <code>.env</code> da agente, nunca no GitHub. Teste com:<br>
            <code>curl -H "Authorization: Bearer SUA_CHAVE" ${origem}/api/v1/status</code></p>
          </div>`
        : ''}
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}

      <div class="card tabela"><table>
        <thead><tr><th>Nome</th><th>Permissões</th><th>Último uso</th><th></th></tr></thead>
        <tbody>${
          chaves.length
            ? chaves.map(
                (k) => html`<tr>
                  <td>${k.nome}<br><span class="fraco">${k.prefixo}… · criada ${dataHora(k.criado_em)}</span></td>
                  <td>${k.escopos.split(',').map((e) => html`<span class="etiqueta">${ESCOPOS[e] || e}</span> `)}</td>
                  <td class="fraco">${k.ultimo_uso ? html`Usada em ${dataHora(k.ultimo_uso)}` : 'Nunca usada'}</td>
                  <td>${
                    k.revogada_em
                      ? html`<span class="etiqueta off">Revogada</span>`
                      : html`<form method="post" action="/chaves/${k.id}/revogar">
                          <button class="botao sec mini" type="submit">Revogar</button></form>`
                  }</td>
                </tr>`
              )
            : html`<tr><td colspan="4" class="fraco">Nenhuma chave criada ainda.</td></tr>`
        }</tbody>
      </table></div>

      <h2>Nova chave</h2>
      <form method="post" action="/chaves" class="card">
        <label for="nome">Nome (para você reconhecer)</label>
        <input id="nome" name="nome" placeholder="ex.: Naia" required maxlength="60">
        <fieldset style="border:0;padding:0;margin:12px 0 0">
          <legend style="font-weight:600;color:var(--texto)">Permissões</legend>
          ${Object.entries(ESCOPOS).map(
            ([id, rotulo]) => html`<label style="font-weight:400;display:flex;gap:10px;align-items:center">
              <input type="checkbox" name="escopos" value="${id}" checked style="width:22px;min-height:22px"> ${rotulo}</label>`
          )}
        </fieldset>
        <button class="botao" type="submit">Criar chave</button>
      </form>`,
  });
}

rotas.get('/chaves', async (c) => c.html(await telaChaves(c)));

rotas.post('/chaves', async (c) => {
  const form = await c.req.parseBody({ all: true });
  const nome = String(form.nome || '').trim().slice(0, 60);
  const marcados = [].concat(form.escopos || []).map(String).filter((e) => e in ESCOPOS);
  if (!nome) return c.html(await telaChaves(c, { erro: 'Dê um nome à chave.' }), 400);
  if (!marcados.length) return c.html(await telaChaves(c, { erro: 'Marque ao menos uma permissão.' }), 400);

  const eu = c.get('usuario');
  const chave = await criarChave(c.env.DB, { nome, escopos: marcados, criadoPor: eu.id });
  await auditar(c.env.DB, { atorTipo: 'usuario', atorId: eu.id, acao: 'chave_criada', detalhe: nome });
  // A chave aparece só nesta resposta. Não fica em cache do navegador.
  c.header('Cache-Control', 'no-store');
  return c.html(await telaChaves(c, { novaChave: chave, nomeNova: nome }));
});

rotas.post('/chaves/:id/revogar', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE chaves_api SET revogada_em = ? WHERE id = ? AND revogada_em IS NULL')
    .bind(Date.now(), id)
    .run();
  await auditar(c.env.DB, { atorTipo: 'usuario', atorId: c.get('usuario').id, acao: 'chave_revogada', detalhe: `id=${id}` });
  return c.redirect('/chaves');
});

export default rotas;
