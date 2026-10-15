// API para a agente (Naia) e integrações. Autenticação: "Authorization: Bearer mls_...".
// Versionada em /api/v1 para que mudanças futuras não quebrem quem já usa.
// Documentação para quem integra: docs/API.md

import { Hono } from 'hono';
import { exigirChave } from '../lib/permissoes.js';
import { ETAPAS, FRASES_DO_SITE, ErroDeDados, paraApi, lerTelefone, lerData } from '../lib/leads.js';
import { carregarConfig, LISTAS_DO_SISTEMA, TIPOS_DE_CAMPO, campoPersonalizado, plataformaDaPagina } from '../lib/config.js';
import { criarLead, atualizarLead, buscarLead, listarLeads } from '../lib/repo-leads.js';

const api = new Hono();

api.onError((erro, c) => {
  if (erro instanceof ErroDeDados) return c.json({ erro: 'dados_invalidos', mensagem: erro.message }, 422);
  console.error(erro);
  return c.json({ erro: 'erro_interno', mensagem: 'Erro inesperado.' }, 500);
});

async function corpoJson(c) {
  try {
    const corpo = await c.req.json();
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
    return corpo;
  } catch {
    throw new ErroDeDados('Envie um objeto JSON no corpo, com Content-Type: application/json.');
  }
}

const ator = (c) => ({ tipo: 'chave', id: c.get('chave').id });

/**
 * A primeira mensagem do WhatsApp diz de qual página do site a pessoa veio.
 * A mensagem é usada só para essa comparação e NÃO é gravada (LGPD).
 */
function origemPelaMensagem(mensagem) {
  const texto = String(mensagem || '').toLowerCase();
  return FRASES_DO_SITE.find((f) => texto.includes(f.frase.toLowerCase())) || null;
}

/** Teste de conexão: confirma que a chave funciona e mostra as permissões dela. */
api.get('/status', exigirChave(), (c) => {
  const chave = c.get('chave');
  return c.json({ ok: true, chave: chave.nome, escopos: chave.escopos, versao: 'v1' });
});

/** Valores aceitos em cada campo de lista. A agente pode consultar antes de gravar. */
api.get('/opcoes', exigirChave(), async (c) => {
  const config = await carregarConfig(c.env.DB);
  const ativas = (campo) => Object.fromEntries((config.listas[campo] || []).filter((o) => o.ativo).map((o) => [o.valor, o.rotulo]));
  return c.json({
    ...Object.fromEntries(Object.keys(LISTAS_DO_SISTEMA).map((campo) => [campo, ativas(campo)])),
    etapa: ETAPAS,
    frases_do_site: FRASES_DO_SITE,
    plataforma_por_pagina: Object.fromEntries((config.listas.pagina || []).map((o) => [o.valor, plataformaDaPagina(config, o.valor)])),
    campos_personalizados: config.campos
      .filter((cp) => cp.ativo)
      .map((cp) => ({
        chave: cp.chave,
        rotulo: cp.rotulo,
        tipo: cp.tipo,
        tipo_descricao: TIPOS_DE_CAMPO[cp.tipo],
        ...(cp.tipo === 'lista' ? { opcoes: ativas(cp.chave) } : {}),
      })),
  });
});

/** Cria um lead. Se ele já existir (mesma referência ou mesmo telefone em 90 dias), devolve o existente. */
api.post('/leads', exigirChave('leads:escrever'), async (c) => {
  const { mensagem_inicial, ...dados } = await corpoJson(c);
  const config = await carregarConfig(c.env.DB);
  const origem = origemPelaMensagem(mensagem_inicial);
  if (origem) {
    dados.pagina ??= origem.pagina;
    if (origem.area) dados.area ??= origem.area;
    // Plataforma não informada → a plataforma que anuncia aquela página (Configurações).
    const padrao = plataformaDaPagina(config, dados.pagina);
    if (!dados.plataforma && !dados.utm_source && padrao) dados.plataforma = padrao;
  }
  const { lead, jaExistia } = await criarLead(c.env.DB, dados, ator(c), config);
  return c.json({ ja_existia: jaExistia, origem_identificada: origem?.pagina ?? null, lead: paraApi(lead, config) }, jaExistia ? 200 : 201);
});

/** Lista leads. Filtros: telefone, etapa, area, plataforma, desde, ate, busca, pagina, por_pagina. */
api.get('/leads', exigirChave('leads:ler'), async (c) => {
  const q = c.req.query();
  if (q.etapa && !(q.etapa in ETAPAS)) throw new ErroDeDados(`Etapa inválida. Aceitas: ${Object.keys(ETAPAS).join(', ')}.`);
  const config = await carregarConfig(c.env.DB);
  // Qualquer outro parâmetro com nome de campo personalizado vira filtro. Ex.: ?tipo_veiculo=moto
  const extras = {};
  for (const [chave, valor] of Object.entries(q)) {
    if (campoPersonalizado(config, chave)) extras[chave] = valor;
  }
  const r = await listarLeads(c.env.DB, {
    extras,
    etapa: q.etapa,
    area: q.area,
    plataforma: q.plataforma,
    telefone: q.telefone ? lerTelefone(q.telefone) : null,
    desde: q.desde ? lerData(q.desde) : null,
    ate: q.ate ? lerData(q.ate) : null,
    busca: q.busca,
    pagina: q.pagina,
    porPagina: q.por_pagina,
  });
  return c.json({ total: r.total, pagina: r.pagina, por_pagina: r.porPagina, leads: r.leads.map((l) => paraApi(l, config)) });
});

api.get('/leads/:id{[0-9]+}', exigirChave('leads:ler'), async (c) => {
  const lead = await buscarLead(c.env.DB, Number(c.req.param('id')));
  if (!lead) return c.json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' }, 404);
  return c.json({ lead: paraApi(lead, await carregarConfig(c.env.DB)) });
});

/** Atualiza só os campos enviados. Ex.: {"primeiro_atendimento_em": "agora"} */
api.patch('/leads/:id{[0-9]+}', exigirChave('leads:escrever'), async (c) => {
  const dados = await corpoJson(c);
  const config = await carregarConfig(c.env.DB);
  const lead = await atualizarLead(c.env.DB, Number(c.req.param('id')), dados, ator(c), config);
  if (!lead) return c.json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' }, 404);
  return c.json({ lead: paraApi(lead, config) });
});

export default api;
