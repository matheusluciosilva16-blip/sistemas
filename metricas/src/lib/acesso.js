// Controle de acesso: sessões da equipe, chaves de API e registro de auditoria.

import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { gerarToken, sha256 } from './seguranca.js';

const COOKIE = 'sessao';
const DURACAO_SESSAO = 30 * 24 * 60 * 60 * 1000; // 30 dias
const JANELA_TENTATIVAS = 15 * 60 * 1000; // 15 minutos
const MAX_TENTATIVAS = 5;

// Escopos que uma chave de API pode receber. A etapa 2 passa a usar os de leads.
export const ESCOPOS = {
  'leads:escrever': 'Criar e atualizar leads',
  'leads:ler': 'Consultar leads',
};

/** Registra uma ação na auditoria. Nunca grava dado pessoal de lead aqui. */
export async function auditar(db, { atorTipo, atorId = null, acao, detalhe = null }) {
  await db
    .prepare('INSERT INTO auditoria (quando, ator_tipo, ator_id, acao, detalhe) VALUES (?, ?, ?, ?, ?)')
    .bind(Date.now(), atorTipo, atorId, acao, detalhe)
    .run();
}

// ---------- Sessões ----------

export async function abrirSessao(c, usuarioId) {
  const token = gerarToken();
  const agora = Date.now();
  await c.env.DB.prepare('INSERT INTO sessoes (token_hash, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), usuarioId, agora, agora + DURACAO_SESSAO)
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACAO_SESSAO / 1000,
  });
}

export async function fecharSessao(c) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Devolve o usuário dono do cookie, ou null. Usuário desativado perde o acesso na hora. */
export async function usuarioDaSessao(c) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.papel
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`
  )
    .bind(await sha256(token), Date.now())
    .first();
}

// ---------- Limite de tentativas de login ----------

export async function bloqueado(db, chaves) {
  const desde = Date.now() - JANELA_TENTATIVAS;
  for (const chave of chaves) {
    const { n } = await db
      .prepare('SELECT COUNT(*) AS n FROM tentativas_login WHERE chave = ? AND quando > ?')
      .bind(chave, desde)
      .first();
    if (n >= MAX_TENTATIVAS) return true;
  }
  return false;
}

export async function registrarFalha(db, chaves) {
  const agora = Date.now();
  await db.batch([
    ...chaves.map((chave) => db.prepare('INSERT INTO tentativas_login (chave, quando) VALUES (?, ?)').bind(chave, agora)),
    // faxina: apaga registros antigos para a tabela não crescer
    db.prepare('DELETE FROM tentativas_login WHERE quando < ?').bind(agora - JANELA_TENTATIVAS),
  ]);
}

export async function limparFalhas(db, chave) {
  await db.prepare('DELETE FROM tentativas_login WHERE chave = ?').bind(chave).run();
}

// ---------- Chaves de API ----------

/** Cria uma chave nova. Devolve o texto completo — é a única vez que ele existe. */
export async function criarChave(db, { nome, escopos, criadoPor }) {
  const chave = `mls_${gerarToken(32)}`;
  await db
    .prepare('INSERT INTO chaves_api (nome, prefixo, chave_hash, escopos, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(nome, chave.slice(0, 10), await sha256(chave), escopos.join(','), criadoPor, Date.now())
    .run();
  return chave;
}

/** Confere o cabeçalho "Authorization: Bearer mls_..." e devolve a chave, ou null. */
export async function chaveDaRequisicao(c) {
  const cabecalho = c.req.header('Authorization') || '';
  const [tipo, chave] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !chave?.startsWith('mls_')) return null;
  const registro = await c.env.DB.prepare(
    'SELECT id, nome, escopos FROM chaves_api WHERE chave_hash = ? AND revogada_em IS NULL'
  )
    .bind(await sha256(chave))
    .first();
  if (!registro) return null;
  await c.env.DB.prepare('UPDATE chaves_api SET ultimo_uso = ? WHERE id = ?').bind(Date.now(), registro.id).run();
  return { ...registro, escopos: registro.escopos.split(',').filter(Boolean) };
}
