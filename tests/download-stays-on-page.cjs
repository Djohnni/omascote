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

function createHarness({ fileStatus = 200, formato = 'resultado' } = {}) {
  const calls = [];
  const links = [];
  const alerts = [];
  const events = [];
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
        json: async () => ({
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
  return { download, calls, links, alerts, events, get clicks() { return clicks; } };
}

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
