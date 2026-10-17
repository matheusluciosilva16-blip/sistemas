// Telas do CRM: lista de leads, cadastro, edição e exclusão a pedido (LGPD).
// As listas de opções e os campos personalizados vêm das Configurações (src/lib/config.js).

import { Hono } from 'hono';
import { html, dataHora } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { ETAPAS, ErroDeDados, valorCampoData, telefoneLegivel, lerData, reais } from '../lib/leads.js';
import { carregarConfig, opcoesParaSelecao, rotulo, SECOES } from '../lib/config.js';
import { criarLead, atualizarLead, buscarLead, listarLeads, anonimizarLead, apagarLead } from '../lib/repo-leads.js';
import { exigirAdmin } from '../lib/permissoes.js';

const rotas = new Hono();
const ator = (c) => ({ tipo: 'usuario', id: c.get('usuario').id });

// ---------- Pedaços de formulário ----------

function campoSelect(nome, rotuloCampo, opcoes, valor, { vazio = '—' } = {}) {
  return html`<label for="${nome}">${rotuloCampo}</label>
    <select id="${nome}" name="${nome}">
      <option value="">${vazio}</option>
      ${Object.entries(opcoes).map(([v, r]) => html`<option value="${v}" ${String(valor ?? '') === v ? html`selected` : ''}>${r}</option>`)}
    </select>`;
}

function campoTexto(nome, rotuloCampo, valor, extra = {}) {
  return html`<label for="${nome}">${rotuloCampo}</label>
    <input id="${nome}" name="${nome}" value="${valor ?? ''}" type="${extra.tipo || 'text'}"
      ${extra.inputmode ? html`inputmode="${extra.inputmode}"` : ''} ${extra.placeholder ? html`placeholder="${extra.placeholder}"` : ''}
      ${extra.maxlength ? html`maxlength="${extra.maxlength}"` : ''}>`;
}

const campoData = (nome, rotuloCampo, ms) =>
  html`<label for="${nome}">${rotuloCampo}</label><input id="${nome}" name="${nome}" type="datetime-local" value="${valorCampoData(ms)}">`;

const SIM_NAO = { 1: 'Sim', 0: 'Não' };
const ENCERRADOS = ['contrato', 'perdido', 'desqualificado'];
const dinheiroNoCampo = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

/** Lista do sistema como select, com as opções ativas (e a atual, se desativada). */
const lista = (config, campo, rotuloCampo, valor, op) => campoSelect(campo, rotuloCampo, opcoesParaSelecao(config, campo, valor), valor, op);

/** Campo personalizado no formulário, conforme o tipo. O nome no form é "x_<chave>". */
function campoExtra(config, cp, valor) {
  const nome = `x_${cp.chave}`;
  switch (cp.tipo) {
    case 'lista': return campoSelect(nome, cp.rotulo, opcoesParaSelecao(config, cp.chave, valor), valor);
    case 'sim_nao': return campoSelect(nome, cp.rotulo, SIM_NAO, valor, { vazio: 'Não informado' });
    case 'data': return campoData(nome, cp.rotulo, valor);
    case 'dinheiro': return campoTexto(nome, `${cp.rotulo} (R$)`, dinheiroNoCampo(valor), { inputmode: 'decimal', placeholder: '0,00' });
    case 'numero': return campoTexto(nome, cp.rotulo, valor, { inputmode: 'decimal' });
    default: return campoTexto(nome, cp.rotulo, valor, { maxlength: 200 });
  }
}

/** Valor de campo personalizado em texto, para a lista. */
function extraLegivel(config, cp, valor) {
  if (valor == null) return null;
  if (cp.tipo === 'lista') return rotulo(config, cp.chave, valor);
  if (cp.tipo === 'sim_nao') return valor ? 'Sim' : 'Não';
  if (cp.tipo === 'dinheiro') return reais(valor);
  if (cp.tipo === 'data') return dataHora(valor);
  return String(valor);
}

function etiquetaEtapa(etapa) {
  const cor = { contrato: 'on', perdido: 'off', desqualificado: 'off', nao_compareceu: 'off' }[etapa] || '';
  return html`<span class="etiqueta ${cor}">${ETAPAS[etapa] || etapa}</span>`;
}

/** Tempo entre a entrada e o 1º atendimento, em texto curto. */
export function tempoDeResposta(lead) {
  if (!lead.primeiro_atendimento_em) return null;
  const min = Math.round((lead.primeiro_atendimento_em - lead.entrada_em) / 60000);
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.round(min / 1440)} dias`;
}

async function membrosAtivos(db) {
  const { results } = await db.prepare('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome').all();
  return Object.fromEntries(results.map((u) => [String(u.id), u.nome]));
}

// ---------- Lista ----------

rotas.get('/leads', async (c) => {
  const q = c.req.query();
  const config = await carregarConfig(c.env.DB);
  const naLista = config.campos.filter((cp) => cp.ativo && cp.na_lista);
  const filtrosExtras = naLista.filter((cp) => cp.tipo === 'lista');
  const valida = (campo, v) => (config.listas[campo] || []).some((o) => o.valor === v);

  let erro = '';
  let filtro = {};
  try {
    filtro = {
      etapa: q.etapa in ETAPAS ? q.etapa : null,
      area: valida('area', q.area) ? q.area : null,
      plataforma: valida('plataforma', q.plataforma) ? q.plataforma : null,
      busca: q.busca?.trim() || null,
      desde: q.desde ? lerData(q.desde) : null,
      ate: q.ate ? lerData(q.ate) + 24 * 3600 * 1000 : null, // "até" inclui o dia inteiro
      extras: Object.fromEntries(filtrosExtras.filter((cp) => valida(cp.chave, q[`x_${cp.chave}`])).map((cp) => [cp.chave, q[`x_${cp.chave}`]])),
      pagina: q.pagina,
    };
  } catch (e) {
    erro = e.message;
  }
  const r = await listarLeads(c.env.DB, filtro);
  const paginas = Math.max(Math.ceil(r.total / r.porPagina), 1);
  const linkPagina = (n) => `/leads?${new URLSearchParams({ ...q, pagina: n })}`;
  const filtrando = Object.entries(q).some(([k, v]) => v && !['pagina', 'apagado'].includes(k));

  return c.html(
    pagina({
      titulo: 'Leads',
      usuario: c.get('usuario'),
      atual: '/leads',
      conteudo: html`
        <span class="eyebrow">CRM</span>
        <h1>Leads</h1>
        <a class="botao" href="/leads/novo" style="margin:0 0 16px">+ Novo lead</a>
        ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
        ${q.apagado ? html`<div class="aviso ok" role="status">Lead apagado.</div>` : ''}
        <details class="card" ${filtrando ? html`open` : ''}>
          <summary style="font-weight:600;color:var(--ink)">Filtrar</summary>
          <form method="get" action="/leads">
            ${campoTexto('busca', 'Nome ou telefone', q.busca)}
            ${campoSelect('etapa', 'Etapa', ETAPAS, q.etapa, { vazio: 'Todas' })}
            ${campoSelect('area', 'Área', opcoesParaSelecao(config, 'area'), q.area, { vazio: 'Todas' })}
            ${campoSelect('plataforma', 'Plataforma', opcoesParaSelecao(config, 'plataforma'), q.plataforma, { vazio: 'Todas' })}
            ${filtrosExtras.map((cp) => campoSelect(`x_${cp.chave}`, cp.rotulo, opcoesParaSelecao(config, cp.chave), q[`x_${cp.chave}`], { vazio: 'Todos' }))}
            <label for="desde">Entrada a partir de</label><input id="desde" name="desde" type="date" value="${q.desde || ''}">
            <label for="ate">Entrada até</label><input id="ate" name="ate" type="date" value="${q.ate || ''}">
            <button class="botao" type="submit">Aplicar</button> <a href="/leads" class="fraco" style="margin-left:12px">Limpar</a>
          </form>
        </details>

        <p class="fraco">${r.total} lead(s)</p>
        <div class="card tabela"><table>
          <thead><tr><th>Lead</th><th>Etapa</th><th>Entrada</th><th>Origem</th>${naLista.length ? html`<th>Outros</th>` : ''}<th>1ª resposta</th></tr></thead>
          <tbody>${
            r.leads.length
              ? r.leads.map(
                  (l) => html`<tr>
                    <td><a href="/leads/${l.id}"><strong>${l.nome || (l.anonimizado_em ? 'Anonimizado' : 'Sem nome')}</strong></a><br>
                      <span class="fraco">${telefoneLegivel(l.telefone)}</span></td>
                    <td>${etiquetaEtapa(l.etapa)}</td>
                    <td class="fraco">${dataHora(l.entrada_em)}</td>
                    <td class="fraco">${[rotulo(config, 'plataforma', l.plataforma), rotulo(config, 'area', l.area)].filter(Boolean).join(' · ') || '—'}</td>
                    ${naLista.length
                      ? html`<td class="fraco">${naLista
                          .map((cp) => [cp.rotulo, extraLegivel(config, cp, l.extras[cp.chave])])
                          .filter(([, v]) => v != null)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}</td>`
                      : ''}
                    <td class="fraco">${
                      tempoDeResposta(l)
                        ? `Respondido em ${tempoDeResposta(l)}`
                        : ENCERRADOS.includes(l.etapa) ? '—' : html`<span style="color:var(--gold)">Aguardando</span>`
                    }</td>
                  </tr>`
                )
              : html`<tr><td colspan="6" class="fraco">Nenhum lead encontrado.</td></tr>`
          }</tbody>
        </table></div>
        ${paginas > 1
          ? html`<p>${r.pagina > 1 ? html`<a href="${linkPagina(r.pagina - 1)}">← Anteriores</a> ` : ''}
              <span class="fraco">Página ${r.pagina} de ${paginas}</span>
              ${r.pagina < paginas ? html` <a href="${linkPagina(r.pagina + 1)}">Próximos →</a>` : ''}</p>`
          : ''}`,
    })
  );
});

// ---------- Formulário (novo e edição) ----------

async function telaLead(c, lead, { erro = '', ok = '' } = {}) {
  const novo = !lead.id;
  const anonimo = !!lead.anonimizado_em;
  const config = await carregarConfig(c.env.DB);
  const membros = await membrosAtivos(c.env.DB);
  const eu = c.get('usuario');
  const extras = lead.extras || {};
  const extrasDa = (secao) => config.campos.filter((cp) => cp.ativo && cp.secao === secao).map((cp) => campoExtra(config, cp, extras[cp.chave]));

  return pagina({
    titulo: novo ? 'Novo lead' : lead.nome || 'Lead',
    usuario: eu,
    atual: '/leads',
    conteudo: html`
      <p><a href="/leads">← Leads</a></p>
      <span class="eyebrow">${novo ? 'Cadastro' : `Lead nº ${lead.id}`}</span>
      <h1>${novo ? 'Novo lead' : lead.nome || (anonimo ? 'Lead anonimizado' : 'Lead sem nome')}</h1>
      ${novo ? '' : html`<p>${etiquetaEtapa(lead.etapa)} <span class="fraco">· criado ${dataHora(lead.criado_em)}</span></p>`}
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      ${ok ? html`<div class="aviso ok" role="status">${ok}</div>` : ''}
      ${anonimo ? html`<div class="aviso ouro">Os dados pessoais deste lead foram apagados a pedido em ${dataHora(lead.anonimizado_em)}. Os números continuam nas métricas.</div>` : ''}

      ${!novo && !lead.primeiro_atendimento_em && !ENCERRADOS.includes(lead.etapa)
        ? html`<form method="post" action="/leads/${lead.id}/atendimento-agora" class="card">
            <strong>Ainda sem primeiro atendimento.</strong>
            <p class="fraco" style="margin:4px 0 0">Entrou ${dataHora(lead.entrada_em)}.</p>
            <button class="botao" type="submit">Registrar 1º atendimento agora</button>
          </form>`
        : ''}

      <form method="post" action="${novo ? '/leads' : `/leads/${lead.id}`}">
        <div class="card">
          <h2 style="margin-top:0">${SECOES.contato}</h2>
          ${anonimo
            ? html`<p class="fraco">Nome e telefone apagados.</p>`
            : html`${campoTexto('nome', 'Nome', lead.nome)}
                ${campoTexto('telefone', 'Telefone / WhatsApp', lead.telefone ? telefoneLegivel(lead.telefone) : '', { tipo: 'tel', inputmode: 'tel', placeholder: '(22) 99999-9999' })}`}
          ${campoData('entrada_em', 'Entrada do lead', lead.entrada_em ?? Date.now())}
          ${lista(config, 'canal', 'Canal', lead.canal ?? 'whatsapp')}
          ${lista(config, 'area', 'Área / tipo de caso', lead.area)}
          ${campoSelect('responsavel_id', 'Responsável', membros, lead.responsavel_id ?? (novo ? eu.id : null), { vazio: 'Ninguém' })}
          ${extrasDa('contato')}
          <p class="fraco">Não registre aqui detalhes do caso. Este sistema guarda só o necessário para as métricas.</p>
        </div>

        <div class="card">
          <h2 style="margin-top:0">${SECOES.origem}</h2>
          ${lista(config, 'plataforma', 'Plataforma', lead.plataforma, { vazio: 'Não se sabe' })}
          ${lista(config, 'pagina', 'Página do site', lead.pagina, { vazio: 'Nenhuma / não se sabe' })}
          ${extrasDa('origem')}
          <details><summary class="fraco" style="margin-top:14px">Campanha, anúncio e UTMs</summary>
            ${campoTexto('campanha', 'Campanha', lead.campanha)}
            ${campoTexto('conjunto', 'Conjunto / grupo de anúncios', lead.conjunto)}
            ${campoTexto('anuncio', 'Anúncio', lead.anuncio)}
            ${campoTexto('utm_source', 'utm_source', lead.utm_source)}
            ${campoTexto('utm_medium', 'utm_medium', lead.utm_medium)}
            ${campoTexto('utm_campaign', 'utm_campaign', lead.utm_campaign)}
            ${campoTexto('utm_content', 'utm_content', lead.utm_content)}
            ${campoTexto('utm_term', 'utm_term', lead.utm_term)}
            ${campoTexto('ref', 'Código de rastreio', lead.ref)}
          </details>
        </div>

        <div class="card">
          <h2 style="margin-top:0">${SECOES.andamento}</h2>
          ${campoData('primeiro_atendimento_em', 'Primeiro atendimento', lead.primeiro_atendimento_em)}
          ${campoSelect('qualificado', 'Qualificado?', SIM_NAO, lead.qualificado, { vazio: 'Ainda não avaliado' })}
          ${lista(config, 'motivo_desqualificacao', 'Se não, por quê?', lead.motivo_desqualificacao)}
          ${campoData('consulta_agendada_para', 'Consulta agendada para', lead.consulta_agendada_para)}
          ${campoSelect('compareceu', 'Compareceu?', SIM_NAO, lead.compareceu, { vazio: 'Ainda não' })}
          ${extrasDa('andamento')}
        </div>

        <div class="card">
          <h2 style="margin-top:0">${SECOES.desfecho}</h2>
          ${campoData('contrato_em', 'Contrato fechado em', lead.contrato_em)}
          ${campoTexto('honorarios_iniciais', 'Honorários iniciais (R$)', dinheiroNoCampo(lead.honorarios_iniciais), { inputmode: 'decimal', placeholder: '0,00' })}
          ${campoTexto('exito_estimado', 'Êxito estimado (R$), se houver', dinheiroNoCampo(lead.exito_estimado), { inputmode: 'decimal', placeholder: 'Deixe vazio se não há êxito' })}
          <p class="fraco">Ou, se não fechou:</p>
          ${lista(config, 'motivo_perda', 'Motivo da perda', lead.motivo_perda, { vazio: 'Não perdido' })}
          ${extrasDa('desfecho')}
        </div>

        <button class="botao" type="submit">${novo ? 'Cadastrar lead' : 'Salvar'}</button>
      </form>

      ${!novo && !anonimo && eu.papel === 'admin'
        ? html`<h2>Excluir dados a pedido (LGPD)</h2>
          <form method="post" action="/leads/${lead.id}/anonimizar" class="card">
            <p>Apaga nome, telefone e os campos de texto livre de forma definitiva. Datas, etapa,
            campanha e valores continuam, sem identificar a pessoa, para não distorcer o CAC.
            <strong>Não dá para desfazer.</strong></p>
            <label for="confirmar">Para confirmar, digite EXCLUIR</label>
            <input id="confirmar" name="confirmar" autocomplete="off" required>
            <button class="botao sec" type="submit">Apagar dados pessoais</button>
          </form>`
        : ''}
      ${!novo && eu.papel === 'admin'
        ? html`<h2>Apagar lead criado por engano</h2>
          <form method="post" action="/leads/${lead.id}/apagar" class="card">
            <p>Remove o lead por completo, <strong>inclusive das métricas</strong>. Use só para teste, duplicidade ou
            cadastro errado. Para atender um pedido de exclusão de um cliente real, use a opção acima, que preserva os números.</p>
            <label for="confirmar-apagar">Para confirmar, digite APAGAR</label>
            <input id="confirmar-apagar" name="confirmar" autocomplete="off" required>
            <button class="botao sec" type="submit">Apagar lead</button>
          </form>`
        : ''}`,
  });
}

/** Converte o formulário: campos vazios viram null; perda é registrada pelo motivo. */
function dadosDoFormulario(form, lead = {}) {
  const dados = {};
  for (const [k, v] of Object.entries(form)) {
    if (k === 'confirmar') continue;
    if (k.startsWith('x_')) (dados.extras ??= {})[k.slice(2)] = v;
    else dados[k] = v;
  }
  // Escolher um motivo de desqualificação já responde "Qualificado? Não".
  if (dados.motivo_desqualificacao && !dados.qualificado) dados.qualificado = '0';
  // Sem motivo de perda = não perdido. Com motivo, mantém a data original da perda, se havia.
  dados.perdido_em = dados.motivo_perda ? (lead.perdido_em ?? 'agora') : null;
  if (lead.anonimizado_em) {
    delete dados.nome;
    delete dados.telefone;
  }
  return dados;
}

rotas.get('/leads/novo', async (c) => c.html(await telaLead(c, {})));

rotas.post('/leads', async (c) => {
  const form = await c.req.parseBody();
  const config = await carregarConfig(c.env.DB);
  try {
    const { lead, jaExistia } = await criarLead(c.env.DB, dadosDoFormulario(form), ator(c), config);
    if (jaExistia) {
      return c.html(await telaLead(c, lead, { erro: 'Já existe um lead com este telefone nos últimos 90 dias. Abrimos o existente em vez de duplicar.' }));
    }
    return c.redirect(`/leads/${lead.id}?ok=criado`);
  } catch (e) {
    if (!(e instanceof ErroDeDados)) throw e;
    return c.html(await telaLead(c, {}, { erro: e.message }), 422);
  }
});

rotas.get('/leads/:id{[0-9]+}', async (c) => {
  const lead = await buscarLead(c.env.DB, Number(c.req.param('id')));
  if (!lead) return c.notFound();
  const ok = { criado: 'Lead cadastrado.', salvo: 'Alterações salvas.', anonimizado: 'Dados pessoais apagados.' }[c.req.query('ok')];
  return c.html(await telaLead(c, lead, { ok }));
});

rotas.post('/leads/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const atual = await buscarLead(c.env.DB, id);
  if (!atual) return c.notFound();
  const form = await c.req.parseBody();
  const config = await carregarConfig(c.env.DB);
  try {
    await atualizarLead(c.env.DB, id, dadosDoFormulario(form, atual), ator(c), config);
    return c.redirect(`/leads/${id}?ok=salvo`);
  } catch (e) {
    if (!(e instanceof ErroDeDados)) throw e;
    return c.html(await telaLead(c, atual, { erro: e.message }), 422);
  }
});

rotas.post('/leads/:id{[0-9]+}/atendimento-agora', async (c) => {
  const id = Number(c.req.param('id'));
  const lead = await buscarLead(c.env.DB, id);
  if (!lead) return c.notFound();
  try {
    if (!lead.primeiro_atendimento_em) {
      await atualizarLead(c.env.DB, id, { primeiro_atendimento_em: 'agora' }, ator(c), await carregarConfig(c.env.DB));
    }
  } catch (e) {
    if (!(e instanceof ErroDeDados)) throw e;
    return c.html(await telaLead(c, lead, { erro: e.message }), 422);
  }
  return c.redirect(`/leads/${id}?ok=salvo`);
});

rotas.post('/leads/:id{[0-9]+}/apagar', exigirAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const lead = await buscarLead(c.env.DB, id);
  if (!lead) return c.notFound();
  const form = await c.req.parseBody();
  if (String(form.confirmar || '').trim().toUpperCase() !== 'APAGAR') {
    return c.html(await telaLead(c, lead, { erro: 'Confirmação incorreta. Digite APAGAR para remover o lead.' }), 400);
  }
  await apagarLead(c.env.DB, id, ator(c));
  return c.redirect('/leads?apagado=1');
});

rotas.post('/leads/:id{[0-9]+}/anonimizar', exigirAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const lead = await buscarLead(c.env.DB, id);
  if (!lead) return c.notFound();
  const form = await c.req.parseBody();
  if (String(form.confirmar || '').trim().toUpperCase() !== 'EXCLUIR') {
    return c.html(await telaLead(c, lead, { erro: 'Confirmação incorreta. Digite EXCLUIR para apagar os dados.' }), 400);
  }
  await anonimizarLead(c.env.DB, id, ator(c), await carregarConfig(c.env.DB));
  return c.redirect(`/leads/${id}?ok=anonimizado`);
});

export default rotas;
