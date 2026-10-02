// Local presentation regression. APIs/uploads are mocked; this never creates a paid order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');

const root = __dirname;
const bundle = fs.readFileSync(path.join(root, 'atendimento/assets/index-BYWG3Byi.js'), 'utf8');
const initialState = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()` )();
const products = new Function(`return (${bundle.match(/Cs=(\[\{id:.*?\]),ws=/s)[1]})`)().filter(product => product.id !== 'personalizada');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4'};
const server = http.createServer((request, response) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  const bytes = fs.readFileSync(file);
  response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':bytes.length});
  response.end(bytes);
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'omascote-product-form-'));
  console.log('Screenshots:', screenshots);
  try {
    for (const viewport of [{width:390,height:844}, {width:1440,height:1000}]) {
      let state = structuredClone(initialState);
      let releaseUpload = null;
      const requests = [], errors = [];
      const context = await browser.newContext({viewport, reducedMotion:'reduce'});
      await context.addInitScript(() => {
        localStorage.setItem('omascote_token', 'local-only-test-token');
        localStorage.setItem('omascote_nome_time', 'Time de teste local');
        localStorage.setItem('omascote_saldo', '36');
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() === 'POST') requests.push(url.pathname);
        if (url.pathname.includes('/atendimento-api/lab')) {
          const body = request.method() === 'POST' ? request.postDataJSON() : {};
          if (body.action === 'start_conversation') {
            state.conversationId = body.payload.id;
            state.chat = [
              {id:'welcome',role:'assistant',text:'Olá, como posso ajudar?'},
              {id:'old-product',role:'assistant',text:'Estas informações antigas não pertencem ao formulário.',flow:'mascote_uniforme'}
            ];
          }
          if (body.action === 'save_draft') state.draft = body.payload.draft;
          if (body.action === 'save_chat') state.chat = body.payload.chat;
          assert.notEqual(body.action, 'complete', 'presentation must not complete an order');
          return route.fulfill({json:{ok:true,state}});
        }
        if (url.pathname.includes('/atendimento-api/files')) {
          const body = request.postDataBuffer().toString();
          const field = body.match(/name="field"\r\n\r\n([^\r]+)/)?.[1] || 'team_crest';
          await new Promise(resolve => {releaseUpload = resolve;});
          return route.fulfill({json:{ok:true,file:{id:'local-crest',field,name:'escudo-local.png',type:'image/png',size:pixel.length,url:origin + '/__product-test/crest.png'}}});
        }
        if (url.pathname === '/__product-test/crest.png') return route.fulfill({contentType:'image/png',body:pixel});
        if (url.origin === 'https://api.omascote.com.br') {
          assert.ok(!(request.method() === 'POST' && /\/pedidos(?:\/|$)/.test(url.pathname)), 'no paid request is allowed');
          return route.fulfill({json:{ok:true,saldo:36,nome_time:'Time de teste local',pedidos:[],avaliacoes:[],plano:'',usados_no_ciclo:0}});
        }
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      await page.goto(origin + '/app.html', {waitUntil:'domcontentloaded'});
      await page.locator('#vitrineHome').waitFor({state:'visible'});
      const chat = page.frameLocator('#integratedChatFrame');

      async function assertCleanProduct(product) {
        await chat.locator('.lab-form').waitFor({state:'visible'});
        assert.equal(await chat.locator('.lab-form-heading strong').innerText(), product.name);
        assert.equal(await chat.locator('.composer').isVisible(), false, 'product must not display a chat composer');
        assert.equal(await chat.locator('.lab-conversation-bar').isVisible(), false, 'product must not display conversation controls');
        assert.equal(await chat.locator('.lab-scroll > .lab-message:visible').count(), 0, 'old messages and product cards must not compete with the form');
        assert.equal(await chat.locator('.product-card:visible').count(), 0, 'product must not be repeated as a chat card');
        assert.equal(await chat.locator('.composer-area > input[type="file"]').count(), 1, 'print upload input remains mounted');
        assert.equal(await chat.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true, 'product has no horizontal overflow');
        assert.equal(await chat.locator('.lab-scroll').evaluate(node => getComputedStyle(node).overflowY), 'visible', 'product scroll belongs to the page rather than a chat box');
        await page.waitForFunction(() => {
          const frame = document.getElementById('integratedChatFrame');
          const content = frame?.contentDocument?.querySelector('.lab-frame.is-integrated');
          return content && frame.clientHeight >= content.getBoundingClientRect().height;
        }, null, {timeout:5000});
        const height = await page.locator('#integratedChatFrame').evaluate(frame => ({frame:frame.clientHeight,content:frame.contentDocument.querySelector('.lab-frame.is-integrated').getBoundingClientRect().height}));
        assert.ok(height.frame - height.content <= 325, 'form uses its content height instead of a tall fixed chat viewport');
      }

      assert.equal(products.length, 10);
      for (const product of products) {
        console.log(`Opening ${product.id} at ${viewport.width}px`);
        await page.locator('[data-vitrine-options]').click();
        const catalog = chat.getByRole('navigation', {name:'Todas as opções do chat'});
        await catalog.waitFor({state:'visible'});
        await catalog.locator('section[aria-label="Criar uma arte"] button').filter({has:chat.getByText(product.name,{exact:true})}).click();
        if (product.id === 'escudo3d') {
          await page.locator('#escudo3dExamples').waitFor({state:'visible'});
          await page.locator('#escudo3dExamples [data-delivery-choice="image"]').click();
        }
        const switchDialog = chat.getByRole('alertdialog');
        try {
          // React can render the switch dialog after the click has completed.
          // Wait for either the target form or its original confirmation dialog.
          await page.waitForFunction(name => {
            const document = window.document.getElementById('integratedChatFrame')?.contentDocument;
            const dialog = document?.querySelector('[role="alertdialog"]');
            return (dialog && dialog.getBoundingClientRect().width > 0) || document?.querySelector('.lab-form-heading strong')?.textContent.trim() === name;
          }, product.name, {timeout:10000});
          if (await switchDialog.isVisible()) {
            await chat.getByRole('button', {name:'Trocar de atendimento',exact:true}).click();
          }
          await page.waitForFunction(name => window.document.getElementById('integratedChatFrame')?.contentDocument?.querySelector('.lab-form-heading strong')?.textContent.trim() === name, product.name, {timeout:10000});
          await chat.getByRole('radio', {name:'Futebol',exact:true}).waitFor({state:'visible',timeout:10000});
        } catch (error) {
          console.log('Product diagnostics:', JSON.stringify({product:product.id, viewport, draft:state.draft, parentText:(await page.locator('body').innerText()).slice(-3500), childText:(await chat.locator('body').innerText()).slice(-6500), errors}));
          await page.screenshot({path:path.join(screenshots,`failure-${product.id}-${viewport.width}.png`),fullPage:true});
          throw error;
        }
        await assertCleanProduct(product);
        if (product.id === 'proximo_jogo') {
          const iframe = page.frames().find(frame => frame.url().includes('/atendimento/'));
          await iframe.evaluate(() => {
            window.dispatchEvent(new MessageEvent('message', {data:{type:'omascote-chat:visual-mode',mode:'chat'},origin:location.origin,source:window}));
            window.dispatchEvent(new MessageEvent('message', {data:{type:'omascote-chat:visual-mode',mode:'chat'},origin:'https://untrusted.invalid',source:window.parent}));
          });
          await page.evaluate(() => {
            const source = document.getElementById('integratedChatFrame').contentWindow;
            window.dispatchEvent(new MessageEvent('message', {data:{type:'omascote-chat:presentation',mode:'chat'},origin:location.origin,source:window}));
            window.dispatchEvent(new MessageEvent('message', {data:{type:'omascote-chat:presentation',mode:'chat'},origin:'https://untrusted.invalid',source}));
          });
          assert.equal(await chat.locator('body').evaluate(node => node.dataset.productView), 'product', 'child ignores wrong-source and wrong-origin mode messages');
          assert.equal(await page.locator('body').evaluate(node => node.classList.contains('vitrineProductActive')), true, 'parent ignores wrong-source and wrong-origin presentation messages');
          await assertCleanProduct(product);
        }
        await chat.getByRole('radio', {name:'Futebol',exact:true}).click();
        await page.waitForTimeout(520);
        assert.equal(state.draft?.flow, product.id, 'all products use their original draft');
        assert.equal(state.draft.values.sport, 'Futebol', 'sport stays on the original draft');
        await assertCleanProduct(product);
        await chat.getByRole('button', {name:'Enviar pedido',exact:true}).click();
        const validation = chat.locator('.form-error[role="alert"]');
        await validation.waitFor({state:'visible'});
        assert.match(await validation.innerText(), /Falta preencher|Envie uma foto|Informe /, 'required-field errors remain visible');
        if (['mascote_uniforme','proximo_jogo','escudo3d'].includes(product.id)) {
          await page.screenshot({path:path.join(screenshots,`${product.id}-${viewport.width}.png`),fullPage:true});
        }
        if (product.id === 'mascote_uniforme') {
          const id = state.draft.id;
          await chat.locator('.question-trigger').filter({hasText:/escudo/i}).first().click();
          await chat.locator('.lab-form input[type="file"]').first().setInputFiles({name:'escudo-local.png',mimeType:'image/png',buffer:pixel});
          await chat.locator('.lab-busy').waitFor({state:'visible'});
          assert.ok(releaseUpload, 'local upload is waiting under test control');
          releaseUpload();
          await chat.getByText('escudo-local.png',{exact:true}).waitFor({state:'visible'});
          await page.waitForTimeout(520);
          assert.equal(state.draft.files[0].field, 'team_crest', 'file keeps its original field mapping');
          await page.locator('[data-vitrine-home]').first().click();
          await page.locator('[data-vitrine-product="mascote_uniforme"]').click();
          await assertCleanProduct(product);
          assert.equal(state.draft.id, id, 'home navigation preserves the draft');
          assert.equal(state.draft.values.sport, 'Futebol', 'home navigation preserves answers');
          assert.equal(state.draft.files[0].id, 'local-crest', 'home navigation preserves upload');
        }
        await page.locator('[data-vitrine-home]').first().click();
      }

      await page.locator('[data-vitrine-chat]').click();
      await chat.locator('.composer').waitFor({state:'visible'});
      assert.equal(await chat.locator('.lab-conversation-bar').isVisible(), true, 'Help restores chat controls');
      assert.ok(await chat.locator('.lab-scroll > .lab-message:visible').count(), 'Help restores existing conversation');
      await page.screenshot({path:path.join(screenshots,`help-${viewport.width}.png`),fullPage:true});
      assert.deepEqual(errors, [], 'no runtime errors');
      assert.equal(requests.some(url => /\/pedidos(?:\/|$)/.test(url)), false, 'no generation request was sent');
      console.log(`OK ${viewport.width}px: all 10 original forms, clean product UI, required errors, upload/status, preserved draft and Help`);
      await context.close();

      // Restore an already-sent local conversation rather than submitting an order.
      const outcomeState = structuredClone(initialState);
      outcomeState.chat = [
        {id:'welcome',role:'assistant',text:'Olá'},
        {id:'obsolete',role:'assistant',text:'Mensagem antiga que não deve aparecer.'},
        {id:'sent',role:'assistant',text:'Pedido enviado.',action:'orders'}
      ];
      const outcomeContext = await browser.newContext({viewport, reducedMotion:'reduce'});
      await outcomeContext.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.includes('/atendimento-api/lab')) {
          if (request.method() === 'POST') {
            const body = request.postDataJSON();
            assert.notEqual(body.action, 'complete');
            if (body.action === 'start_conversation') outcomeState.conversationId = body.payload.id;
          }
          return route.fulfill({json:{ok:true,state:outcomeState}});
        }
        if (url.origin === 'https://api.omascote.com.br') return route.fulfill({json:{ok:true,pedidos:[],avaliacoes:[]}});
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      const outcomePage = await outcomeContext.newPage();
      outcomePage.on('pageerror', error => errors.push(error.message));
      await outcomePage.goto(origin + '/app.html', {waitUntil:'domcontentloaded'});
      await outcomePage.locator('[data-vitrine-chat]').click();
      const outcomeChat = outcomePage.frameLocator('#integratedChatFrame');
      await outcomeChat.locator('.lab-post-order-actions').waitFor({state:'visible'});
      await outcomePage.evaluate(() => {
        document.getElementById('integratedChatFrame').contentWindow.postMessage({type:'omascote-chat:visual-mode',mode:'product'}, location.origin);
      });
      await outcomeChat.locator('.composer').waitFor({state:'hidden'});
      assert.equal(await outcomeChat.locator('.lab-scroll > .lab-message:visible').count(), 1, 'only the current success outcome remains visible');
      assert.equal(await outcomeChat.getByRole('button',{name:'Pedidos',exact:true}).isVisible(), true, 'post-order access to real orders remains visible');
      assert.equal(await outcomeChat.getByRole('button',{name:'CRIAR +',exact:true}).isVisible(), true, 'post-order creation shortcut remains visible');
      assert.deepEqual(errors, [], 'outcome presentation has no runtime errors');
      await outcomePage.screenshot({path:path.join(screenshots,`sent-${viewport.width}.png`),fullPage:true});
      await outcomeContext.close();
      console.log(`OK ${viewport.width}px: restored post-order actions without paid requests`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => {console.error(error);server.close();process.exitCode=1;});
