const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const source = html.slice(html.indexOf('const imagensFinaisPedidos ='), html.indexOf('function guardarFeedbackDownloadPedido('));

function harness(cards = []) {
  const requests = [];
  const revoked = [];
  const sandbox = {
    token: 'sessao-teste', API_BASE: 'https://api.omascote.com.br',
    URL: { createObjectURL: () => 'blob:arte-final', revokeObjectURL: url => revoked.push(url) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, headers: { get: () => 'image/png' }, blob: async () => ({ size: 100 }) };
    },
    document: {
      querySelectorAll: () => cards,
      createElement: () => ({ children: [], appendChild(el) { this.children.push(el); } })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { sandbox, requests, revoked };
}

test('imagem final usa visualizacao autenticada e reaproveita o arquivo', async () => {
  const { sandbox, requests } = harness();
  const img = { dataset: { pedidoImagemFinal: 'pedido-1' }, isConnected: true };
  await sandbox.exibirImagemFinalPedido(img);
  await sandbox.exibirImagemFinalPedido(img);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /download-resultado\?visualizacao=1$/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sessao-teste');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(img.src, 'blob:arte-final');
  assert.equal(img.alt, 'Arte final');
});

test('nao carrega sem login e limpa os arquivos ao trocar de sessao', async () => {
  const { sandbox, requests, revoked } = harness();
  const img = { dataset: { pedidoImagemFinal: 'pedido-1' }, isConnected: true };
  await sandbox.exibirImagemFinalPedido(img);
  sandbox.token = '';
  sandbox.sincronizarImagensFinaisSessao();
  await sandbox.exibirImagemFinalPedido(img);
  assert.equal(requests.length, 1);
  assert.deepEqual(revoked, ['blob:arte-final']);
});

test('botoes ficam imediatamente abaixo da imagem sem aviso de previa', async () => {
  let afterImage;
  let removed = false;
  const buttons = [{ type: 'image' }, { type: 'video' }, { type: 'feedback' }];
  const img = { dataset: {}, style: {}, isConnected: true, insertAdjacentElement(position, element) {
    assert.equal(position, 'afterend'); afterImage = element;
  } };
  const card = {
    dataset: { pedidoId: 'pedido-1' },
    querySelector: selector => selector === 'img' ? img : null,
    querySelectorAll: selector => selector === '.previewAviso' ? [{ remove() { removed = true; } }] : buttons
  };
  const { sandbox, requests } = harness([card]);
  sandbox.organizarEntregasPedidos([{ id: 'pedido-1', status: 'pronto', aprovado_cliente: true, pagamento_pendente: false }]);
  assert.equal(removed, true);
  assert.deepEqual(afterImage.children, buttons);
  assert.equal(img.dataset.pedidoImagemFinal, 'pedido-1');
  assert.equal(requests.length, 1);
  delete img.dataset.pedidoImagemFinal;
  sandbox.organizarEntregasPedidos([{ id: 'pedido-1', status: 'pronto', aprovado_cliente: false }]);
  assert.equal(img.dataset.pedidoImagemFinal, undefined);
  assert.equal(requests.length, 1);
});
