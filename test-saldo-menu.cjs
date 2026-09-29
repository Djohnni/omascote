const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
const menu = html.match(/\.saldoMenu\s*\{([^}]+)\}/)[1];

test('janela de saldo fica presa a tela e nao abaixo do botao', () => {
  assert.match(menu, /position:\s*fixed\s*;/);
  assert.match(menu, /top:\s*10px\s*;/);
  assert.match(menu, /left:\s*50%\s*;/);
  assert.match(menu, /transform:\s*translateX\(-50%\)\s*;/);
});

test('altura da janela reserva as margens e mantem rolagem interna', () => {
  assert.match(menu, /max-height:\s*min\(calc\(100vh - 20px\), 720px\)\s*;/);
  assert.match(menu, /max-height:\s*min\(calc\(100dvh - 20px\), 720px\)\s*;/);
  assert.match(menu, /overflow:\s*auto\s*;/);
  assert.match(menu, /box-sizing:\s*border-box\s*;/);
  assert.match(menu, /width:\s*min\(392px, calc\(100vw - 28px\)\)\s*;/);
});

test('regra de celular e acao de gerar Pix permanecem presentes', () => {
  assert.match(html, /@media \(max-width:680px\)\s*\{\s*\.saldoMenu\s*\{[^}]*max-height:calc\(100dvh - 20px\)/);
  assert.match(html, /id="saldoGerarPixBtn"[^>]*>GERAR CHAVE PIX<\/button>/);
});
