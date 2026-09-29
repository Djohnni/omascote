const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const start = html.indexOf('async function iniciarDownloadDiretoSeguro(');
const end = html.indexOf('async function baixarVideoPedido(', start);
assert.ok(start >= 0 && end > start, 'função de download encontrada');
const source = html.slice(start, end);

function createHarness({ fileStatus = 200, formato = 'resultado', nativePath, nativeExpires = 300 } = {}) {
  const calls = [];
  const links = [];
  const alerts = [];
  const events = [];
  const nativeRequests = [];
  let clicks = 0;
  class MockURL extends URL {
    static createObjectURL() { return 'blob:omascote-teste'; }
    static revokeObjectURL() {}
  }
  const sandbox = {
    API_BASE: 'https://api.omascote.com.br',
    URL: MockURL,
    URLSearchParams,
    token: 'token-de-teste',
    downloadsDiretosEmAndamento: new Set(),
    imagensFinaisPedidos: new Map(),
    sincronizarImagensFinaisSessao: () => {},
    exibirImagemFinalPedido: () => {},
    performance: { now: () => 1 },
    ambienteDownloadAtual: () => ({ navegador: 'whatsapp', sistema: 'android', navegadorInterno: true }),
    mostrarAvisoPedido: () => {},
    solicitarDownloadHttps: input => nativeRequests.push(input),
    ia4Track: (event, data) => events.push({ event, data }),
    ia4TratarAuthInvalida: () => '',
    ia4LerJsonSeguro: async response => response.json(),
    alert: message => alerts.push(message),
    setTimeout: () => 1,
    document: {
      querySelectorAll: () => [],
      body: { appendChild: link => links.push(link) },
      createElement: tag => {
        assert.equal(tag, 'a', 'download não navega por formulário');
        return { style: {}, click: () => { clicks++; }, remove: () => {} };
      }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if(calls.length === 1) return {
        ok: true,
        status: 200,
        json: async () => nativePath ? ({ ok: true, transporte: 'https', expires_in: nativeExpires, download_path: nativePath }) : ({
          ok: true,
          ticket: 'ticket-unico',
          download_path: `/pedidos/pedido-teste/download-direto/${formato}`
        })
      };
      return fileStatus === 200 ? {
        ok: true,
        status: 200,
        headers: { get: () => formato === 'video' ? 'video/mp4' : 'image/png' },
        blob: async () => new Blob(['arquivo'], { type: formato === 'video' ? 'video/mp4' : 'image/png' })
      } : {
        ok: false,
        status: fileStatus,
        json: async () => ({ ok: false, error: 'Arquivo indisponível' })
      };
    }
  };
  const download = vm.runInNewContext(`${source}\niniciarDownloadDiretoSeguro`, sandbox);
  return { download, calls, links, alerts, events, nativeRequests, get clicks() { return clicks; } };
}

test('HTTPS recebe somente autorização; não carrega arquivo em memória nem anuncia salvamento', async () => {
  for (const formato of ['resultado', 'video']) {
    const nativePath = `/pedidos/pedido-teste/download-arquivo/${formato}?chave=${'a'.repeat(43)}`;
    const h = createHarness({ formato, nativePath });
    const ok = await h.download({ id: 'pedido-teste', ticketEndpoint: '/pedidos/pedido-teste/download-ticket', formato });
    assert.equal(ok, true);
    assert.equal(h.calls.length, 1, 'nenhum fetch do arquivo');
    assert.equal(JSON.parse(h.calls[0].options.body).transporte, 'https');
    assert.equal(h.nativeRequests.length, 1);
    assert.equal(h.nativeRequests[0].url, `https://api.omascote.com.br${nativePath}`);
    assert.equal(h.clicks, 0, 'nenhum clique Blob');
    assert.deepEqual(h.events.map(e => e.event), ['download_inicio', 'download_ticket_resposta', 'download_solicitado_navegador']);
    assert.ok(!JSON.stringify(h.events).includes('a'.repeat(43)), 'ticket não vaza para eventos');
  }
});

test('recusa links externos, outro pedido, protocolo inseguro e prazo inválido', async () => {
  for (const nativePath of [
    `https://evil.example/pedidos/pedido-teste/download-arquivo/resultado?chave=${'a'.repeat(43)}`,
    `/pedidos/outro/download-arquivo/resultado?chave=${'a'.repeat(43)}`,
    `http://api.omascote.com.br/pedidos/pedido-teste/download-arquivo/resultado?chave=${'a'.repeat(43)}`,
    '/pedidos/pedido-teste/download-arquivo/resultado?chave=invalida'
  ]) {
    const h = createHarness({ nativePath });
    assert.equal(await h.download({ id: 'pedido-teste', ticketEndpoint: '/ticket' }), false);
    assert.equal(h.nativeRequests.length, 0);
  }
  const h = createHarness({ nativePath: `/pedidos/pedido-teste/download-arquivo/resultado?chave=${'a'.repeat(43)}`, nativeExpires: 301 });
  assert.equal(await h.download({ id: 'pedido-teste', ticketEndpoint: '/ticket' }), false);
});

test('link HTTPS preserva conversa e alternativa exige clique real', () => {
  const nativeStart = html.indexOf('const downloadsDiretosEmAndamento = new Set();');
  const nativeEnd = html.indexOf('function ambienteDownloadAtual()', nativeStart);
  const elements = [];
  const messages = [];
  const timers = [];
  let now = 100;
  const sandbox = {
    Date: { now: () => now },
    setTimeout: (fn, delay) => timers.push({ fn, delay }),
    mostrarAvisoPedido: (...args) => messages.push(args), ia4Track: () => {},
    document: {
      body: { appendChild: el => elements.push(el) },
      getElementById: () => ({ querySelector: () => ({ appendChild: el => elements.push(el) }) }),
      createElement: tag => ({ tag, style: {}, click() { this.clicked = true; }, addEventListener(name, fn) { this[name] = fn; }, remove() {} })
    }
  };
  const api = vm.runInNewContext(`${html.slice(nativeStart, nativeEnd)}\n({solicitarDownloadHttps,mostrarAlternativaDownloadHttps})`, sandbox);
  const url = 'https://api.omascote.com.br/pedidos/p/download-arquivo/video?chave=exemplo';
  api.solicitarDownloadHttps({ url, id: 'p', formato: 'video', expiresIn: 300 });
  assert.equal(elements[0].tag, 'a');
  assert.equal(elements[0].hidden, true);
  assert.equal(elements[0].href, url);
  assert.equal(elements[0].target, '_blank');
  assert.equal(elements[0].clicked, true);
  assert.equal(elements[0].referrerPolicy, 'no-referrer');
  assert.ok(timers.some(t => t.delay === 300000), 'link temporário tem expiração');
  api.mostrarAlternativaDownloadHttps('p', 'video');
  assert.equal(elements[1].target, '_blank');
  assert.equal(elements[1].rel, 'noopener noreferrer');
  assert.equal(elements[1].href, url);
  now += 300001;
  let prevented = false;
  elements[1].click({ stopPropagation() {}, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(messages.at(-1)[0], 'Link expirado');
});

test('baixa em segundo plano sem trocar a página do cliente', async () => {
  const h = createHarness();
  const ok = await h.download({
    id: 'pedido-teste',
    ticketEndpoint: '/pedidos/pedido-teste/download-ticket',
    formato: 'resultado'
  });
  assert.equal(ok, true);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[1].options.method, 'POST');
  assert.equal(h.calls[1].options.body.get('ticket'), 'ticket-unico');
  assert.equal(h.clicks, 1);
  assert.equal(h.links[0].href, 'blob:omascote-teste');
  assert.equal(h.links[0].download, 'pedido-teste_imagem.png');
  assert.equal(h.links[0].target, '_blank', 'se o navegador ignorar download, a página atual permanece');
  assert.equal(h.alerts.length, 0);
  assert.ok(h.events.some(item => item.event === 'download_enviado_navegador' && item.data.rota === 'download_blob'));
});

test('vídeo também baixa sem navegar para a API', async () => {
  const h = createHarness({ formato: 'video' });
  const ok = await h.download({
    id: 'pedido-teste',
    ticketEndpoint: '/pedidos/pedido-teste/download-ticket',
    formato: 'video',
    recurso: 'pedido_video'
  });
  assert.equal(ok, true);
  assert.equal(h.clicks, 1);
  assert.equal(h.links[0].download, 'pedido-teste_video_8s.mp4');
  assert.equal(h.links[0].href, 'blob:omascote-teste');
});

test('erro ao buscar arquivo não abre outra página nem anuncia download concluído', async () => {
  const h = createHarness({ fileStatus: 403 });
  const ok = await h.download({
    id: 'pedido-teste',
    ticketEndpoint: '/pedidos/pedido-teste/download-ticket',
    formato: 'resultado'
  });
  assert.equal(ok, false);
  assert.equal(h.clicks, 0);
  assert.equal(h.links.length, 0);
  assert.equal(h.alerts[0], 'Arquivo indisponível');
  assert.ok(!h.events.some(item => item.event === 'download_enviado_navegador'));
});
