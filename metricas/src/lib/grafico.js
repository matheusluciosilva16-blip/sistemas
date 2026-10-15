// Gráfico de colunas em SVG, montado no servidor (sem JavaScript no navegador).
// Uma série por gráfico (nunca dois eixos): investimento e leads ficam em gráficos separados.
// Especificação visual: colunas de até 24px com topo arredondado de 4px e base reta,
// grade em linha fina, rótulos na cor de texto (não na cor da série), dica ao passar o dedo
// ou o mouse (<title>) e tabela equivalente para quem não enxerga o gráfico.

import { html, cru, escapar } from './html.js';

const COR = '#FDBE3F'; // dourado da marca: 10,9:1 sobre o marinho, acima do mínimo de 3:1 para marcas
const GRADE = '#334155';
const TEXTO = '#94A3B8';

/** Arredonda o máximo para um valor "redondo" (1, 2, 2.5, 5 × 10^n). */
function tetoRedondo(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v);
}

const diaCurto = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * @param {object[]} serie  [{dia, ...}]
 * @param {string} campo    valor a plotar
 * @param {(v:number)=>string} formatar  formato do valor (eixo, dica e tabela)
 * @param {string} titulo
 * @param {object} [op]
 * @param {(v:number)=>string} [op.eixo]  formato curto para o eixo (padrão: o mesmo de formatar)
 * @param {boolean} [op.inteiro]  contagens: o eixo só mostra números inteiros
 */
export function graficoColunas(serie, campo, formatar, titulo, { eixo = formatar, inteiro = false } = {}) {
  const L = 640, A = 200, esq = 56, dir = 8, topo = 12, base = 28;
  const larguraUtil = L - esq - dir;
  const alturaUtil = A - topo - base;
  let max = tetoRedondo(Math.max(...serie.map((p) => p[campo]), 0));
  if (inteiro) max = Math.max(1, Math.ceil(max));
  const fatia = larguraUtil / Math.max(serie.length, 1);
  const largura = Math.max(2, Math.min(24, fatia - 2)); // 2px de respiro entre colunas vizinhas
  const y = (v) => topo + alturaUtil - (v / max) * alturaUtil;

  const colunas = serie
    .map((p, i) => {
      const v = p[campo];
      const x = esq + i * fatia + (fatia - largura) / 2;
      const alto = (v / max) * alturaUtil;
      const dica = `<title>${escapar(diaCurto(p.dia))}: ${escapar(formatar(v))}</title>`;
      // Área de toque cobre a fatia inteira, maior que a coluna
      const toque = `<rect x="${(esq + i * fatia).toFixed(1)}" y="${topo}" width="${fatia.toFixed(1)}" height="${alturaUtil}" fill="transparent">${dica}</rect>`;
      if (!v) return toque;
      const r = Math.min(4, largura / 2, alto);
      const x2 = x + largura, yb = topo + alturaUtil, yt = yb - alto;
      const caminho = `M${x.toFixed(1)},${yb} V${(yt + r).toFixed(1)} Q${x.toFixed(1)},${yt.toFixed(1)} ${(x + r).toFixed(1)},${yt.toFixed(1)} H${(x2 - r).toFixed(1)} Q${x2.toFixed(1)},${yt.toFixed(1)} ${x2.toFixed(1)},${(yt + r).toFixed(1)} V${yb} Z`;
      return `<path d="${caminho}" fill="${COR}">${dica}</path>${toque}`;
    })
    .join('');

  const marcas = [0, max / 2, max]
    .filter((v) => !inteiro || Number.isInteger(v))
    .map((v) => `<line x1="${esq}" x2="${L - dir}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${GRADE}" stroke-width="1"/>
      <text x="${esq - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="${TEXTO}" font-size="12">${escapar(eixo(v))}</text>`)
    .join('');

  const indicesX = serie.length > 2 ? [0, Math.floor((serie.length - 1) / 2), serie.length - 1] : serie.map((_, i) => i);
  const rotulosX = indicesX
    .map((i) => `<text x="${(esq + i * fatia + fatia / 2).toFixed(1)}" y="${A - 8}" text-anchor="middle" fill="${TEXTO}" font-size="12">${diaCurto(serie[i].dia)}</text>`)
    .join('');

  const total = serie.reduce((s, p) => s + p[campo], 0);
  return html`<figure class="card" style="margin:0">
    <figcaption><h3 style="margin:0">${titulo}</h3><p class="fraco" style="margin:2px 0 8px">Total no período: ${formatar(total)}</p></figcaption>
    <svg viewBox="0 0 ${L} ${A}" width="100%" role="img" aria-label="${titulo}, por dia. Total ${formatar(total)}." style="display:block;font-family:var(--ui)">
      ${cru(marcas)}${cru(colunas)}${cru(rotulosX)}
    </svg>
    <details><summary class="fraco" style="margin-top:8px">Ver em tabela</summary>
      <div class="tabela"><table><thead><tr><th>Dia</th><th>${titulo}</th></tr></thead>
      <tbody>${serie.map((p) => html`<tr><td>${diaCurto(p.dia)}</td><td>${formatar(p[campo])}</td></tr>`)}</tbody></table></div>
    </details>
  </figure>`;
}
