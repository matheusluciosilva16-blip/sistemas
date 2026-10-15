// Testes das funções de segurança e do escape de HTML. Rodar com: npm run testar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSenha, verificarSenha, igualSeguro, problemaNaSenha, gerarToken } from '../src/lib/seguranca.js';
import { html } from '../src/lib/html.js';

test('senha certa confere, senha errada não', async () => {
  const guardado = await hashSenha('senhaforte123');
  assert.ok(guardado.startsWith('pbkdf2$100000$'));
  assert.equal(await verificarSenha('senhaforte123', guardado), true);
  assert.equal(await verificarSenha('senhaforte124', guardado), false);
});

test('mesma senha gera hashes diferentes (sal aleatório)', async () => {
  assert.notEqual(await hashSenha('abcdefghij'), await hashSenha('abcdefghij'));
});

test('hash corrompido não autentica', async () => {
  assert.equal(await verificarSenha('x', 'lixo'), false);
});

test('comparação segura', () => {
  assert.equal(igualSeguro('abc', 'abc'), true);
  assert.equal(igualSeguro('abc', 'abd'), false);
  assert.equal(igualSeguro('abc', 'abcd'), false);
});

test('regra de senha', () => {
  assert.ok(problemaNaSenha('curta'));
  assert.equal(problemaNaSenha('1234567890'), null);
});

test('tokens são únicos e sem caracteres problemáticos', () => {
  const a = gerarToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, gerarToken());
});

test('html escapa o que vem de fora', () => {
  const nome = '<script>alert(1)</script>';
  assert.equal(html`<p>${nome}</p>`.toString(), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(html`<a title="${'"x"'}">`.toString(), '<a title="&quot;x&quot;">');
  assert.equal(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`.toString(), '<ul><li>a</li><li>b</li></ul>');
});
