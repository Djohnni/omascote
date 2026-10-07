const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const start = html.indexOf('function omascoteChatUrl(){');
const end = html.indexOf('function fecharAtendimentoIntegrado(){', start);
assert.ok(start >= 0 && end > start, 'Find actual app loader and open handler');
const source = html.slice(start, end);

function harness({ missingFrame = false, dataSrc = '/atendimento/index.html?integrado=1&v=test' } = {}) {
  const events = new Map(), timers = new Map(), navigation = [];
  let nextTimer = 0, currentSrc = '', scrolls = 0;
  const loading = { hidden: true }, status = { textContent: '' };
  const retry = { hidden: true, addEventListener(type, callback) { this[type] = callback; } };
  const frame = {
    dataset: dataSrc === null ? {} : { src: dataSrc }, contentWindow: {},
    getAttribute(name) { return name === 'src' ? currentSrc || null : null; },
    set src(value) { currentSrc = value; navigation.push(value); },
    get src() { return currentSrc; },
  };
  const nodes = { integratedChatLoading: loading, integratedChatLoadingStatus: status, integratedChatRetry: retry };
  const window = {
    location: { origin: 'https://omascote.com.br' },
    addEventListener(type, callback) { events.set(type, callback); },
  };
  const context = vm.createContext({
    URL, window, integratedChatFrame: missingFrame ? null : frame,
    integratedChatModal: { scrollIntoView() { scrolls++; } },
    document: { getElementById(id) { return nodes[id] || null; } },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  return {
    context, frame, loading, status, retry, navigation, timers,
    get scrolls() { return scrolls; },
    ready(overrides = {}) {
      events.get('message')({ source: frame.contentWindow, origin: window.location.origin,
        data: { type: 'omascote-chat:visual-ready', ready: true }, ...overrides });
    },
    expire() {
      for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
    },
  };
}

test('entry markup defers the frame and four hidden images while retaining original sources', () => {
  const iframe = html.match(/<iframe\b[^>]*\bid="integratedChatFrame"[^>]*>/)[0];
  assert.doesNotMatch(iframe, /(?:\s)src\s*=/);
  assert.match(iframe, /data-src="\/atendimento\/index\.html\?integrado=1/);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  const targets = [
    images.find(tag => /src="produtos\/mascote_uniforme\.jpg"/.test(tag)),
    images.find(tag => /src="produtos\/jogador-escudo-amostra-1\.webp"/.test(tag)),
    images.find(tag => /id="selectedProductPreviewImg"/.test(tag)),
    images.find(tag => /src="google-g\.png"/.test(tag)),
  ];
  for (const image of targets) {
    assert.ok(image);
    assert.match(image, /loading="lazy"/);
    assert.match(image, /decoding="async"/);
    assert.doesNotMatch(image, /fetchpriority="high"/);
  }
  assert.match(targets[2], /src="produtos\/resultado\.jpg"/);
});

test('loader does not run during initialization and first help open starts exactly one navigation', () => {
  const h = harness();
  assert.equal(h.navigation.length, 0);
  assert.equal(h.timers.size, 0);
  h.context.abrirAtendimentoIntegrado();
  assert.deepEqual(h.navigation, ['https://omascote.com.br/atendimento/index.html?integrado=1&v=test']);
  assert.equal(h.loading.hidden, false);
  assert.equal(h.retry.hidden, true);
  assert.equal(h.scrolls, 1);
  assert.equal([...h.timers.values()][0].delay, 15000);
  h.context.abrirAtendimentoIntegrado();
  h.context.carregarAtendimentoIntegrado();
  assert.equal(h.navigation.length, 1);
  assert.equal(h.timers.size, 1);
});

test('slow help loading reveals retry and only explicit retry makes another navigation', () => {
  const h = harness();
  h.context.abrirAtendimentoIntegrado();
  h.expire();
  assert.equal(h.loading.hidden, false);
  assert.equal(h.retry.hidden, false);
  assert.match(h.status.textContent, /Confira sua conexão/);
  h.context.abrirAtendimentoIntegrado();
  assert.equal(h.navigation.length, 1);
  h.retry.click();
  assert.equal(h.navigation.length, 2);
  assert.equal(h.retry.hidden, true);
  assert.equal(h.timers.size, 1);
});

test('messages cannot mark another frame or origin ready or accept a truthy nonboolean', () => {
  const h = harness();
  h.context.carregarAtendimentoIntegrado();
  h.ready({ source: {} });
  h.ready({ origin: 'https://example.com' });
  h.ready({ data: { type: 'omascote-chat:visual-ready', ready: 'true' } });
  h.ready({ data: { type: 'omascote-chat:other', ready: true } });
  assert.equal(h.loading.hidden, false);
  assert.equal(h.timers.size, 1);
  h.ready();
  assert.equal(h.loading.hidden, true);
  assert.equal(h.timers.size, 0);
});

test('first legitimate ready permanently prevents reloading drafts and pending authentication', () => {
  const h = harness();
  h.context.carregarAtendimentoIntegrado();
  h.ready();
  h.context.carregarAtendimentoIntegrado({ retry: true });
  h.retry.click();
  h.ready({ data: { type: 'omascote-chat:visual-ready', ready: false } });
  h.context.carregarAtendimentoIntegrado({ retry: true });
  h.context.abrirAtendimentoIntegrado();
  assert.equal(h.navigation.length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.loading.hidden, true);
});

test('missing frame fails harmlessly and legacy markup still has a local fallback URL', () => {
  const missing = harness({ missingFrame: true });
  assert.equal(missing.context.carregarAtendimentoIntegrado(), false);
  missing.context.abrirAtendimentoIntegrado();
  assert.equal(missing.navigation.length, 0);
  const legacy = harness({ dataSrc: null });
  legacy.context.carregarAtendimentoIntegrado();
  assert.match(legacy.navigation[0], /^https:\/\/omascote\.com\.br\/atendimento\/index\.html\?integrado=1/);
});
