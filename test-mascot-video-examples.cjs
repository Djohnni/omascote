// Local browser regression. Remote requests are mocked; no real orders or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {chromium} = require('playwright');
const root = __dirname;
const bundle = fs.readFileSync(path.join(root,'atendimento/assets/index-BYWG3Byi.js'),'utf8');
const initial = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()` )();
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif'};
const server = http.createServer((req,res) => {
  let file = path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
  res.end(fs.readFileSync(file));
});
async function run() {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'omascote-mascot-options-'));
  try {
    for (const width of [390,1440]) {
      let state=structuredClone(initial);
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      const page=await context.newPage();
      const errors=[],paid=[],media=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',req=>{if (/\.mp4(?:\?|$)/.test(req.url())) media.push(req.url());});
      await context.addInitScript(()=>{
        localStorage.setItem('omascote_token','local-test-only');
        localStorage.setItem('omascote_nome_time','Teste');
      });
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if (url.pathname.includes('/atendimento-api/lab')) {
          const body=request.method()==='POST'?request.postDataJSON():{};
          if (body.action==='start_conversation') {
            state.conversationId=body.payload.id;
            state.chat=[{id:'welcome',role:'assistant',text:'Olá'},
              {id:'mascot-example',role:'assistant',text:'Crie o mascote do seu time.',flow:'mascote_uniforme'}];
          }
          if (body.action==='save_draft') state.draft=body.payload.draft;
          if (body.action==='save_chat') state.chat=body.payload.chat;
          assert.notEqual(body.action,'complete');
          return route.fulfill({json:{ok:true,state}});
        }
        if (url.pathname.includes('/atendimento-api/files')) {
          const body=request.postDataBuffer().toString();
          const field=body.match(/name="field"\r\n\r\n([^\r]+)/)[1];
          return route.fulfill({json:{ok:true,file:{id:'crest',field,name:'escudo.png',type:'image/png',size:pixel.length,url:origin+'/__test/crest.png'}}});
        }
        if (url.pathname.startsWith('/__test/')) return route.fulfill({contentType:'image/png',body:pixel});
        if (url.origin==='https://api.omascote.com.br') {
          if (request.method()==='POST' && /\/pedidos(?:\/|$)/.test(url.pathname)) paid.push(url.pathname);
          return route.fulfill({json:{ok:true,nome_time:'Teste',saldo:100,pedidos:[],avaliacoes:[]}});
        }
        if (url.origin!==origin) return route.abort();
        return route.continue();
      });
      await page.goto(origin+'/app.html');
      const chat=page.frameLocator('#integratedChatFrame');
      await page.locator('[data-vitrine-product="mascote_uniforme"]').click();
      const gallery=page.locator('#mascotVideoExamples');
      await gallery.waitFor({state:'visible'});
      assert.equal(state.draft,null,'the selection precedes draft collection');
      assert.equal(await gallery.locator('article').count(),3);
      assert.deepEqual(await gallery.locator('h3').allTextContents(),['Sol','Chuva','Escrita personalizada']);
      assert.deepEqual(await gallery.locator('.mascotExamples__price').allTextContents(),['R$ 25,00','R$ 28,00','R$ 28,00']);
      assert.equal(await gallery.locator('.mascotExamples__placeholder').count(),3);
      assert.equal(await gallery.locator('video').count(),0,'no broken media elements before examples are uploaded');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await gallery.screenshot({path:path.join(screenshots,`choices-${width}.png`)});
      await gallery.locator('[data-mascot-choice="sol"]').click();
      await chat.locator('.guided-mascot[data-step="1"]').waitFor({state:'visible'});
      await chat.locator('[data-field="mascot_animal"] input').fill('Lobo');
      await chat.getByRole('radio',{name:'Futebol',exact:true}).click();
      await chat.getByRole('button',{name:'Continuar',exact:true}).click();
      await chat.locator('[data-field="team_crest"] input[type="file"]').setInputFiles({name:'escudo.png',mimeType:'image/png',buffer:pixel});
      await chat.getByText('escudo.png',{exact:true}).waitFor();
      await chat.getByRole('button',{name:'Continuar',exact:true}).click();
      await chat.getByRole('button',{name:'Continuar',exact:true}).click();
      const final=chat.locator('.guided-mascot[data-stage-key="final"]');
      await final.waitFor({state:'visible'});
      assert.equal(await chat.getByRole('button',{name:'Vídeo em preparação',exact:true}).isDisabled(),true);
      assert.match(await final.textContent(),/Sol.*25,00/);
      await chat.getByRole('button',{name:'Trocar opção',exact:true}).click();
      await gallery.locator('[data-mascot-choice="chuva"]').click();
      await final.getByText(/Imagem \+ vídeo · Chuva/).waitFor();
      assert.match(await final.textContent(),/Chuva.*28,00/);
      await chat.getByRole('button',{name:'Trocar opção',exact:true}).click();
      await gallery.locator('[data-mascot-choice="escrita_personalizada"]').click();
      const text=chat.getByRole('textbox',{name:'Texto para o vídeo',exact:true});
      await text.fill('Vamos, Lobos!');
      await page.waitForFunction(()=>document.getElementById('integratedChatFrame').contentDocument.querySelector('.mascot-video-text')?.value==='Vamos, Lobos!');
      await page.screenshot({path:path.join(screenshots,`personalized-${width}.png`),fullPage:true});
      const blocked=await page.evaluate(()=>{
        try {omascoteChatBaseCleanOrder('mascote_uniforme',{delivery_mode:'image_video',mascot_video_option:'sol'},{});return false;}
        catch(e){return /em preparação/.test(e.message);}
      });
      assert.equal(blocked,true,'the parent bridge rejects prepared variants before order creation');
      await chat.getByRole('button',{name:'Trocar opção',exact:true}).click();
      await gallery.locator('[data-mascot-choice="image"]').click();
      await chat.getByRole('button',{name:'Enviar pedido',exact:true}).waitFor();
      assert.equal(await chat.getByRole('button',{name:'Enviar pedido',exact:true}).isEnabled(),true,'image remains available');
      assert.equal(await text.count(),0);
      assert.equal(await chat.locator('[data-field="mascot_animal"] input').count(),0);
      assert.match(await final.textContent(),/Lobo/,'changing delivery preserves the character and upload');
      assert.equal(await final.locator('img[alt="Escudo enviado"]').count(),1);
      await chat.getByRole('button',{name:'Trocar opção',exact:true}).click();
      await gallery.getByRole('button',{name:'Voltar ao mascote',exact:true}).click();
      assert.equal(await gallery.isHidden(),true,'closing does not discard the form');
      await chat.getByRole('button',{name:'Trocar opção',exact:true}).click();
      await gallery.press('Escape');
      for (let step=4;step>=1;step--) {
        await chat.locator(`.guided-mascot[data-step="${step}"]`).waitFor({state:'visible'});
        await chat.getByRole('button',{name:'← Voltar',exact:true}).click();
      }
      assert.equal(await gallery.isHidden(),true);
      await page.locator('#vitrineHome').waitFor({state:'visible'});
      assert.equal(await page.locator('#vitrineHome').isVisible(),true);
      await page.locator('[data-vitrine-options]').first().click();
      await chat.getByRole('button',{name:/^Mascote do Time/}).click();
      await gallery.waitFor({state:'visible'});
      await gallery.getByRole('button',{name:'Voltar ao mascote',exact:true}).click();
      await chat.getByRole('button',{name:'← Voltar',exact:true}).click();
      await page.locator('#vitrineHome').waitFor({state:'visible'});
      await page.locator('[data-vitrine-chat]').first().click();
      await chat.getByRole('button',{name:'Criar esta arte',exact:true}).first().click();
      await gallery.waitFor({state:'visible'});
      await gallery.press('Escape');
      assert.deepEqual(paid,[]);
      assert.deepEqual(media,[]);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS: mobile and desktop selection, saved choices, custom text, image fallback, no paid requests.');
    console.log('Screenshots: '+screenshots);
  } finally {await browser.close();server.close();}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
