// Importação do CSV exportado do Gerenciador de Anúncios do Meta.
// Reconhece as colunas pelo nome (em português ou inglês), avisa o que faltar e
// devolve linhas diárias prontas para gravar.
//
// Como exportar (ver README): Gerenciador de Anúncios → aba Anúncios → Detalhamento → Por tempo → Dia
// → Relatórios → Exportar dados da tabela → CSV.

import { ErroDeDados } from './erros.js';

// ---------- CSV ----------

/** Lê um CSV (vírgula ou ponto e vírgula, com aspas). Devolve uma lista de linhas (listas de células). */
export function lerCsv(texto) {
  texto = texto.replace(/^﻿/, ''); // BOM do Excel
  const primeira = texto.slice(0, texto.indexOf('\n') > -1 ? texto.indexOf('\n') : undefined);
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';

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
  if (!t || t === '-' || t === '—') return null;
  const d = t.replace(/[^\d-]/g, '');
  return d ? Math.round(Number(d)) : null;
}

/** Decimal: "1.234,56", "1,234.56", "1234.56", "12,5". O último separador é o decimal. */
export function lerDecimal(v) {
  let t = String(v ?? '').replace(/[R$\s]/g, '').trim();
  if (!t || t === '-' || t === '—') return null;
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

// ---------- Colunas do Meta ----------

const normalizar = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cada campo: como reconhecer o cabeçalho e o que ele alimenta (para o aviso de coluna faltando).
const COLUNAS_META = [
  { campo: 'dia', teste: (h) => /^(dia|day|data|date)$/.test(h) },
  { campo: 'inicio', teste: (h) => /^(inicio dos relatorios|reporting starts)/.test(h) },
  { campo: 'fim', teste: (h) => /^(termino dos relatorios|fim dos relatorios|reporting ends)/.test(h) },
  { campo: 'campanha', teste: (h) => /^(nome da campanha|campaign name)$/.test(h) },
  { campo: 'conjunto', teste: (h) => /^(nome do conjunto de anuncios|ad set name)$/.test(h) },
  { campo: 'anuncio', teste: (h) => /^(nome do anuncio|ad name)$/.test(h) },
  { campo: 'investimento', teste: (h) => /^(valor usado|valor gasto|amount spent)/.test(h), alimenta: 'todas as métricas de custo' },
  { campo: 'impressoes', teste: (h) => /^(impressoes|impressions)$/.test(h), alimenta: 'CPM, CTR e hook rate' },
  { campo: 'alcance', teste: (h) => /^(alcance|reach)$/.test(h), alimenta: 'frequência' },
  { campo: 'cliques_link', teste: (h) => /^(cliques no link|link clicks)$/.test(h), alimenta: 'CTR, CPC e taxa de carregamento' },
  { campo: 'lp_views', teste: (h) => /(visualizacoes da pagina de destino|landing page views)/.test(h), alimenta: 'taxa de carregamento e taxa de conversão da página' },
  { campo: 'video_3s', teste: (h) => /(3 segundos|3-second|3 second)/.test(h), alimenta: 'hook rate e hold rate' },
  { campo: 'video_25', teste: (h) => /(video|reproduc|plays).*\b25 ?%/.test(h), alimenta: 'retenção 25%' },
  { campo: 'video_50', teste: (h) => /(video|reproduc|plays).*\b50 ?%/.test(h), alimenta: 'retenção 50% e hold rate' },
  { campo: 'video_75', teste: (h) => /(video|reproduc|plays).*\b75 ?%/.test(h), alimenta: 'retenção 75%' },
  { campo: 'video_100', teste: (h) => /(video|reproduc|plays).*\b100 ?%/.test(h), alimenta: 'retenção 100%' },
  { campo: 'thruplays', teste: (h) => /^thruplays?$/.test(h), alimenta: 'hold rate (alternativa ao 50%)' },
  { campo: 'conversas', teste: (h) => /(conversas por mensagem iniciadas|messaging conversations started)/.test(h), alimenta: 'conversas iniciadas (anúncios de WhatsApp)' },
];

const NOMES = {
  investimento: 'Valor usado', impressoes: 'Impressões', alcance: 'Alcance', cliques_link: 'Cliques no link',
  lp_views: 'Visualizações da página de destino', video_3s: 'Reproduções de 3 segundos', video_25: 'Vídeo 25%',
  video_50: 'Vídeo 50%', video_75: 'Vídeo 75%', video_100: 'Vídeo 100%', thruplays: 'ThruPlays',
  conversas: 'Conversas por mensagem iniciadas',
};

const INTEIROS = ['impressoes', 'alcance', 'cliques_link', 'lp_views', 'video_3s', 'video_25', 'video_50', 'video_75', 'video_100', 'thruplays', 'conversas'];

/**
 * Converte o CSV do Meta em linhas diárias.
 * @returns {{linhas: object[], avisos: string[], dataInicio: string, dataFim: string, nivel: string}}
 */
export function importarMeta(texto) {
  const { linhas } = lerCsv(texto);
  if (linhas.length < 2) throw new ErroDeDados('O arquivo está vazio ou só tem o cabeçalho.');

  const cabecalho = linhas[0].map(normalizar);
  const indice = {};
  for (const col of COLUNAS_META) {
    const i = cabecalho.findIndex((h) => col.teste(h));
    if (i > -1) indice[col.campo] = i;
  }

  const faltando = (campo) => indice[campo] === undefined;
  if (faltando('investimento')) throw new ErroDeDados('Não encontrei a coluna "Valor usado (BRL)". Confira se o arquivo é a exportação do Gerenciador de Anúncios do Meta.');
  if (faltando('impressoes')) throw new ErroDeDados('Não encontrei a coluna "Impressões".');
  if (faltando('campanha')) throw new ErroDeDados('Não encontrei a coluna "Nome da campanha". Exporte a partir da aba Campanhas, Conjuntos ou Anúncios.');
  if (faltando('dia') && faltando('inicio')) throw new ErroDeDados('Não encontrei a data. Exporte com Detalhamento → Por tempo → Dia.');

  const avisos = [];
  for (const col of COLUNAS_META) {
    if (col.alimenta && faltando(col.campo)) avisos.push(`Sem a coluna "${NOMES[col.campo]}": ${col.alimenta} ficará vazio.`);
  }
  // Retenção: thruplays substitui o 50% no hold rate; não precisa avisar dos dois.
  if (!faltando('thruplays')) {
    const i = avisos.findIndex((a) => a.startsWith('Sem a coluna "Vídeo 50%"'));
    if (i > -1) avisos.splice(i, 1);
  }
  const nivel = !faltando('anuncio') ? 'anúncio' : !faltando('conjunto') ? 'conjunto' : 'campanha';
  if (nivel !== 'anúncio') avisos.push(`O arquivo está no nível de ${nivel}. Para ver cada anúncio, exporte pela aba Anúncios.`);

  const resultado = new Map();
  let ignoradas = 0;
  for (const celulas of linhas.slice(1)) {
    const pega = (campo) => (indice[campo] === undefined ? '' : celulas[indice[campo]] ?? '');
    let dia = lerDia(pega('dia'));
    if (!dia) {
      const inicio = lerDia(pega('inicio'));
      const fim = lerDia(pega('fim'));
      if (inicio && fim && inicio !== fim) {
        throw new ErroDeDados('O arquivo soma vários dias em uma linha. Exporte com Detalhamento → Por tempo → Dia.');
      }
      dia = inicio;
    }
    const campanha = pega('campanha').trim();
    if (!dia || !campanha) { ignoradas++; continue; } // linha de total ou em branco

    const linha = {
      plataforma: 'meta',
      data: dia,
      campanha,
      conjunto: pega('conjunto').trim(),
      anuncio: pega('anuncio').trim(),
      investimento: Math.round((lerDecimal(pega('investimento')) ?? 0) * 100),
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
  return { linhas: lista, avisos, dataInicio: datas[0], dataFim: datas[datas.length - 1], nivel };
}
