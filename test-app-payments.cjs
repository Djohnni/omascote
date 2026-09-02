const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const html = fs.readFileSync(`${__dirname}/app.html`, 'utf8');

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=|application\/ld\+json/.test(match[1])) new vm.Script(match[2]);
}

const names = [
  'ia4EstaEmModoApp', 'ia4AppModeHeaders', 'ia4Escudo3dBrindeGratisNoApp',
  'formatCleanProductPrice', 'cardPagamentoPendente', 'gerarPixPedido',
  'copiarPixPedido', 'verQrCodePedido', 'usarSaldoPedido', 'abrirModalPixQr'
];
const source = names.map(name => {
  const match = html.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, name);
  return match[0];
}).join('\n');

function makeContext(search, referrer = '') {
  const calls = [];
  const alerts = [];
  const nodes = {
    pixQrModal: { classList: { add() {} }, setAttribute() {} },
    pixQrBody: { innerHTML: '' }
  };
  const context = vm.createContext({
    URLSearchParams, window: { location: { search } },
    document: { referrer, getElementById: id => nodes[id] },
    token: 'local-test-only', API_BASE: 'https://example.test',
    brindeEscudo3dAppDisponivel: true,
    couponSummaryText: () => '', htmlEscape: text => text,
    pedidoEconomicoAntesPagamentoUI: p => p.modalidade_criacao === 'economica',
    ia4LerJsonSeguro: response => response.json(), ia4TratarAuthInvalida: () => '',
    alert: text => alerts.push(text),
    copiarTextoPix: async text => { calls.push({ copied: text }); return true; },
    refreshMe: async () => calls.push({ refreshed: true }),
    carregarHistorico: async () => calls.push({ history: true }),
    pararPollingSaldoPix() {}, saldoPixAtual: null,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({
        ok: true, pix_copia_cola: 'PIX-LOCAL-TEST',
        qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8HkAAAAASUVORK5CYII='
      }) };
    }
  });
  vm.runInContext(source, context);
  return { context, calls, alerts, nodes };
}

async function verify() {
  for (const [search, referrer, app] of [
    ['', '', false], ['?omascote_app=1', '', true],
    ['?modo_app=1', '', true], ['', 'android-app://br.com.omascote.app', true]
  ]) {
    const { context: c, calls, alerts, nodes } = makeContext(search, referrer);
    assert.equal(c.ia4EstaEmModoApp(), app);
    const card = c.cardPagamentoPendente({ id: 'teste', valor_pendente: 8 });
    assert.match(card, /Copiar Pix R\$8/);
    assert.match(card, /Ver QR Code/);
    assert.match(card, /Usar saldo Meu Clube FC/);
    assert.doesNotMatch(card, /indisponível/);
    const economic = c.cardPagamentoPendente({ id: 'teste', valor_pendente: 4, modalidade_criacao: 'economica' });
    assert.match(economic, /Copiar Pix R\$4/);
    assert.doesNotMatch(economic, /Usar saldo/);
    assert.equal(c.formatCleanProductPrice({ id: 'contratacao', price: 8 }), 'R$8,00');
    assert.equal(c.formatCleanProductPrice({ id: 'escudo3d', price: 8 }), app ? 'Grátis no app' : 'R$8,00');
    await c.copiarPixPedido('teste');
    assert.ok(calls.some(call => call.copied === 'PIX-LOCAL-TEST'));
    await c.verQrCodePedido('teste');
    assert.match(nodes.pixQrBody.innerHTML, /QR Code Pix/);
    await c.usarSaldoPedido('teste');
    const requests = calls.filter(call => call.url);
    assert.equal(requests.length, 3);
    assert.ok(requests[2].url.endsWith('/pagar-com-saldo'));
    for (const call of requests) {
      assert.equal(call.options.headers.Authorization, 'Bearer local-test-only');
      assert.equal(call.options.headers['X-Omascote-App-Mode'], app ? 'app' : undefined);
    }
    c.token = '';
    await c.gerarPixPedido('teste');
    await c.usarSaldoPedido('teste');
    assert.equal(calls.filter(call => call.url).length, 3);
    assert.ok(alerts.some(text => text.includes('Faça login')));
  }
  console.log('OK - scripts validos; Pix, QR e saldo em navegador, flag app, flag alternativa e TWA; login e brinde preservados');
}

verify().then(() => {
  if (!process.argv.includes('--serve')) return;
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[0]).join('\n');
  const { context } = makeContext('?omascote_app=1');
  const card = context.cardPagamentoPendente({ id: 'teste', valor_pendente: 8 });
  const page = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste local de pagamento no app</title>${styles}<body class="omascoteAppMode"><main style="max-width:390px;margin:24px auto;padding:16px;background:#fff;color:#111"><h2>Meus pedidos</h2><p>Pedido fictício para conferir o pagamento</p>${card}<p id="testStatus" role="status"></p></main><div id="pixQrModal" class="modal" aria-hidden="true"><div class="modalBox"><div id="pixQrBody"></div></div></div><script>
  const token = 'local-test-only', API_BASE = '/mock-api';
  let saldoPixAtual = null;
  function couponSummaryText(){ return ''; }
  function htmlEscape(s){ return s; }
  function pedidoEconomicoAntesPagamentoUI(){ return false; }
  function ia4LerJsonSeguro(r){ return r.json(); }
  function ia4TratarAuthInvalida(){ return ''; }
  function pararPollingSaldoPix(){}
  function refreshMe(){}
  function carregarHistorico(){}
  async function copiarTextoPix(text){ document.getElementById('testStatus').textContent = text; return true; }
  window.alert = text => { document.getElementById('testStatus').textContent = text; };
  ${source}
  </script></body></html>`;
  http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url.startsWith('/mock-api/')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, pix_copia_cola: 'PIX-LOCAL-TEST', qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8HkAAAAASUVORK5CYII=' }));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(page);
  }).listen(8766, '127.0.0.1', () => console.log('Teste visual em http://127.0.0.1:8766/?omascote_app=1'));
}).catch(error => { console.error(error); process.exitCode = 1; });
