// Funções de segurança: senhas, tokens e comparação à prova de "timing attack".
// Tudo usa a criptografia nativa do Cloudflare (Web Crypto), sem biblioteca externa.

const codificador = new TextEncoder();

// 100.000 é o máximo de iterações de PBKDF2 que o Cloudflare Workers aceita.
const ITERACOES = 100_000;

function paraBase64Url(bytes) {
  let binario = '';
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Gera um token aleatório seguro (usado em sessões e chaves de API). */
export function gerarToken(bytes = 32) {
  return paraBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Hash SHA-256 em hexadecimal. Serve para guardar tokens sem guardar o token. */
export async function sha256(texto) {
  const resumo = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara dois textos sempre no mesmo tempo, para não vazar informação pela demora. */
export function igualSeguro(a, b) {
  const x = codificador.encode(String(a));
  const y = codificador.encode(String(b));
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferenca === 0;
}

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256);
}

/** Transforma a senha em hash para guardar no banco. Formato: pbkdf2$iterações$sal$hash */
export async function hashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${paraBase64Url(sal)}$${paraBase64Url(bits)}`;
}

/** Confere se a senha digitada corresponde ao hash guardado. */
export async function verificarSenha(senha, guardado) {
  const [tipo, iteracoes, sal, hash] = String(guardado).split('$');
  if (tipo !== 'pbkdf2' || !sal || !hash) return false;
  const bits = await derivar(senha, deBase64Url(sal), Number(iteracoes));
  return igualSeguro(paraBase64Url(bits), hash);
}

/** Regra mínima de senha. Devolve a mensagem de erro, ou null se estiver boa. */
export function problemaNaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 200) return 'A senha é longa demais.';
  return null;
}
