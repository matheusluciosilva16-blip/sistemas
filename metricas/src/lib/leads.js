// Regras do CRM: listas de opções, conversão de dados de entrada e validação.
// Usado tanto pelas telas quanto pela API, para que as duas portas sigam as mesmas regras.

// ---------- Listas fechadas ----------
// Para acrescentar uma opção, basta incluí-la aqui. Não remova opções já usadas:
// leads antigos continuariam com o valor, mas sem rótulo.

export const OPCOES = {
  canal: {
    whatsapp: 'WhatsApp',
    ligacao: 'Ligação',
    formulario: 'Formulário',
    presencial: 'Presencial',
    outro: 'Outro',
  },
  plataforma: {
    google: 'Google Ads',
    meta: 'Meta Ads (Facebook/Instagram)',
    organico: 'Orgânico (Google ou Instagram sem anúncio)',
    indicacao: 'Indicação',
    outra: 'Outra',
  },
  pagina: {
    'busca-e-apreensao': 'Busca e apreensão',
    'conta-bloqueada': 'Conta bloqueada',
    criminal: 'Criminal',
    entrada: 'Página de entrada',
  },
  area: {
    busca_apreensao: 'Busca e apreensão de veículo',
    conta_bloqueada: 'Conta bloqueada',
    criminal: 'Criminal',
    outra: 'Outra área',
  },
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

// Frase de WhatsApp de cada página do site → página e área.
// Mantida em sincronia com o repositório do site (bloco "msgGeral" de cada página).
export const FRASES_DO_SITE = [
  { frase: 'Estou com um problema de busca e apreensão no meu veículo', pagina: 'busca-e-apreensao', area: 'busca_apreensao' },
  { frase: 'Tive valores bloqueados judicialmente na minha conta', pagina: 'conta-bloqueada', area: 'conta_bloqueada' },
  { frase: 'Preciso de orientação sobre uma situação criminal urgente', pagina: 'criminal', area: 'criminal' },
  { frase: 'Gostaria de orientação jurídica', pagina: 'entrada', area: null },
];

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

export class ErroDeDados extends Error {}

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

/** Converte os dados recebidos para o formato do banco. Só toca nos campos presentes. */
export function converter(dados) {
  const saida = {};
  for (const [campo, valor] of Object.entries(dados)) {
    if (!CAMPOS_ACEITOS.includes(campo)) throw new ErroDeDados(`Campo desconhecido: "${campo}".`);
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
      else if (!(valor in OPCOES[campo])) {
        throw new ErroDeDados(`Valor inválido para "${campo}": "${valor}". Aceitos: ${Object.keys(OPCOES[campo]).join(', ')}.`);
      } else saida[campo] = valor;
    }
  }
  return saida;
}

/** Plataforma deduzida da UTM, quando não informada. */
function plataformaDaUtm(utmSource) {
  const s = String(utmSource || '').toLowerCase();
  if (/google|adwords|gads/.test(s)) return 'google';
  if (/facebook|instagram|^fb$|^ig$|meta/.test(s)) return 'meta';
  return null;
}

/**
 * Junta o estado atual com as mudanças, aplica as regras automáticas e confere a coerência.
 * Devolve o lead completo como ficará no banco.
 */
export function aplicarRegras(atual, mudancas) {
  const lead = { ...atual, ...mudancas };

  if (!lead.nome && !lead.telefone && !atual.anonimizado_em) throw new ErroDeDados('Informe ao menos o nome ou o telefone.');
  if (!lead.entrada_em) lead.entrada_em = Date.now();
  if (!lead.canal) lead.canal = 'whatsapp';
  if (!lead.plataforma && lead.utm_source) lead.plataforma = plataformaDaUtm(lead.utm_source);

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

/** Formato público do lead (API): datas em ISO de Brasília, dinheiro em reais. */
export function paraApi(lead) {
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
    anonimizado: !!lead.anonimizado_em,
  };
}
