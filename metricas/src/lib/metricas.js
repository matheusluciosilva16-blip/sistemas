// Cálculo das métricas do funil: anúncio → clique → lead → qualificado → consulta → contrato.
// Fórmulas da especificação (§3). Toda divisão por zero vira null ("—" na tela), nunca 0 ou infinito.
//
// Regras de atribuição (explicadas também na tela):
//  - Período dos ANÚNCIOS: dia da veiculação.
//  - Período dos LEADS: dia de entrada do lead. Contratos, consultas e honorários contados são
//    os dos leads que entraram no período (coorte). Assim o CAC compara a verba de um período
//    com o que aqueles mesmos leads renderam, mesmo que o contrato saia semanas depois.
//  - Sem filtro de plataforma, entram os leads de plataformas PAGAS (google, meta).
//    Orgânico, indicação e "não se sabe" ficam fora do CAC e aparecem como aviso.
//  - Filtro de página: investimento das campanhas associadas àquela página (Métricas → Campanhas).

export const PLATAFORMAS_PAGAS = ['google', 'meta'];
const DIA = 24 * 3600 * 1000;

// ---------- Datas (horário de Brasília) ----------

export function hojeBrasilia() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function somarDias(dia, n) {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
}

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA) + 1;

/** Limites em ms de um intervalo de dias de Brasília (fim exclusivo). */
const msInicio = (dia) => Date.parse(`${dia}T00:00:00-03:00`);
const msFim = (dia) => Date.parse(`${dia}T00:00:00-03:00`) + DIA;

export const PERIODOS = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '60d': 'Últimos 60 dias',
  mes: 'Este mês',
  mes_anterior: 'Mês passado',
  personalizado: 'Personalizado',
};

/** Resolve o período escolhido e o período anterior de mesmo tamanho (para comparação). */
export function resolverPeriodo({ periodo = '30d', desde, ate } = {}) {
  const hoje = hojeBrasilia();
  let d;
  let a = hoje;
  if (periodo === 'personalizado' && /^\d{4}-\d{2}-\d{2}$/.test(desde || '') && /^\d{4}-\d{2}-\d{2}$/.test(ate || '') && desde <= ate) {
    d = desde;
    a = ate;
  } else if (periodo === 'mes') {
    d = `${hoje.slice(0, 7)}-01`;
  } else if (periodo === 'mes_anterior') {
    a = somarDias(`${hoje.slice(0, 7)}-01`, -1);
    d = `${a.slice(0, 7)}-01`;
  } else {
    if (!['7d', '60d'].includes(periodo)) periodo = '30d';
    d = somarDias(hoje, -(Number(periodo.replace('d', '')) - 1));
  }
  if (periodo === 'personalizado' && d === undefined) periodo = '30d';
  const n = diasEntre(d, a);
  return { periodo, desde: d, ate: a, dias: n, anterior: { desde: somarDias(d, -n), ate: somarDias(d, -1) } };
}

// ---------- Consultas ----------

/** Filtros SQL comuns. Devolve {ads: {sql, valores}, leads: {sql, valores}} */
function filtros({ desde, ate, plataforma, pagina }) {
  const ads = ['a.data BETWEEN ? AND ?'];
  const vAds = [desde, ate];
  const leads = ['l.entrada_em >= ? AND l.entrada_em < ?'];
  const vLeads = [msInicio(desde), msFim(ate)];

  if (plataforma) {
    ads.push('a.plataforma = ?'); vAds.push(plataforma);
    leads.push('l.plataforma = ?'); vLeads.push(plataforma);
  } else {
    leads.push(`l.plataforma IN (${PLATAFORMAS_PAGAS.map(() => '?').join(', ')})`); vLeads.push(...PLATAFORMAS_PAGAS);
  }
  if (pagina) {
    ads.push('a.campanha IN (SELECT campanha FROM campanhas_paginas cp WHERE cp.plataforma = a.plataforma AND cp.pagina = ?)');
    vAds.push(pagina);
    leads.push('l.pagina = ?'); vLeads.push(pagina);
  }
  return { ads: { sql: ads.join(' AND '), valores: vAds }, leads: { sql: leads.join(' AND '), valores: vLeads } };
}

const SOMAS_ADS = `
  COALESCE(SUM(a.investimento), 0) AS investimento,
  COALESCE(SUM(a.impressoes), 0)   AS impressoes,
  SUM(a.alcance)      AS alcance,
  SUM(CASE WHEN a.alcance IS NOT NULL THEN a.impressoes END) AS impressoes_com_alcance,
  SUM(a.cliques_link) AS cliques_link,
  SUM(a.lp_views)     AS lp_views,
  SUM(CASE WHEN a.lp_views IS NOT NULL THEN a.cliques_link END) AS cliques_com_lp,
  SUM(a.video_3s)     AS video_3s,
  SUM(CASE WHEN a.video_3s IS NOT NULL THEN a.impressoes END) AS impressoes_video,
  SUM(a.video_25) AS video_25, SUM(a.video_50) AS video_50, SUM(a.video_75) AS video_75, SUM(a.video_100) AS video_100,
  SUM(a.thruplays)    AS thruplays,
  SUM(a.conversas)    AS conversas`;

const SOMAS_LEADS = `
  COUNT(*) AS leads,
  COALESCE(SUM(l.qualificado = 1), 0) AS qualificados,
  COALESCE(SUM(l.qualificado = 0), 0) AS desqualificados,
  COALESCE(SUM(l.consulta_agendada_para IS NOT NULL), 0) AS agendadas,
  COALESCE(SUM(l.compareceu = 1), 0) AS realizadas,
  COALESCE(SUM(l.contrato_em IS NOT NULL), 0) AS contratos,
  COALESCE(SUM(l.honorarios_iniciais), 0) AS honorarios,
  COALESCE(SUM(CASE WHEN l.contrato_em IS NOT NULL THEN COALESCE(l.honorarios_iniciais, 0) + COALESCE(l.exito_estimado, 0) END), 0) AS honorarios_projetados,
  COALESCE(SUM(l.primeiro_atendimento_em IS NOT NULL), 0) AS atendidos,
  AVG(CASE WHEN l.primeiro_atendimento_em IS NOT NULL THEN (l.primeiro_atendimento_em - l.entrada_em) / 60000.0 END) AS resposta_media_min`;

const div = (a, b) => (a == null || !b ? null : a / b);

/** Métricas derivadas, com as fórmulas da especificação. Valores em centavos onde for dinheiro. */
export function derivar(ads, ld) {
  return {
    // Etapa 1 — entrega
    investimento: ads.investimento,
    impressoes: ads.impressoes,
    alcance: ads.alcance,
    frequencia: div(ads.impressoes_com_alcance, ads.alcance),
    cpm: div(ads.investimento * 1000, ads.impressoes),
    // Etapa 2 — atenção
    hook_rate: div(ads.video_3s, ads.impressoes_video),
    hold_rate: div(ads.thruplays ?? ads.video_50, ads.video_3s),
    retencao_25: div(ads.video_25, ads.impressoes_video),
    retencao_50: div(ads.video_50, ads.impressoes_video),
    retencao_75: div(ads.video_75, ads.impressoes_video),
    retencao_100: div(ads.video_100, ads.impressoes_video),
    // Etapa 3 — clique
    cliques_link: ads.cliques_link,
    ctr: div(ads.cliques_link, ads.impressoes),
    cpc: div(ads.investimento, ads.cliques_link),
    lp_views: ads.lp_views,
    taxa_carregamento: div(ads.lp_views, ads.cliques_com_lp),
    conversas: ads.conversas,
    // Etapa 4 — conversão
    leads: ld.leads,
    taxa_conversao: div(ld.leads, ads.lp_views) ?? div(ld.leads, ads.cliques_link),
    conversao_base: ads.lp_views ? 'visualizações da página' : 'cliques no link',
    cpl: div(ads.investimento, ld.leads),
    // Etapa 5 — qualidade e vendas
    qualificados: ld.qualificados,
    desqualificados: ld.desqualificados,
    agendadas: ld.agendadas,
    realizadas: ld.realizadas,
    contratos: ld.contratos,
    taxa_qualificacao: div(ld.qualificados, ld.leads),
    custo_lead_qualificado: div(ads.investimento, ld.qualificados),
    taxa_agendamento: div(ld.agendadas, ld.qualificados),
    taxa_comparecimento: div(ld.realizadas, ld.agendadas),
    taxa_fechamento: div(ld.contratos, ld.realizadas),
    cac: div(ads.investimento, ld.contratos),
    ticket_medio: div(ld.honorarios, ld.contratos),
    honorarios: ld.honorarios,
    roas_imediato: div(ld.honorarios, ads.investimento),
    roas_projetado: div(ld.honorarios_projetados, ads.investimento),
    resposta_media_min: ld.resposta_media_min,
    atendidos: ld.atendidos,
  };
}

/** Todas as métricas de um período. */
export async function calcular(db, f) {
  const { ads, leads } = filtros(f);
  const [somaAds, somaLeads, respostas] = await db.batch([
    db.prepare(`SELECT ${SOMAS_ADS} FROM anuncios_diario a WHERE ${ads.sql}`).bind(...ads.valores),
    db.prepare(`SELECT ${SOMAS_LEADS} FROM leads l WHERE ${leads.sql}`).bind(...leads.valores),
    db.prepare(
      `SELECT (l.primeiro_atendimento_em - l.entrada_em) / 60000.0 AS m FROM leads l
        WHERE ${leads.sql} AND l.primeiro_atendimento_em IS NOT NULL ORDER BY m`
    ).bind(...leads.valores),
  ]);
  const m = derivar(somaAds.results[0], somaLeads.results[0]);
  const tempos = respostas.results.map((r) => r.m);
  m.resposta_mediana_min = tempos.length ? tempos[Math.floor((tempos.length - 1) / 2)] : null;
  return m;
}

/** Avisos que ajudam a ler os números certos. */
export async function avisos(db, f) {
  const lista = [];
  const desde = msInicio(f.desde);
  const ate = msFim(f.ate);
  const [semPlataforma, semPagina, ultimaImportacao] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM leads WHERE entrada_em >= ? AND entrada_em < ? AND (plataforma IS NULL OR plataforma = '')").bind(desde, ate),
    db.prepare(
      `SELECT COUNT(DISTINCT a.campanha) AS n FROM anuncios_diario a
        LEFT JOIN campanhas_paginas cp ON cp.plataforma = a.plataforma AND cp.campanha = a.campanha
        WHERE a.data BETWEEN ? AND ? AND cp.campanha IS NULL`
    ).bind(f.desde, f.ate),
    db.prepare('SELECT plataforma, MAX(data_fim) AS ate FROM importacoes GROUP BY plataforma'),
  ]);
  const n1 = semPlataforma.results[0].n;
  if (n1) lista.push(`${n1} lead(s) do período estão sem plataforma ("não se sabe") e ficaram fora do CAC.`);
  const n2 = semPagina.results[0].n;
  if (n2) lista.push(`${n2} campanha(s) ainda não estão associadas a uma página do site. Associe em "Campanhas" para o recorte por página funcionar.`);
  // Até quando cada plataforma tem dados importados
  const importadas = ultimaImportacao.results.filter((r) => !f.plataforma || r.plataforma === f.plataforma);
  const nome = { meta: 'Meta', google: 'Google Ads' };
  if (!importadas.length) lista.push('Nenhum dado de anúncio importado ainda. Importe o CSV do Meta ou do Google Ads em "Importar CSV".');
  // Agrupa as plataformas atrasadas pela data, para não repetir o mesmo aviso
  const porData = {};
  for (const r of importadas) if (r.ate < f.ate) (porData[r.ate] ??= []).push(nome[r.plataforma] || r.plataforma);
  for (const [ate, plataformas] of Object.entries(porData)) {
    lista.push(`Os dados do ${plataformas.join(' e do ')} vão só até ${ate.split('-').reverse().join('/')}. Os leads depois disso não têm investimento correspondente.`);
  }
  return lista;
}

/** Série diária: investimento e leads. Inclui os dias sem nada (zero). */
export async function serieDiaria(db, f) {
  const { ads, leads } = filtros(f);
  const [porDiaAds, porDiaLeads] = await db.batch([
    db.prepare(`SELECT a.data AS dia, SUM(a.investimento) AS investimento FROM anuncios_diario a WHERE ${ads.sql} GROUP BY a.data`).bind(...ads.valores),
    db.prepare(
      `SELECT date((l.entrada_em / 1000) - 10800, 'unixepoch') AS dia, COUNT(*) AS leads FROM leads l WHERE ${leads.sql} GROUP BY dia`
    ).bind(...leads.valores),
  ]);
  const inv = Object.fromEntries(porDiaAds.results.map((r) => [r.dia, r.investimento]));
  const lds = Object.fromEntries(porDiaLeads.results.map((r) => [r.dia, r.leads]));
  const dias = [];
  for (let d = f.desde; d <= f.ate; d = somarDias(d, 1)) dias.push({ dia: d, investimento: inv[d] || 0, leads: lds[d] || 0 });
  return dias;
}

const NIVEIS = { campanha: ['campanha'], conjunto: ['campanha', 'conjunto'], anuncio: ['campanha', 'conjunto', 'anuncio'] };

/** Métricas de anúncio por campanha, conjunto ou anúncio. */
export async function porNivel(db, f, nivel = 'campanha') {
  const cols = (NIVEIS[nivel] || NIVEIS.campanha).map((c) => `a.${c}`);
  const { ads } = filtros(f);
  const { results } = await db
    .prepare(
      `SELECT ${cols.join(', ')}, a.plataforma, MAX(cp.pagina) AS pagina, ${SOMAS_ADS}
         FROM anuncios_diario a
         LEFT JOIN campanhas_paginas cp ON cp.plataforma = a.plataforma AND cp.campanha = a.campanha
        WHERE ${ads.sql}
        GROUP BY a.plataforma, ${cols.join(', ')}
        ORDER BY investimento DESC`
    )
    .bind(...ads.valores)
    .all();
  return results.map((r) => ({ ...r, m: derivar(r, { leads: 0 }) }));
}

/** Funil de leads e custo por página do site (o elo entre investimento e CRM). */
export async function porPagina(db, f, paginas) {
  const saida = [];
  for (const pagina of paginas) {
    const m = await calcular(db, { ...f, pagina: pagina.valor });
    if (m.investimento || m.leads) saida.push({ pagina, m });
  }
  return saida;
}

/** Funil de leads agrupado pelos valores de uma lista (área, motivo, campo personalizado...). */
export async function porLista(db, f, { coluna, chaveExtra }) {
  if (!chaveExtra && !COLUNAS_LISTA.includes(coluna)) throw new Error(`Coluna não permitida: ${coluna}`);
  const { leads } = filtros({ ...f, pagina: f.pagina });
  const expr = chaveExtra ? 'json_extract(l.extras, ?)' : `l.${coluna}`;
  const valores = chaveExtra ? [`$.${chaveExtra}`, ...leads.valores] : leads.valores;
  const { results } = await db
    .prepare(`SELECT ${expr} AS valor, ${SOMAS_LEADS} FROM leads l WHERE ${leads.sql} GROUP BY valor ORDER BY leads DESC`)
    .bind(...valores)
    .all();
  return results.map((r) => ({ valor: r.valor, m: derivar({ investimento: null, impressoes: 0 }, r) }));
}

export const COLUNAS_LISTA = ['area', 'pagina', 'canal', 'plataforma', 'motivo_desqualificacao', 'motivo_perda'];
