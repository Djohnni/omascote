const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const helper = html.slice(html.indexOf('function adicionarOkAvaliacaoDownload('), html.indexOf('function ambienteDownloadAtual()'));
const avisoSource = html.slice(html.indexOf('function mostrarAvisoPedido('), html.indexOf('function onlyDigits(s)'));

test('OK fecha aviso antes de abrir pesquisa de imagem ou vídeo, sem abertura automática', () => {
  for (const tipo of ['imagem', 'vídeo']) {
    const elements = new Map();
    const events = [];
    const box = { appendChild: el => elements.set(el.id, el) };
    const aviso = {
      querySelector: selector => selector === '.ia4ToastPedidoBox' ? box : {},
      classList: { add: () => {}, remove: () => events.push('fechou') }
    };
    const sandbox = {
      timerAvisoPedido: 7,
      clearTimeout: timer => events.push(`limpou:${timer}`),
      setTimeout: () => 8,
      convidarAvaliacaoArte: (id, selectedTipo) => events.push([id, selectedTipo]),
      document: {
        getElementById: id => id === 'ia4ToastPedido' ? aviso : elements.get(id),
        createElement: () => ({ addEventListener(name, fn) { this[name] = fn; }, remove() { elements.delete(this.id); } })
      }
    };
    const api = vm.runInNewContext(`${avisoSource}\n${helper}\n({mostrarAvisoPedido,adicionarOkAvaliacaoDownload})`, sandbox);
    api.adicionarOkAvaliacaoDownload('pedido-teste', tipo);
    const button = elements.get('downloadAvisoOk');
    assert.equal(button.textContent, 'OK');
    assert.equal(button.type, 'button');
    assert.deepEqual(events, ['limpou:7'], 'aguarda o cliente, sem abrir pesquisa');
    button.click({ stopPropagation() {} });
    assert.equal(button.disabled, true);
    assert.deepEqual(events.slice(-3), ['fechou', 'limpou:7', ['pedido-teste', tipo]]);
    api.mostrarAvisoPedido('Outro aviso', 'Não reutilizar pesquisa anterior');
    assert.equal(elements.has('downloadAvisoOk'), false, 'não vaza botão para outros avisos');
  }
});

test('os dois fluxos de download usam OK e não agendam pesquisa automática', () => {
  const flows = html.slice(html.indexOf('async function baixarVideoPedido('), html.indexOf('async function compartilharImagemPedido('));
  assert.match(flows, /adicionarOkAvaliacaoDownload\(pedidoId, "vídeo"\)/);
  assert.match(flows, /adicionarOkAvaliacaoDownload\(pedidoId, "imagem"\)/);
  assert.doesNotMatch(flows, /setTimeout\([^\n]*convidarAvaliacaoArte/);
});
