// Moldura comum de todas as telas: cabeçalho, menu e estilo.
// Mobile-first, na paleta do site (marinho + dourado da marca).

import { html, cru } from './html.js';

const ESTILO = `
:root{--bg:#0F172A;--fundo:#0B1220;--card:#1E293B;--card2:#293548;--borda:#334155;
--texto:#F8FAFC;--corpo:#CBD5E1;--fraco:#94A3B8;--ouro:#FDBE3F;--ouro2:#E3A92F;
--ok:#22C55E;--erro:#F87171}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--corpo);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--ouro)}
header{background:var(--fundo);border-bottom:1px solid var(--borda);padding:12px 16px}
.marca{color:var(--texto);font-weight:700;text-decoration:none}
.marca small{display:block;color:var(--fraco);font-weight:600;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}
nav{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-size:.95rem}
nav a{color:var(--corpo);text-decoration:none;padding:6px 0}
nav a[aria-current]{color:var(--ouro);font-weight:600}
nav form{margin:0}
nav button{background:none;border:0;color:var(--fraco);font:inherit;padding:6px 0;cursor:pointer}
main{max-width:960px;margin:0 auto;padding:20px 16px 64px}
h1{color:var(--texto);font-size:1.5rem;margin:0 0 16px}
h2{color:var(--texto);font-size:1.15rem;margin:28px 0 12px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:16px;margin-bottom:16px}
label{display:block;font-weight:600;color:var(--texto);margin:12px 0 4px;font-size:.95rem}
input,select{width:100%;min-height:48px;padding:10px 12px;border-radius:10px;border:1px solid var(--borda);
background:var(--fundo);color:var(--texto);font:inherit}
input:focus,select:focus,button:focus,a:focus{outline:2px solid var(--ouro);outline-offset:2px}
.botao{display:inline-block;min-height:48px;padding:12px 20px;border-radius:10px;border:0;background:var(--ouro);
color:#0F172A;font-family:inherit;font-weight:700;font-size:1rem;line-height:1.2;cursor:pointer;margin-top:16px;text-decoration:none}
.botao:hover{background:var(--ouro2)}
.botao.sec{background:transparent;border:1.5px solid var(--ouro);color:var(--ouro)}
.botao.mini{min-height:40px;padding:8px 14px;margin:0;font-size:.9rem}
.aviso{border-radius:10px;padding:12px 14px;margin-bottom:16px;border:1px solid}
.aviso.erro{border-color:var(--erro);color:#FECACA;background:rgb(248 113 113 / .08)}
.aviso.ok{border-color:var(--ok);color:#BBF7D0;background:rgb(34 197 94 / .08)}
.aviso.ouro{border-color:var(--ouro);color:var(--texto);background:rgb(253 190 63 / .08)}
.segredo{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;background:var(--fundo);
border:1px dashed var(--ouro);padding:12px;border-radius:10px;color:var(--ouro);user-select:all}
.tabela{width:100%;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--borda);vertical-align:top}
th{color:var(--fraco);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}
.etiqueta{display:inline-block;white-space:nowrap;margin:0 4px 4px 0;padding:2px 10px;border-radius:999px;font-size:.8rem;border:1px solid var(--borda)}
.etiqueta.on{border-color:var(--ok);color:#BBF7D0}
.etiqueta.off{border-color:var(--erro);color:#FECACA}
.fraco{color:var(--fraco);font-size:.9rem}
.estreito{max-width:420px;margin:0 auto}
@media (max-width:640px){
  .tabela thead{display:none}
  .tabela tr{display:block;padding:10px 0;border-bottom:1px solid var(--borda)}
  .tabela tr:last-child{border-bottom:0}
  .tabela td{display:block;border:0;padding:3px 0}
  .tabela td:empty{display:none}
}
`;

/**
 * @param {object} op
 * @param {string} op.titulo
 * @param {*} op.conteudo  HTML já montado com html``
 * @param {object} [op.usuario]  usuário logado (sem ele, não mostra menu)
 * @param {string} [op.atual]  caminho da página atual, para destacar no menu
 */
export function pagina({ titulo, conteudo, usuario, atual }) {
  const itens = [['/painel', 'Painel'], ['/leads', 'Leads']];
  if (usuario?.papel === 'admin') itens.push(['/equipe', 'Equipe'], ['/chaves', 'Chaves de API']);
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
<style>${cru(ESTILO)}</style>
</head>
<body>
<header>
  <a class="marca" href="/painel">Métricas do escritório<small>Matheus Lucio Silva · Advogado</small></a>
  ${menu}
</header>
<main>${conteudo}</main>
</body>
</html>`.toString();
}
