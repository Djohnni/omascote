const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app.html', 'utf8');
const start = html.indexOf('function pedidoIncluiVideoPago(');
const end = html.indexOf('function cardPagamentoPendente(', start);
assert.ok(start >= 0 && end > start, 'regras de entrega encontradas');

const classes = new Set();
const handlers = {};
const storage = new Map();
const button = {
  href: 'https://wa.me/5547992536917?text=ajuda',
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
  },
  addEventListener(name, handler) { handlers[name] = handler; },
  setAttribute(name, value) { this[name] = value; },
  removeAttribute(name) { delete this[name]; },
};
const notice = { hidden: true, textContent: '' };
const sandbox = {
  document: { getElementById: (id) => id === 'ia4WhatsappBtn' ? button : notice },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  htmlEscape: (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
};
const rules = vm.runInNewContext(`${html.slice(start, end)}\n({ pedidoProblemaEntrega, pedidoEntregaProblemaHtml, atualizarAlertaEntregaWhatsapp })`, sandbox);
const now = Date.now();
const base = {
  id: 'pedido-123',
  status: 'em_producao',
  criado_em: new Date(now - 20 * 60 * 1000).toISOString(),
  valor_final: 14.9,
  pagamento_pendente: false,
  imagem_url: null,
};

assert.equal(rules.pedidoProblemaEntrega(base), null, 'não sinaliza produção normal');
assert.equal(rules.pedidoProblemaEntrega({ ...base, pagamento_pendente: true, status: 'erro' }), null, 'não sinaliza pedido sem pagamento');
assert.equal(rules.pedidoProblemaEntrega({ ...base, valor_final: 0, status: 'erro' }), null, 'não sinaliza pedido gratuito');

const falhaImagem = { ...base, status: 'erro' };
assert.equal(rules.pedidoProblemaEntrega(falhaImagem).tipo, 'imagem');
assert.equal(rules.pedidoProblemaEntrega({ ...falhaImagem, imagem_url: '/imagem.png' }), null, 'não diz que faltou uma imagem já entregue');
assert.match(rules.pedidoEntregaProblemaHtml(falhaImagem), /Falar no WhatsApp/);
assert.doesNotMatch(rules.pedidoEntregaProblemaHtml(falhaImagem), /suporte interno/i);

const video = { requested: true, commercial: true, status: 'failed' };
const falhaVideo = { ...base, status: 'pronto', imagem_url: '/imagem.png', video_generation: video, video_pronto: false };
assert.equal(rules.pedidoProblemaEntrega(falhaVideo).tipo, 'vídeo');

const atrasado = { ...base, criado_em: new Date(now - 91 * 60 * 1000).toISOString() };
assert.equal(rules.pedidoProblemaEntrega(atrasado).atrasado, true);
assert.equal(rules.pedidoProblemaEntrega({ ...atrasado, imagem_url: '/imagem.png', video_generation: { ...video, status: 'processing' } }).tipo, 'vídeo');
assert.equal(rules.pedidoProblemaEntrega({ ...falhaVideo, video_pronto: true }), null, 'não sinaliza vídeo entregue');

rules.atualizarAlertaEntregaWhatsapp([falhaVideo]);
assert.equal(classes.has('ia4WhatsappBtnFalha'), true);
assert.equal(notice.hidden, false);
assert.match(button.href, /pedido-123/);
handlers.click();
assert.equal(notice.hidden, true, 'clicar no WhatsApp esconde o aviso imediatamente');
assert.match(button.href, /pedido-123/, 'o clique mantém o link específico do pedido');
rules.atualizarAlertaEntregaWhatsapp([falhaVideo]);
assert.equal(notice.hidden, true, 'o mesmo erro não reaparece na atualização do histórico');
assert.match(storage.get('ia4tube_whatsapp_avisos_lidos_v1'), /pedido-123:vídeo/);
const noticeAfterReload = { hidden: true, textContent: '' };
const buttonAfterReload = {
  ...button,
  classList: { add() {}, remove() {} },
  addEventListener() {},
};
const afterReload = vm.runInNewContext(`${html.slice(start, end)}\n({ atualizarAlertaEntregaWhatsapp })`, {
  ...sandbox,
  document: { getElementById: id => id === 'ia4WhatsappBtn' ? buttonAfterReload : noticeAfterReload },
});
afterReload.atualizarAlertaEntregaWhatsapp([falhaVideo]);
assert.equal(noticeAfterReload.hidden, true, 'o erro reconhecido continua oculto após recarregar a página');

const novaFalha = { ...falhaImagem, id: 'pedido-456' };
rules.atualizarAlertaEntregaWhatsapp([falhaVideo, novaFalha]);
assert.equal(notice.hidden, false, 'um pedido novo com erro volta a mostrar o aviso');
assert.match(button.href, /pedido-456/);
handlers.click();
rules.atualizarAlertaEntregaWhatsapp([falhaVideo, novaFalha]);
assert.equal(notice.hidden, true, 'os erros já reconhecidos permanecem ocultos');

rules.atualizarAlertaEntregaWhatsapp([{ ...falhaVideo, video_pronto: true }, novaFalha]);
rules.atualizarAlertaEntregaWhatsapp([falhaVideo, novaFalha]);
assert.equal(notice.hidden, false, 'um pedido recuperado que falha outra vez gera novo aviso');
assert.match(button.href, /pedido-123/);

rules.atualizarAlertaEntregaWhatsapp([]);
assert.equal(classes.has('ia4WhatsappBtnFalha'), false);
assert.equal(notice.hidden, true);
assert.equal(button.href, 'https://wa.me/5547992536917?text=ajuda');

console.log('OK: pedidos pagos com falha ou atraso destacam o WhatsApp sem alertar pedidos em produção normal');
