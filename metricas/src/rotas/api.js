// API para a agente (Naia) e integrações. Autenticação: "Authorization: Bearer mls_...".
// Versionada em /api/v1 para que mudanças futuras não quebrem quem já usa.
// Documentação para quem integra: docs/API.md

import { Hono } from 'hono';
import { exigirChave } from '../lib/permissoes.js';
import { OPCOES, ETAPAS, FRASES_DO_SITE, ErroDeDados, paraApi, lerTelefone, lerData } from '../lib/leads.js';
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
api.get('/opcoes', exigirChave(), (c) => c.json({ ...OPCOES, etapa: ETAPAS, frases_do_site: FRASES_DO_SITE }));

/** Cria um lead. Se ele já existir (mesma referência ou mesmo telefone em 90 dias), devolve o existente. */
api.post('/leads', exigirChave('leads:escrever'), async (c) => {
  const { mensagem_inicial, ...dados } = await corpoJson(c);
  const origem = origemPelaMensagem(mensagem_inicial);
  if (origem) {
    dados.pagina ??= origem.pagina;
    if (origem.area) dados.area ??= origem.area;
  }
  const { lead, jaExistia } = await criarLead(c.env.DB, dados, ator(c));
  return c.json({ ja_existia: jaExistia, origem_identificada: origem?.pagina ?? null, lead: paraApi(lead) }, jaExistia ? 200 : 201);
});

/** Lista leads. Filtros: telefone, etapa, area, plataforma, desde, ate, busca, pagina, por_pagina. */
api.get('/leads', exigirChave('leads:ler'), async (c) => {
  const q = c.req.query();
  if (q.etapa && !(q.etapa in ETAPAS)) throw new ErroDeDados(`Etapa inválida. Aceitas: ${Object.keys(ETAPAS).join(', ')}.`);
  const r = await listarLeads(c.env.DB, {
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
  return c.json({ total: r.total, pagina: r.pagina, por_pagina: r.porPagina, leads: r.leads.map(paraApi) });
});

api.get('/leads/:id{[0-9]+}', exigirChave('leads:ler'), async (c) => {
  const lead = await buscarLead(c.env.DB, Number(c.req.param('id')));
  if (!lead) return c.json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' }, 404);
  return c.json({ lead: paraApi(lead) });
});

/** Atualiza só os campos enviados. Ex.: {"primeiro_atendimento_em": "agora"} */
api.patch('/leads/:id{[0-9]+}', exigirChave('leads:escrever'), async (c) => {
  const dados = await corpoJson(c);
  const lead = await atualizarLead(c.env.DB, Number(c.req.param('id')), dados, ator(c));
  if (!lead) return c.json({ erro: 'nao_encontrado', mensagem: 'Lead não encontrado.' }, 404);
  return c.json({ lead: paraApi(lead) });
});

export default api;
