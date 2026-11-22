// Isolated browser component regression. All assets are served from disk; no API or paid orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = __dirname;
const script = fs.readFileSync(path.join(root,'mascot-video-examples.js'),'utf8');
const options = fs.readFileSync(path.join(root,'mascot-video-options.js'),'utf8');
const css = fs.readFileSync(path.join(root,'mascot-video-examples.css'),'utf8');
const fixture = `<!doctype html><html lang="pt-BR"><head><base href="https://gallery.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="integratedChatModal"><iframe id="integratedChatFrame" title="Atendimento"></iframe></div><section id="escudo3dExamples" hidden></section><script>${options}</script><script>${script}</script></body></html>`;

async function run() {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const width of [390,768,1440]) {
      const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      const errors = [], videos = [];
      await context.route('**/*',async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('.mp4')) { videos.push(url.pathname); return route.abort(); }
        const file = path.resolve(root,'.'+url.pathname);
        if (url.origin !== 'https://gallery.test' || !file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.abort();
        return route.fulfill({contentType:'image/webp',body:fs.readFileSync(file)});
      });
      const page = await context.newPage();
      page.on('pageerror',error => errors.push(error.message));
      await page.setContent(fixture);
      await page.evaluate(() => {
        window.__gallerySelections = [];
        window.OmascoteMascotExamples.open(choice => window.__gallerySelections.push(choice),{preserveOnFrameLoad:true});
      });
      const gallery = page.locator('#mascotVideoExamples');
      await gallery.waitFor({state:'visible'});
      const cards = gallery.locator('article');
      assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node=>node.dataset.mascotOption)),['image','sol','chuva','ascensao_epica']);
      assert.deepEqual(await gallery.locator('h3').allTextContents(),['Somente imagem','Sol','Chuva','Ascensão Épica']);
      assert.equal(await cards.first().locator('img').getAttribute('src'),'/media/vitrine/mascote-lobos-da-serra.webp');
      await cards.first().locator('img').evaluate(img => img.decode());
      assert.equal(await cards.first().locator('img').evaluate(img => img.naturalWidth),720,'the first example is a real existing image');
      assert.equal(await gallery.locator('[data-mascot-choice="image"]').count(),1);
      assert.equal(await gallery.locator('video').count(),3);
      assert.deepEqual(await gallery.locator('video').evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('src'),node.preload])),[[null,'none'],[null,'none'],[null,'none']]);
      assert.deepEqual(videos,[],'opening all examples downloads no video');
      const columns = await gallery.locator('.mascotExamples__grid').evaluate(grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      assert.equal(columns,width<=600?1:width<=1050?2:4);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const imagePrice = gallery.locator('[data-mascot-image-price]');
      assert.equal(await imagePrice.textContent(),'R$ 18,00');
      for (const summary of [{active:true,remaining:5},{active:false,remaining:5},{active:true,remaining:0},null]) {
        await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('omascote:tester-bonus',{detail})),summary);
        assert.equal(await imagePrice.textContent(),'R$ 18,00');
        assert.deepEqual(await cards.locator('.mascotExamples__price').allTextContents(),['R$ 18,00','R$ 25,00','R$ 28,00','R$ 28,00'],'catalog prices do not depend on a promotional allowance');
      }
      await gallery.locator('[data-mascot-choice="image"]').click();
      assert.deepEqual(await page.evaluate(()=>window.__gallerySelections),['image']);
      assert.equal(await gallery.isHidden(),true);
      for (const choice of ['sol','chuva','ascensao_epica']) {
        await page.evaluate(()=>window.OmascoteMascotExamples.open(choice=>window.__gallerySelections.push(choice),{preserveOnFrameLoad:true}));
        await gallery.locator(`[data-mascot-choice="${choice}"]`).click();
      }
      assert.deepEqual(await page.evaluate(()=>window.__gallerySelections),['image','sol','chuva','ascensao_epica']);
      assert.deepEqual(videos,[],'choosing an image or video prepares a draft without loading a video');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: first image card, existing image asset, four responsive cards, unchanged catalog prices, all selection callbacks and deferred video loading at 390/768/1440px.');
  } finally { await browser.close(); }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
