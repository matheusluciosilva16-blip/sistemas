// Montagem de HTML com proteção contra injeção de código.
// Todo valor interpolado em html`...` é escapado, a não ser que já seja HTML montado
// por esta mesma função. Assim, um nome de lead como "<script>" aparece como texto.

class HtmlSeguro {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

export function escapar(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function converter(valor) {
  if (valor === null || valor === undefined || valor === false) return '';
  if (valor instanceof HtmlSeguro) return valor.texto;
  if (Array.isArray(valor)) return valor.map(converter).join('');
  return escapar(valor);
}

export function html(partes, ...valores) {
  let saida = partes[0];
  valores.forEach((v, i) => {
    saida += converter(v) + partes[i + 1];
  });
  return new HtmlSeguro(saida);
}

/** Data/hora no fuso de Brasília, para exibição. */
export function dataHora(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms));
}

/** Marca um texto como HTML confiável (só para conteúdo escrito por nós, nunca por usuário). */
export function cru(texto) {
  return new HtmlSeguro(texto);
}
