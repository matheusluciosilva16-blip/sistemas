// API para a agente (Naia) e integrações. Autenticação: "Authorization: Bearer mls_...".
// Versionada em /api/v1 para que mudanças futuras não quebrem quem já usa.

import { Hono } from 'hono';
import { exigirChave } from '../lib/permissoes.js';

const api = new Hono();

/** Teste de conexão: confirma que a chave funciona e mostra as permissões dela. */
api.get('/status', exigirChave(), (c) => {
  const chave = c.get('chave');
  return c.json({ ok: true, chave: chave.nome, escopos: chave.escopos, versao: 'v1' });
});

export default api;
