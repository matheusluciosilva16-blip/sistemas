// Leitura e gravação de leads no banco. Toda escrita passa por aplicarRegras().

import { aplicarRegras, converter, JANELA_DUPLICIDADE, ErroDeDados } from './leads.js';
import { auditar } from './acesso.js';

const COLUNAS = [
  'nome', 'telefone', 'entrada_em', 'canal', 'plataforma', 'pagina',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'campanha', 'conjunto', 'anuncio', 'ref', 'area', 'responsavel_id',
  'primeiro_atendimento_em', 'qualificado', 'motivo_desqualificacao',
  'consulta_agendada_para', 'compareceu', 'contrato_em', 'honorarios_iniciais',
  'exito_estimado', 'perdido_em', 'motivo_perda',
];

export async function buscarLead(db, id) {
  return db.prepare('SELECT * FROM leads_com_etapa WHERE id = ?').bind(id).first();
}

/**
 * Cria um lead. Se já existir um com a mesma referência externa, ou o mesmo telefone
 * nos últimos 90 dias, devolve o existente em vez de duplicar.
 * @param ator {tipo: 'usuario'|'chave', id}
 * @returns {{lead, jaExistia: boolean}}
 */
export async function criarLead(db, dados, ator) {
  const mudancas = converter(dados);

  if (mudancas.referencia_externa) {
    const existente = await db
      .prepare('SELECT * FROM leads_com_etapa WHERE referencia_externa = ?')
      .bind(mudancas.referencia_externa)
      .first();
    if (existente) return { lead: existente, jaExistia: true };
  }
  if (mudancas.telefone) {
    const existente = await db
      .prepare('SELECT * FROM leads_com_etapa WHERE telefone = ? AND entrada_em > ? ORDER BY entrada_em DESC LIMIT 1')
      .bind(mudancas.telefone, Date.now() - JANELA_DUPLICIDADE)
      .first();
    if (existente) return { lead: existente, jaExistia: true };
  }

  const lead = aplicarRegras({}, mudancas);
  const agora = Date.now();
  const valores = COLUNAS.map((c) => lead[c] ?? null);
  const { meta } = await db
    .prepare(
      `INSERT INTO leads (${COLUNAS.join(', ')}, referencia_externa, criado_por_tipo, criado_por_id, criado_em, atualizado_em)
       VALUES (${COLUNAS.map(() => '?').join(', ')}, ?, ?, ?, ?, ?)`
    )
    .bind(...valores, lead.referencia_externa ?? null, ator.tipo, ator.id, agora, agora)
    .run();

  await auditar(db, { atorTipo: ator.tipo, atorId: ator.id, acao: 'lead_criado', detalhe: `lead=${meta.last_row_id}` });
  return { lead: await buscarLead(db, meta.last_row_id), jaExistia: false };
}

/** Atualiza só os campos enviados. Devolve o lead atualizado, ou null se não existir. */
export async function atualizarLead(db, id, dados, ator) {
  const atual = await buscarLead(db, id);
  if (!atual) return null;
  if (atual.anonimizado_em && ('nome' in dados || 'telefone' in dados)) {
    throw new ErroDeDados('Lead anonimizado: nome e telefone não podem voltar a ser gravados.');
  }
  const mudancas = converter(dados);
  delete mudancas.referencia_externa; // a referência só é definida na criação

  const lead = aplicarRegras(atual, mudancas);
  const alterados = COLUNAS.filter((c) => (lead[c] ?? null) !== (atual[c] ?? null));
  if (!alterados.length) return atual;

  await db
    .prepare(`UPDATE leads SET ${alterados.map((c) => `${c} = ?`).join(', ')}, atualizado_em = ? WHERE id = ?`)
    .bind(...alterados.map((c) => lead[c] ?? null), Date.now(), id)
    .run();
  // Na auditoria vão só os NOMES dos campos alterados, nunca os valores.
  await auditar(db, { atorTipo: ator.tipo, atorId: ator.id, acao: 'lead_atualizado', detalhe: `lead=${id} campos=${alterados.join(',')}` });
  return buscarLead(db, id);
}

/**
 * Exclusão a pedido do titular (LGPD). Apaga o que identifica a pessoa e mantém os números
 * (datas, etapa, valores, campanha), para que o CAC e o histórico das campanhas não mudem.
 */
export async function anonimizarLead(db, id, ator) {
  const { meta } = await db
    .prepare(
      `UPDATE leads SET nome = NULL, telefone = NULL, referencia_externa = NULL,
              anonimizado_em = ?, atualizado_em = ? WHERE id = ? AND anonimizado_em IS NULL`
    )
    .bind(Date.now(), Date.now(), id)
    .run();
  if (meta.changes) await auditar(db, { atorTipo: ator.tipo, atorId: ator.id, acao: 'lead_anonimizado', detalhe: `lead=${id}` });
  return meta.changes > 0;
}

/**
 * Lista leads com filtros. Todos opcionais.
 * @param f {etapa, area, plataforma, telefone, busca, desde, ate, pagina, porPagina}
 */
export async function listarLeads(db, f = {}) {
  const onde = [];
  const valores = [];
  if (f.etapa) { onde.push('etapa = ?'); valores.push(f.etapa); }
  if (f.area) { onde.push('area = ?'); valores.push(f.area); }
  if (f.plataforma) { onde.push('plataforma = ?'); valores.push(f.plataforma); }
  if (f.telefone) { onde.push('telefone = ?'); valores.push(f.telefone); }
  if (f.desde) { onde.push('entrada_em >= ?'); valores.push(f.desde); }
  if (f.ate) { onde.push('entrada_em < ?'); valores.push(f.ate); }
  if (f.busca) {
    onde.push('(nome LIKE ? OR telefone LIKE ?)');
    const termo = `%${f.busca.replace(/[%_]/g, '')}%`;
    valores.push(termo, `%${f.busca.replace(/\D/g, '') || '¬'}%`);
  }
  const filtro = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const porPagina = Math.min(Math.max(Number(f.porPagina) || 50, 1), 100);
  const pagina = Math.max(Number(f.pagina) || 1, 1);

  const [{ results }, total] = await Promise.all([
    db
      .prepare(`SELECT * FROM leads_com_etapa ${filtro} ORDER BY entrada_em DESC LIMIT ? OFFSET ?`)
      .bind(...valores, porPagina, (pagina - 1) * porPagina)
      .all(),
    db.prepare(`SELECT COUNT(*) AS n FROM leads_com_etapa ${filtro}`).bind(...valores).first('n'),
  ]);
  return { leads: results, total, pagina, porPagina };
}
