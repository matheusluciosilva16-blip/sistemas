// Configurações do CRM (só administrador): listas de classificação, campos personalizados e ajustes.
// Nada é apagado: opções e campos são desativados, para o histórico e as métricas não mudarem.

import { Hono } from 'hono';
import { html } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { exigirAdmin } from '../lib/permissoes.js';
import { auditar } from '../lib/acesso.js';
import {
  carregarConfig, LISTAS_DO_SISTEMA, TIPOS_DE_CAMPO, SECOES, AJUSTES,
  paraIdentificador, chaveValida, opcoesParaSelecao,
} from '../lib/config.js';

const rotas = new Hono();
rotas.use('/configuracoes', exigirAdmin);
rotas.use('/configuracoes/*', exigirAdmin);

const registrar = (c, acao, detalhe) => auditar(c.env.DB, { atorTipo: 'usuario', atorId: c.get('usuario').id, acao, detalhe });
const voltar = (c, ancora, aviso) => c.redirect(`/configuracoes?${aviso ? `aviso=${encodeURIComponent(aviso)}` : 'ok=1'}#${ancora}`);

/** Bloco de edição das opções de uma lista (do sistema ou de um campo personalizado). */
function editorDeLista(campo, titulo, opcoes, { aberto = false } = {}) {
  return html`<details class="card" id="lista-${campo}" ${aberto ? html`open` : ''}>
    <summary><strong style="color:var(--ink)">${titulo}</strong>
      <span class="fraco"> · ${opcoes.filter((o) => o.ativo).length} ativa(s)</span></summary>
    <div class="tabela" style="margin-top:12px"><table>
      <tbody>${opcoes.map(
        (o) => html`<tr>
          <td style="width:100%">
            <form method="post" action="/configuracoes/opcoes/editar" style="display:flex;gap:8px;align-items:center">
              <input type="hidden" name="campo" value="${campo}"><input type="hidden" name="valor" value="${o.valor}">
              <input name="rotulo" value="${o.rotulo}" aria-label="Nome da opção" maxlength="80" required>
              <button class="botao sec mini" type="submit">Salvar</button>
            </form>
            <span class="fraco">código: ${o.valor}</span>
          </td>
          <td>
            <form method="post" action="/configuracoes/opcoes/alternar">
              <input type="hidden" name="campo" value="${campo}"><input type="hidden" name="valor" value="${o.valor}">
              <button class="botao sec mini" type="submit">${o.ativo ? 'Desativar' : 'Reativar'}</button>
            </form>
            ${o.ativo ? '' : html`<span class="etiqueta off" style="margin-top:6px">Desativada</span>`}
          </td>
        </tr>`
      )}</tbody>
    </table></div>
    <form method="post" action="/configuracoes/opcoes/adicionar" style="display:flex;gap:8px;align-items:flex-end;margin-top:12px">
      <input type="hidden" name="campo" value="${campo}">
      <div style="flex:1"><label for="nova-${campo}">Nova opção</label>
        <input id="nova-${campo}" name="rotulo" maxlength="80" required placeholder="Nome da nova opção"></div>
      <button class="botao mini" type="submit" style="min-height:48px">Adicionar</button>
    </form>
  </details>`;
}

rotas.get('/configuracoes', async (c) => {
  const config = await carregarConfig(c.env.DB);
  const aviso = c.req.query('aviso');
  const ok = c.req.query('ok');

  return c.html(
    pagina({
      titulo: 'Configurações',
      usuario: c.get('usuario'),
      atual: '/configuracoes',
      conteudo: html`
        <span class="eyebrow">CRM</span>
        <h1>Configurações</h1>
        <p>Acrescente classificações e campos sem precisar de programador. Nada é apagado:
        o que for desativado some dos formulários, mas continua nos leads antigos e nas métricas.</p>
        ${aviso ? html`<div class="aviso erro" role="alert">${aviso}</div>` : ''}
        ${ok ? html`<div class="aviso ok" role="status">Alteração salva.</div>` : ''}

        <h2 id="ajustes">Ajustes</h2>
        <form method="post" action="/configuracoes/ajustes" class="card">
          <label for="plataforma_padrao">${AJUSTES.plataforma_padrao.rotulo}</label>
          <select id="plataforma_padrao" name="plataforma_padrao">
            <option value="">Nenhuma: deixar "não se sabe"</option>
            ${Object.entries(opcoesParaSelecao(config, 'plataforma', config.ajustes.plataforma_padrao)).map(
              ([v, r]) => html`<option value="${v}" ${v === config.ajustes.plataforma_padrao ? html`selected` : ''}>${r}</option>`
            )}
          </select>
          <p class="fraco">${AJUSTES.plataforma_padrao.ajuda}</p>
          <button class="botao mini" type="submit" style="margin-top:8px">Salvar ajustes</button>
        </form>

        <h2 id="listas">Listas de classificação</h2>
        ${Object.entries(LISTAS_DO_SISTEMA).map(([campo, titulo]) => editorDeLista(campo, titulo, config.listas[campo] || []))}

        <h2 id="campos">Campos personalizados</h2>
        <p class="fraco">Colunas novas no cadastro do lead. Um campo do tipo <strong>lista</strong> vira uma
        classificação nova, com filtro na lista de leads e, nas próximas etapas, recorte nas métricas.</p>
        ${config.campos.length
          ? config.campos.map(
              (cp) => html`<div class="card" id="campo-${cp.chave}">
                <p style="margin:0 0 4px"><strong style="color:var(--ink)">${cp.rotulo}</strong>
                  <span class="etiqueta">${TIPOS_DE_CAMPO[cp.tipo]}</span>
                  ${cp.ativo ? '' : html`<span class="etiqueta off">Desativado</span>`}</p>
                <p class="fraco" style="margin:0">código para a API: <code>${cp.chave}</code></p>
                <form method="post" action="/configuracoes/campos/editar">
                  <input type="hidden" name="chave" value="${cp.chave}">
                  <label for="r-${cp.chave}">Nome</label>
                  <input id="r-${cp.chave}" name="rotulo" value="${cp.rotulo}" maxlength="60" required>
                  <label for="s-${cp.chave}">Aparece na seção</label>
                  <select id="s-${cp.chave}" name="secao">
                    ${Object.entries(SECOES).map(([v, r]) => html`<option value="${v}" ${v === cp.secao ? html`selected` : ''}>${r}</option>`)}
                  </select>
                  <label style="font-weight:400;display:flex;gap:10px;align-items:center">
                    <input type="checkbox" name="na_lista" value="1" ${cp.na_lista ? html`checked` : ''} style="width:22px;min-height:22px">
                    Mostrar na lista de leads${cp.tipo === 'lista' ? ' e usar como filtro' : ''}</label>
                  <button class="botao sec mini" type="submit" style="margin-top:12px">Salvar campo</button>
                </form>
                <form method="post" action="/configuracoes/campos/alternar" style="margin-top:8px">
                  <input type="hidden" name="chave" value="${cp.chave}">
                  <button class="botao sec mini" type="submit">${cp.ativo ? 'Desativar campo' : 'Reativar campo'}</button>
                </form>
                ${cp.tipo === 'lista' ? html`<div style="margin-top:16px">${editorDeLista(cp.chave, `Opções de "${cp.rotulo}"`, config.listas[cp.chave] || [], { aberto: true })}</div>` : ''}
              </div>`
            )
          : html`<p class="fraco">Nenhum campo personalizado ainda.</p>`}

        <form method="post" action="/configuracoes/campos/adicionar" class="card" id="novo-campo">
          <h3>Novo campo</h3>
          <label for="novo-rotulo">Nome do campo</label>
          <input id="novo-rotulo" name="rotulo" maxlength="60" required placeholder="ex.: Tipo de veículo">
          <label for="novo-tipo">Tipo</label>
          <select id="novo-tipo" name="tipo">
            ${Object.entries(TIPOS_DE_CAMPO).map(([v, r]) => html`<option value="${v}">${r}</option>`)}
          </select>
          <label for="novo-secao">Aparece na seção</label>
          <select id="novo-secao" name="secao">
            ${Object.entries(SECOES).map(([v, r]) => html`<option value="${v}" ${v === 'andamento' ? html`selected` : ''}>${r}</option>`)}
          </select>
          <label for="novo-opcoes">Opções iniciais (só para o tipo lista), uma por linha</label>
          <textarea id="novo-opcoes" name="opcoes" rows="4" placeholder="Carro&#10;Moto&#10;Caminhão"></textarea>
          <label style="font-weight:400;display:flex;gap:10px;align-items:center">
            <input type="checkbox" name="na_lista" value="1" style="width:22px;min-height:22px"> Mostrar na lista de leads</label>
          <div class="aviso ouro" style="margin-top:16px">Não crie campo para detalhes do caso, como o que aconteceu,
          o número do processo ou os documentos. Este sistema existe para métricas e precisa guardar o mínimo (LGPD).</div>
          <button class="botao" type="submit" style="margin-top:4px">Criar campo</button>
        </form>`,
    })
  );
});

// ---------- Ajustes ----------

rotas.post('/configuracoes/ajustes', async (c) => {
  const form = await c.req.parseBody();
  const config = await carregarConfig(c.env.DB);
  const valor = String(form.plataforma_padrao || '');
  if (valor && !(config.listas.plataforma || []).some((o) => o.valor === valor && o.ativo)) return voltar(c, 'ajustes', 'Plataforma inválida.');
  await c.env.DB.prepare('INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .bind('plataforma_padrao', valor || null)
    .run();
  await registrar(c, 'ajuste_alterado', `plataforma_padrao=${valor || '(nenhuma)'}`);
  return voltar(c, 'ajustes');
});

// ---------- Opções de listas ----------

/** A lista existe? (do sistema, ou campo personalizado do tipo lista) */
function listaExiste(config, campo) {
  return campo in LISTAS_DO_SISTEMA || config.campos.some((cp) => cp.chave === campo && cp.tipo === 'lista');
}

/** Cria as opções a partir dos nomes, gerando códigos únicos. */
async function inserirOpcoes(db, campo, rotulos, existentes) {
  const usados = new Set(existentes.map((o) => o.valor));
  let ordem = existentes.length;
  const comandos = [];
  for (const r of rotulos) {
    const nome = r.trim().slice(0, 80);
    if (!nome) continue;
    let valor = paraIdentificador(nome) || 'opcao';
    for (let n = 2; usados.has(valor); n++) valor = `${paraIdentificador(nome) || 'opcao'}_${n}`;
    usados.add(valor);
    comandos.push(db.prepare('INSERT INTO opcoes (campo, valor, rotulo, ordem) VALUES (?, ?, ?, ?)').bind(campo, valor, nome, ordem++));
  }
  if (comandos.length) await db.batch(comandos);
  return comandos.length;
}

rotas.post('/configuracoes/opcoes/adicionar', async (c) => {
  const form = await c.req.parseBody();
  const campo = String(form.campo || '');
  const config = await carregarConfig(c.env.DB);
  if (!listaExiste(config, campo)) return voltar(c, 'listas', 'Lista inexistente.');
  const nome = String(form.rotulo || '').trim();
  const existentes = config.listas[campo] || [];
  if (existentes.some((o) => o.rotulo.toLowerCase() === nome.toLowerCase())) return voltar(c, `lista-${campo}`, `Já existe a opção "${nome}".`);
  if (!(await inserirOpcoes(c.env.DB, campo, [nome], existentes))) return voltar(c, `lista-${campo}`, 'Dê um nome à opção.');
  await registrar(c, 'opcao_criada', `${campo}: ${nome}`);
  return voltar(c, `lista-${campo}`);
});

rotas.post('/configuracoes/opcoes/editar', async (c) => {
  const form = await c.req.parseBody();
  const campo = String(form.campo || '');
  const valor = String(form.valor || '');
  const nome = String(form.rotulo || '').trim().slice(0, 80);
  if (!nome) return voltar(c, `lista-${campo}`, 'O nome não pode ficar vazio.');
  const { meta } = await c.env.DB.prepare('UPDATE opcoes SET rotulo = ? WHERE campo = ? AND valor = ?').bind(nome, campo, valor).run();
  if (!meta.changes) return voltar(c, 'listas', 'Opção inexistente.');
  await registrar(c, 'opcao_renomeada', `${campo}.${valor}: ${nome}`);
  return voltar(c, `lista-${campo}`);
});

rotas.post('/configuracoes/opcoes/alternar', async (c) => {
  const form = await c.req.parseBody();
  const campo = String(form.campo || '');
  const valor = String(form.valor || '');
  const config = await carregarConfig(c.env.DB);
  const opcao = (config.listas[campo] || []).find((o) => o.valor === valor);
  if (!opcao) return voltar(c, 'listas', 'Opção inexistente.');
  if (opcao.ativo && config.listas[campo].filter((o) => o.ativo).length === 1) {
    return voltar(c, `lista-${campo}`, 'Uma lista precisa de ao menos uma opção ativa.');
  }
  await c.env.DB.prepare('UPDATE opcoes SET ativo = ? WHERE campo = ? AND valor = ?').bind(opcao.ativo ? 0 : 1, campo, valor).run();
  await registrar(c, opcao.ativo ? 'opcao_desativada' : 'opcao_reativada', `${campo}.${valor}`);
  return voltar(c, `lista-${campo}`);
});

// ---------- Campos personalizados ----------

rotas.post('/configuracoes/campos/adicionar', async (c) => {
  const form = await c.req.parseBody();
  const nome = String(form.rotulo || '').trim().slice(0, 60);
  const tipo = String(form.tipo || '');
  const secao = String(form.secao || 'andamento');
  const config = await carregarConfig(c.env.DB);

  if (!nome) return voltar(c, 'novo-campo', 'Dê um nome ao campo.');
  if (!(tipo in TIPOS_DE_CAMPO)) return voltar(c, 'novo-campo', 'Tipo inválido.');
  if (!(secao in SECOES)) return voltar(c, 'novo-campo', 'Seção inválida.');
  let chave = paraIdentificador(nome);
  if (!/^[a-z]/.test(chave)) chave = `campo_${chave}`;
  if (!chaveValida(chave)) return voltar(c, 'novo-campo', `O nome "${nome}" já é usado pelo sistema. Escolha outro.`);
  if (config.campos.some((cp) => cp.chave === chave)) return voltar(c, 'novo-campo', `Já existe um campo com esse nome.`);

  const opcoes = String(form.opcoes || '').split(/\r?\n/).filter((l) => l.trim());
  if (tipo === 'lista' && !opcoes.length) return voltar(c, 'novo-campo', 'Um campo do tipo lista precisa de ao menos uma opção.');

  await c.env.DB.prepare(
    'INSERT INTO campos_personalizados (chave, rotulo, tipo, secao, na_lista, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(chave, nome, tipo, secao, form.na_lista ? 1 : 0, config.campos.length, Date.now())
    .run();
  if (tipo === 'lista') await inserirOpcoes(c.env.DB, chave, opcoes, []);
  await registrar(c, 'campo_criado', `${chave} (${tipo})`);
  return voltar(c, `campo-${chave}`);
});

rotas.post('/configuracoes/campos/editar', async (c) => {
  const form = await c.req.parseBody();
  const chave = String(form.chave || '');
  const nome = String(form.rotulo || '').trim().slice(0, 60);
  const secao = String(form.secao || '');
  if (!nome) return voltar(c, `campo-${chave}`, 'O nome não pode ficar vazio.');
  if (!(secao in SECOES)) return voltar(c, `campo-${chave}`, 'Seção inválida.');
  const { meta } = await c.env.DB.prepare('UPDATE campos_personalizados SET rotulo = ?, secao = ?, na_lista = ? WHERE chave = ?')
    .bind(nome, secao, form.na_lista ? 1 : 0, chave)
    .run();
  if (!meta.changes) return voltar(c, 'campos', 'Campo inexistente.');
  await registrar(c, 'campo_editado', chave);
  return voltar(c, `campo-${chave}`);
});

rotas.post('/configuracoes/campos/alternar', async (c) => {
  const form = await c.req.parseBody();
  const chave = String(form.chave || '');
  const campo = await c.env.DB.prepare('SELECT ativo FROM campos_personalizados WHERE chave = ?').bind(chave).first();
  if (!campo) return voltar(c, 'campos', 'Campo inexistente.');
  await c.env.DB.prepare('UPDATE campos_personalizados SET ativo = ? WHERE chave = ?').bind(campo.ativo ? 0 : 1, chave).run();
  await registrar(c, campo.ativo ? 'campo_desativado' : 'campo_reativado', chave);
  return voltar(c, `campo-${chave}`);
});

export default rotas;
