// Local guided-presentation regression. All APIs, uploads and order writes are mocked.
// This test must never create a real account, Pix charge, image, video or paid order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const { assertPurchaseSafety } = require('./test-guided-purchase-safety.cjs');

const root = __dirname;
const fullRun = !process.argv.includes('--bridge-only');
const appearanceKeys = ['scenario_id','visual_style','style_id'];
const bundle = fs.readFileSync(path.join(root, 'atendimento/assets/index-BYWG3Byi.js'), 'utf8');
const initialState = new Function(`return (${bundle.match(/sc=(\(\)=>\(\{version:1,.*?\}\)),cc=/s)[1]})()`)();
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
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'omascote-guided-mascot-'));
  console.log('Screenshots:', screenshots);

  async function setup(viewport, settings = {}) {
    let state = structuredClone(initialState);
    if (settings.savedAppearance) state.draft = {
      id:'local-saved-mascot-appearance',flow:'mascote_uniforme',stage:'collect',files:[],
      values:{sport:'',...settings.savedAppearance}
    };
    const actions = [], requests = [], errors = [], uploads = [], orderMessages = [];
    let releaseUpload = null, releaseOrder = null;
    let failedOrders = settings.failedOrders || 0;
    const balance = settings.balance ?? 100;
    const context = await browser.newContext({viewport, reducedMotion:'reduce', ...(viewport.width < 600 ? {isMobile:true,hasTouch:true} : {})});
    await context.addInitScript(({balance}) => {
      localStorage.setItem('omascote_token', 'local-only-test-token');
      localStorage.setItem('omascote_nome_time', 'Time de teste local');
      localStorage.setItem('omascote_saldo', String(balance));
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.data?.type !== 'omascote-chat:create-order') return;
        (window.__localGuidedOrderMessages ||= []).push({
          draft:event.data.draft,
          files:event.data.files.map(file => ({id:file.id,field:file.field,name:file.name,size:file.size})),
          requestId:event.data.requestId
        });
      });
    }, {balance});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'POST') requests.push({path:url.pathname,body:request.postDataBuffer()?.toString() || ''});
      if (url.pathname.includes('/atendimento-api/lab')) {
        const body = request.method() === 'POST' ? request.postDataJSON() : {};
        actions.push(body.action);
        if (body.action === 'start_conversation') {
          state.conversationId = body.payload.id;
          state.chat = [
            {id:'welcome',role:'assistant',text:'Olá, como posso ajudar?'},
            {id:'old',role:'assistant',text:'Mensagem antiga não deve competir com o produto.',flow:'mascote_uniforme'}
          ];
        }
        if (body.action === 'save_draft') state.draft = body.payload.draft;
        if (body.action === 'save_chat') state.chat = body.payload.chat;
        assert.notEqual(body.action, 'complete', 'integrated product must use its original parent bridge, not lab completion');
        return route.fulfill({json:{ok:true,state}});
      }
      if (url.pathname.includes('/atendimento-api/files')) {
        const body = request.postDataBuffer().toString();
        const field = body.match(/name="field"\r\n\r\n([^\r]+)/)?.[1];
        assert.ok(field, 'upload keeps its original field identifier');
        uploads.push(field);
        if (settings.holdUploads) await new Promise(resolve => {releaseUpload = resolve;});
        const file = {id:`local-${field}`,field,name:`${field}-local.png`,type:'image/png',size:pixel.length,url:origin + `/__guided-test/${field}.png`};
        return route.fulfill({json:{ok:true,file}});
      }
      if (url.pathname.startsWith('/__guided-test/')) return route.fulfill({contentType:'image/png',body:pixel});
      if (url.origin === 'https://api.omascote.com.br') {
        if (request.method() === 'POST' && url.pathname === '/pedidos') {
          if (settings.holdOrders) await new Promise(resolve => {releaseOrder = resolve;});
          if (failedOrders-- > 0) return route.fulfill({status:503,json:{ok:false,error:'Falha local simulada. Tente novamente.'}});
          const body = request.postDataBuffer().toString();
          const price = body.includes('image_video') ? 28 : 18;
          const needsPix = balance < price;
          return route.fulfill({json:{ok:true,pedido_id:'local-guided-order',pagamento_pendente:needsPix,requer_pix_antes_criacao:needsPix,valor:price}});
        }
        if (request.method() === 'POST' && url.pathname === '/pedidos/local-guided-order/gerar-pix') {
          return route.fulfill({json:{ok:true,pedido_id:'local-guided-order',pix_copia_cola:'PIX-LOCAL-NAO-PAGAR',qr_code:'PIX-LOCAL-NAO-PAGAR',qr_code_base64:pixel.toString('base64'),valor:28}});
        }
        return route.fulfill({json:{ok:true,saldo:balance,saldo_extra:balance,saldo_mensal:0,nome_time:'Time de teste local',pedidos:[],avaliacoes:[],plano:'',usados_no_ciclo:0}});
      }
      // Only the local static server can reach the network. Every remote host is blocked.
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    await page.goto(origin + '/app.html', {waitUntil:'domcontentloaded'});
    await page.locator('#vitrineHome').waitFor({state:'visible'});
    assert.equal(await page.getByRole('heading',{name:'Entregamos os vídeos em menos de 5 minutos',exact:true}).isVisible(),true,'home delivery heading is shown');
    assert.equal(await page.getByRole('heading',{name:'Mais artes para o seu time',exact:true}).count(),0,'previous gallery heading was replaced');
    const chat = page.frameLocator('#integratedChatFrame');
    await page.locator('[data-vitrine-product="mascote_uniforme"]').click();
    await chat.locator('.guided-mascot[data-step="1"]').waitFor({state:'visible',timeout:15000});
    return {
      context,page,chat,actions,requests,errors,uploads,orderMessages,
      getState:() => state,
      releaseUpload:() => {assert.ok(releaseUpload,'upload is controlled by this test');releaseUpload();releaseUpload=null;},
      releaseOrder:() => {assert.ok(releaseOrder,'order is controlled by this test');releaseOrder();releaseOrder=null;},
      orderCount:() => requests.filter(request => request.path === '/pedidos').length,
      pixCount:() => requests.filter(request => request.path.endsWith('/gerar-pix')).length,
      messages:() => page.evaluate(() => window.__localGuidedOrderMessages || [])
    };
  }

  const field = (test, key) => test.chat.locator(`.guided-field[data-field="${key}"]`);
  const next = test => test.chat.getByRole('button',{name:'Continuar',exact:true});
  const final = test => test.chat.getByRole('button',{name:'Enviar pedido',exact:true});
  async function uploadEmphasis(test, pending) {
    await test.page.mouse.move(0,0);
    await test.page.waitForFunction(pending => {
      const form=document.getElementById('integratedChatFrame')?.contentDocument?.querySelector('.guided-mascot');
      const upload=form?.querySelector('[data-field="team_crest"] .upload-button'),next=form?.querySelector('.guided-primary');
      if (!upload || !next) return false;
      const style=element => element.ownerDocument.defaultView.getComputedStyle(element);
      return style(upload).backgroundColor === (pending ? 'rgb(0, 135, 71)' : 'rgb(250, 252, 251)') &&
        style(next).backgroundColor === (pending ? 'rgb(250, 252, 251)' : 'rgb(0, 135, 71)');
    },pending);
    const styles = await test.chat.locator('.guided-mascot').evaluate(form => {
      const upload=form.querySelector('[data-field="team_crest"] .upload-button'),next=form.querySelector('.guided-primary');
      return [upload,next].map(element => {
        const css=getComputedStyle(element);
        return {background:css.backgroundColor,color:css.color,border:css.borderTopStyle === 'none' && css.outlineStyle === 'dashed' ? 'dashed' : css.borderTopStyle,height:element.getBoundingClientRect().height};
      });
    });
    const button={background:'rgb(0, 135, 71)',color:'rgb(255, 255, 255)',border:'none',height:56};
    const area={background:'rgb(250, 252, 251)',color:'rgb(25, 87, 55)',border:'dashed',height:140};
    assert.deepEqual(styles,pending ? [{...button,border:'solid',height:140},{...area,height:56}] : [area,button],'colors and borders follow the required crest without changing original sizes, including after removal');
  }
  async function step(test, number) {
    await test.chat.locator(`.guided-mascot[data-step="${number}"]`).waitFor({state:'visible'});
    assert.equal(await test.chat.locator('.guided-mascot:visible').count(),1,'only one guided step is visible');
    const progress = test.chat.locator('.guided-mascot .guided-progress');
    const total=Number(await progress.getAttribute('aria-valuemax'));
    assert.equal(total,4,'mascot retains a penultimate optional stage for the two remaining visible parts');
    assert.equal(await test.chat.locator('details.guided-purchase-safety').count(),number === total ? 1 : 0,'purchase disclosure appears only at the final step');
    assert.equal(await progress.count(),1,'guided step has one progress indicator');
    assert.equal(await progress.getAttribute('role'),'progressbar','progress keeps accessible semantics');
    assert.equal(await progress.getAttribute('aria-valuemin'),'0');
    assert.equal(await progress.getAttribute('aria-valuenow'),String(number),'progress follows current step including Back');
    assert.equal(await progress.getAttribute('aria-valuetext'),`Etapa ${number} de ${total}`);
    assert.equal(await progress.locator(':scope > span').count(),total,'progress contains the actual stage count');
    assert.equal(await progress.locator(':scope > span.is-active').count(),number,'completed and current segments are green');
    await test.page.waitForFunction(() => {
      const frame=document.getElementById('integratedChatFrame')?.contentDocument;
      const segments=frame?.querySelectorAll('.guided-mascot .guided-progress > span');
      return segments?.length && [...segments].every(segment =>
        frame.defaultView.getComputedStyle(segment).backgroundColor ===
          (segment.classList.contains('is-active') ? 'rgb(22, 139, 70)' : 'rgb(227, 235, 230)'));
    },null,{timeout:5000});
    const segments = await progress.evaluate(bar => {
      const box = bar.getBoundingClientRect();
      return [...bar.children].map(segment => {
        const item = segment.getBoundingClientRect();
        return {width:item.width,height:item.height,top:item.top,left:item.left,right:item.right,
          barLeft:box.left,barRight:box.right,barWidth:box.width,color:getComputedStyle(segment).backgroundColor};
      });
    });
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      assert.ok(segment.width > 0,'progress segment is visibly rendered');
      assert.ok(Math.abs(segment.width - segments[0].width) <= 1,'all segments have equal width on mobile and desktop');
      assert.ok(Math.abs(segment.top - segments[0].top) <= 1,'segments remain on one line');
      assert.ok(segment.left >= segment.barLeft - 1 && segment.right <= segment.barRight + 1,'segments stay within the progress bar without overflow');
      assert.equal(segment.height,5,'progress remains a slim visual indicator');
      assert.equal(segment.color,index < number ? 'rgb(22, 139, 70)' : 'rgb(227, 235, 230)','active and inactive colors match the approved visual');
      if (index > 0) assert.ok(segment.left > segments[index - 1].right,'segments keep visible spacing');
    }
    const keys=await test.chat.locator('.guided-fields > .guided-field').evaluateAll(nodes => nodes.map(node => node.dataset.field));
    if (number===total-1) {
      assert.equal(await test.chat.locator('.guided-mascot').getAttribute('data-stage-key'),'optional');
      assert.equal(await test.chat.locator('.guided-title').innerText(),'Os itens abaixo são opcionais');
      assert.deepEqual([...keys].sort(),['uniform_image','coupon_code'].sort(),'only shirt and coupon remain grouped in the optional stage');
      const bounds=await test.chat.locator('.guided-fields > .guided-field').evaluateAll(nodes => nodes.map(node => {
        const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom};
      }));
      for (let index=1;index<bounds.length;index++) assert.ok(bounds[index].top>=bounds[index-1].bottom-1,'optional parts form one vertical column');
    } else assert.deepEqual(keys.filter(key => ['uniform_image','coupon_code'].includes(key)),[],'optional parts are absent from required and final stages');
    for (const key of appearanceKeys) {
      assert.equal(await test.chat.locator(`[data-field="${key}"],[data-review-field="${key}"]`).count(),0,`${key} has no visible question or review row`);
    }
    assert.doesNotMatch(await test.chat.locator('.guided-mascot').innerText(),/Cenário|Estilo da arte|Esportivo leve|3D forte|Realista com luz de cinema|Cores fortes e luzes/,'appearance labels and saved/default choice names are not shown in any step');
    assert.equal(await test.chat.locator('.composer').isVisible(),false,'product does not show the composer');
    assert.equal(await test.chat.locator('.lab-scroll > .lab-message:visible').count(),0,'chat writing is not shown behind the guided form');
    assert.equal(await test.chat.locator('html').evaluate(node => node.scrollWidth <= innerWidth),true,'step has no horizontal overflow');
    assert.equal(await test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'parent has no horizontal overflow');
    try {
      await test.page.waitForFunction(() => {
        const frame = document.getElementById('integratedChatFrame');
        const content = frame?.contentDocument?.querySelector('.lab-frame.is-integrated');
        if (!document.body.classList.contains('vitrineGuidedActive') || !content) return false;
        const contentHeight = content.getBoundingClientRect().height;
        return frame.clientHeight >= contentHeight && frame.clientHeight - contentHeight <= 12;
      },null,{timeout:5000});
    } catch (error) {
      console.log('Guided height diagnostics:',await test.page.locator('#integratedChatFrame').evaluate(frame => ({
        parentClasses:document.body.className,childDataset:{...frame.contentDocument.body.dataset},
        frame:frame.clientHeight,content:frame.contentDocument.querySelector('.lab-frame.is-integrated')?.getBoundingClientRect().height,
        frameStyle:getComputedStyle(frame).height,inlineStyle:frame.style.height,
        navigationDisplay:getComputedStyle(document.querySelector('.vitrineChatNav')).display
      })));
      await test.page.screenshot({path:path.join(screenshots,`height-failure-step-${number}-${test.page.viewportSize().width}.png`),fullPage:true});
      throw error;
    }
    assert.equal(await test.page.locator('.vitrineChatNav').isVisible(),false,'guided mode hides duplicate outer Back/navigation');
    const height = await test.page.locator('#integratedChatFrame').evaluate(frame => ({frame:frame.clientHeight,content:frame.contentDocument.querySelector('.lab-frame.is-integrated').getBoundingClientRect().height}));
    assert.ok(height.frame >= height.content,`step ${number} iframe cannot cut its content (${height.frame} < ${height.content})`);
    assert.ok(height.frame - height.content <= 12,`step ${number} iframe shrinks with content rather than retaining a blank viewport`);
  }
  async function saved(test, predicate, description) {
    const deadline = Date.now() + 5000;
    while (!predicate(test.getState().draft) && Date.now() < deadline) await test.page.waitForTimeout(50);
    assert.ok(predicate(test.getState().draft), description);
  }
  async function upload(test, key, held = false, keyboard = false) {
    const input = field(test,key).locator('input[type="file"]');
    await input.waitFor({state:'attached'});
    const file = {name:`${key}-local.png`,mimeType:'image/png',buffer:pixel};
    if (keyboard) {
      const trigger = field(test,key).locator('.upload-button');
      assert.equal(await trigger.getAttribute('tabindex'),'0','original upload label is keyboard reachable');
      const chooser = test.page.waitForEvent('filechooser');
      await trigger.focus();
      await trigger.press('Enter');
      await (await chooser).setFiles(file);
    } else await input.setInputFiles(file);
    if (held) {
      await test.chat.locator('.lab-busy').waitFor({state:'visible'});
      assert.equal(await next(test).isDisabled(),true,'cannot advance during upload');
      test.releaseUpload();
    }
    await field(test,key).getByText(`${key}-local.png`,{exact:true}).waitFor({state:'visible'});
    await saved(test,draft => draft?.files.some(file => file.field === key),`${key} is saved on the original draft`);
  }
  async function chooseVideo(test) {
    const choice = test.chat.getByRole('radio',{name:/Imagem \+ v[ií]deo/});
    await choice.click();
    assert.equal(await choice.isChecked(),true,'video remains an image + video delivery');
  }
  async function fillValid(test) {
    await field(test,'mascot_animal').locator('input').fill('Lobo');
    await test.chat.getByRole('radio',{name:'Futebol',exact:true}).click();
    await next(test).click();
    await step(test,2);
    await upload(test,'team_crest');
    await next(test).click();
    await step(test,3);
    await test.page.screenshot({path:path.join(screenshots,'optional-stage-clean-390.png'),fullPage:true});
    const original=structuredClone(test.getState().draft);
    await next(test).click();
    await step(test,4);
    assert.deepEqual(test.getState().draft.values,original.values,'skipping optional stage preserves empty values and original defaults');
    assert.equal(test.getState().draft.files.some(file => file.field==='uniform_image'),false,'skipping does not assume or create a shirt');
    assert.equal(await test.chat.getByRole('radio',{name:/Somente imagem/}).isChecked(),true,'blank optional stage cannot select paid video');
  }

  try {
    for (const viewport of fullRun ? [{width:320,height:844},{width:390,height:844},{width:1440,height:1000}] : []) {
      const test = await setup(viewport,{holdUploads:true});
      try {
        await step(test,1);
        await saved(test,draft => draft?.flow === 'mascote_uniforme','uses the existing mascot draft');
        const id = test.getState().draft.id;
        assert.equal(test.getState().draft.values.sport,'','sport starts empty, not a presumption of Futebol');
        assert.equal(test.getState().draft.values.scenario_id,'Cenário atual','original required scenario keeps its valid default');
        assert.equal(test.getState().draft.values.visual_style,'Esportivo leve','original visual default is untouched');
        assert.equal(await field(test,'mascot_animal').locator('input').getAttribute('aria-label'),'Qual animal você quer transformar em mascote?','original input accessible label is preserved');
        assert.equal(await test.chat.locator('input[type="file"]').count(),1,'only the original hidden info-print input is mounted before upload step');
        await test.chat.getByRole('button',{name:/Voltar$/}).click();
        await test.page.locator('#vitrineHome').waitFor({state:'visible'});
        await test.page.locator('[data-vitrine-product="mascote_uniforme"]').click();
        await step(test,1);
        assert.equal(test.getState().draft.id,id,'first-step Back returns home without discarding the draft');
        await test.page.screenshot({path:path.join(screenshots,`step-1-${viewport.width}.png`),fullPage:true});
        await next(test).click();
        await step(test,1);
        assert.ok(await test.chat.locator('[role="alert"]:visible').count(),'empty first step displays validation');
        assert.equal(test.orderCount(),0);
        await field(test,'mascot_animal').locator('input').fill('Lobo');
        await next(test).click();
        await step(test,1);
        assert.equal(test.orderCount(),0,'filling animal alone cannot bypass sport');
        const other = test.chat.getByRole('radio',{name:'Outro esporte',exact:true});
        if (!(await other.isVisible())) await test.chat.getByRole('button',{name:/Outras opções|Outro esporte/,exact:false}).click();
        await other.click();
        await field(test,'other_sport').waitFor({state:'visible'});
        await field(test,'sport_context').waitFor({state:'visible'});
        await next(test).click();
        await step(test,1);
        assert.equal(test.orderCount(),0,'other sport details stay mandatory');
        await field(test,'other_sport').locator('input').fill('Handebol');
        await field(test,'sport_context').locator('input,textarea').fill('Quadra de handebol, traves e bola de handebol.');
        await next(test).click();
        await step(test,2);
        await test.chat.getByRole('button',{name:/Voltar$/}).click();
        await step(test,1);
        assert.equal(await field(test,'mascot_animal').locator('input').inputValue(),'Lobo');
        assert.equal(await field(test,'other_sport').locator('input').inputValue(),'Handebol','back preserves custom sport');
        await test.chat.getByRole('radio',{name:'Futebol',exact:true}).click();
        assert.equal(await field(test,'other_sport').count(),0,'conditional sport questions disappear when not applicable');
        await next(test).click();
        await step(test,2);
        assert.equal(await field(test,'team_crest').locator('input[type="file"]').getAttribute('aria-label'),'Envie o escudo ou brasão do time');
        assert.equal(await field(test,'uniform_image').count(),0,'optional shirt is not shown in the required crest stage');
        await uploadEmphasis(test,true);
        await test.chat.locator('.guided-mascot').screenshot({path:path.join(screenshots,`escudo-antes-${viewport.width}.png`)});
        await next(test).click();
        await step(test,2);
        assert.ok(await test.chat.locator('[role="alert"]:visible').count(),'crest requirement is visible before continuing');
        assert.equal(test.orderCount(),0);
        await upload(test,'team_crest',true,true);
        await uploadEmphasis(test,false);
        await test.page.screenshot({path:path.join(screenshots,`escudo-depois-${viewport.width}.png`),fullPage:true});
        await next(test).click();
        await step(test,3);
        assert.equal(await test.chat.locator('.guided-upload-pending,.guided-continue-pending').count(),0,'optional uploads retain their presentation');
        await upload(test,'uniform_image',true);
        assert.equal(await field(test,'scenario_id').count(),0,'scenario is not mounted in the optional tab');
        await field(test,'coupon_code').locator('input').fill('LOCAL-TEST');
        await saved(test,draft => draft?.values.coupon_code === 'LOCAL-TEST','optional coupon uses original draft');
        assert.equal(await test.chat.getByRole('radio',{name:'Esportivo leve',exact:true}).count(),0,'style choice is hidden while the original draft default remains');
        assert.deepEqual(test.uploads,['team_crest','uniform_image'],'uploads keep exact old field names and no new mascot-photo upload');
        await test.chat.getByRole('button',{name:/Voltar$/}).click();
        await step(test,2);
        assert.equal(await field(test,'team_crest').getByText('team_crest-local.png',{exact:true}).isVisible(),true,'back preserves uploaded shield');
        await field(test,'team_crest').getByRole('button',{name:'Remover',exact:true}).click();
        await saved(test,draft => !draft.files.some(file => file.field === 'team_crest'),'removing the crest restores the empty original draft field');
        await uploadEmphasis(test,true);
        await upload(test,'team_crest',true);
        await uploadEmphasis(test,false);
        await test.chat.getByRole('button',{name:/Voltar$/}).click();
        await step(test,1);
        await next(test).click();
        await step(test,2);
        assert.equal(await field(test,'team_crest').getByText('team_crest-local.png',{exact:true}).isVisible(),true,'back preserves uploaded shield');
        await test.page.screenshot({path:path.join(screenshots,`step-2-${viewport.width}.png`),fullPage:true});
        await next(test).click();
        await step(test,3);
        assert.equal(await field(test,'uniform_image').getByText('uniform_image-local.png',{exact:true}).isVisible(),true,'back preserves optional shirt');
        assert.equal(await field(test,'coupon_code').locator('input').inputValue(),'LOCAL-TEST','back preserves the optional coupon');
        await test.page.screenshot({path:path.join(screenshots,`optional-stage-${viewport.width}.png`),fullPage:true});
        await next(test).click();
        await step(test,4);
        await assertPurchaseSafety(test,{
          form:test.chat.locator('.guided-mascot'),assertLayout:() => step(test,4),
          screenshots,name:`mascote-${viewport.width}`,capture:true,draft:() => test.getState().draft
        });
        assert.match(await test.chat.locator('.guided-mascot').innerText(),/R\$\s*18,00/);
        assert.match(await test.chat.locator('.guided-mascot').innerText(),/R\$\s*28,00/);
        assert.equal(await test.chat.getByRole('radio',{name:/Somente imagem/}).isChecked(),true,'default is image, not an implicit paid upgrade');
        await chooseVideo(test);
        const snapshot=structuredClone(test.getState().draft);
        await test.chat.getByRole('button',{name:'Editar',exact:true}).first().click();
        await step(test,1);
        assert.equal(await field(test,'mascot_animal').locator('input').inputValue(),'Lobo');
        await next(test).click();
        await step(test,2);
        await next(test).click();
        await step(test,3);
        await next(test).click();
        await step(test,4);
        assert.equal(await test.chat.getByRole('radio',{name:/Imagem \+ v[ií]deo/}).isChecked(),true,'editing retains local delivery choice');
        await saved(test,draft => draft?.values.coupon_code === 'LOCAL-TEST','optional coupon uses original draft');
        assert.deepEqual(test.getState().draft.values,snapshot.values,'editing retains required and optional values');
        assert.deepEqual(test.getState().draft.files,snapshot.files,'editing retains both uploaded original files');
        assert.equal(test.getState().draft.id,id,'guided steps never replace the original draft');
        assert.equal(test.orderCount(),0,'all step buttons and editing are non-submitting');
        await step(test,4);
        await test.page.screenshot({path:path.join(screenshots,`step-final-${viewport.width}.png`),fullPage:true});
        assert.equal(await test.chat.locator('.guided-mascot').evaluate(form => {
          const delivery=form.querySelector('.guided-delivery'),send=form.querySelector('.guided-primary'),review=form.querySelector('.guided-review');
          return !!(delivery.compareDocumentPosition(send)&Node.DOCUMENT_POSITION_FOLLOWING) &&
            !!(send.compareDocumentPosition(review)&Node.DOCUMENT_POSITION_FOLLOWING);
        }),true,'final delivery prices precede Enviar, then review');
        await test.page.locator('[data-vitrine-home]').first().click();
        await test.page.locator('[data-vitrine-product="mascote_uniforme"]').click();
        await test.chat.locator('.guided-mascot').waitFor({state:'visible'});
        await step(test,4);
        assert.equal(test.getState().draft.id,id,'home preserves original draft');
        assert.equal(test.getState().draft.files.length,2,'home preserves shield and shirt');
        assert.deepEqual(test.getState().draft.values,snapshot.values,'home retains required and optional values');

        await test.chat.getByRole('button',{name:'Ajuda',exact:true}).click();
        await test.chat.locator('.composer').waitFor({state:'visible'});
        assert.equal(await test.chat.locator('.guided-mascot:visible').count(),0,'Help restores the original renderer, not the wizard');
        assert.equal(await test.chat.locator('.lab-conversation-bar').isVisible(),true);
        assert.equal(test.getState().draft.id,id,'Help does not discard responses');
        assert.doesNotMatch(await test.chat.locator('.lab-form').innerText(),/Qual cenário|Estilo da arte|Como você quer o visual da arte\?/,'original Help fallback also hides appearance questions');
        assert.equal(test.getState().draft.values.scenario_id,'Cenário atual');
        assert.equal(test.getState().draft.values.visual_style,'Esportivo leve');

        for (const product of products.filter(product => product.id !== 'mascote_uniforme')) {
          await test.page.locator('[data-vitrine-home]').first().click();
          await test.page.locator('[data-vitrine-options]').click();
          const catalog = test.chat.getByRole('navigation',{name:'Todas as opções do chat'});
          await catalog.waitFor({state:'visible'});
          await catalog.locator('section[aria-label="Criar uma arte"] button').filter({has:test.chat.getByText(product.name,{exact:true})}).click();
          if (product.id === 'escudo3d') {
            await test.page.locator('#escudo3dExamples').waitFor({state:'visible'});
            await test.page.locator('#escudo3dExamples [data-delivery-choice="image"]').click();
          }
          await test.page.waitForFunction(name => {
            const document = window.document.getElementById('integratedChatFrame')?.contentDocument;
            return document?.querySelector('[role="alertdialog"]')?.getBoundingClientRect().width > 0 || document?.querySelector('.lab-form-heading strong')?.textContent.trim() === name;
          },product.name);
          if (await test.chat.getByRole('alertdialog').isVisible()) await test.chat.getByRole('button',{name:'Trocar de atendimento',exact:true}).click();
          await test.chat.locator('.lab-form-heading strong').filter({hasText:product.name}).waitFor({state:'visible'});
          assert.equal(await test.chat.locator('.guided-mascot').count(),0,`${product.id} is separate from mascot presentation`);
          await test.chat.locator('.guided-product[data-stage-key="sport"]').waitFor({state:'visible'});
          await test.chat.getByRole('button',{name:'Continuar',exact:true}).click();
          await test.chat.locator('.guided-error[role="alert"]').waitFor({state:'visible'});
          assert.equal(await test.chat.locator('.guided-product').getAttribute('data-stage-key'),'sport',`${product.id} retains original required-sport validation`);
          assert.equal(test.orderCount(),0,`${product.id} validation never bypassed`);
        }
        assert.deepEqual(test.errors,[],'guided and original products have no runtime errors');
        console.log(`OK ${viewport.width}px: empty/defaults, conditional sport, step validation, exact uploads, back/edit/home persistence, optional settings, prices, Help and nine guided products with original validation`);
      } finally { await test.context.close(); }
    }

    // The original bridge is exercised using a completely intercepted API.
    for (const mode of ['image','image_video','pix','retry','saved-appearance']) {
      const savedAppearance=mode==='saved-appearance'
        ? {scenario_id:'Noite',visual_style:'Realista com luz de cinema',style_id:'saved-local-style'} : null;
      const test = await setup({width:390,height:844},{balance:mode === 'pix' ? 0 : 100,failedOrders:mode === 'retry' ? 1 : 0,holdOrders:mode === 'image_video',savedAppearance});
      try {
        await fillValid(test);
        if (mode !== 'image') await chooseVideo(test);
        const originalId = test.getState().draft.id;
        const originalAppearance=Object.fromEntries(appearanceKeys.map(key => [key,test.getState().draft.values[key]]));
        if(savedAppearance) assert.deepEqual(originalAppearance,savedAppearance,'a resumed draft keeps its previously saved appearance choices');
        if (mode === 'image_video') {
          await final(test).evaluate(button => {button.click();button.click();});
          await test.chat.locator('.lab-busy').waitFor({state:'visible'});
          assert.equal(await final(test).count() === 0 || await final(test).isDisabled(),true,'submit is absent or disabled during bridge response');
          assert.equal(test.orderCount(),1,'double click starts one mocked backend order');
          test.releaseOrder();
        } else await final(test).click();
        if (mode === 'retry') {
          await test.chat.locator('.form-error[role="alert"]').waitFor({state:'visible'});
          assert.match(await test.chat.locator('.form-error[role="alert"]').innerText(),/Falha local simulada/);
          await step(test,4);
          await test.page.waitForTimeout(1200);
          assert.equal(test.orderCount(),1,'backend failure never auto retries');
          assert.equal(test.getState().draft.id,originalId,'backend failure retains original draft');
          assert.equal(test.getState().draft.files[0].field,'team_crest');
          await final(test).click();
        }
        await test.chat.locator('.lab-post-order-actions').waitFor({state:'visible',timeout:10000});
        const messages = await test.messages();
        assert.equal(messages.length,mode === 'retry' ? 2 : 1,'submit calls the original bridge once per explicit attempt');
        assert.equal(test.orderCount(),mode === 'retry' ? 2 : 1);
        assert.equal(messages.at(-1).draft.id,originalId,'bridge gets unchanged draft id');
        assert.equal(messages.at(-1).draft.flow,'mascote_uniforme');
        assert.equal(messages.at(-1).draft.values.mascot_animal,'Lobo');
        assert.equal(messages.at(-1).draft.values.sport,'Futebol');
        assert.equal(messages.at(-1).draft.values.delivery_mode,mode === 'image' ? 'image' : 'image_video');
        assert.equal(messages.at(-1).draft.values.video_model,mode === 'image' ? '' : 'fast','old video-model mapping preserved');
        for(const [key,value] of Object.entries(originalAppearance))
          assert.equal(messages.at(-1).draft.values[key],value,`hidden ${key} still reaches the original submission bridge`);
        const body=test.requests.filter(request=>request.path==='/pedidos').at(-1).body;
        const transmittedFields=JSON.parse(body.match(/name="fields_json"\r\n\r\n([^\r]*)/)?.[1] || '{}');
        const mappedScenario=await test.page.evaluate(value=>omascoteChatScenarioId('mascote_uniforme',value),originalAppearance.scenario_id);
        assert.equal(transmittedFields.scenario_id,mappedScenario,'original scenario mapping is still applied by the parent');
        assert.equal(transmittedFields.visual_style,originalAppearance.visual_style.toLowerCase(),'hidden style still reaches the backend with its original lowercase mapping');
        assert.equal(messages.at(-1).files[0].field,'team_crest','bridge receives original image field');
        assert.equal(await test.chat.getByRole('dialog',{name:'Como você quer receber?'}).count(),0,'chosen delivery does not open a repeated delivery dialog');
        assert.equal(test.pixCount(),mode === 'pix' ? 1 : 0,'original backend balance result alone determines Pix');
        await test.page.waitForTimeout(600);
        assert.equal(test.orderCount(),mode === 'retry' ? 2 : 1,'success does not repeat submit');
        assert.equal(test.actions.includes('complete'),false,'no lab order bypass');
        assert.deepEqual(test.errors,[],'bridge flow has no runtime errors');
        await test.page.screenshot({path:path.join(screenshots,`submit-${mode}.png`),fullPage:true});
        console.log(`OK mocked ${mode}: original submit/bridge, exact fields/delivery, bounded attempts, preserved error/retry and original Pix result`);
      } finally { await test.context.close(); }
    }
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => {console.error(error);server.close();process.exitCode=1;});
