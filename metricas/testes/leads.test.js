// Testes das regras do CRM. Rodar com: npm run testar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converter, aplicarRegras, lerData, isoBrasilia, lerDinheiro, lerTelefone, ErroDeDados } from '../src/lib/leads.js';
import { configPadrao, montarConfig, paraIdentificador, chaveValida } from '../src/lib/config.js';

const CFG = configPadrao();

const novo = (dados, cfg = CFG) => aplicarRegras({}, converter(dados, cfg), cfg);
const muda = (atual, dados, cfg = CFG) => aplicarRegras(atual, converter(dados, cfg, atual), cfg);

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
  assert.throws(() => converter({ detalhes_do_caso: 'x' }, CFG), /Campo desconhecido/);
  assert.throws(() => converter({ area: 'tributario' }, CFG), /Aceitos/);
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

// ---------- CRM configurável ----------

function configCom() {
  const base = configPadrao();
  const opcoes = Object.entries(base.listas).flatMap(([campo, os]) => os.map((o) => ({ ...o, campo })));
  // "outra" área desativada; campo personalizado de lista com uma opção desativada
  opcoes.find((o) => o.campo === 'area' && o.valor === 'outra').ativo = 0;
  opcoes.push({ campo: 'tipo_veiculo', valor: 'carro', rotulo: 'Carro', ordem: 0, ativo: 1 });
  opcoes.push({ campo: 'tipo_veiculo', valor: 'moto', rotulo: 'Moto', ordem: 1, ativo: 0 });
  return montarConfig(opcoes, [
    { chave: 'tipo_veiculo', rotulo: 'Tipo de veículo', tipo: 'lista', secao: 'contato', na_lista: 1, ativo: 1 },
    { chave: 'parcelas_atrasadas', rotulo: 'Parcelas atrasadas', tipo: 'numero', secao: 'andamento', na_lista: 0, ativo: 1 },
    { chave: 'valor_bloqueado', rotulo: 'Valor bloqueado', tipo: 'dinheiro', secao: 'andamento', na_lista: 0, ativo: 1 },
    { chave: 'antigo', rotulo: 'Campo antigo', tipo: 'texto', secao: 'andamento', na_lista: 0, ativo: 0 },
  ]);
}

test('campos personalizados são aceitos soltos ou dentro de extras', () => {
  const cfg = configCom();
  const a = novo({ nome: 'A', tipo_veiculo: 'carro', extras: { parcelas_atrasadas: '3', valor_bloqueado: '1.250,00' } }, cfg);
  assert.deepEqual(a.extras, { tipo_veiculo: 'carro', parcelas_atrasadas: 3, valor_bloqueado: 125000 });
});

test('campo personalizado desativado e opção desativada são recusados em lead novo', () => {
  const cfg = configCom();
  assert.throws(() => novo({ nome: 'A', antigo: 'x' }, cfg), /desativado/);
  assert.throws(() => novo({ nome: 'A', tipo_veiculo: 'moto' }, cfg), /Aceitos: carro/);
  assert.throws(() => novo({ nome: 'A', area: 'outra' }, cfg), /Valor inválido/);
});

test('lead que já tinha a opção desativada pode ser salvo sem perdê-la', () => {
  const cfg = configCom();
  const atual = { nome: 'A', entrada_em: 1, canal: 'whatsapp', area: 'outra', extras: { tipo_veiculo: 'moto' } };
  const b = muda(atual, { area: 'outra', tipo_veiculo: 'moto', nome: 'B' }, cfg);
  assert.equal(b.area, 'outra');
  assert.equal(b.extras.tipo_veiculo, 'moto');
});

test('valor vazio apaga o campo personalizado; os outros continuam', () => {
  const cfg = configCom();
  const atual = { nome: 'A', entrada_em: 1, canal: 'whatsapp', extras: { tipo_veiculo: 'carro', parcelas_atrasadas: 2 } };
  assert.deepEqual(muda(atual, { parcelas_atrasadas: '' }, cfg).extras, { tipo_veiculo: 'carro' });
});

test('identificador de campo novo', () => {
  assert.equal(paraIdentificador('Área Previdenciária!'), 'area_previdenciaria');
  assert.equal(chaveValida('tipo_veiculo'), true);
  assert.equal(chaveValida('telefone'), false);
  assert.equal(chaveValida('busca'), false);
});
