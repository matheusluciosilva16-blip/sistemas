// Configuração do CRM editável pelo painel (Configurações):
//  - listas de classificação (canal, plataforma, área, motivos...): acrescentar, renomear, desativar;
//  - campos personalizados: "colunas" novas no lead, de qualquer tipo, inclusive listas próprias;
//  - ajustes gerais (ex.: plataforma padrão dos leads que chegam pelas páginas de campanha).
//
// Opções nunca são apagadas, só desativadas: leads antigos continuam com o valor e o rótulo,
// e as métricas do passado não mudam.

import { ErroDeDados } from './erros.js';

/** Listas que já vêm no sistema. O valor interno não muda; o rótulo pode ser editado. */
export const LISTAS_DO_SISTEMA = {
  canal: 'Canal',
  plataforma: 'Plataforma',
  pagina: 'Página do site',
  area: 'Área / tipo de caso',
  motivo_desqualificacao: 'Motivos de desqualificação',
  motivo_perda: 'Motivos de perda',
};

/** Valores iniciais. Gravados no banco na primeira vez que o sistema roda. */
export const OPCOES_INICIAIS = {
  canal: { whatsapp: 'WhatsApp', ligacao: 'Ligação', formulario: 'Formulário', presencial: 'Presencial', outro: 'Outro' },
  plataforma: {
    google: 'Google Ads',
    meta: 'Meta Ads (Facebook/Instagram)',
    organico: 'Orgânico (Google ou Instagram sem anúncio)',
    indicacao: 'Indicação',
    outra: 'Outra',
  },
  pagina: { 'busca-e-apreensao': 'Busca e apreensão', 'conta-bloqueada': 'Conta bloqueada', criminal: 'Criminal', entrada: 'Página de entrada' },
  area: { busca_apreensao: 'Busca e apreensão de veículo', conta_bloqueada: 'Conta bloqueada', criminal: 'Criminal', outra: 'Outra área' },
  motivo_desqualificacao: {
    area_nao_atendida: 'Assunto que o escritório não atende',
    fora_da_regiao: 'Fora da região atendida',
    so_informacao: 'Só queria informação',
    sem_condicao_financeira: 'Sem condição de contratar',
    contato_invalido: 'Contato inválido ou engano',
    duplicado: 'Lead duplicado',
    outro: 'Outro',
  },
  motivo_perda: {
    sem_resposta: 'Parou de responder',
    honorarios: 'Achou os honorários altos',
    outro_advogado: 'Contratou outro advogado',
    desistiu: 'Desistiu de seguir',
    resolveu_sozinho: 'Resolveu por conta própria',
    outro: 'Outro',
  },
};

export const TIPOS_DE_CAMPO = {
  lista: 'Lista de opções (classificação)',
  sim_nao: 'Sim / não',
  numero: 'Número',
  dinheiro: 'Valor em reais',
  data: 'Data e hora',
  texto: 'Texto curto (até 200 caracteres)',
};

export const SECOES = { contato: 'Contato', origem: 'Origem', andamento: 'Andamento', desfecho: 'Desfecho' };

export const AJUSTES = {
  plataforma_padrao: {
    rotulo: 'Plataforma dos leads que chegam pelas páginas de campanha',
    ajuda:
      'Quando a mensagem do WhatsApp é a frase de uma página de campanha e a plataforma não foi informada, ' +
      'o lead recebe esta plataforma. Use enquanto anunciar em uma plataforma só. Deixe vazio quando anunciar em mais de uma.',
  },
};

// Nomes que não podem virar campo personalizado (já existem ou são reservados).
const RESERVADOS = new Set([
  'id', 'etapa', 'extras', 'mensagem_inicial', 'nome', 'telefone', 'entrada_em', 'canal', 'plataforma', 'pagina',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campanha', 'conjunto', 'anuncio', 'ref',
  'area', 'responsavel_id', 'primeiro_atendimento_em', 'qualificado', 'motivo_desqualificacao', 'consulta_agendada_para',
  'compareceu', 'contrato_em', 'honorarios_iniciais', 'exito_estimado', 'perdido_em', 'motivo_perda',
  'referencia_externa', 'busca', 'desde', 'ate', 'por_pagina', 'confirmar', 'criado_em', 'atualizado_em', 'anonimizado_em', 'anonimizado', 'criado_por_tipo', 'criado_por_id',
]);

/** "Área Previdenciária!" → "area_previdenciaria" */
export function paraIdentificador(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function chaveValida(chave) {
  return /^[a-z][a-z0-9_]{1,39}$/.test(chave) && !RESERVADOS.has(chave);
}

/**
 * Carrega listas, campos personalizados e ajustes.
 * Na primeira execução grava as opções iniciais.
 */
export async function carregarConfig(db) {
  let [{ results: opcoes }, { results: campos }, { results: ajustes }] = await db.batch([
    db.prepare('SELECT campo, valor, rotulo, ordem, ativo FROM opcoes ORDER BY campo, ordem, rotulo'),
    db.prepare('SELECT chave, rotulo, tipo, secao, na_lista, ativo, ordem FROM campos_personalizados ORDER BY ordem, rotulo'),
    db.prepare('SELECT chave, valor FROM ajustes'),
  ]);

  if (!opcoes.length) {
    const inserts = [];
    for (const [campo, valores] of Object.entries(OPCOES_INICIAIS)) {
      Object.entries(valores).forEach(([valor, rotulo], i) =>
        inserts.push(db.prepare('INSERT OR IGNORE INTO opcoes (campo, valor, rotulo, ordem) VALUES (?, ?, ?, ?)').bind(campo, valor, rotulo, i))
      );
    }
    await db.batch(inserts);
    ({ results: opcoes } = await db.prepare('SELECT campo, valor, rotulo, ordem, ativo FROM opcoes ORDER BY campo, ordem, rotulo').all());
  }
  return montarConfig(opcoes, campos, ajustes);
}

/** Separado de carregarConfig para os testes montarem uma configuração sem banco. */
export function montarConfig(opcoes, campos = [], ajustes = []) {
  const listas = {};
  for (const o of opcoes) (listas[o.campo] ??= []).push({ ...o, ativo: !!o.ativo });
  return {
    listas,
    campos: campos.map((c) => ({ ...c, ativo: !!c.ativo, na_lista: !!c.na_lista })),
    ajustes: Object.fromEntries(ajustes.map((a) => [a.chave, a.valor])),
  };
}

/** Configuração só com os valores iniciais (testes). */
export function configPadrao() {
  const opcoes = [];
  for (const [campo, valores] of Object.entries(OPCOES_INICIAIS)) {
    Object.entries(valores).forEach(([valor, rotulo], i) => opcoes.push({ campo, valor, rotulo, ordem: i, ativo: 1 }));
  }
  return montarConfig(opcoes);
}

/** Rótulo de um valor (mesmo desativado). */
export function rotulo(config, campo, valor) {
  if (valor == null) return null;
  return config.listas[campo]?.find((o) => o.valor === valor)?.rotulo ?? valor;
}

/** {valor: rótulo} das opções ativas, mais o valor atual do lead se ele estiver desativado. */
export function opcoesParaSelecao(config, campo, valorAtual) {
  const saida = {};
  for (const o of config.listas[campo] || []) {
    if (o.ativo || o.valor === valorAtual) saida[o.valor] = o.ativo ? o.rotulo : `${o.rotulo} (desativada)`;
  }
  return saida;
}

/** Confere se o valor pode ser gravado: tem de existir e estar ativo (ou já ser o valor do lead). */
export function conferirOpcao(config, campo, valor, valorAtual, nomeExibido = campo) {
  const opcao = config.listas[campo]?.find((o) => o.valor === valor);
  if (!opcao || (!opcao.ativo && valor !== valorAtual)) {
    const aceitos = (config.listas[campo] || []).filter((o) => o.ativo).map((o) => o.valor);
    throw new ErroDeDados(`Valor inválido para "${nomeExibido}": "${valor}". Aceitos: ${aceitos.join(', ')}.`);
  }
}

export function campoPersonalizado(config, chave) {
  return config.campos.find((c) => c.chave === chave);
}
