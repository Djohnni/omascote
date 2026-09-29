const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const guidance = 'É só clicar no botão verde “Criar esta arte” abaixo.';
const productIds = [
  'proximo_jogo', 'resultado', 'jogador_escudo', 'contratacao',
  'escalacao', 'patrocinador', 'escudo3d', 'mascote_uniforme',
  'proximo_jogo_jogador', 'resultado_jogo_jogador', 'personalizada'
];
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };

function emptyState(conversationId = '') {
  return { version:1, profile:{}, profileFiles:[], athletes:[], lineup:'', sponsors:[], games:[], orders:[], invites:[], tickets:[], shareLinks:[], shareVotes:[], plan:null, draft:null, chat:[], processed:[], conversationId, conversationStartedAt:new Date().toISOString(), conversationStarts:[], conversations:[], chatRevision:0, draftRevision:0 };
}

test('todos os produtos indicam Criar esta arte antes de pedir dados', async () => {
  let state = emptyState();
  let assistantCalls = 0;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/atendimento-api/lab') {
      if (request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (body.action === 'start_conversation') state = emptyState(body.payload.id);
        if (body.action === 'save_chat') state.chat = body.payload.chat;
      }
      response.writeHead(200, { 'Content-Type':'application/json' });
      response.end(JSON.stringify({ ok:true, state }));
      return;
    }
    if (url.pathname === '/atendimento-api/assistant') {
      assistantCalls++;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const productId = body.message.match(/^pedido de arte: (.+)$/)?.[1];
      response.writeHead(200, { 'Content-Type':'application/json' });
      response.end(JSON.stringify({ ok:true, reply:'Qual esporte e quais dados você quer usar?', flow:productId, sport:'', switchFlow:false, intent:'show', recordId:null, fields:[], buttons:[], sportsRequest:false, usage:{ estimatedCostBrl:0 } }));
      return;
    }
    const file = path.resolve(root, `.${url.pathname}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, channel:'msedge' });
  try {
    for (const productId of productIds) {
      const page = await browser.newPage();
      try {
        await page.goto(`${base}/atendimento/index.html`);
        await page.getByRole('button', { name:'Enviar mensagem' }).waitFor();
        await page.getByLabel('Mensagem para o assistente').fill(`pedido de arte: ${productId}`);
        await page.getByRole('button', { name:'Enviar mensagem' }).click();
        await page.getByText(guidance, { exact:true }).waitFor();
        assert.equal(await page.locator('.product-card').count(), 1, productId);
        assert.equal(await page.getByText('Qual esporte e quais dados você quer usar?', { exact:true }).count(), 0, productId);
        await page.locator('.product-card').getByRole('button', { name:'Criar esta arte' }).click();
        await page.locator('.lab-form').waitFor();
      } finally {
        await page.close();
      }
    }

    const page = await browser.newPage();
    try {
      await page.goto(`${base}/atendimento/index.html`);
      await page.getByRole('button', { name:'Enviar mensagem' }).waitFor();
      const callsBeforeExact = assistantCalls;
      await page.getByLabel('Mensagem para o assistente').fill('Escudo 3D');
      await page.getByRole('button', { name:'Enviar mensagem' }).click();
      await page.getByText(guidance, { exact:true }).waitFor();
      assert.equal(await page.locator('.product-card').count(), 1);
      assert.equal(assistantCalls, callsBeforeExact, 'nome exato não deve chamar o assistente nem abrir o formulário');
      assert.equal(await page.locator('.lab-form').count(), 0);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
