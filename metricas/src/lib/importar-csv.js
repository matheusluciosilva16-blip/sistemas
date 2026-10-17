// Importação dos CSVs exportados do Meta (Gerenciador de Anúncios) e do Google Ads.
// Descobre a plataforma pelo cabeçalho, reconhece as colunas pelo nome (português ou inglês),
// avisa o que faltar e devolve linhas diárias prontas para gravar.
// Os passos de exportação de cada plataforma estão na tela de importação (src/rotas/metricas.js).

import { ErroDeDados } from './erros.js';

// ---------- CSV ----------

/** Lê um CSV (vírgula ou ponto e vírgula, com aspas). Devolve uma lista de linhas (listas de células). */
/** Converte os bytes do arquivo em texto. O Google pode exportar em UTF-16 (opção "CSV para Excel"). */
export function decodificar(bytes) {
  const b = new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

export function lerCsv(texto) {
  texto = texto.replace(/^﻿/, ''); // BOM do Excel
  // Separador: o que mais aparece nas primeiras linhas (o Google põe linhas de título antes do cabeçalho).
  const inicio = texto.split(/\r?\n/, 6).join('\n');
  const contar = (c) => inicio.split(c).length - 1;
  const sep = ['\t', ';', ','].reduce((melhor, c) => (contar(c) > contar(melhor) ? c : melhor), ',');

  const linhas = [];
  let linha = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { celula += '"'; i++; }
      else if (ch === '"') aspas = false;
      else celula += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(celula); celula = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula); celula = '';
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
      linha = [];
    } else celula += ch;
  }
  linha.push(celula);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  return { linhas, separador: sep };
}

// ---------- Números e datas ----------

/** Inteiro de contagem: "1.234", "1,234" e "1234" valem 1234. Vazio ou "-" = null. */
export function lerInteiro(v) {
  const t = String(v ?? '').trim();
  if (!t || /^[-—]+$/.test(t)) return null;
  // Conversões do Google vêm com decimais ("1,00"): arredonda em vez de juntar os dígitos.
  if (/[.,]\d{1,2}$/.test(t) && !/^\d{1,3}([.,]\d{3})+$/.test(t)) return Math.round(lerDecimal(t) ?? 0);
  const d = t.replace(/[^\d-]/g, '');
  return d ? Math.round(Number(d)) : null;
}

/** Decimal: "1.234,56", "1,234.56", "1234.56", "12,5". O último separador é o decimal. */
export function lerDecimal(v) {
  let t = String(v ?? '').replace(/[R$\s]/g, '').trim();
  if (!t || /^[-—]+$/.test(t)) return null;
  const virgula = t.lastIndexOf(',');
  const ponto = t.lastIndexOf('.');
  if (virgula > -1 && ponto > -1) {
    t = virgula > ponto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (virgula > -1) {
    t = t.replace(',', '.');
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, ''); // 1.234.567 = milhar
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "2026-10-15", "15/10/2026" → "2026-10-15" */
export function lerDia(v) {
  const t = String(v ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// ---------- Colunas de cada plataforma ----------

const normalizar = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cada campo: como reconhecer o cabeçalho, o nome mostrado e o que ele alimenta (para o aviso).
const COLUNAS = {
  meta: [
    { campo: 'dia', teste: (h) => /^(dia|day|data|date)$/.test(h) },
    { campo: 'inicio', teste: (h) => /^(inicio dos relatorios|reporting starts)/.test(h) },
    { campo: 'fim', teste: (h) => /^(termino dos relatorios|fim dos relatorios|reporting ends)/.test(h) },
    { campo: 'campanha', teste: (h) => /^(nome da campanha|campaign name)$/.test(h) },
    { campo: 'conjunto', teste: (h) => /^(nome do conjunto de anuncios|ad set name)$/.test(h) },
    { campo: 'anuncio', teste: (h) => /^(nome do anuncio|ad name)$/.test(h) },
    { campo: 'investimento', nome: 'Valor usado', teste: (h) => /^(valor usado|valor gasto|amount spent)/.test(h), alimenta: 'todas as métricas de custo' },
    { campo: 'impressoes', nome: 'Impressões', teste: (h) => /^(impressoes|impressions)$/.test(h), alimenta: 'CPM, CTR e hook rate' },
    { campo: 'alcance', nome: 'Alcance', teste: (h) => /^(alcance|reach)$/.test(h), alimenta: 'frequência' },
    { campo: 'cliques_link', nome: 'Cliques no link', teste: (h) => /^(cliques no link|link clicks)$/.test(h), alimenta: 'CTR, CPC e taxa de carregamento' },
    { campo: 'lp_views', nome: 'Visualizações da página de destino', teste: (h) => /(visualizacoes da pagina de destino|landing page views)/.test(h), alimenta: 'taxa de carregamento e taxa de conversão da página' },
    { campo: 'video_3s', nome: 'Reproduções de 3 segundos', teste: (h) => /(3 segundos|3-second|3 second)/.test(h), alimenta: 'hook rate e hold rate' },
    { campo: 'video_25', nome: 'Vídeo 25%', teste: (h) => /(video|reproduc|plays).*\b25 ?%/.test(h), alimenta: 'retenção 25%' },
    { campo: 'video_50', nome: 'Vídeo 50%', teste: (h) => /(video|reproduc|plays).*\b50 ?%/.test(h), alimenta: 'retenção 50% e hold rate' },
    { campo: 'video_75', nome: 'Vídeo 75%', teste: (h) => /(video|reproduc|plays).*\b75 ?%/.test(h), alimenta: 'retenção 75%' },
    { campo: 'video_100', nome: 'Vídeo 100%', teste: (h) => /(video|reproduc|plays).*\b100 ?%/.test(h), alimenta: 'retenção 100%' },
    { campo: 'thruplays', nome: 'ThruPlays', teste: (h) => /^thruplays?$/.test(h), alimenta: 'hold rate (alternativa ao 50%)' },
    { campo: 'conversas', nome: 'Conversas por mensagem iniciadas', teste: (h) => /(conversas por mensagem iniciadas|messaging conversations started)/.test(h), alimenta: 'conversões da plataforma (anúncios de WhatsApp)' },
  ],
  google: [
    { campo: 'dia', teste: (h) => /^(dia|day|data|date)$/.test(h) },
    { campo: 'campanha', teste: (h) => /^(campanha|campaign)$/.test(h) },
    { campo: 'conjunto', teste: (h) => /^(grupo de anuncios|ad group)$/.test(h) },
    { campo: 'anuncio', teste: (h) => /^(anuncio|ad|titulo 1|headline 1)$/.test(h) },
    { campo: 'investimento', nome: 'Custo', teste: (h) => /^(custo|cost)$/.test(h), alimenta: 'todas as métricas de custo' },
    { campo: 'impressoes', nome: 'Impr.', teste: (h) => /^(impr\.?|impressoes|impressions)$/.test(h), alimenta: 'CPM e CTR' },
    { campo: 'cliques_link', nome: 'Cliques', teste: (h) => /^(cliques|clicks)$/.test(h), alimenta: 'CTR, CPC e taxa de conversão' },
    { campo: 'conversas', nome: 'Conversões', teste: (h) => /^(conversoes|conversions)$/.test(h), alimenta: 'conversões da plataforma (tag de conversão do Google Ads)' },
  ],
};

const INTEIROS = ['impressoes', 'alcance', 'cliques_link', 'lp_views', 'video_3s', 'video_25', 'video_50', 'video_75', 'video_100', 'thruplays', 'conversas'];

/** Descobre a plataforma e a linha do cabeçalho (o Google põe 1 ou 2 linhas de título antes). */
export function detectarPlataforma(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const h = linhas[i].map(normalizar);
    const tem = (re) => h.some((x) => re.test(x));
    if (tem(/^(valor usado|valor gasto|amount spent)/) && tem(/^(nome da campanha|campaign name)$/)) return { plataforma: 'meta', linhaCabecalho: i };
    if (tem(/^(custo|cost)$/) && tem(/^(campanha|campaign)$/)) return { plataforma: 'google', linhaCabecalho: i };
  }
  throw new ErroDeDados(
    'Não reconheci o arquivo. Esperava a exportação do Gerenciador de Anúncios do Meta (com "Valor usado" e "Nome da campanha") ' +
      'ou um relatório do Google Ads (com "Custo" e "Campanha").'
  );
}

/**
 * Converte o CSV em linhas diárias. Funciona para Meta e Google.
 * @returns {{plataforma, linhas: object[], avisos: string[], dataInicio: string, dataFim: string, nivel: string}}
 */
export function importarCsv(texto) {
  const { linhas } = lerCsv(texto);
  if (linhas.length < 2) throw new ErroDeDados('O arquivo está vazio ou só tem o cabeçalho.');
  const { plataforma, linhaCabecalho } = detectarPlataforma(linhas);
  const colunas = COLUNAS[plataforma];
  const nomePlataforma = plataforma === 'meta' ? 'Meta' : 'Google Ads';

  const cabecalho = linhas[linhaCabecalho].map(normalizar);
  const indice = {};
  for (const col of colunas) {
    const i = cabecalho.findIndex((h) => col.teste(h));
    if (i > -1) indice[col.campo] = i;
  }
  const faltando = (campo) => indice[campo] === undefined;
  if (faltando('impressoes')) throw new ErroDeDados(`Não encontrei a coluna de impressões no arquivo do ${nomePlataforma}.`);
  if (faltando('dia') && faltando('inicio')) {
    throw new ErroDeDados(
      plataforma === 'meta'
        ? 'Não encontrei a data. Exporte com Detalhamento → Por tempo → Dia.'
        : 'Não encontrei a coluna "Dia". No relatório do Google Ads, segmente por Tempo → Dia antes de baixar.'
    );
  }

  const avisos = [];
  for (const col of colunas) {
    if (col.alimenta && faltando(col.campo)) avisos.push(`Sem a coluna "${col.nome}": ${col.alimenta} ficará vazio.`);
  }
  if (plataforma === 'meta' && !faltando('thruplays')) {
    const i = avisos.findIndex((a) => a.startsWith('Sem a coluna "Vídeo 50%"'));
    if (i > -1) avisos.splice(i, 1);
  }
  const nivel = !faltando('anuncio') ? 'anúncio' : !faltando('conjunto') ? (plataforma === 'meta' ? 'conjunto' : 'grupo de anúncios') : 'campanha';
  if (plataforma === 'meta' && nivel !== 'anúncio') avisos.push(`O arquivo está no nível de ${nivel}. Para ver cada anúncio, exporte pela aba Anúncios.`);

  const resultado = new Map();
  let ignoradas = 0;
  for (const celulas of linhas.slice(linhaCabecalho + 1)) {
    const pega = (campo) => (indice[campo] === undefined ? '' : celulas[indice[campo]] ?? '');
    let dia = lerDia(pega('dia'));
    if (!dia && plataforma === 'meta') {
      const inicio = lerDia(pega('inicio'));
      const fim = lerDia(pega('fim'));
      if (inicio && fim && inicio !== fim) {
        throw new ErroDeDados('O arquivo soma vários dias em uma linha. Exporte com Detalhamento → Por tempo → Dia.');
      }
      dia = inicio;
    }
    const campanha = pega('campanha').trim();
    // Linhas de total do Google ("Total: conta", "Total: Pesquisa"...) e linhas em branco
    if (!dia || !campanha || /^total\b/i.test(campanha) || /^total\b/i.test(pega('dia'))) { ignoradas++; continue; }

    const linha = {
      plataforma,
      data: dia,
      campanha,
      conjunto: pega('conjunto').trim(),
      anuncio: pega('anuncio').trim(),
      investimento: faltando('investimento') ? 0 : Math.round((lerDecimal(pega('investimento')) ?? 0) * 100),
    };
    for (const campo of INTEIROS) linha[campo] = faltando(campo) ? null : lerInteiro(pega(campo));
    linha.impressoes ??= 0;

    // A mesma chave repetida no arquivo é somada (acontece com detalhamentos extras, ex.: posicionamento).
    const chave = [linha.data, linha.campanha, linha.conjunto, linha.anuncio].join('\u0001');
    const anterior = resultado.get(chave);
    if (anterior) {
      anterior.investimento += linha.investimento;
      for (const campo of INTEIROS) if (linha[campo] != null) anterior[campo] = (anterior[campo] ?? 0) + linha[campo];
    } else resultado.set(chave, linha);
  }

  const lista = [...resultado.values()];
  if (!lista.length) throw new ErroDeDados('Nenhuma linha com data e campanha foi encontrada no arquivo.');
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem data ou sem campanha foram ignoradas (linhas de total, por exemplo).`);
  const datas = lista.map((l) => l.data).sort();
  return { plataforma, linhas: lista, avisos, dataInicio: datas[0], dataFim: datas[datas.length - 1], nivel };
}
