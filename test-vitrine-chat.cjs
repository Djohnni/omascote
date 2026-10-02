// Local browser regression. Remote services are mocked or blocked; no paid orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = __dirname;
const captureBaseline = process.argv.includes('--capture-baseline');
const compactOnly = process.argv.includes('--compact-only');
const baselineCommit = 'c6c9b94b86f28791e2db2507d39d640d403ddc20';
const baselineFiles = captureBaseline ? new Map(['app.html','vitrine-chat.css'].map(file => [file,execFileSync('git',['show',`${baselineCommit}:${file}`],{cwd:root,maxBuffer:8*1024*1024})])) : null;
// Measured with the baseline HTML/CSS above, not inferred from the new layout.
const baselineMetrics = {
  320:{image:{x:95.203125,y:215,width:212.796875,height:450},hero:{width:280,height:450}},
  390:{image:{x:112,y:187,width:266,height:450},hero:{width:350,height:450}},
  430:{image:{x:121.609375,y:152.5,width:296.390625,height:450},hero:{width:390,height:450}},
  1440:{image:{x:553.609375,y:193.1875,width:666.390625,height:620},hero:{width:980,height:620}}
};
const bundle = fs.readFileSync(path.join(root, 'atendimento/assets/index-BYWG3Byi.js'), 'utf8');
const initialState = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()`)();
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4'};
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  const data = baselineFiles?.get(path.relative(root,file)) || fs.readFileSync(file);
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
    const viewports = captureBaseline || compactOnly ? [{width:320,height:844},{width:390,height:844},{width:430,height:932},{width:1440,height:1000}] : [{width:390,height:844},{width:1440,height:1000}];
    for (const viewport of viewports) {
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
      await page.locator('.vitrineHero__backdrop').evaluate(image => image.decode());
      await page.locator('.vitrineProducts img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      const heroMetrics = await page.locator('.vitrineHero__image').evaluate(image => {
        const rect = node => {
          const box = node.getBoundingClientRect();
          return {x:box.x,y:box.y,width:box.width,height:box.height,bottom:box.bottom};
        };
        return {image:rect(image),hero:rect(image.closest('.vitrineHero')),header:rect(document.querySelector('.vitrineHeader')),
          naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,src:image.getAttribute('src'),objectFit:getComputedStyle(image).objectFit,objectPosition:getComputedStyle(image).objectPosition};
      });
      console.log(`${captureBaseline ? 'BASELINE' : 'CURRENT'} ${viewport.width}px hero:`,JSON.stringify(heroMetrics));
      if (captureBaseline) {
        await page.screenshot({path:path.join(screenshots,`baseline-home-${viewport.width}.png`),fullPage:true});
        assert.deepEqual(errors,[],'baseline has no runtime errors');
        assert.equal(paidRequests.length,0,'baseline captures create no orders');
        await context.close();
        continue;
      }
      const expectedHero = baselineMetrics[viewport.width];
      for (const key of ['width','height']) {
        assert.equal(heroMetrics.image[key],expectedHero.image[key],`mascot image ${key} is exactly unchanged at ${viewport.width}px`);
        assert.equal(heroMetrics.hero[key],expectedHero.hero[key],`hero ${key} is exactly unchanged at ${viewport.width}px`);
      }
      assert.equal(heroMetrics.image.x,expectedHero.image.x,'mascot keeps the same horizontal placement');
      assert.ok(heroMetrics.image.y < expectedHero.image.y,'mascot moves upward without resizing');
      assert.equal(heroMetrics.naturalWidth,720,'the same original wolf asset is used');
      assert.equal(heroMetrics.naturalHeight,1279);
      assert.equal(heroMetrics.src,'/media/vitrine/mascote-lobos-recorte-20261001.webp');
      assert.equal(heroMetrics.objectFit,'contain','mascot is neither enlarged/cropped nor stretched');
      assert.equal(heroMetrics.objectPosition,'100% 0%','same-sized mascot is aligned upward within its original box');
      const scale = Math.min(heroMetrics.image.width/heroMetrics.naturalWidth,heroMetrics.image.height/heroMetrics.naturalHeight);
      const oldScale = Math.min(expectedHero.image.width/720,expectedHero.image.height/1279);
      assert.equal(scale,oldScale,'actual contained mascot pixels keep the exact same visual scale');
      assert.equal(await page.locator('#vitrineTitle').count(),0,'the redundant initial question is removed');
      assert.equal(await page.getByText('O que vamos criar hoje?',{exact:true}).count(),0);
      const navigation = await page.locator('.vitrineHeader').evaluate(header => {
        const bounds = selector => {
          const box = header.querySelector(selector).getBoundingClientRect();
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};
        };
        const orderText = document.createRange();
        orderText.selectNodeContents(header.querySelector('[data-vitrine-orders]'));
        return {brand:bounds('.vitrineBrand'),orders:bounds('[data-vitrine-orders]'),account:bounds('[data-vitrine-account]'),icon:bounds('[data-vitrine-account] svg'),ordersTextLines:[...orderText.getClientRects()].filter(box => box.width > 0 && box.height > 0).length};
      });
      console.log(`CURRENT ${viewport.width}px header targets:`,JSON.stringify(navigation));
      assert.ok(navigation.orders.top >= navigation.brand.bottom - 1,'orders sit below the brand');
      assert.ok(navigation.orders.left >= navigation.brand.left - 1 && navigation.orders.left <= navigation.brand.left + 2,'orders remain aligned with the brand');
      assert.ok(Math.abs(navigation.orders.top - navigation.account.top) <= 1,'account icon stays next to orders on the same row');
      assert.ok(navigation.account.left >= navigation.orders.right,'orders text and account icon do not overlap');
      assert.equal(navigation.icon.width,25,'account icon keeps its original visible width');
      assert.equal(navigation.icon.height,25,'account icon keeps its original visible height');
      assert.equal(navigation.ordersTextLines,1,'orders text stays on one line even at 320px');
      assert.ok(heroMetrics.hero.y >= 0 && heroMetrics.hero.y <= 20,'hero starts at the page top with only a small breathing space');
      const homeButtons = page.locator('.vitrineHeader button, #vitrineHome button');
      const hitTargets = await homeButtons.evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().width > 0).map(button => {
        const box = button.getBoundingClientRect();
        return {name:button.getAttribute('aria-label') || button.textContent.trim(),x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:box.width,height:box.height};
      }));
      for (let index = 0; index < hitTargets.length; index++) {
        const target = hitTargets[index];
        assert.ok(target.width >= 30 && target.height >= 30,`${target.name} retains a usable hit target`);
        for (const other of hitTargets.slice(index + 1)) {
          const overlap = Math.min(target.right,other.right) - Math.max(target.x,other.x) > 1 && Math.min(target.bottom,other.bottom) - Math.max(target.y,other.y) > 1;
          assert.equal(overlap,false,`${target.name} and ${other.name} have disjoint hit targets`);
        }
      }
      for (let index = 0; index < await homeButtons.count(); index++) {
        const button = homeButtons.nth(index);
        if (!(await button.isVisible())) continue;
        await button.scrollIntoViewIfNeeded();
        assert.equal(await button.evaluate(node => {
          const box = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
        }),true,'home button center is not blocked by another element');
      }
      await page.evaluate(() => scrollTo(0,0));
      const thumbnails = await page.locator('.vitrineProducts img').evaluateAll(images => images.map(image => {
        const box = image.getBoundingClientRect();
        return {width:box.width, height:box.height, top:box.top, bottom:box.bottom, fit:getComputedStyle(image).objectFit};
      }));
      assert.equal(thumbnails.length, 3, 'home keeps three product thumbnails');
      for (const thumbnail of thumbnails) {
        assert.equal(thumbnail.fit, 'cover', 'all product thumbnails fill their vertical frame');
        assert.ok(Math.abs(thumbnail.width / thumbnail.height - 9/16) < .001, 'all thumbnails are 9:16');
        for (const edge of ['width','height','top','bottom']) assert.ok(Math.abs(thumbnail[edge] - thumbnails[0][edge]) <= 1, `product thumbnails have identical ${edge}`);
      }
      const titleTops = await page.locator('.vitrineProducts span').evaluateAll(titles => titles.map(title => title.getBoundingClientRect().top));
      assert.ok(titleTops.every(top => Math.abs(top-titleTops[0]) <= 1), 'product titles start on the same line');
      const titlesAbove = await page.locator('.vitrineProducts button').evaluateAll(buttons => buttons.every(button => {
        const title = button.querySelector('span'), image = button.querySelector('img');
        return title === button.firstElementChild && title.getBoundingClientRect().bottom <= image.getBoundingClientRect().top + 1;
      }));
      assert.equal(titlesAbove, true, 'product names are above their images in visual and reading order');
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
      if (compactOnly) {
        assert.deepEqual(errors,[],'compact home has no runtime errors');
        assert.equal(paidRequests.length,0,'compact home checks create no orders');
        console.log(`OK compact ${viewport.width}px: same wolf/hero sizes, raised hero, compact header, all hit targets disjoint/reachable, no overflow`);
        await context.close();
        continue;
      }

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
      async function savedDraft(predicate,description) {
        const deadline = Date.now()+5000;
        while (!predicate(state.draft) && Date.now()<deadline) await page.waitForTimeout(50);
        assert.ok(predicate(state.draft),description);
      }
      await savedDraft(draft => draft?.flow === 'mascote_uniforme','original mascot draft is persisted');
      assert.equal(state.draft?.flow, 'mascote_uniforme', 'mascot uses the existing chat draft');
      const mascotId = state.draft.id;
      await chat.getByRole('radio', {name:'Futebol',exact:true}).click();
      await savedDraft(draft => draft?.values.sport === 'Futebol','sport is persisted before leaving the product');
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
        await savedDraft(draft => draft?.flow === product,'accepted product switch is persisted');
        assert.equal(state.draft.flow, product, 'accepted switch uses the original product draft');
        assert.notEqual(state.draft.id, previousId);
        await chat.getByRole('radio',{name:'Futebol',exact:true}).click();
        await savedDraft(draft => draft?.flow === product && draft.values.sport === 'Futebol','new product sport is persisted');
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
