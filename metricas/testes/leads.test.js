// Testes das regras do CRM. Rodar com: npm run testar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converter, aplicarRegras, lerData, isoBrasilia, lerDinheiro, lerTelefone, ErroDeDados } from '../src/lib/leads.js';

const novo = (dados) => aplicarRegras({}, converter(dados));
const muda = (atual, dados) => aplicarRegras(atual, converter(dados));

test('datas sem fuso são horário de Brasília', () => {
  assert.equal(lerData('2026-10-15T09:30'), Date.parse('2026-10-15T12:30:00Z'));
  assert.equal(isoBrasilia(Date.parse('2026-10-15T12:30:00Z')), '2026-10-15T09:30:00-03:00');
  assert.equal(lerData('2026-10-15T09:30:00Z'), Date.parse('2026-10-15T09:30:00Z'));
  assert.throws(() => lerData('ontem'), ErroDeDados);
});

test('dinheiro em vários formatos vira centavos', () => {
  assert.equal(lerDinheiro(3500), 350000);
  assert.equal(lerDinheiro('3.500,50'), 350050);
  assert.equal(lerDinheiro('R$ 1.200,00'), 120000);
  assert.equal(lerDinheiro('800.5'), 80050);
  assert.throws(() => lerDinheiro('-1'), ErroDeDados);
});

test('telefone ganha DDI 55', () => {
  assert.equal(lerTelefone('(22) 99999-8888'), '5522999998888');
  assert.equal(lerTelefone('+55 22 2040-1317'), '552220401317');
  assert.throws(() => lerTelefone('123'), ErroDeDados);
});

test('campo desconhecido e valor fora da lista são recusados', () => {
  assert.throws(() => converter({ detalhes_do_caso: 'x' }), /Campo desconhecido/);
  assert.throws(() => converter({ area: 'tributario' }), /Aceitos/);
});

test('lead precisa de nome ou telefone', () => {
  assert.throws(() => novo({ canal: 'whatsapp' }), /nome ou o telefone/);
  assert.equal(novo({ nome: 'Ana' }).canal, 'whatsapp');
});

test('plataforma deduzida da utm_source', () => {
  assert.equal(novo({ nome: 'A', utm_source: 'google' }).plataforma, 'google');
  assert.equal(novo({ nome: 'A', utm_source: 'ig' }).plataforma, 'meta');
  assert.equal(novo({ nome: 'A', utm_source: 'google', plataforma: 'meta' }).plataforma, 'meta');
});

test('motivo de desqualificação desqualifica; requalificar apaga o motivo', () => {
  const a = novo({ nome: 'A', motivo_desqualificacao: 'fora_da_regiao' });
  assert.equal(a.qualificado, 0);
  const b = muda(a, { qualificado: true });
  assert.equal(b.qualificado, 1);
  assert.equal(b.motivo_desqualificacao, null);
  assert.throws(() => novo({ nome: 'A', qualificado: false }), /precisa de motivo/);
});

test('contrato marca como qualificado e exige coerência', () => {
  const a = novo({ nome: 'A', contrato_em: 'agora', honorarios_iniciais: 3000 });
  assert.equal(a.qualificado, 1);
  assert.throws(() => novo({ nome: 'A', honorarios_iniciais: 3000 }), /data do contrato/);
  assert.throws(() => novo({ nome: 'A', contrato_em: 'agora', motivo_perda: 'desistiu' }), /ao mesmo tempo/);
});

test('perda registra data e exige motivo', () => {
  const a = novo({ nome: 'A', motivo_perda: 'sem_resposta' });
  assert.ok(a.perdido_em);
  assert.throws(() => novo({ nome: 'A', perdido_em: 'agora' }), /precisa de motivo/);
  assert.equal(muda(a, { perdido_em: null }).motivo_perda, null);
});

test('comparecimento exige consulta; tirar a consulta limpa o comparecimento', () => {
  assert.throws(() => novo({ nome: 'A', compareceu: true }), /data da consulta/);
  const a = novo({ nome: 'A', consulta_agendada_para: '2026-10-20T14:00', compareceu: true });
  assert.equal(muda(a, { consulta_agendada_para: null }).compareceu, null);
});

test('atendimento antes da entrada é recusado', () => {
  assert.throws(() => novo({ nome: 'A', entrada_em: '2026-01-15T10:00', primeiro_atendimento_em: '2026-01-15T09:00' }), /antes da entrada/);
});

test('entrada no futuro é recusada', () => {
  assert.throws(() => novo({ nome: 'A', entrada_em: Date.now() + 3600 * 1000 }), /futuro/);
});
