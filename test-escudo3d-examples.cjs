// Local-only regression: all nonlocal requests are blocked. No paid generation.
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
const server = http.createServer((req,res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  const data = fs.readFileSync(file);
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':data.length});
  res.end(data);
});
async function run() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'omascote-examples-'));
  try {
    for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
      let state = structuredClone(initialState);
      const context = await browser.newContext({viewport,reducedMotion:'reduce'});
      const page = await context.newPage();
      const errors = [], media = [], actions = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (/\/media\/escudo3d\//.test(r.url())) media.push(r.url()); });
      await context.route('**/*', async route => {
        const request = route.request();
        if (!request.url().startsWith(origin)) return route.abort();
        if (request.url().includes('/atendimento-api/lab')) {
          const body = request.method()==='POST' ? request.postDataJSON() : {};
          actions.push(body.action);
          if (body.action==='start_conversation') {
            state.conversationId = body.payload.id;
            state.chat = [{id:'welcome',role:'assistant',text:'Olá'}, {id:'test-product',role:'assistant',text:'É só clicar no botão verde “Criar esta arte” abaixo.',flow:'escudo3d'}];
          }
          if (body.action==='save_draft') state.draft = body.payload.draft;
          if (body.action==='save_chat') state.chat = body.payload.chat;
          return route.fulfill({json:{ok:true,state}});
        }
        return route.continue();
      });
      await page.goto(origin+'/app.html?chat_preview=1');
      const chat = page.frameLocator('#integratedChatFrame');
      if (viewport.width > 600) {
        await chat.getByRole('button',{name:'Ver opções',exact:true}).click();
        await chat.getByRole('button',{name:/^Escudo 3D/}).click();
      } else {
        await chat.getByRole('button',{name:'Criar esta arte',exact:true}).click();
      }
      await page.locator('#escudo3dExamples').waitFor({state:'visible'});
      await page.waitForFunction(()=>{ const y=document.getElementById('escudo3dExamples').getBoundingClientRect().top; return y>=0 && y<65; });
      assert.equal(state.draft,null,'form must wait for example selection');
      assert.equal(await chat.locator('.escudo3d-delivery').count(),0);
      assert.equal(media.filter(u=>u.endsWith('.mp4')).length,0,'opening examples must not download video');
      await page.screenshot({path:path.join(screenshots,`gallery-${viewport.width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
      await page.getByRole('button',{name:'Assistir ao exemplo de 8 segundos',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#escudo3dExamples video').currentTime>0);
      assert.equal(media.filter(u=>u.endsWith('.mp4')).length,1,'only selected video downloads');
      await page.getByRole('button',{name:'Assistir ao exemplo de 10 segundos',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('#escudo3dExamples video')[1].currentTime>0);
      assert.equal(await page.locator('#escudo3dExamples video').first().evaluate(v=>v.paused),true);
      await page.getByRole('button',{name:'Escolher por R$ 14,90',exact:true}).click();
      await chat.getByText('Imagem + vídeo de 8 segundos — R$ 14,90',{exact:true}).waitFor();
      assert.equal(state.draft.values.delivery_mode,'image_video');
      assert.equal(state.draft.values.video_model,'fast');
      const draftId = state.draft.id;
      await chat.getByRole('radio',{name:'Futebol',exact:true}).click();
      await page.waitForTimeout(650);
      for (const [label,choice,summary] of [
        ['Escolher por R$ 19,90','omni','Imagem + vídeo de 10 segundos — R$ 19,90'],
        ['Prefiro somente imagem — R$ 4,00','','Somente imagem — R$ 4,00']
      ]) {
        await chat.getByRole('button',{name:'Ver modelos',exact:true}).click();
        await page.getByRole('button',{name:label,exact:true}).click();
        await chat.getByText(summary,{exact:true}).waitFor();
        await page.waitForTimeout(650);
        assert.equal(state.draft.values.video_model,choice);
        assert.equal(state.draft.values.delivery_mode,choice?'image_video':'image');
        assert.equal(state.draft.id,draftId,'changing model preserves draft');
        assert.equal(state.draft.values.sport,'Futebol');
      }
      await chat.getByRole('button',{name:'Ver modelos',exact:true}).click();
      await page.getByRole('button',{name:'Fechar exemplos e voltar ao chat'}).click();
      assert.equal(await page.locator('#escudo3dExamples').isVisible(),false);
      assert.equal(actions.includes('complete'),false);
      assert.deepEqual(errors,[],'page runtime errors');
      console.log(`OK ${viewport.width}px: gallery, lazy videos, playback, all choices, preserved draft and no orders`);
      await context.close();
    }
    console.log('Screenshots:',screenshots);
  } finally { await browser.close(); server.close(); }
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
