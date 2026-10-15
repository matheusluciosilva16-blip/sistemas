// Telas de métricas: visão geral, funil, evolução diária, tabelas por campanha/página/classificação,
// importação do CSV do Meta e associação de campanha → página do site.

import { Hono } from 'hono';
import { html, dataHora } from '../lib/html.js';
import { pagina } from '../lib/layout.js';
import { reais, ErroDeDados } from '../lib/leads.js';
import { carregarConfig, opcoesParaSelecao, rotulo, LISTAS_DO_SISTEMA } from '../lib/config.js';
import { exigirAdmin } from '../lib/permissoes.js';
import { auditar } from '../lib/acesso.js';
import { importarMeta } from '../lib/importar-csv.js';
import { graficoColunas } from '../lib/grafico.js';
import {
  resolverPeriodo, PERIODOS, calcular, avisos, serieDiaria, porNivel, porPagina, porLista, COLUNAS_LISTA,
} from '../lib/metricas.js';

const rotas = new Hono();

// ---------- Formatação ----------

const traco = '—';
const num = (v) => (v == null ? traco : Math.round(v).toLocaleString('pt-BR'));
const pct = (v, casas = 1) => (v == null ? traco : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const dinheiro = (centavos) => (centavos == null ? traco : reais(Math.round(centavos)));
const vezes = (v) => (v == null ? traco : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);
const dec = (v) => (v == null ? traco : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function minutos(v) {
  if (v == null) return traco;
  if (v < 60) return `${Math.round(v)} min`;
  if (v < 48 * 60) return `${Math.floor(v / 60)} h ${Math.round(v % 60)} min`;
  return `${(v / 1440).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}
const dataBr = (d) => d.split('-').reverse().join('/');

/** Variação contra o período anterior. Seta e texto; a cor não carrega o sentido sozinha. */
function variacao(atual, anterior, { menorMelhor = false } = {}) {
  if (atual == null || anterior == null || anterior === 0) return html`<span class="fraco">sem comparação</span>`;
  const d = (atual - anterior) / Math.abs(anterior);
  if (Math.abs(d) < 0.005) return html`<span class="fraco">= período anterior</span>`;
  const sobe = d > 0;
  const bom = menorMelhor ? !sobe : sobe;
  return html`<span class="fraco"><span style="color:${bom ? 'var(--ok)' : 'var(--erro)'}">${sobe ? '▲' : '▼'}</span>
    ${pct(Math.abs(d), 0)} vs. período anterior${menorMelhor ? ' (menor é melhor)' : ''}</span>`;
}

function indicador(titulo, valor, comparacao) {
  return html`<div class="card"><span class="eyebrow">${titulo}</span><div class="numeral">${valor}</div>
    <div style="margin-top:8px">${comparacao}</div></div>`;
}

// ---------- Filtros ----------

function lerFiltros(q, config) {
  const p = resolverPeriodo({ periodo: q.periodo, desde: q.desde, ate: q.ate });
  const valida = (campo, v) => (config.listas[campo] || []).some((o) => o.valor === v);
  return {
    ...p,
    plataforma: valida('plataforma', q.plataforma) ? q.plataforma : null,
    pagina: valida('pagina', q.pagina) ? q.pagina : null,
  };
}

function formularioFiltros(q, f, config) {
  const sel = (nome, opcoes, valor, vazio) => html`<select id="${nome}" name="${nome}">
      ${vazio ? html`<option value="">${vazio}</option>` : ''}
      ${Object.entries(opcoes).map(([v, r]) => html`<option value="${v}" ${v === (valor ?? '') ? html`selected` : ''}>${r}</option>`)}
    </select>`;
  const pagas = Object.fromEntries(Object.entries(opcoesParaSelecao(config, 'plataforma')).filter(([v]) => ['google', 'meta'].includes(v)));
  return html`<form method="get" action="/metricas" class="card" style="display:grid;gap:4px 16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end">
    <div><label for="periodo">Período</label>${sel('periodo', PERIODOS, f.periodo)}</div>
    <div><label for="plataforma">Plataforma</label>${sel('plataforma', pagas, f.plataforma, 'Todas as pagas')}</div>
    <div><label for="pagina">Página do site</label>${sel('pagina', opcoesParaSelecao(config, 'pagina'), f.pagina, 'Todas')}</div>
    <div><label for="desde">De (personalizado)</label><input id="desde" name="desde" type="date" value="${q.desde || f.desde}"></div>
    <div><label for="ate">Até (personalizado)</label><input id="ate" name="ate" type="date" value="${q.ate || f.ate}"></div>
    <div><button class="botao" type="submit" style="margin-top:0;width:100%">Ver</button></div>
  </form>`;
}

// ---------- Blocos ----------

function funil(m) {
  const etapas = [
    ['Impressões', m.impressoes],
    ['Cliques no link', m.cliques_link],
    ['Visualizações da página', m.lp_views],
    ['Leads', m.leads],
    ['Qualificados', m.qualificados],
    ['Consultas realizadas', m.realizadas],
    ['Contratos', m.contratos],
  ].filter(([, v], i) => v != null || i >= 3);

  return html`<div class="card">
    ${etapas.map(([nome, valor], i) => {
      const anterior = i ? etapas[i - 1][1] : null;
      const taxa = i && anterior ? valor / anterior : null;
      return html`<div style="padding:10px 0;${i ? 'border-top:1px solid var(--line)' : ''}">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
          <strong style="color:var(--ink)">${nome}</strong><span class="numeral" style="font-size:1.25rem">${num(valor)}</span>
        </div>
        ${i
          ? html`<div style="display:flex;gap:10px;align-items:center;margin-top:6px">
              <div style="flex:1;height:6px;background:var(--deep);border-radius:999px" aria-hidden="true">
                <div style="height:6px;border-radius:999px;background:var(--gold);width:${Math.min(100, (taxa ?? 0) * 100).toFixed(1)}%"></div>
              </div>
              <span class="fraco" style="min-width:132px;text-align:right">${taxa == null ? 'sem base' : `${pct(taxa)} da etapa anterior`}</span>
            </div>`
          : ''}
      </div>`;
    })}
  </div>`;
}

/** Tabela com todas as métricas, agrupadas pelas etapas da especificação. */
function todasAsMetricas(m) {
  const grupos = [
    ['1. Entrega', [['Investimento', dinheiro(m.investimento)], ['Impressões', num(m.impressoes)], ['Alcance (soma diária)', num(m.alcance)],
      ['Frequência diária média', dec(m.frequencia)], ['CPM', dinheiro(m.cpm)]]],
    ['2. Atenção (vídeo)', [['Hook rate (3 s ÷ impressões)', pct(m.hook_rate)], ['Hold rate (ThruPlay ou 50% ÷ 3 s)', pct(m.hold_rate)],
      ['Retenção 25%', pct(m.retencao_25)], ['Retenção 50%', pct(m.retencao_50)], ['Retenção 75%', pct(m.retencao_75)], ['Retenção 100%', pct(m.retencao_100)]]],
    ['3. Clique', [['Cliques no link', num(m.cliques_link)], ['CTR de link', pct(m.ctr, 2)], ['CPC', dinheiro(m.cpc)],
      ['Visualizações da página', num(m.lp_views)], ['Taxa de carregamento', pct(m.taxa_carregamento)], ['Conversas iniciadas (Meta)', num(m.conversas)]]],
    ['4. Conversão', [['Leads (CRM)', num(m.leads)], [`Taxa de conversão (leads ÷ ${m.conversao_base})`, pct(m.taxa_conversao)], ['CPL', dinheiro(m.cpl)]]],
    ['5. Qualidade e vendas', [['Taxa de qualificação', pct(m.taxa_qualificacao)], ['Custo por lead qualificado', dinheiro(m.custo_lead_qualificado)],
      ['Taxa de agendamento', pct(m.taxa_agendamento)], ['Taxa de comparecimento', pct(m.taxa_comparecimento)], ['Taxa de fechamento', pct(m.taxa_fechamento)],
      ['CAC', dinheiro(m.cac)], ['Ticket médio (honorários iniciais)', dinheiro(m.ticket_medio)], ['ROAS imediato', vezes(m.roas_imediato)],
      ['ROAS projetado (com êxito estimado)', vezes(m.roas_projetado)], ['Tempo médio de resposta', minutos(m.resposta_media_min)],
      ['Tempo mediano de resposta', minutos(m.resposta_mediana_min)]]],
  ];
  return html`<div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${grupos.map(
    ([titulo, linhas]) => html`<div class="card"><h3>${titulo}</h3>
      <table><tbody>${linhas.map(([k, v]) => html`<tr><td style="padding:8px 0">${k}</td><td style="padding:8px 0;text-align:right;color:var(--ink);white-space:nowrap">${v}</td></tr>`)}</tbody></table></div>`
  )}</div>`;
}

function linkOrdem(q, coluna, rotuloColuna, atual) {
  const p = new URLSearchParams({ ...q, ordem: coluna });
  return html`<a href="/metricas?${p}#campanhas" style="color:${atual === coluna ? 'var(--gold)' : 'inherit'};text-decoration:none">${rotuloColuna}${atual === coluna ? ' ↓' : ''}</a>`;
}

function tabelaNiveis(linhas, q, nivel, config) {
  const ordem = ['investimento', 'impressoes', 'ctr', 'cpm', 'hook_rate', 'cpc', 'conversas'].includes(q.ordem) ? q.ordem : 'investimento';
  const ordenadas = [...linhas].sort((a, b) => (b.m[ordem] ?? -1) - (a.m[ordem] ?? -1));
  // Destaque: métrica de anúncio muito pior que a média do próprio período (base para a etapa 5).
  const media = (k) => {
    const v = linhas.map((l) => l.m[k]).filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const mediaCtr = media('ctr');
  const mediaCpm = media('cpm');
  const alerta = (v, ref, pior) => (v != null && ref != null && linhas.length > 1 && (pior === 'baixo' ? v < ref * 0.7 : v > ref * 1.3));
  const marca = (texto, ruim) => (ruim ? html`<span style="color:var(--erro)" title="Bem pior que a média das linhas desta tabela">⚠ ${texto}</span>` : texto);
  const niveis = { campanha: 'Campanha', conjunto: 'Conjunto', anuncio: 'Anúncio' };
  const link = (n) => `/metricas?${new URLSearchParams({ ...q, nivel: n })}#campanhas`;

  return html`<p>${Object.entries(niveis).map(([n, r]) =>
      html`<a class="etiqueta ${n === nivel ? 'ouro' : ''}" href="${link(n)}" style="text-decoration:none">${r}</a>`)}</p>
    <div class="card tabela"><table>
      <thead><tr><th>${niveis[nivel]}</th><th>${linkOrdem(q, 'investimento', 'Invest.', ordem)}</th><th>${linkOrdem(q, 'impressoes', 'Impr.', ordem)}</th>
        <th>${linkOrdem(q, 'cpm', 'CPM', ordem)}</th><th>${linkOrdem(q, 'ctr', 'CTR', ordem)}</th><th>${linkOrdem(q, 'cpc', 'CPC', ordem)}</th>
        <th>${linkOrdem(q, 'hook_rate', 'Hook', ordem)}</th><th>Carreg.</th><th>${linkOrdem(q, 'conversas', 'Conversas', ordem)}</th></tr></thead>
      <tbody>${
        ordenadas.length
          ? ordenadas.map(
              (l) => html`<tr>
                <td><strong style="color:var(--ink)">${l[nivel] || l.campanha || '(sem nome)'}</strong>
                  ${nivel !== 'campanha' ? html`<br><span class="fraco">${[l.campanha, nivel === 'anuncio' ? l.conjunto : null].filter(Boolean).join(' › ')}</span>` : ''}
                  ${nivel === 'campanha' ? html`<br><span class="fraco">${l.pagina ? `Página: ${rotulo(config, 'pagina', l.pagina)}` : 'Sem página associada'}</span>` : ''}</td>
                <td data-r="Investimento">${dinheiro(l.m.investimento)}</td><td data-r="Impressões">${num(l.m.impressoes)}</td>
                <td data-r="CPM">${marca(dinheiro(l.m.cpm), alerta(l.m.cpm, mediaCpm, 'alto'))}</td>
                <td data-r="CTR">${marca(pct(l.m.ctr, 2), alerta(l.m.ctr, mediaCtr, 'baixo'))}</td>
                <td data-r="CPC">${dinheiro(l.m.cpc)}</td><td data-r="Hook rate">${pct(l.m.hook_rate)}</td>
                <td data-r="Carregamento">${pct(l.m.taxa_carregamento)}</td><td data-r="Conversas">${num(l.m.conversas)}</td>
              </tr>`
            )
          : html`<tr><td colspan="9" class="fraco">Sem dados de anúncio no período. Importe o CSV do Meta.</td></tr>`
      }</tbody></table></div>
    <p class="fraco">⚠ marca CTR 30% abaixo ou CPM 30% acima da média das linhas desta tabela.</p>`;
}

function tabelaFunilLeads(titulo, linhas, nomeValor, { comCusto = false } = {}) {
  return html`<div class="card tabela"><table>
    <thead><tr><th>${titulo}</th>${comCusto ? html`<th>Invest.</th><th>CPL</th>` : ''}<th>Leads</th><th>Qualif.</th><th>Consultas</th><th>Contratos</th>
      <th>Fechamento</th>${comCusto ? html`<th>CAC</th>` : html`<th>Ticket</th>`}</tr></thead>
    <tbody>${
      linhas.length
        ? linhas.map(
            (l) => html`<tr><td><strong style="color:var(--ink)">${nomeValor(l)}</strong></td>
              ${comCusto ? html`<td data-r="Investimento">${dinheiro(l.m.investimento)}</td><td data-r="CPL">${dinheiro(l.m.cpl)}</td>` : ''}
              <td data-r="Leads">${num(l.m.leads)}</td><td data-r="Qualificados">${num(l.m.qualificados)} <span class="fraco">${pct(l.m.taxa_qualificacao, 0)}</span></td>
              <td data-r="Consultas">${num(l.m.realizadas)}</td><td data-r="Contratos">${num(l.m.contratos)}</td><td data-r="Fechamento">${pct(l.m.taxa_fechamento, 0)}</td>
              ${comCusto ? html`<td data-r="CAC">${dinheiro(l.m.cac)}</td>` : html`<td data-r="Ticket médio">${dinheiro(l.m.ticket_medio)}</td>`}</tr>`
          )
        : html`<tr><td colspan="9" class="fraco">Sem leads no período.</td></tr>`
    }</tbody></table></div>`;
}

// ---------- Tela principal ----------

rotas.get('/metricas', async (c) => {
  const q = c.req.query();
  const db = c.env.DB;
  const config = await carregarConfig(db);
  const f = lerFiltros(q, config);
  const nivel = ['campanha', 'conjunto', 'anuncio'].includes(q.nivel) ? q.nivel : 'campanha';
  const listas = [
    ...['area', 'motivo_desqualificacao', 'motivo_perda', 'canal'].map((k) => ({ id: k, titulo: LISTAS_DO_SISTEMA[k], coluna: k })),
    ...config.campos.filter((cp) => cp.tipo === 'lista').map((cp) => ({ id: `x_${cp.chave}`, titulo: cp.rotulo, chaveExtra: cp.chave })),
  ];
  const recorte = listas.find((l) => l.id === q.recorte) || listas[0];

  const [m, ant, lista, serie, niveis, paginas, grupos] = await Promise.all([
    calcular(db, f),
    calcular(db, { ...f, ...f.anterior }),
    avisos(db, f),
    serieDiaria(db, f),
    porNivel(db, f, nivel),
    f.pagina ? Promise.resolve([]) : porPagina(db, f, (config.listas.pagina || []).map((o) => ({ valor: o.valor, rotulo: o.rotulo }))),
    porLista(db, f, recorte.chaveExtra ? { chaveExtra: recorte.chaveExtra } : { coluna: COLUNAS_LISTA.includes(recorte.coluna) ? recorte.coluna : 'area' }),
  ]);
  const rotuloRecorte = (valor) => (valor == null ? 'Não informado' : rotulo(config, recorte.chaveExtra || recorte.coluna, valor));
  const admin = c.get('usuario').papel === 'admin';

  return c.html(
    pagina({
      titulo: 'Métricas',
      usuario: c.get('usuario'),
      atual: '/metricas',
      conteudo: html`
        <span class="eyebrow">Tráfego pago</span>
        <h1>Métricas</h1>
        ${admin ? html`<p><a class="botao sec mini" href="/metricas/importar">Importar CSV do Meta</a>
          <a class="botao sec mini" href="/metricas/campanhas" style="margin-left:8px">Campanhas → páginas</a></p>` : ''}
        ${formularioFiltros(q, f, config)}
        <p class="fraco">${dataBr(f.desde)} a ${dataBr(f.ate)} (${f.dias} dias) · comparado com ${dataBr(f.anterior.desde)} a ${dataBr(f.anterior.ate)}</p>
        ${lista.map((a) => html`<div class="aviso ouro">${a}</div>`)}

        <div class="grade kpi">
          ${indicador('Investimento', dinheiro(m.investimento), variacao(m.investimento, ant.investimento))}
          ${indicador('Leads', num(m.leads), variacao(m.leads, ant.leads))}
          ${indicador('Contratos', num(m.contratos), variacao(m.contratos, ant.contratos))}
          ${indicador('CAC', dinheiro(m.cac), variacao(m.cac, ant.cac, { menorMelhor: true }))}
          ${indicador('ROAS imediato', vezes(m.roas_imediato), variacao(m.roas_imediato, ant.roas_imediato))}
          ${indicador('CPL', dinheiro(m.cpl), variacao(m.cpl, ant.cpl, { menorMelhor: true }))}
        </div>
        <p class="fraco">Leads, consultas e contratos são os dos leads que <strong>entraram</strong> no período, mesmo que o contrato
        tenha saído depois. Por isso os períodos mais recentes tendem a mostrar menos contratos até o atendimento terminar.</p>

        <h2>Funil</h2>
        ${funil(m)}

        <h2>Evolução diária</h2>
        <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
          ${graficoColunas(serie, 'investimento', (v) => dinheiro(v), 'Investimento', { eixo: (v) => `R$ ${num(v / 100)}` })}
          ${graficoColunas(serie, 'leads', (v) => num(v), 'Leads', { inteiro: true })}
        </div>

        <h2>Todas as métricas</h2>
        ${todasAsMetricas(m)}

        <h2 id="campanhas">Campanhas e anúncios</h2>
        ${tabelaNiveis(niveis, q, nivel, config)}

        ${f.pagina ? '' : html`<h2>Por página do site</h2>
          <p class="fraco">O investimento de cada página vem das campanhas associadas a ela.</p>
          ${tabelaFunilLeads('Página', paginas, (l) => l.pagina.rotulo, { comCusto: true })}`}

        <h2 id="recorte">Leads por classificação</h2>
        <p>${listas.map((l) => html`<a class="etiqueta ${l.id === recorte.id ? 'ouro' : ''}" style="text-decoration:none"
          href="/metricas?${new URLSearchParams({ ...q, recorte: l.id })}#recorte">${l.titulo}</a>`)}</p>
        ${tabelaFunilLeads(recorte.titulo, grupos, (l) => rotuloRecorte(l.valor))}`,
    })
  );
});

// ---------- Importar CSV ----------

async function telaImportar(c, { erro = '', resultado = null } = {}) {
  const { results: historico } = await c.env.DB.prepare(
    `SELECT i.*, u.nome AS autor FROM importacoes i LEFT JOIN usuarios u ON u.id = i.criado_por ORDER BY i.criado_em DESC LIMIT 20`
  ).all();
  return pagina({
    titulo: 'Importar CSV',
    usuario: c.get('usuario'),
    atual: '/metricas',
    conteudo: html`
      <p><a href="/metricas">← Métricas</a></p>
      <span class="eyebrow">Meta Ads</span>
      <h1>Importar CSV</h1>
      ${erro ? html`<div class="aviso erro" role="alert">${erro}</div>` : ''}
      ${resultado
        ? html`<div class="aviso ok" role="status"><strong>${num(resultado.linhas)} linhas importadas</strong>, de ${dataBr(resultado.dataInicio)} a ${dataBr(resultado.dataFim)}
            (nível de ${resultado.nivel}).</div>
          ${resultado.avisos.map((a) => html`<div class="aviso ouro">${a}</div>`)}
          ${resultado.campanhasNovas ? html`<div class="aviso ouro">${resultado.campanhasNovas} campanha(s) nova(s).
            <a href="/metricas/campanhas">Associe cada uma à página do site</a> para o CPL e o CAC por página funcionarem.</div>` : ''}`
        : ''}
      <form method="post" action="/metricas/importar" enctype="multipart/form-data" class="card">
        <label for="arquivo">Arquivo CSV exportado do Gerenciador de Anúncios</label>
        <input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv" required>
        <button class="botao" type="submit">Importar</button>
      </form>
      <div class="card">
        <h3>Como exportar do Meta</h3>
        <ol>
          <li>No <strong>Gerenciador de Anúncios</strong>, abra a aba <strong>Anúncios</strong> (para ver cada anúncio).</li>
          <li>Escolha o período. Não filtre campanhas: exporte <strong>todas</strong>.</li>
          <li><strong>Detalhamento → Por tempo → Dia.</strong></li>
          <li>Em <strong>Colunas</strong>, inclua: Valor usado, Impressões, Alcance, Cliques no link, Visualizações da página de destino,
            Reproduções de vídeo de 3 segundos, Reproduções de vídeo em 25%, 50%, 75% e 100%, ThruPlays e, se usar anúncio de WhatsApp,
            Conversas por mensagem iniciadas. Salve essa seleção como predefinição para as próximas vezes.</li>
          <li><strong>Relatórios → Exportar dados da tabela → .csv</strong>.</li>
        </ol>
        <p class="fraco">Importar de novo um período <strong>substitui</strong> os dados daqueles dias. Pode importar sempre o mês
        inteiro, sem medo de duplicar.</p>
      </div>
      <h2>Importações anteriores</h2>
      <div class="card tabela"><table>
        <thead><tr><th>Quando</th><th>Arquivo</th><th>Período</th><th>Linhas</th></tr></thead>
        <tbody>${
          historico.length
            ? historico.map((i) => html`<tr><td>${dataHora(i.criado_em)}<br><span class="fraco">${i.autor || ''}</span></td><td>${i.arquivo}</td>
                <td>${i.data_inicio ? `${dataBr(i.data_inicio)} a ${dataBr(i.data_fim)}` : traco}</td><td>${num(i.linhas)}</td></tr>`)
            : html`<tr><td colspan="4" class="fraco">Nenhuma importação ainda.</td></tr>`
        }</tbody></table></div>`,
  });
}

rotas.get('/metricas/importar', exigirAdmin, async (c) => c.html(await telaImportar(c)));

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const COLUNAS_ADS = ['plataforma', 'data', 'campanha', 'conjunto', 'anuncio', 'investimento', 'impressoes', 'alcance', 'cliques_link', 'lp_views',
  'video_3s', 'video_25', 'video_50', 'video_75', 'video_100', 'thruplays', 'conversas'];

rotas.post('/metricas/importar', exigirAdmin, async (c) => {
  const form = await c.req.parseBody();
  const arquivo = form.arquivo;
  if (!arquivo || typeof arquivo === 'string') return c.html(await telaImportar(c, { erro: 'Escolha um arquivo CSV.' }), 400);
  if (arquivo.size > TAMANHO_MAXIMO) return c.html(await telaImportar(c, { erro: 'Arquivo maior que 5 MB. Exporte um período menor.' }), 400);
  if (/\.xlsx?$/i.test(arquivo.name)) return c.html(await telaImportar(c, { erro: 'Esse arquivo é do Excel. Exporte em .csv.' }), 400);

  let r;
  try {
    r = importarMeta(await arquivo.text());
  } catch (e) {
    if (!(e instanceof ErroDeDados)) throw e;
    return c.html(await telaImportar(c, { erro: e.message }), 422);
  }

  const db = c.env.DB;
  const eu = c.get('usuario');
  const { meta } = await db
    .prepare('INSERT INTO importacoes (plataforma, arquivo, linhas, data_inicio, data_fim, avisos, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('meta', String(arquivo.name).slice(0, 200), r.linhas.length, r.dataInicio, r.dataFim, r.avisos.join('\n') || null, eu.id, Date.now())
    .run();
  const importacao = meta.last_row_id;

  // Os dias presentes no arquivo são substituídos por inteiro: reimportar não duplica.
  const dias = [...new Set(r.linhas.map((l) => l.data))];
  const comandos = dias.map((d) => db.prepare("DELETE FROM anuncios_diario WHERE plataforma = 'meta' AND data = ?").bind(d));
  const insert = `INSERT INTO anuncios_diario (${COLUNAS_ADS.join(', ')}, importacao_id) VALUES (${COLUNAS_ADS.map(() => '?').join(', ')}, ?)`;
  for (const l of r.linhas) comandos.push(db.prepare(insert).bind(...COLUNAS_ADS.map((k) => l[k] ?? null), importacao));
  // Em blocos, para respeitar o limite de comandos por lote do D1.
  for (let i = 0; i < comandos.length; i += 90) await db.batch(comandos.slice(i, i + 90));

  const { n } = await db
    .prepare(
      `SELECT COUNT(DISTINCT a.campanha) AS n FROM anuncios_diario a
        LEFT JOIN campanhas_paginas cp ON cp.plataforma = a.plataforma AND cp.campanha = a.campanha
       WHERE a.importacao_id = ? AND cp.campanha IS NULL`
    )
    .bind(importacao)
    .first();
  await auditar(db, { atorTipo: 'usuario', atorId: eu.id, acao: 'csv_importado', detalhe: `meta ${r.dataInicio}..${r.dataFim} linhas=${r.linhas.length}` });
  return c.html(await telaImportar(c, { resultado: { ...r, linhas: r.linhas.length, campanhasNovas: n } }));
});

// ---------- Campanhas → páginas ----------

/** Sugestão pelo nome da campanha, só para pré-selecionar. Nada é gravado sem você salvar. */
function sugerirPagina(nome, config) {
  const n = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const regras = [[/busca|apreens|veicul/, 'busca-e-apreensao'], [/bloque|conta|sisbajud/, 'conta-bloqueada'], [/crimin|flagrante|plantao/, 'criminal']];
  const achou = regras.find(([re]) => re.test(n))?.[1];
  return achou && (config.listas.pagina || []).some((o) => o.valor === achou && o.ativo) ? achou : '';
}

rotas.get('/metricas/campanhas', exigirAdmin, async (c) => {
  const config = await carregarConfig(c.env.DB);
  const { results } = await c.env.DB.prepare(
    `SELECT a.plataforma, a.campanha, MIN(a.data) AS primeiro, MAX(a.data) AS ultimo, SUM(a.investimento) AS investimento,
            cp.pagina, cp.campanha IS NOT NULL AS associada
       FROM anuncios_diario a
       LEFT JOIN campanhas_paginas cp ON cp.plataforma = a.plataforma AND cp.campanha = a.campanha
      GROUP BY a.plataforma, a.campanha ORDER BY associada, ultimo DESC`
  ).all();
  const ok = c.req.query('ok');

  return c.html(
    pagina({
      titulo: 'Campanhas',
      usuario: c.get('usuario'),
      atual: '/metricas',
      conteudo: html`
        <p><a href="/metricas">← Métricas</a></p>
        <span class="eyebrow">Atribuição</span>
        <h1>Campanhas → páginas</h1>
        <p>A mensagem do WhatsApp diz de qual <strong>página</strong> o lead veio, mas não de qual campanha. Associando cada campanha
        à página que ela anuncia, o sistema liga o investimento aos leads do CRM e calcula CPL e CAC por página.</p>
        ${ok ? html`<div class="aviso ok" role="status">Associações salvas.</div>` : ''}
        ${results.length
          ? html`<form method="post" action="/metricas/campanhas">
              ${results.map(
                (r, i) => html`<div class="card">
                  <strong style="color:var(--ink)">${r.campanha}</strong>
                  <p class="fraco" style="margin:2px 0 0">${rotulo(config, 'plataforma', r.plataforma)} · ${dataBr(r.primeiro)} a ${dataBr(r.ultimo)} · ${dinheiro(r.investimento)}
                    ${r.associada ? '' : html` · <span style="color:var(--gold)">não associada</span>`}</p>
                  <input type="hidden" name="plataforma_${i}" value="${r.plataforma}">
                  <input type="hidden" name="campanha_${i}" value="${r.campanha}">
                  <label for="pagina_${i}">Página que esta campanha anuncia</label>
                  <select id="pagina_${i}" name="pagina_${i}">
                    <option value="">Nenhuma página do site (ex.: anúncio direto para o WhatsApp)</option>
                    ${Object.entries(opcoesParaSelecao(config, 'pagina', r.pagina)).map(([v, rot]) => {
                      const escolhido = r.associada ? r.pagina === v : sugerirPagina(r.campanha, config) === v;
                      return html`<option value="${v}" ${escolhido ? html`selected` : ''}>${rot}</option>`;
                    })}
                  </select>
                </div>`
              )}
              <input type="hidden" name="total" value="${results.length}">
              <button class="botao" type="submit">Salvar associações</button>
            </form>`
          : html`<div class="card fraco">Nenhuma campanha importada ainda. <a href="/metricas/importar">Importe o CSV do Meta</a>.</div>`}`,
    })
  );
});

rotas.post('/metricas/campanhas', exigirAdmin, async (c) => {
  const form = await c.req.parseBody();
  const config = await carregarConfig(c.env.DB);
  const total = Math.min(Number(form.total) || 0, 2000);
  const comandos = [];
  for (let i = 0; i < total; i++) {
    const plataforma = String(form[`plataforma_${i}`] || '');
    const campanha = String(form[`campanha_${i}`] || '');
    let p = String(form[`pagina_${i}`] || '');
    if (!plataforma || !campanha) continue;
    if (p && !(config.listas.pagina || []).some((o) => o.valor === p)) p = '';
    comandos.push(
      c.env.DB.prepare(
        'INSERT INTO campanhas_paginas (plataforma, campanha, pagina) VALUES (?, ?, ?) ON CONFLICT(plataforma, campanha) DO UPDATE SET pagina = excluded.pagina'
      ).bind(plataforma, campanha, p || null)
    );
  }
  for (let i = 0; i < comandos.length; i += 90) await c.env.DB.batch(comandos.slice(i, i + 90));
  await auditar(c.env.DB, { atorTipo: 'usuario', atorId: c.get('usuario').id, acao: 'campanhas_associadas', detalhe: `${comandos.length} campanha(s)` });
  return c.redirect('/metricas/campanhas?ok=1');
});

export default rotas;
