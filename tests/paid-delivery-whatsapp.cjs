const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app.html', 'utf8');
const start = html.indexOf('function pedidoIncluiVideoPago(');
const end = html.indexOf('function cardPagamentoPendente(', start);
assert.ok(start >= 0 && end > start, 'regras de entrega encontradas');

const classes = new Set();
const button = {
  href: 'https://wa.me/5547992536917?text=ajuda',
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
  },
  setAttribute(name, value) { this[name] = value; },
  removeAttribute(name) { delete this[name]; },
};
const notice = { hidden: true, textContent: '' };
const sandbox = {
  document: { getElementById: (id) => id === 'ia4WhatsappBtn' ? button : notice },
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
rules.atualizarAlertaEntregaWhatsapp([]);
assert.equal(classes.has('ia4WhatsappBtnFalha'), false);
assert.equal(notice.hidden, true);
assert.equal(button.href, 'https://wa.me/5547992536917?text=ajuda');

console.log('OK: pedidos pagos com falha ou atraso destacam o WhatsApp sem alertar pedidos em produção normal');
