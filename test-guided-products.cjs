// Local-only regression: original renderers/validators/bridge, with every remote request intercepted.
// No accounts, Pix charges, paid orders, images or videos are created by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');

const root = __dirname;
const bundle = fs.readFileSync(path.join(root,'atendimento/assets/index-BYWG3Byi.js'),'utf8');
const initialState = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()`)();
const products = new Function(`return (${bundle.match(/Cs=(\[\{id:.*?\]),ws=/s)[1]})`)()
  .filter(product => !['personalizada','mascote_uniforme'].includes(product.id));
const imageOnly = new Set(['contratacao','proximo_jogo_jogador','resultado_jogo_jogador']);
const orderEndpoints = new Set(['/pedidos','/resultado_do_jogo']);
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'};
const server = http.createServer((request,response) => {
  let file = path.resolve(root,'.' + decodeURIComponent(new URL(request.url,'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  const bytes = fs.readFileSync(file);
  response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Content-Length':bytes.length});
  response.end(bytes);
});
const labels = {
  team_crest:{jogador_escudo:'Qual é o escudo do time?',contratacao:'Qual é o escudo do time?',patrocinador:'Envie o escudo do time',escudo3d:'Envie o escudo que vai virar 3D'},
  home_crest:'Envie o escudo do Time A',
  away_crest:{proximo_jogo:'Envie o escudo do Time B',proximo_jogo_jogador:'Envie o escudo do Time B',resultado_jogo_jogador:'Envie o escudo do Time B'},
  player_photos:'Envie uma foto de cada atleta, na ordem dos nomes',
  athlete_photos:'Envie até 3 fotos do jogador',
  sponsor_logos:'Envie as logos dos patrocinadores',
  jersey_reference:'Envie uma foto da camiseta do time'
};

async function run() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(),'omascote-guided-products-'));
  console.log('Screenshots:',screenshots);

  async function setup(viewport,settings = {}) {
    let state = structuredClone(initialState), failedOrders = settings.failedOrders || 0;
    let releaseOrder = null, fileIndex = 0;
    const errors = [], requests = [], uploads = [], actions = [], balances = [];
    const balance = settings.balance ?? 100;
    const context = await browser.newContext({viewport,reducedMotion:'reduce',...(viewport.width < 600 ? {isMobile:true,hasTouch:true} : {})});
    await context.addInitScript(({balance}) => {
      localStorage.setItem('omascote_token','local-guided-products-only');
      localStorage.setItem('omascote_nome_time','Time local');
      localStorage.setItem('omascote_saldo',String(balance));
      window.addEventListener('message',event => {
        if (event.origin !== location.origin || event.data?.type !== 'omascote-chat:create-order') return;
        (window.__localProductMessages ||= []).push({draft:event.data.draft,requestId:event.data.requestId,
          files:event.data.files.map(file => ({id:file.id,field:file.field,name:file.name,size:file.size}))});
      });
    },{balance});
    const page = await context.newPage();
    page.on('pageerror',error => errors.push(error.message));
    await context.route('**/*',async route => {
      const request = route.request(),url = new URL(request.url());
      if (request.method() === 'POST') requests.push({path:url.pathname,body:request.postDataBuffer()?.toString() || ''});
      if (url.pathname.includes('/atendimento-api/lab')) {
        const body = request.method() === 'POST' ? request.postDataJSON() : {};
        actions.push(body.action);
        assert.notEqual(body.action,'complete','integrated products never bypass their real parent bridge');
        if (body.action === 'start_conversation') {
          state.conversationId = body.payload.id;
          state.chat = [{id:'welcome',role:'assistant',text:'Olá'},
            {id:'old',role:'assistant',text:'Mensagem antiga que deve ficar oculta.',flow:'proximo_jogo'}];
        }
        if (body.action === 'save_draft') state.draft = body.payload.draft;
        if (body.action === 'save_chat') state.chat = body.payload.chat;
        return route.fulfill({json:{ok:true,state}});
      }
      if (url.pathname.includes('/atendimento-api/files')) {
        const body = request.postDataBuffer().toString();
        const field = body.match(/name="field"\r\n\r\n([^\r]+)/)?.[1];
        assert.ok(field,'upload uses the existing field identifier');
        const name = body.match(/filename="([^"]+)"/)?.[1];
        assert.ok(name,'upload preserves its selected filename');
        uploads.push({field,name});
        const id = `local-file-${++fileIndex}`;
        return route.fulfill({json:{ok:true,file:{id,field,name,type:'image/png',size:pixel.length,url:`${origin}/__guided-products/${id}.png`}}});
      }
      if (url.pathname.startsWith('/__guided-products/')) return route.fulfill({contentType:'image/png',body:pixel});
      if (url.pathname.includes('/atendimento-api/assistant')) {
        return route.fulfill({json:{ok:true,fields:[{key:'match_datetime',value:'2026-10-05T18:00'}],text:'Data local normalizada.'}});
      }
      if (url.origin === 'https://api.omascote.com.br') {
        if (request.method() === 'POST' && orderEndpoints.has(url.pathname)) {
          if (settings.holdOrders) await new Promise(resolve => {releaseOrder = resolve;});
          if (failedOrders-- > 0) return route.fulfill({status:503,json:{ok:false,error:'Falha local simulada; tente novamente.'}});
          const body = request.postDataBuffer().toString();
          const video = body.includes('image_video'),omni = body.includes('omni');
          const price = video ? omni ? 19.9 : 14.9 : settings.price || 8;
          balances.push({balance,price});
          return route.fulfill({json:{ok:true,pedido_id:'local-products-order',pagamento_pendente:balance < price,
            requer_pix_antes_criacao:balance < price,valor:price}});
        }
        if (request.method() === 'POST' && url.pathname === '/pedidos/local-products-order/gerar-pix')
          return route.fulfill({json:{ok:true,pedido_id:'local-products-order',pix_copia_cola:'PIX-LOCAL-NAO-PAGAR',qr_code:'PIX-LOCAL-NAO-PAGAR',qr_code_base64:pixel.toString('base64'),valor:14.9}});
        return route.fulfill({json:{ok:true,saldo:balance,saldo_extra:balance,saldo_mensal:0,nome_time:'Time local',pedidos:[],avaliacoes:[],plano:'',usados_no_ciclo:0}});
      }
      // Strict allowlist: only static files from this local test server reach the network.
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + '/app.html',{waitUntil:'domcontentloaded'});
    await page.locator('#vitrineHome').waitFor({state:'visible'});
    return {context,page,chat:page.frameLocator('#integratedChatFrame'),errors,requests,uploads,actions,balances,
      state:() => state,
      messages:() => page.evaluate(() => window.__localProductMessages || []),
      orderCount:() => requests.filter(request => orderEndpoints.has(request.path)).length,
      pixCount:() => requests.filter(request => request.path.endsWith('/gerar-pix')).length,
      releaseOrder:() => {assert.ok(releaseOrder,'mock backend is under test control');releaseOrder();releaseOrder=null;}};
  }
  const guide = test => test.chat.locator('.guided-product');
  const field = (test,key) => test.chat.locator(`.guided-field[data-field="${key}"]`);
  const next = test => test.chat.getByRole('button',{name:'Continuar',exact:true});
  const send = test => test.chat.getByRole('button',{name:'Enviar pedido',exact:true});
  const back = test => test.chat.getByRole('button',{name:'← Voltar',exact:true});
  async function saved(test,predicate,description) {
    const deadline = Date.now() + 7000;
    while (!predicate(test.state().draft) && Date.now() < deadline) await test.page.waitForTimeout(50);
    assert.ok(predicate(test.state().draft),description);
  }
  async function open(test,product,seed = 'image') {
    await test.page.locator('[data-vitrine-options]').click();
    const catalog = test.chat.getByRole('navigation',{name:'Todas as opções do chat'});
    await catalog.waitFor({state:'visible'});
    await catalog.locator('section[aria-label="Criar uma arte"] button').filter({has:test.chat.getByText(product.name,{exact:true})}).click();
    if (product.id === 'escudo3d') {
      await test.page.locator('#escudo3dExamples').waitFor({state:'visible'});
      await test.page.locator(`#escudo3dExamples [data-delivery-choice="${seed}"]`).click();
    }
    await test.page.waitForFunction(flow => {
      const doc = document.getElementById('integratedChatFrame')?.contentDocument;
      const form = doc?.querySelector('.guided-product');
      return doc?.querySelector('[role="alertdialog"]')?.getBoundingClientRect().width > 0 ||
        form?.getAttribute('aria-label') === `Informações para ${flow}`;
    },product.name,{timeout:15000});
    if (await test.chat.getByRole('alertdialog').isVisible()) await test.chat.getByRole('button',{name:'Trocar de atendimento',exact:true}).click();
    await guide(test).waitFor({state:'visible'});
    await saved(test,draft => draft?.flow === product.id,'original product draft selected');
    await assertStep(test);
  }
  async function assertStep(test) {
    assert.equal(await guide(test).count(),1,'one guided product only');
    await test.page.waitForFunction(() => {
      const form=document.getElementById('integratedChatFrame')?.contentDocument?.querySelector('.guided-product');
      if (!form) return false;
      return [...form.querySelectorAll('.guided-progress > span')].every(segment =>
        getComputedStyle(segment).backgroundColor === (segment.classList.contains('is-active') ? 'rgb(22, 139, 70)' : 'rgb(227, 235, 230)'));
    },null,{timeout:5000});
    // One atomic DOM read avoids mixing the old step number with the next render's segments.
    const view=await guide(test).evaluate(form => {
      const progress=form.querySelector('.guided-progress'),box=progress.getBoundingClientRect();
      return {number:Number(form.dataset.step),key:form.dataset.stageKey,isFinal:form.dataset.final==='true',
        keys:[...form.querySelectorAll('.guided-fields > .guided-field')].map(node => node.dataset.field),
        role:progress.getAttribute('role'),min:progress.getAttribute('aria-valuemin'),
        total:Number(progress.getAttribute('aria-valuemax')),now:progress.getAttribute('aria-valuenow'),text:progress.getAttribute('aria-valuetext'),
        active:progress.querySelectorAll(':scope > span.is-active').length,
        segments:[...progress.children].map(child => {const r=child.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,height:r.height,color:getComputedStyle(child).backgroundColor,barLeft:box.left,barRight:box.right};})};
    });
    const {number,total,segments,keys,isFinal}=view;
    assert.ok(total >= 3 && total <= 25,'bounded progress is based on actual questions, including up to ten athletes');
    assert.equal(view.role,'progressbar');
    assert.equal(view.min,'0');
    assert.equal(view.now,String(number));
    assert.equal(view.text,`Etapa ${number} de ${total}`);
    assert.equal(segments.length,total);
    assert.equal(view.active,number,'Back updates progress');
    for (let i=0;i<segments.length;i++) {
      assert.ok(segments[i].width > 0 && Math.abs(segments[i].width-segments[0].width)<1,'equal slim segments across mobile/desktop');
      assert.equal(segments[i].height,5);
      assert.equal(segments[i].color,i<number ? 'rgb(22, 139, 70)' : 'rgb(227, 235, 230)');
      assert.ok(segments[i].left >= segments[i].barLeft - 1 && segments[i].right <= segments[i].barRight + 1);
    }
    assert.ok(isFinal ? keys.length===0 : keys.length>=1 && keys.length<=2,'only one or two questions appear per step');
    if (keys.some(key => ['photo_mode','scenario_id','matchup','score'].includes(key))) assert.equal(keys.length,1,'complex original renderer owns its own step');
    assert.equal(await test.chat.locator('.composer').isVisible(),false);
    assert.equal(await test.chat.locator('.lab-conversation-bar').isVisible(),false);
    assert.equal(await test.chat.locator('.lab-scroll > .lab-message:visible').count(),0,'old chat does not compete with questions');
    assert.equal(await test.chat.locator('.composer-area > input[type="file"]').count(),1,'original print-upload input stays mounted');
    assert.equal(await test.chat.locator('html').evaluate(node => node.scrollWidth <= innerWidth),true);
    assert.equal(await test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await test.page.waitForFunction(() => {
      const frame = document.getElementById('integratedChatFrame');
      const content = frame?.contentDocument?.querySelector('.lab-frame.is-integrated');
      if (!content || !document.body.classList.contains('vitrineGuidedActive')) return false;
      const difference = frame.clientHeight - content.getBoundingClientRect().height;
      return difference >= 0 && difference <= 12;
    },null,{timeout:7000});
    assert.equal(await test.page.locator('.vitrineChatNav').isVisible(),false,'duplicate outer navigation is hidden');
    return {number,total,keys,isFinal,key:view.key};
  }
  async function advance(test) {
    const key = await guide(test).getAttribute('data-stage-key');
    await next(test).click();
    await test.page.waitForFunction(old => {
      const form = document.getElementById('integratedChatFrame')?.contentDocument?.querySelector('.guided-product');
      return form && form.dataset.stageKey !== old;
    },key,{timeout:5000});
    return assertStep(test);
  }
  async function retreat(test) {
    const key=await guide(test).getAttribute('data-stage-key');
    await back(test).click();
    await test.page.waitForFunction(old => document.getElementById('integratedChatFrame')?.contentDocument
      ?.querySelector('.guided-product')?.dataset.stageKey !== old,key,{timeout:5000});
    return assertStep(test);
  }
  async function upload(test,key,count=1,keyboard=false) {
    const control = field(test,key).locator('input[type="file"]');
    await control.waitFor({state:'attached'});
    const expectedLabel = typeof labels[key] === 'string' ? labels[key] : labels[key]?.[test.state().draft.flow];
    if (expectedLabel) assert.equal(await control.getAttribute('aria-label'),expectedLabel,'original upload accessible label is unchanged');
    const files = Array.from({length:count},(_,index) => ({name:`${key}-${index}-local.png`,mimeType:'image/png',buffer:pixel}));
    if (keyboard) {
      const trigger = field(test,key).locator('label.upload-button');
      assert.equal(await trigger.getAttribute('tabindex'),'0');
      const chooser = test.page.waitForEvent('filechooser');
      await trigger.focus();
      await trigger.press('Enter');
      await (await chooser).setFiles(files);
    } else await control.setInputFiles(files);
    await saved(test,draft => draft?.files.filter(file => file.field===key).length===count,`${key} uploaded into existing draft`);
    await field(test,key).getByText(files[0].name,{exact:true}).waitFor({state:'visible'});
  }
  async function fillField(test,key,settings={}) {
    const flow = test.state().draft.flow,values = test.state().draft.values;
    if (key.startsWith('__contract_')) {
      const groups=field(test,key).getByRole('radiogroup');
      assert.equal(await groups.count(),2,'original announcement and shirt controls are the only two questions');
      assert.equal(await groups.first().getAttribute('aria-label'),'João: anúncio');
      assert.equal(await groups.last().getAttribute('aria-label'),'João: camiseta');
      await groups.first().getByRole('radio',{name:'Renovado',exact:true}).click();
      await groups.first().getByRole('radio',{name:'Contratado',exact:true}).click();
      await groups.last().getByRole('radio',{name:settings.jersey ? 'Sim' : 'Não',exact:true}).click();
      await saved(test,draft => draft.values.players.endsWith(settings.jersey ? 'Sim' : 'Não'),'original contract option handlers retain serialized players');
      return;
    }
    if (['team_crest','home_crest','away_crest','player_photos','athlete_photos','sponsor_logos','jersey_reference'].includes(key)) {
      const needed = key!=='away_crest' || ['proximo_jogo','proximo_jogo_jogador','resultado_jogo_jogador'].includes(flow);
      if (needed && !test.state().draft.files.some(file => file.field===key)) await upload(test,key,1,key==='team_crest');
      return;
    }
    if (['team_photo','opponent_crest','reference_layout'].includes(key)) return;
    if (key==='uniform_image') {
      if (settings.photo) {
        await field(test,key).getByLabel('Enviar camiseta do time para vestir no mascote',{exact:true}).setInputFiles({name:'shirt-local.png',mimeType:'image/png',buffer:pixel});
        await saved(test,draft => draft.files.some(file => file.field==='uniform_image'),'nested shirt keeps original upload identifier');
      }
      return;
    }
    if (key==='sport') {if (!values.sport) await field(test,key).getByRole('radio',{name:'Futebol',exact:true}).click();return;}
    if (['scenario_id','visual_style','photo_mode'].includes(key)) {
      if (key==='photo_mode') {
        if (settings.photo==='Não tenho mascote') {
          await field(test,key).getByRole('button',{name:'Não tenho foto do mascote',exact:true}).click();
          await saved(test,draft => draft.values.photo_mode==='Não tenho mascote','original description-mode handler');
        } else if (settings.photo==='Mascote') {
          await field(test,key).getByLabel('Adicionar foto: Mascote',{exact:true}).setInputFiles({name:'match-photo-local.png',mimeType:'image/png',buffer:pixel});
          await saved(test,draft => draft.files.some(file => file.field==='match_photo') && draft.values.photo_mode==='Mascote','original photo-action handler and field');
        } else {
          assert.equal(values.photo_mode,'Sem foto');
          assert.equal(await field(test,key).getByRole('button',{name:'Sem foto',exact:true}).isVisible(),true,'original photo-mode action remains available');
        }
      } else assert.ok(await field(test,key).getByRole('radio',{checked:true}).count(),'existing choice default remains selected');
      return;
    }
    if (key==='matchup' || key==='score') {
      const inputs = field(test,key).locator('input:not([type="radio"]):not([type="file"]):not([type="checkbox"])');
      if (await inputs.count()>1) {
        await field(test,key).getByLabel('Time A',{exact:true}).fill('Clube A');
        await field(test,key).getByLabel('Time B',{exact:true}).fill('Clube B');
        if (key==='score') {
          await field(test,key).getByLabel('Gols Time A',{exact:true}).fill('2');
          await field(test,key).getByLabel('Gols Time B',{exact:true}).fill('1');
        }
      } else await field(test,key).locator('input,textarea').fill(key==='score' ? 'Clube A 2 x 1 Clube B' : 'Clube A x Clube B');
      await saved(test,draft => draft.values[key]?.includes('Clube B'),`${key} uses original controlled input`);
      return;
    }
    const text = {match_datetime:settings.date || '2026-10-05T18:00',competition:'Copa Local',venue:'Arena Local',title:'NOSSOS PATROCINADORES',
      players:flow==='contratacao' ? `João | Atacante | Contratado | ${settings.jersey ? 'Sim' : 'Não'}` : flow==='escalacao' ? 'João | Goleiro\nPedro | Atacante' : 'João | Atacante',
      headline:'VAMOS JUNTOS',section_title:'JOGO LOCAL',scorers:'João | 2',coupon_code:'LOCAL-TEST',other_sport:'Handebol',sport_context:'Quadra de handebol, traves e bola de handebol.',mascot_description:'Lobo azul'}[key];
    if (text===undefined) throw new Error(`Unmapped original field ${flow}/${key}`);
    const control = field(test,key).locator('textarea,input:not([type="radio"]):not([type="file"]):not([type="checkbox"])').first();
    assert.ok(await control.getAttribute('aria-label'),'original text label remains accessible');
    await control.fill(text);
    await saved(test,draft => draft?.values[key]===text,`${key} answer saved in original draft`);
  }
  async function fillToFinal(test,settings={}) {
    const visited=[];
    for (let count=0;count<20;count++) {
      const current=await assertStep(test);
      if (current.isFinal) return visited;
      visited.push(current);
      for (const key of current.keys) await fillField(test,key,settings);
      await advance(test);
    }
    throw new Error('Guided presentation must reach final in bounded steps');
  }
  async function assertFinal(test,product,seed='image') {
    const current=await assertStep(test);
    assert.equal(current.isFinal,true);
    assert.equal(await test.chat.locator('.lab-form-heading strong').innerText(),'Finalizar');
    const ordering=await guide(test).evaluate(form => {
      const price=form.querySelector('.guided-delivery'),button=form.querySelector('.guided-primary'),review=form.querySelector('.guided-review');
      return {priceBeforeButton:!!(price.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING),
        buttonBeforeReview:!!(button.compareDocumentPosition(review)&Node.DOCUMENT_POSITION_FOLLOWING),
        gap:button.getBoundingClientRect().top-price.getBoundingClientRect().bottom};
    });
    assert.equal(ordering.priceBeforeButton,true,'price then Enviar');
    assert.equal(ordering.buttonBeforeReview,true,'Enviar then review');
    assert.ok(ordering.gap>=0 && ordering.gap<=30,'Enviar is immediately under delivery prices');
    const normalized=(await test.chat.locator('.guided-delivery').innerText()).replace(/\u00a0/g,' ');
    if (product.id==='escudo3d') {
      assert.equal(await test.chat.locator('.guided-selected-delivery').count(),1);
      assert.equal(await test.chat.locator('.guided-delivery input').count(),0,'chosen gallery model is not replaced by a different selector');
      assert.match(normalized,seed==='omni' ? /10 segundos\s+R\$ 19,90/ : seed==='fast' ? /8 segundos\s+R\$ 14,90/ : /Somente imagem\s+R\$ 4,00/);
      assert.doesNotMatch(normalized,/fast|omni/i,'provider names do not appear to customer');
    } else {
      assert.ok(normalized.includes(product.priceLabel.replace(/\u00a0/g,' ')),'original image price remains visible');
      assert.equal(await test.chat.getByRole('radio',{name:/Imagem \+ vídeo/}).count(),imageOnly.has(product.id) ? 0 : 1,'original image-only exceptions unchanged');
      if (!imageOnly.has(product.id)) assert.match(normalized,/R\$ 14,90/,'original regular video price');
      assert.equal(await test.chat.getByRole('radio',{name:/Somente imagem/}).isChecked(),true);
    }
    assert.equal(test.orderCount(),0,'all navigation/final/edit actions before Enviar are non-submitting');
  }
  async function submitAndAssert(test,product,mode='image',seed='image',retry=false) {
    if (mode==='image_video' && product.id!=='escudo3d') await test.chat.getByRole('radio',{name:/Imagem \+ vídeo/}).click();
    const original=structuredClone(test.state().draft);
    if (test.releaseControlledOrder) {
      await send(test).evaluate(button => {button.click();button.click();button.click();});
      await test.chat.locator('.lab-busy').waitFor({state:'visible'});
      assert.equal(test.orderCount(),1,'multiple clicks yield exactly one request');
      test.releaseOrder();
    } else await send(test).click();
    if (retry) {
      await test.chat.getByRole('alert').filter({hasText:'Falha local simulada'}).waitFor({state:'visible'});
      await assertStep(test);
      await test.page.waitForTimeout(1100);
      assert.equal(test.orderCount(),1,'backend failure never loops or automatically retries');
      assert.equal(test.state().draft.id,original.id);
      assert.deepEqual(test.state().draft.files,original.files,'failed submission preserves original files');
      await send(test).click();
    }
    await test.chat.locator('.lab-post-order-actions').waitFor({state:'visible',timeout:15000});
    const messages=await test.messages();
    assert.equal(messages.length,retry ? 2 : 1,'one original parent-bridge message per explicit attempt');
    assert.equal(test.orderCount(),retry ? 2 : 1,'one backend request per explicit attempt');
    const payload=messages.at(-1);
    assert.equal(payload.draft.id,original.id);
    assert.equal(payload.draft.flow,product.id);
    assert.equal(payload.draft.values.sport,original.values.sport==='Outro esporte' ? original.values.other_sport : original.values.sport);
    assert.equal(payload.draft.values.delivery_mode,mode);
    assert.equal(payload.draft.values.video_model,mode==='image' ? '' : product.id==='escudo3d' && seed==='omni' ? 'omni' : 'fast');
    const orderRequests=test.requests.filter(request => orderEndpoints.has(request.path));
    assert.equal(orderRequests.at(-1).path,product.id==='resultado' ? '/resultado_do_jogo' : '/pedidos','original product endpoint is preserved');
    const transmittedFields=JSON.parse(orderRequests.at(-1).body.match(/name="fields_json"\r\n\r\n([^\r]*)/)?.[1] || '{}');
    for (const [name,value] of [['delivery_mode',mode],['video_model',payload.draft.values.video_model]]) {
      assert.equal(transmittedFields[name],value,`${name} is retained by original parent FormData builder`);
    }
    assert.deepEqual(payload.files.map(file => ({id:file.id,field:file.field,name:file.name,size:file.size})),
      original.files.map(file => ({id:file.id,field:file.field,name:file.name,size:file.size})),'bridge keeps original file metadata/order');
    for (const key of ['matchup','score','match_datetime','players','competition','title'])
      if (original.values[key]) assert.equal(payload.draft.values[key],original.values[key],`${key} reaches original bridge unchanged`);
    assert.equal(await test.chat.getByRole('dialog',{name:'Como você quer receber?'}).count(),0,'no repeated delivery dialog');
    await test.page.waitForTimeout(200);
    assert.equal(test.orderCount(),retry ? 2 : 1,'success does not repeat the request');
    assert.equal(test.actions.includes('complete'),false);
    assert.deepEqual(test.errors,[],'no runtime errors');
    return payload;
  }

  try {
    assert.equal(products.length,9);
    for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
      for (const product of products) {
        const test=await setup(viewport,{price:product.price});
        try {
          await open(test,product);
          await saved(test,draft => !!draft?.values,'original initial draft saved');
          const originalId=test.state().draft.id;
          assert.equal(test.state().draft.values.sport,'','no presumed sport');
          assert.equal(test.state().draft.values.visual_style,'Esportivo leve','original visual default');
          if (test.state().draft.values.scenario_id!==undefined) assert.equal(test.state().draft.values.scenario_id,'Cenário atual');
          assert.equal(await field(test,'sport').getByRole('radio',{checked:true}).count(),0);
          await next(test).click();
          assert.equal((await assertStep(test)).key,'sport','empty sport prevents advancing');
          assert.ok(await test.chat.getByRole('alert').count());
          assert.equal(test.orderCount(),0);
          await back(test).click();
          await test.page.locator('#vitrineHome').waitFor({state:'visible'});
          await open(test,product);
          assert.equal(test.state().draft.id,originalId,'first-step Voltar/Home preserves draft ID');
          await test.page.screenshot({path:path.join(screenshots,`${product.id}-first-${viewport.width}.png`),fullPage:true});
          await field(test,'sport').getByRole('radio',{name:'Futebol',exact:true}).click();
          await saved(test,draft => draft.values.sport==='Futebol','sport answer persisted');
          await advance(test);
          const requiredStage=await assertStep(test);
          await next(test).click();
          assert.equal((await assertStep(test)).key,requiredStage.key,'missing mandatory product data blocks current step');
          assert.equal(test.orderCount(),0);
          assert.ok(await test.chat.getByRole('alert').count(),'original required validation visible');
          const visited=await fillToFinal(test);
          await assertFinal(test,product);
          assert.equal(test.state().draft.id,originalId,'all steps retain original draft');
          assert.equal(test.state().draft.values.coupon_code,product.id==='contratacao' ? undefined : 'LOCAL-TEST','original coupon presence remains unchanged');
          const snapshot=structuredClone(test.state().draft);
          // Back, per-answer Edit and Home must preserve answers and uploaded blobs/IDs.
          const previous=await retreat(test);
          assert.equal(previous.number,previous.total-1);
          await fillToFinal(test);
          await test.chat.locator('[data-review-field="sport"]').getByRole('button',{name:/Editar/}).click();
          await test.chat.locator('.guided-product[data-stage-key="sport"]').waitFor({state:'visible'});
          assert.equal((await assertStep(test)).key,'sport');
          await fillToFinal(test);
          assert.deepEqual(test.state().draft.values,snapshot.values,'back/edit preserves all original values');
          assert.deepEqual(test.state().draft.files,snapshot.files,'back/edit preserves all original files');
          await test.page.locator('[data-vitrine-home]').first().click();
          await test.page.locator('#vitrineHome').waitFor({state:'visible'});
          await open(test,product);
          assert.equal((await assertStep(test)).isFinal,true,'Home reopens same final stage');
          assert.equal(test.state().draft.id,originalId);
          assert.deepEqual(test.state().draft.files,snapshot.files);
          await test.page.screenshot({path:path.join(screenshots,`${product.id}-final-${viewport.width}.png`),fullPage:true});
          await submitAndAssert(test,product);
          assert.equal(test.pixCount(),0,'sufficient balance preserves original non-Pix flow');
          console.log(`OK ${product.id} ${viewport.width}px: ${visited.length+2} bounded steps, defaults/validation, labels, uploads, back/edit/Home, prices and original image bridge`);
        } catch (error) {
          console.log('Failure diagnostics:',JSON.stringify({flow:product.id,width:viewport.width,state:test.state().draft,body:(await test.chat.locator('body').innerText()).slice(-6500),errors:test.errors}));
          await test.page.screenshot({path:path.join(screenshots,`${product.id}-failure-${viewport.width}.png`),fullPage:true});
          throw error;
        } finally {await test.context.close();}
      }
    }

    // Additional delivery/error/balance variants exercise original submit handlers, never real APIs.
    for (const scenario of [
      {id:'proximo_jogo',mode:'image_video'}, {id:'resultado',mode:'image_video',failedOrders:1},
      {id:'jogador_escudo',mode:'image_video'}, {id:'escalacao',mode:'image_video',balance:0},
      {id:'patrocinador',mode:'image_video'}, {id:'escudo3d',mode:'image_video',seed:'fast',holdOrders:true},
      {id:'escudo3d',mode:'image_video',seed:'omni'}, {id:'proximo_jogo',mode:'image',date:'amanhã às 18h'}
    ]) {
      const product=products.find(item => item.id===scenario.id);
      const test=await setup({width:390,height:844},scenario);
      test.releaseControlledOrder=!!scenario.holdOrders;
      try {
        await open(test,product,scenario.seed);
        await fillToFinal(test,scenario);
        await assertFinal(test,product,scenario.seed);
        await submitAndAssert(test,product,scenario.mode,scenario.seed,!!scenario.failedOrders);
        assert.equal(test.pixCount(),scenario.balance===0 ? 1 : 0,'original backend balance determines Pix');
        await test.page.screenshot({path:path.join(screenshots,`${scenario.id}-${scenario.seed || scenario.mode}${scenario.failedOrders ? '-retry' : ''}${scenario.balance===0 ? '-pix' : ''}.png`),fullPage:true});
        console.log(`OK delivery ${scenario.id}/${scenario.seed || scenario.mode}: original model, one attempt, bounded retry/Pix`);
      } finally {await test.context.close();}
    }

    // Conditional sport is a separate small step and dynamically disappears on returning to Futebol.
    const custom=await setup({width:390,height:844});
    try {
      const product=products.find(item => item.id==='proximo_jogo');
      await open(custom,product);
      await field(custom,'sport').getByRole('button',{name:'Outro esporte',exact:true}).click();
      await field(custom,'sport').getByRole('radio',{name:'Outro esporte',exact:true}).click();
      await advance(custom);
      assert.deepEqual((await assertStep(custom)).keys,['other_sport','sport_context']);
      const customTotal=(await assertStep(custom)).total;
      await next(custom).click();
      assert.deepEqual((await assertStep(custom)).keys,['other_sport','sport_context']);
      assert.equal(custom.orderCount(),0);
      await fillField(custom,'other_sport');await fillField(custom,'sport_context');
      await advance(custom);await retreat(custom);
      assert.equal(await field(custom,'other_sport').locator('input').inputValue(),'Handebol');
      await retreat(custom);
      await field(custom,'sport').getByRole('radio',{name:'Futebol',exact:true}).click();
      await advance(custom);
      assert.equal((await assertStep(custom)).total,customTotal-1,'conditional step is removed without shifting/dropping answers');
      await fillToFinal(custom);
      await custom.chat.getByRole('button',{name:'Ajuda',exact:true}).click();
      await custom.chat.locator('.composer').waitFor({state:'visible'});
      assert.equal(await custom.chat.locator('.guided-product:visible').count(),0,'Help restores original chat');
      assert.equal(await custom.chat.locator('.lab-conversation-bar').isVisible(),true);
      assert.equal(custom.orderCount(),0);
      await custom.page.screenshot({path:path.join(screenshots,'custom-sport-help.png'),fullPage:true});
      assert.deepEqual(custom.errors,[]);
      console.log('OK custom sport: required conditional step, dynamic progress, Back persistence and original Help');
    } finally {await custom.context.close();}

    // Original nested photo/mascot/shirt controls and conditional jersey remain intact.
    for (const scenario of [{id:'proximo_jogo',photo:'Não tenho mascote'},{id:'resultado',photo:'Mascote'},{id:'contratacao',jersey:true}]) {
      const product=products.find(item => item.id===scenario.id),test=await setup({width:320,height:844});
      try {
        await open(test,product);
        for (let count=0;count<20;count++) {
          const current=await assertStep(test);if (current.isFinal) break;
          for (const key of current.keys) {
            if (key==='mascot_description') {
              await next(test).click();
              assert.equal((await assertStep(test)).key,current.key,'nested mandatory animal description blocks only its own step');
              assert.equal(test.orderCount(),0);
            }
            await fillField(test,key,scenario);
          }
          if (current.keys.some(key => key.startsWith('__contract_')) || current.key==='mascot-details')
            await test.page.screenshot({path:path.join(screenshots,`${scenario.id}-${current.key}-320.png`),fullPage:true});
          await advance(test);
        }
        await assertFinal(test,product);
        if (scenario.jersey) assert.equal(test.state().draft.files.some(file => file.field==='jersey_reference'),true,'jersey Sim keeps required original shirt upload');
        await test.page.screenshot({path:path.join(screenshots,`${scenario.id}-conditional.png`),fullPage:true});
        await submitAndAssert(test,product);
        console.log(`OK conditional ${scenario.id}/${scenario.photo || 'jersey'}: original nested inputs/required uploads and bridge`);
      } finally {await test.context.close();}
    }
  } finally {await browser.close();server.close();}
}
run().catch(error => {console.error(error);server.close();process.exitCode=1;});
