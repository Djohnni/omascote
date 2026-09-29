const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const helper = html.slice(html.indexOf('function adicionarFecharAvaliacaoDownload('), html.indexOf('function ambienteDownloadAtual()'));
const avisoSource = html.slice(html.indexOf('function mostrarAvisoPedido('), html.indexOf('function onlyDigits(s)'));

test('X fecha aviso antes de abrir pesquisa de imagem ou vídeo, sem abertura automática', () => {
  for (const tipo of ['imagem', 'vídeo']) {
    const elements = new Map();
    const events = [];
    const box = { classList: { add() {}, remove() {} }, appendChild: el => elements.set(el.id, el) };
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
        createElement: () => ({ setAttribute(name, value) { this[name] = value; }, addEventListener(name, fn) { this[name] = fn; }, remove() { elements.delete(this.id); } })
      }
    };
    const api = vm.runInNewContext(`${avisoSource}\n${helper}\n({mostrarAvisoPedido,adicionarFecharAvaliacaoDownload})`, sandbox);
    api.adicionarFecharAvaliacaoDownload('pedido-teste', tipo);
    const button = elements.get('downloadAvisoFechar');
    assert.equal(button.textContent, '×');
    assert.equal(button['aria-label'], 'Fechar aviso e avaliar a arte');
    assert.equal(button.type, 'button');
    assert.deepEqual(events, ['limpou:7'], 'aguarda o cliente, sem abrir pesquisa');
    button.click({ stopPropagation() {} });
    assert.equal(button.disabled, true);
    assert.deepEqual(events.slice(-3), ['fechou', 'limpou:7', ['pedido-teste', tipo]]);
    api.mostrarAvisoPedido('Outro aviso', 'Não reutilizar pesquisa anterior');
    assert.equal(elements.has('downloadAvisoFechar'), false, 'não vaza botão para outros avisos');
  }
});

test('os dois fluxos de download usam X e não agendam pesquisa automática', () => {
  const flows = html.slice(html.indexOf('async function baixarVideoPedido('), html.indexOf('async function compartilharImagemPedido('));
  assert.match(flows, /adicionarFecharAvaliacaoDownload\(pedidoId, "vídeo"\)/);
  assert.match(flows, /adicionarFecharAvaliacaoDownload\(pedidoId, "imagem"\)/);
  assert.doesNotMatch(flows, /setTimeout\([^\n]*convidarAvaliacaoArte/);
});
