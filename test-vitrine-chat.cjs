// Local browser regression. Remote services are mocked or blocked; no paid orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');

const root = __dirname;
const bundle = fs.readFileSync(path.join(root, 'atendimento/assets/index-BYWG3Byi.js'), 'utf8');
const initialState = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()`)();
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4'};
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  const data = fs.readFileSync(file);
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':data.length});
  res.end(data);
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'omascote-vitrine-'));
  console.log('Screenshots:', screenshots);
  try {
    for (const viewport of [{width:390,height:844}, {width:1440,height:1000}]) {
      let state = structuredClone(initialState);
      const actions = [], errors = [], paidRequests = [], media = [];
      const context = await browser.newContext({viewport, reducedMotion:'reduce'});
      await context.addInitScript(() => {
        localStorage.setItem('omascote_token', 'local-only-test-token');
        localStorage.setItem('omascote_nome_time', 'Time de teste local');
        localStorage.setItem('omascote_saldo', '36');
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {if (/\/media\/escudo3d\/.*\.mp4/.test(request.url())) media.push(request.url());});
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.includes('/atendimento-api/lab')) {
          const body = request.method() === 'POST' ? request.postDataJSON() : {};
          actions.push(body.action);
          if (body.action === 'start_conversation') {
            state.conversationId = body.payload.id;
            state.chat = [{id:'welcome',role:'assistant',text:'Olá'}];
          }
          if (body.action === 'save_draft') state.draft = body.payload.draft;
          if (body.action === 'save_chat') state.chat = body.payload.chat;
          return route.fulfill({json:{ok:true,state}});
        }
        if (url.origin === 'https://api.omascote.com.br') {
          if (request.method() === 'POST' && /\/pedidos(?:\/|$)/.test(url.pathname)) paidRequests.push(url.pathname);
          return route.fulfill({json:{ok:true,saldo:36,nome_time:'Time de teste local',pedidos:[],avaliacoes:[],plano:'',usados_no_ciclo:0}});
        }
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      await page.goto(origin + '/app.html', {waitUntil:'domcontentloaded'});
      await page.locator('#vitrineHome').waitFor({state:'visible'});
      await page.locator('.vitrineHero__image').evaluate(image => image.decode());
      await page.screenshot({path:path.join(screenshots,`home-${viewport.width}.png`), fullPage:true});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'home has no horizontal overflow');
      const flat = await page.locator('#vitrineHome').evaluate(node => {
        const style = getComputedStyle(node);
        return {border:parseFloat(style.borderTopWidth), shadow:style.boxShadow};
      });
      assert.equal(flat.border, 0, 'home does not introduce a boxed panel');
      assert.equal(flat.shadow, 'none', 'home has no surrounding shadow');
      assert.equal(await page.locator('#productsMenuAccordion').isVisible(), false, 'old product menu is not competing with chat');
      assert.equal(media.length, 0, 'home loads no sample MP4');

      const chat = page.frameLocator('#integratedChatFrame');
      await page.locator('[data-vitrine-product="mascote_uniforme"]').click();
      try {
        await chat.getByRole('radio', {name:'Futebol',exact:true}).waitFor({timeout:10000});
      } catch (error) {
        await page.screenshot({path:path.join(screenshots,`open-failure-${viewport.width}.png`),fullPage:true});
        console.log('Open diagnostics:',JSON.stringify({state,actions,errors,parent:await page.locator('body').innerText(),chat:await chat.locator('body').innerText()}));
        throw error;
      }
      await page.waitForFunction(() => document.body.classList.contains('vitrineChatActive'));
      await page.waitForTimeout(650);
      assert.equal(state.draft?.flow, 'mascote_uniforme', 'mascot uses the existing chat draft');
      const mascotId = state.draft.id;
      await chat.getByRole('radio', {name:'Futebol',exact:true}).click();
      await page.waitForTimeout(650);
      await page.locator('[data-vitrine-home]').first().click();
      await page.locator('#vitrineHome').waitFor({state:'visible'});
      await page.locator('[data-vitrine-product="mascote_uniforme"]').click();
      await chat.locator('.lab-form').waitFor({state:'visible'});
      assert.equal(state.draft.id, mascotId, 'returning to home and reopening preserves draft ID');
      assert.equal(state.draft.values.sport, 'Futebol', 'reopened draft preserves sport');
      await page.screenshot({path:path.join(screenshots,`mascot-chat-${viewport.width}.png`), fullPage:true});

      await page.locator('[data-vitrine-home]').first().click();
      await page.locator('[data-vitrine-options]').click();
      const catalog = chat.getByRole('navigation', {name:'Todas as opções do chat'});
      await catalog.waitFor({state:'visible'});
      for (const name of ['Mascote do Time','Próximo Jogo','Resultado do Jogo','Jogador + Escudo','Contratação','Escalação','Patrocinador','Escudo 3D']) {
        assert.ok(await catalog.getByRole('button',{name:new RegExp(name.replace(/[+]/g,'\\+'),'i')}).count(), `catalog preserves ${name}`);
      }
      assert.equal(await catalog.locator('section[aria-label="Criar uma arte"] button').count(), 10, 'catalog preserves all ten paid products');
      await chat.getByRole('button', {name:'Fechar opções',exact:true}).click();
      await page.locator('[data-vitrine-home]').first().click();

      for (const product of ['proximo_jogo','resultado']) {
        const previousId = state.draft.id;
        await page.locator(`[data-vitrine-product="${product}"]`).click();
        await chat.getByRole('alertdialog').waitFor({state:'visible'});
        await chat.getByRole('button', {name:'Manter minhas respostas',exact:true}).click();
        assert.equal(state.draft.id, previousId, 'declining a switch preserves previous draft');
        await page.locator('[data-vitrine-home]').first().click();
        await page.locator(`[data-vitrine-product="${product}"]`).click();
        await chat.getByRole('button', {name:'Trocar de atendimento',exact:true}).click();
        await page.waitForTimeout(650);
        assert.equal(state.draft.flow, product, 'accepted switch uses the original product draft');
        assert.notEqual(state.draft.id, previousId);
        await chat.getByRole('radio',{name:'Futebol',exact:true}).click();
        await page.waitForTimeout(650);
        await page.screenshot({path:path.join(screenshots,`${product}-chat-${viewport.width}.png`), fullPage:true});
        assert.equal(await chat.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true, 'chat form has no horizontal overflow');
        await page.locator('[data-vitrine-home]').first().click();
      }

      await page.locator('[data-vitrine-product="escudo3d"]').click();
      await page.locator('#escudo3dExamples').waitFor({state:'visible'});
      await page.screenshot({path:path.join(screenshots,`gallery-${viewport.width}.png`),fullPage:true});
      const galleryStyles = await page.locator('#escudo3dExamples').evaluate(gallery => {
        return [gallery,...gallery.querySelectorAll('button')].map(node => {
          const style = getComputedStyle(node);
          return {className:node.className,border:style.border,shadow:style.boxShadow,outline:style.outline,textShadow:style.textShadow};
        });
      });
      console.log(`Gallery computed styles ${viewport.width}px:`,JSON.stringify(galleryStyles));
      assert.equal(media.length,0,'opening gallery still loads no sample MP4');
      await page.getByRole('button',{name:'Fechar exemplos e voltar ao chat',exact:true}).click();
      await page.locator('[data-vitrine-home]').first().click();

      await page.locator('[data-vitrine-account]').click();
      await page.locator('#accountMenuPanel').waitFor({state:'visible'});
      await page.locator('#btnAbrirSaldo').click();
      await page.locator('#saldoMenu.open').waitFor({state:'visible'});
      const balance = await page.locator('#saldoMenu').boundingBox();
      assert.ok(balance.y >= 0 && balance.x >= 0 && balance.x + balance.width <= viewport.width + 1 && balance.y + balance.height <= viewport.height + 1, 'balance dialog fits screen');
      assert.equal(await page.locator('#saldoGerarPixBtn').isVisible(), true, 'Pix action remains reachable');
      await page.screenshot({path:path.join(screenshots,`balance-${viewport.width}.png`)});
      await page.mouse.click(3,viewport.height-3);
      await page.locator('#saldoMenu.open').waitFor({state:'hidden'});
      await page.locator('[data-vitrine-orders]').click();
      await page.locator('#menuPedidosTopo.open').waitFor({state:'visible'});
      await page.screenshot({path:path.join(screenshots,`orders-${viewport.width}.png`)});
      assert.equal(paidRequests.length, 0, 'navigation makes no paid-generation request');
      assert.equal(actions.includes('complete'), false, 'test never submits a generated order');
      assert.deepEqual(errors, [], 'no page runtime errors');
      console.log(`OK ${viewport.width}px: flat home, chat drafts, preserved answers, all products, switch confirmation, account/orders/balance`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => {console.error(error);server.close();process.exitCode=1;});
