// Moldura comum de todas as telas: cabeçalho, menu e estilo.
// Segue o design das landing pages (repositório do site, specs/design.md):
// mesmas fontes (Noto Serif 700 nos títulos, Noto Sans no resto, arquivos idênticos),
// mesmos tokens de cor, raios e símbolo da logo no cabeçalho.
// Diferença deliberada: o verde #25D366 é exclusivo do WhatsApp nas LPs, então aqui
// a ação principal é o dourado sólido e a secundária o dourado contornado.

import { html, cru } from './html.js';

const ESTILO = `
@font-face{font-family:'Noto Sans';font-weight:400;font-display:swap;src:url(/fontes/noto-sans-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'Noto Sans';font-weight:600;font-display:swap;src:url(/fontes/noto-sans-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:'Noto Sans';font-weight:700;font-display:swap;src:url(/fontes/noto-sans-latin-700-normal.woff2) format('woff2')}
@font-face{font-family:'Noto Serif';font-weight:700;font-display:swap;src:url(/fontes/noto-serif-latin-700-normal.woff2) format('woff2')}
:root{
  --navy:#0F172A;--deep:#0B1220;--surface:#1E293B;--surface2:#293548;--line:#334155;
  --ink:#F8FAFC;--body:#CBD5E1;--muted:#94A3B8;
  --gold:#FDBE3F;--golddeep:#E3A92F;--goldsoft:rgb(253 190 63 / .12);--goldline:rgb(253 190 63 / .28);
  --ok:#4ADE80;--erro:#F87171;
  --display:'Noto Serif',Georgia,'Times New Roman',serif;
  --ui:'Noto Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--navy);color:var(--body);font:400 1rem/1.65 var(--ui);-webkit-font-smoothing:antialiased}
a{color:var(--gold)}
h1,h2{font-family:var(--display);font-weight:700;color:var(--ink)}
h1{font-size:clamp(1.625rem,5vw,2.25rem);line-height:1.15;letter-spacing:-.015em;margin:0 0 16px}
h2{font-size:clamp(1.25rem,3.6vw,1.5rem);line-height:1.25;letter-spacing:-.01em;margin:32px 0 12px}
h3{font:700 1.0625rem/1.3 var(--ui);color:var(--ink);margin:0 0 8px;letter-spacing:-.01em}
.eyebrow{display:block;font:700 .75rem/1.4 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:8px}
.numeral{font:700 clamp(1.375rem,3vw,1.75rem)/1.1 var(--display);color:var(--ink);letter-spacing:-.01em;overflow-wrap:anywhere}

header{background:var(--deep);border-bottom:1px solid var(--line);padding:12px 20px}
.topo{max-width:1140px;margin:0 auto}
.marca{display:flex;align-items:center;gap:12px;text-decoration:none}
.marca img{height:34px;width:auto}
.marca strong{display:block;color:var(--ink);font:700 1rem/1.2 var(--ui)}
.marca small{display:block;color:var(--muted);font:600 .6875rem/1.4 var(--ui);letter-spacing:.1em;text-transform:uppercase}
nav{display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:10px;font-size:.9375rem}
nav a{color:var(--body);text-decoration:none;padding:8px 0;min-height:40px;display:inline-flex;align-items:center}
nav a[aria-current]{color:var(--gold);font-weight:600;box-shadow:inset 0 -2px var(--gold)}
nav form{margin:0}
nav button{background:none;border:0;color:var(--muted);font:inherit;padding:8px 0;min-height:40px;cursor:pointer}
main{max-width:1140px;margin:0 auto;padding:24px 20px 72px}

.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.grade{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px}
.grade .card{padding:18px}
.grade .card{margin:0}

label{display:block;font-weight:600;color:var(--ink);margin:14px 0 6px;font-size:.9375rem}
input,select,textarea{width:100%;min-height:48px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);
  background:var(--deep);color:var(--ink);font:400 1rem var(--ui)}
textarea{resize:vertical;line-height:1.5}
input::placeholder{color:var(--muted)}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

.botao{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:10px;
  border:1.5px solid var(--gold);background:var(--gold);color:var(--navy);font:700 1rem/1 var(--ui);letter-spacing:.02em;
  cursor:pointer;margin-top:20px;text-decoration:none;transition:background-color .18s ease-out,transform .18s ease-out}
.botao.sec{background:transparent;color:var(--gold)}
.botao.mini{min-height:44px;padding:0 16px;margin:0;font-size:.9rem}
@media (hover:hover){
  .botao:hover{background:var(--golddeep);border-color:var(--golddeep);transform:translateY(-1px)}
  .botao.sec:hover{background:var(--goldsoft);color:var(--gold)}
}

.aviso{border-radius:10px;padding:14px 16px;margin-bottom:16px;border:1px solid}
.aviso.erro{border-color:var(--erro);color:#FECACA;background:rgb(248 113 113 / .08)}
.aviso.ok{border-color:var(--ok);color:#BBF7D0;background:rgb(74 222 128 / .08)}
.aviso.ouro{border-color:var(--goldline);color:var(--ink);background:var(--goldsoft)}
.segredo{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;background:var(--deep);
  border:1px dashed var(--gold);padding:12px;border-radius:10px;color:var(--gold);user-select:all}

.tabela{width:100%;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.9375rem}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font:700 .75rem/1.4 var(--ui);text-transform:uppercase;letter-spacing:.1em}
.etiqueta{display:inline-block;white-space:nowrap;margin:0 4px 4px 0;padding:2px 10px;border-radius:999px;font-size:.8125rem;border:1px solid var(--line);color:var(--body)}
.etiqueta.on{border-color:var(--ok);color:#BBF7D0}
.etiqueta.off{border-color:var(--erro);color:#FECACA}
.etiqueta.ouro{border-color:var(--goldline);color:var(--gold);background:var(--goldsoft)}
.fraco{color:var(--muted);font-size:.875rem}
.estreito{max-width:440px;margin:0 auto}
details>summary{cursor:pointer}
@media (max-width:640px){
  .tabela thead{display:none}
  .tabela tr{display:block;padding:12px 0;border-bottom:1px solid var(--line)}
  .tabela tr:last-child{border-bottom:0}
  .tabela td{display:block;border:0;padding:3px 0}
  .tabela td:empty{display:none}
  .tabela td[data-r]::before{content:attr(data-r) ': ';color:var(--muted)}
  .grade.kpi{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grade.kpi .numeral{font-size:1.25rem}
}
@media (min-width:1024px){main{padding:40px 24px 96px}.card{padding:28px}}
@media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}
`;

/**
 * @param {object} op
 * @param {string} op.titulo
 * @param {*} op.conteudo  HTML já montado com html``
 * @param {object} [op.usuario]  usuário logado (sem ele, não mostra menu)
 * @param {string} [op.atual]  caminho da página atual, para destacar no menu
 */
export function pagina({ titulo, conteudo, usuario, atual }) {
  const itens = [['/painel', 'Painel'], ['/metricas', 'Métricas'], ['/leads', 'Leads']];
  if (usuario?.papel === 'admin') itens.push(['/configuracoes', 'Configurações'], ['/equipe', 'Equipe'], ['/chaves', 'Chaves de API']);
  itens.push(['/conta', 'Minha conta']);

  const menu = usuario
    ? html`<nav aria-label="Menu">
        ${itens.map(([href, nome]) => html`<a href="${href}" ${href === atual ? html`aria-current="page"` : ''}>${nome}</a>`)}
        <form method="post" action="/sair"><button type="submit">Sair</button></form>
      </nav>`
    : '';

  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0F172A">
<title>${titulo} · Métricas</title>
<link rel="preload" href="/fontes/noto-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fontes/noto-serif-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<style>${cru(ESTILO)}</style>
</head>
<body>
<header><div class="topo">
  <a class="marca" href="/painel">
    <img src="/img/logo-simbolo.svg" alt="" width="36" height="34">
    <span><strong>Matheus Lucio Silva</strong><small>Métricas e CRM</small></span>
  </a>
  ${menu}
</div></header>
<main>${conteudo}</main>
</body>
</html>`.toString();
}
