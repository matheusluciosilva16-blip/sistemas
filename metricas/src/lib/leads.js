// Regras do CRM: listas de opções, conversão de dados de entrada e validação.
// Usado tanto pelas telas quanto pela API, para que as duas portas sigam as mesmas regras.

import { ErroDeDados } from './erros.js';
import { conferirOpcao, campoPersonalizado } from './config.js';

export { ErroDeDados };

// As listas de opções (canal, plataforma, área, motivos...) e os campos personalizados
// vivem no banco e são editados em Configurações. Ver src/lib/config.js.

export const ETAPAS = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  qualificado: 'Qualificado',
  consulta_agendada: 'Consulta agendada',
  consulta_realizada: 'Consulta realizada',
  nao_compareceu: 'Não compareceu',
  contrato: 'Contrato fechado',
  desqualificado: 'Desqualificado',
  perdido: 'Perdido',
};

// Mesmo telefone dentro desta janela = mesmo lead (não conta duas vezes).
export const JANELA_DUPLICIDADE = 90 * 24 * 60 * 60 * 1000;

// ---------- Datas ----------
// O Brasil não tem horário de verão desde 2019: Brasília é sempre UTC-3.

const FUSO = '-03:00';

/** Converte a data recebida em milissegundos. Aceita "agora", ISO com ou sem fuso, e AAAA-MM-DD. */
export function lerData(valor) {
  if (valor === null || valor === '') return null;
  if (typeof valor === 'number') return valor;
  const texto = String(valor).trim();
  if (texto.toLowerCase() === 'agora') return Date.now();
  let iso = texto;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'T00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += FUSO; // sem fuso = Brasília
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new ErroDeDados(`Data inválida: "${texto}". Use AAAA-MM-DDTHH:MM ou "agora".`);
  return ms;
}

/** Data em ISO no horário de Brasília, ex.: 2026-10-15T09:30:00-03:00 */
export function isoBrasilia(ms) {
  if (ms === null || ms === undefined) return null;
  return new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 19) + FUSO;
}

/** Valor para <input type="datetime-local">, no horário de Brasília. */
export function valorCampoData(ms) {
  return ms ? isoBrasilia(ms).slice(0, 16) : '';
}

// ---------- Dinheiro e telefone ----------

/** Aceita 3500, 3500.5, "3500", "3.500,00", "R$ 3.500,00". Devolve centavos. */
export function lerDinheiro(valor) {
  if (valor === null || valor === '' || valor === undefined) return null;
  let numero = valor;
  if (typeof valor === 'string') {
    let t = valor.replace(/R\$|\s/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    numero = Number(t);
  }
  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero < 0 || numero > 100_000_000) {
    throw new ErroDeDados(`Valor inválido: "${valor}".`);
  }
  return Math.round(numero * 100);
}

export function reais(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Só dígitos, com DDI 55 quando o número for brasileiro sem DDI. */
export function lerTelefone(valor) {
  if (valor === null || valor === '' || valor === undefined) return null;
  let d = String(valor).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 8 || d.length > 15) throw new ErroDeDados(`Telefone inválido: "${valor}".`);
  return d;
}

export function telefoneLegivel(d) {
  if (!d) return '—';
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

// ---------- Validação ----------

const TEXTOS_LIVRES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campanha', 'conjunto', 'anuncio', 'ref'];
const DATAS = ['entrada_em', 'primeiro_atendimento_em', 'consulta_agendada_para', 'contrato_em', 'perdido_em'];
const LISTAS = ['canal', 'plataforma', 'pagina', 'area', 'motivo_desqualificacao', 'motivo_perda'];
const SIM_NAO = ['qualificado', 'compareceu'];
const DINHEIRO = ['honorarios_iniciais', 'exito_estimado'];

/** Campos que a API e as telas aceitam. Qualquer outro é recusado, para erros não passarem calados. */
export const CAMPOS_ACEITOS = ['nome', 'telefone', 'responsavel_id', 'referencia_externa', ...TEXTOS_LIVRES, ...DATAS, ...LISTAS, ...SIM_NAO, ...DINHEIRO];

function lerSimNao(valor, campo) {
  if (valor === null || valor === '' || valor === undefined) return null;
  if (valor === true || valor === 1 || valor === '1' || valor === 'sim' || valor === 'true') return 1;
  if (valor === false || valor === 0 || valor === '0' || valor === 'nao' || valor === 'não' || valor === 'false') return 0;
  throw new ErroDeDados(`"${campo}" aceita sim/não (true/false).`);
}

/** Converte o valor de um campo personalizado conforme o tipo dele. */
function converterExtra(campo, valor, config, valorAtual) {
  if (valor === null || valor === '' || valor === undefined) return null;
  switch (campo.tipo) {
    case 'texto': return String(valor).trim().slice(0, 200);
    case 'numero': {
      const n = Number(String(valor).replace(',', '.'));
      if (!Number.isFinite(n)) throw new ErroDeDados(`"${campo.rotulo}" precisa ser um número.`);
      return n;
    }
    case 'dinheiro': return lerDinheiro(valor);
    case 'data': return lerData(valor);
    case 'sim_nao': return lerSimNao(valor, campo.rotulo);
    case 'lista':
      conferirOpcao(config, campo.chave, String(valor), valorAtual, campo.rotulo);
      return String(valor);
    default: throw new ErroDeDados(`Tipo de campo desconhecido: ${campo.tipo}.`);
  }
}

/**
 * Converte os dados recebidos para o formato do banco. Só toca nos campos presentes.
 * Campos personalizados podem vir soltos ({"tipo_veiculo": "moto"}) ou dentro de "extras".
 * @param config  resultado de carregarConfig()
 * @param atual   lead atual (para aceitar um valor de opção que foi desativada depois)
 */
export function converter(dados, config, atual = {}) {
  const saida = {};
  const extrasAtuais = atual.extras || {};
  const entrada = { ...dados };
  if (entrada.extras && typeof entrada.extras === 'object') {
    Object.assign(entrada, entrada.extras);
  }
  delete entrada.extras;

  for (const [campo, valor] of Object.entries(entrada)) {
    if (!CAMPOS_ACEITOS.includes(campo)) {
      const extra = campoPersonalizado(config, campo);
      if (!extra) throw new ErroDeDados(`Campo desconhecido: "${campo}".`);
      if (!extra.ativo) throw new ErroDeDados(`O campo "${extra.rotulo}" está desativado.`);
      (saida.extras ??= {})[campo] = converterExtra(extra, valor, config, extrasAtuais[campo]);
      continue;
    }
    if (campo === 'nome') saida.nome = valor ? String(valor).trim().slice(0, 120) : null;
    else if (campo === 'telefone') saida.telefone = lerTelefone(valor);
    else if (campo === 'referencia_externa') saida.referencia_externa = valor ? String(valor).slice(0, 200) : null;
    else if (campo === 'responsavel_id') saida.responsavel_id = valor ? Number(valor) : null;
    else if (TEXTOS_LIVRES.includes(campo)) saida[campo] = valor ? String(valor).trim().slice(0, 200) : null;
    else if (DATAS.includes(campo)) saida[campo] = lerData(valor);
    else if (SIM_NAO.includes(campo)) saida[campo] = lerSimNao(valor, campo);
    else if (DINHEIRO.includes(campo)) saida[campo] = lerDinheiro(valor);
    else if (LISTAS.includes(campo)) {
      if (valor === null || valor === '' || valor === undefined) saida[campo] = null;
      else {
        conferirOpcao(config, campo, String(valor), atual[campo]);
        saida[campo] = String(valor);
      }
    }
  }
  return saida;
}

/** Plataforma deduzida da UTM, quando não informada. */
function plataformaDaUtm(utmSource, config) {
  const s = String(utmSource || '').toLowerCase();
  let p = null;
  if (/google|adwords|gads/.test(s)) p = 'google';
  else if (/facebook|instagram|^fb$|^ig$|meta/.test(s)) p = 'meta';
  // Só usa se a opção existir e estiver ativa nas Configurações.
  return config?.listas.plataforma?.some((o) => o.valor === p && o.ativo) ? p : null;
}

/**
 * Junta o estado atual com as mudanças, aplica as regras automáticas e confere a coerência.
 * Devolve o lead completo como ficará no banco.
 */
export function aplicarRegras(atual, mudancas, config) {
  const lead = { ...atual, ...mudancas };
  // Campos personalizados: junta com os que o lead já tinha; valor vazio apaga a chave.
  if (mudancas.extras) {
    lead.extras = { ...(atual.extras || {}), ...mudancas.extras };
    for (const [k, v] of Object.entries(lead.extras)) if (v === null) delete lead.extras[k];
  }

  if (!lead.nome && !lead.telefone && !atual.anonimizado_em) throw new ErroDeDados('Informe ao menos o nome ou o telefone.');
  if (!lead.entrada_em) lead.entrada_em = Date.now();
  if (!lead.canal) lead.canal = 'whatsapp';
  if (!lead.plataforma && lead.utm_source) lead.plataforma = plataformaDaUtm(lead.utm_source, config);

  // Regras automáticas, para a equipe não precisar marcar o óbvio:
  if ('qualificado' in mudancas) {
    if (mudancas.qualificado !== 0) lead.motivo_desqualificacao = null; // requalificou: motivo antigo sai
  } else if (mudancas.motivo_desqualificacao) {
    lead.qualificado = 0; // informar o motivo já desqualifica
  }
  if ('consulta_agendada_para' in mudancas && mudancas.consulta_agendada_para === null) lead.compareceu = null;
  if (lead.contrato_em && lead.qualificado == null) lead.qualificado = 1; // quem fechou contrato era qualificado

  if ('perdido_em' in mudancas && mudancas.perdido_em === null) lead.motivo_perda = null;
  if (lead.motivo_perda && !lead.perdido_em) lead.perdido_em = Date.now();

  // Coerência:
  if (lead.qualificado === 0 && !lead.motivo_desqualificacao) throw new ErroDeDados('Lead desqualificado precisa de motivo.');
  if (lead.perdido_em && !lead.motivo_perda) throw new ErroDeDados('Lead perdido precisa de motivo.');
  if (lead.contrato_em && lead.perdido_em) throw new ErroDeDados('Um lead não pode ter contrato e estar perdido ao mesmo tempo.');
  if (lead.contrato_em && lead.qualificado === 0) throw new ErroDeDados('Lead com contrato não pode estar desqualificado.');
  if (lead.compareceu != null && !lead.consulta_agendada_para) throw new ErroDeDados('Para marcar comparecimento, informe a data da consulta.');
  if ((lead.honorarios_iniciais != null || lead.exito_estimado != null) && !lead.contrato_em) {
    throw new ErroDeDados('Honorários só podem ser registrados com a data do contrato.');
  }
  // 10 minutos de tolerância para relógios levemente adiantados.
  if ('entrada_em' in mudancas && lead.entrada_em > Date.now() + 10 * 60 * 1000) {
    throw new ErroDeDados('A entrada do lead não pode estar no futuro.');
  }
  if (lead.primeiro_atendimento_em && lead.primeiro_atendimento_em < lead.entrada_em) {
    throw new ErroDeDados('O primeiro atendimento não pode ser antes da entrada do lead.');
  }
  return lead;
}

/** Campos personalizados no formato público: dinheiro em reais, data em ISO de Brasília. */
function extrasParaApi(extras, config) {
  const saida = {};
  for (const [chave, valor] of Object.entries(extras || {})) {
    const tipo = campoPersonalizado(config, chave)?.tipo;
    if (tipo === 'dinheiro') saida[chave] = valor == null ? null : valor / 100;
    else if (tipo === 'data') saida[chave] = isoBrasilia(valor);
    else if (tipo === 'sim_nao') saida[chave] = valor == null ? null : valor === 1;
    else saida[chave] = valor;
  }
  return saida;
}

/** Formato público do lead (API): datas em ISO de Brasília, dinheiro em reais. */
export function paraApi(lead, config) {
  const r = (v) => (v == null ? null : v / 100);
  const b = (v) => (v == null ? null : v === 1);
  return {
    id: lead.id,
    etapa: lead.etapa,
    nome: lead.nome,
    telefone: lead.telefone,
    entrada_em: isoBrasilia(lead.entrada_em),
    canal: lead.canal,
    plataforma: lead.plataforma,
    pagina: lead.pagina,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    campanha: lead.campanha,
    conjunto: lead.conjunto,
    anuncio: lead.anuncio,
    ref: lead.ref,
    area: lead.area,
    responsavel_id: lead.responsavel_id,
    primeiro_atendimento_em: isoBrasilia(lead.primeiro_atendimento_em),
    qualificado: b(lead.qualificado),
    motivo_desqualificacao: lead.motivo_desqualificacao,
    consulta_agendada_para: isoBrasilia(lead.consulta_agendada_para),
    compareceu: b(lead.compareceu),
    contrato_em: isoBrasilia(lead.contrato_em),
    honorarios_iniciais: r(lead.honorarios_iniciais),
    exito_estimado: r(lead.exito_estimado),
    perdido_em: isoBrasilia(lead.perdido_em),
    motivo_perda: lead.motivo_perda,
    referencia_externa: lead.referencia_externa,
    criado_em: isoBrasilia(lead.criado_em),
    atualizado_em: isoBrasilia(lead.atualizado_em),
    extras: extrasParaApi(lead.extras, config),
    anonimizado: !!lead.anonimizado_em,
  };
}
