// Offline event-contract tests. No browser, network, account, order or payment is created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'vitrine-chat.js'),'utf8');

function element(dataset = {}) {
  const listeners = new Map(), classes = new Set();
  return {
    dataset, hidden:false, disabled:false, textContent:'', style:{},
    classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),
      toggle:(value,enabled)=>enabled ? classes.add(value) : classes.delete(value),contains:value=>classes.has(value)},
    addEventListener(type,callback) { listeners.set(type,callback); },
    emit(type,event = {}) { listeners.get(type)?.(event); },
    click() { listeners.get('click')?.(); },
    hasAttribute(name) { return name==='data-vitrine-gift' && this.dataset.vitrineGift != null; },
    scrollIntoView() {}
  };
}

function setup(search = '', withGallery = false) {
  const ids = Object.fromEntries(['vitrineHome','vitrineChatNav','integratedChatFrame','integratedChatModal','vitrineStatus']
    .map(id=>[id,element()]));
  const selectors = {
    '[data-vitrine-product]':[element({vitrineProduct:'mascote_uniforme'}),element({vitrineProduct:'escudo3d',vitrineGift:''})],
    '[data-vitrine-options]':[element()], '[data-vitrine-home]':[element()],
    '[data-vitrine-chat]':[element()], '[data-vitrine-account]':[element()], '[data-vitrine-orders]':[element()]
  };
  const messages = [],loads = [],tracks = [],timers = new Map(),listeners = new Map();
  const frame = ids.integratedChatFrame;
  frame.contentWindow = {postMessage:(data,origin)=>messages.push({data:JSON.parse(JSON.stringify(data)),origin})};
  const body = element({page:'home',vitrine:'true'});
  let timerId = 0, loaderResult = true, loaderError = false, opens = 0, closes = 0, accounts = 0, orders = 0;
  const window = {
    addEventListener:(type,callback)=>listeners.set(type,callback),
    carregarAtendimentoIntegrado(options = {}) {
      loads.push(JSON.parse(JSON.stringify(options)));
      if (loaderError) throw new Error('loader unavailable');
      return loaderResult;
    },
    abrirAtendimentoIntegrado() { opens++;this.carregarAtendimentoIntegrado(); },
    fecharAtendimentoIntegrado() { closes++; },
    abrirMinhaContaPeloAtendimento() { accounts++; },
    abrirPedidosPeloAtendimento() { orders++; },
    ia4Track:(event,data)=>tracks.push({event,data:JSON.parse(JSON.stringify(data))})
  };
  const gallery = {visible:false,opens:0,callback:null,settings:null,
    open(callback,settings) {this.visible=true;this.opens++;this.callback=callback;this.settings=settings;return true;},
    close() {this.visible=false;},
    choose(choice) {const result=this.callback(choice);if(result!==false)this.close();},
    cancel() {this.close();this.settings.onCancel();}
  };
  if (withGallery) window.OmascoteMascotExamples = gallery;
  const context = {
    window, document:{body,getElementById:id=>ids[id],querySelector:()=>null,querySelectorAll:selector=>selectors[selector]||[]},
    location:{origin:'https://local.test',search}, URLSearchParams,
    matchMedia:()=>({matches:true}),
    setTimeout(callback,ms) { const id = ++timerId;timers.set(id,{callback,ms});return id; },
    clearTimeout:id=>timers.delete(id)
  };
  vm.runInNewContext(source,context);
  return {
    ids,selectors,messages,loads,tracks,timers,window,body,gallery,
    get opens() { return opens; }, get closes() { return closes; },
    get accounts() { return accounts; }, get orders() { return orders; },
    set loaderResult(value) { loaderResult = value; }, set loaderError(value) { loaderError = value; },
    message(data,source=frame.contentWindow,origin=context.location.origin) {
      listeners.get('message')?.({data,source,origin});
    },
    expire() {
      const entry = [...timers.entries()][0];
      assert.ok(entry,'a pending timeout exists');
      timers.delete(entry[0]);entry[1].callback();
    },
    selections() { return messages.filter(item=>['omascote-chat:select-product','omascote-chat:open-catalog'].includes(item.data.type)); }
  };
}

test('Abrir a home não inicia o atendimento; evento load não antecipa visual-ready', () => {
  const app = setup();
  assert.equal(app.loads.length,0);
  assert.equal(app.opens,0);
  assert.equal(app.timers.size,0);
  app.ids.integratedChatFrame.emit('load');
  assert.equal(app.loads.length,0);
  assert.equal(app.selections().length,0);
  assert.equal(app.messages.at(-1).data.type,'omascote-chat:visual-state');
});

test('Produto inicia o iframe antes de esperar e é enviado uma única vez após visual-ready', () => {
  const app = setup(),button = app.selectors['[data-vitrine-product]'][0];
  button.click();
  assert.deepEqual(app.loads,[{retry:false}]);
  assert.equal(button.disabled,true);
  assert.equal(app.selections().length,0);
  assert.equal(app.ids.vitrineStatus.textContent,'Preparando atendimento…');
  assert.equal([...app.timers.values()][0].ms,15000);
  button.click();
  assert.equal(app.loads.length,1);
  app.ids.integratedChatFrame.emit('load');
  app.message({type:'omascote-chat:visual-ready',ready:false});
  assert.equal(app.selections().length,0);
  app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
  const sent = app.selections();
  assert.equal(sent.length,1);
  assert.equal(sent[0].data.productId,'mascote_uniforme');
  assert.equal(sent[0].data.gift,false);
  assert.equal(app.ids.vitrineHome.hidden,true);
  app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
  assert.equal(app.selections().length,1);
  app.message({type:'omascote-chat:visual-result',requestId:sent[0].data.requestId,ok:true});
  assert.equal(button.disabled,false);
  assert.equal(app.timers.size,0);
});

test('Catálogo e escudo de brinde conservam a seleção durante o carregamento', () => {
  for (const isGift of [false,true]) {
    const app = setup();
    const button = isGift ? app.selectors['[data-vitrine-product]'][1] : app.selectors['[data-vitrine-options]'][0];
    button.click();
    assert.equal(app.selections().length,0);
    app.message({type:'omascote-chat:visual-ready',ready:true});
    const message = app.selections()[0].data;
    assert.equal(message.type,isGift?'omascote-chat:select-product':'omascote-chat:open-catalog');
    assert.equal(message.gift,isGift);
    if (isGift) {
      assert.equal(message.productId,'escudo3d');
      assert.deepEqual(app.tracks,[{event:'escudo_brinde_aberto',data:{produto:'escudo3d'}}]);
    }
  }
});

test('Timeout sem pronto libera botão; próximo toque pede recarregamento e conserva seleção', () => {
  const app = setup(),button = app.selectors['[data-vitrine-product]'][0];
  button.click();app.expire();
  assert.equal(button.disabled,false);
  assert.equal(app.ids.vitrineHome.hidden,false);
  assert.match(app.ids.vitrineStatus.textContent,/Tente novamente/);
  assert.equal(app.selections().length,0);
  button.click();
  assert.deepEqual(app.loads,[{retry:false},{retry:true}]);
  app.message({type:'omascote-chat:visual-ready',ready:true});
  assert.equal(app.selections().length,1);
  assert.equal(app.selections()[0].data.productId,'mascote_uniforme');
});

test('Pronto tardio não abre pedido cancelado e timeout de confirmação não recarrega frame pronto', () => {
  const app = setup(),button = app.selectors['[data-vitrine-product]'][0];
  button.click();app.expire();
  app.message({type:'omascote-chat:visual-ready',ready:true});
  assert.equal(app.selections().length,0);
  button.click();
  assert.equal(app.selections().length,1);
  assert.equal(app.loads[1].retry,false);
  app.expire();
  button.click();
  assert.equal(app.selections().length,2);
  assert.ok(app.loads.every(call=>call.retry!==true),'ready drafts are never force reloaded');
});

test('Ajuda usa abertura existente; voltar, conta e pedidos não iniciam novo iframe', () => {
  const app = setup();
  app.selectors['[data-vitrine-account]'][0].click();
  app.selectors['[data-vitrine-orders]'][0].click();
  assert.equal(app.accounts,1);assert.equal(app.orders,1);
  assert.equal(app.loads.length,0);
  app.selectors['[data-vitrine-chat]'][0].click();
  assert.equal(app.opens,1);assert.equal(app.loads.length,1);
  assert.equal(app.selections().length,0);
  app.selectors['[data-vitrine-home]'][0].click();
  assert.equal(app.ids.vitrineHome.hidden,false);
  assert.equal(app.loads.length,1);
});

test('Erro do loader libera nova tentativa e mensagens externas não liberam seleção', () => {
  for (const throws of [false,true]) {
    const app = setup(),button = app.selectors['[data-vitrine-product]'][0];
    if (throws) app.loaderError=true;else app.loaderResult=false;
    button.click();
    assert.equal(button.disabled,false);
    assert.equal(app.timers.size,0);
    assert.match(app.ids.vitrineStatus.textContent,/Não foi possível carregar/);
    app.loaderResult=true;app.loaderError=false;button.click();
    app.message({type:'omascote-chat:visual-ready',ready:true},{});
    app.message({type:'omascote-chat:visual-ready',ready:true},app.ids.integratedChatFrame.contentWindow,'https://other.test');
    assert.equal(app.selections().length,0);
    app.message({type:'omascote-chat:visual-ready',ready:true});
    assert.equal(app.selections().length,1);
  }
});

test('Envio em andamento e falha de seleção restauram os controles para nova tentativa', () => {
  const app = setup(),button = app.selectors['[data-vitrine-product]'][0];
  app.message({type:'omascote-chat:visual-ready',ready:true,busy:true});
  button.click();
  assert.equal(button.disabled,false);
  assert.equal(app.selections().length,0);
  assert.equal(app.timers.size,0);
  app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
  button.click();
  const sent = app.selections()[0].data;
  app.message({type:'omascote-chat:visual-result',requestId:sent.requestId,ok:false,error:'Erro simulado'});
  assert.equal(button.disabled,false);
  assert.equal(app.ids.vitrineHome.hidden,false);
  assert.equal(app.ids.vitrineStatus.textContent,'Erro simulado');
  assert.equal(app.timers.size,0);
});

test('Galeria de mascote abre antes do ready e prepara atendimento sem selecionar produto', () => {
  const app=setup('',true),button=app.selectors['[data-vitrine-product]'][0];
  button.click();
  assert.equal(app.gallery.visible,true);
  assert.equal(app.gallery.settings.preserveOnFrameLoad,true);
  assert.equal(app.ids.vitrineHome.hidden,true);
  assert.equal(app.ids.vitrineChatNav.hidden,false);
  assert.deepEqual(app.loads,[{retry:false}]);
  assert.equal(app.selections().length,0);
  assert.equal(app.timers.size,0);
  assert.equal(button.disabled,false);
  app.ids.integratedChatFrame.emit('load');
  app.message({type:'omascote-chat:guided-stage',active:true});
  app.message({type:'omascote-chat:presentation',mode:'chat'});
  assert.equal(app.body.classList.contains('vitrineGuidedActive'),false);
  app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
  assert.equal(app.gallery.visible,true);
  assert.equal(app.selections().length,0);
});

test('Escolha antecipada espera ready e envia a opção exatamente uma vez', () => {
  for(const choice of ['sol','chuva','ascensao_epica','image']) {
    const app=setup('',true),button=app.selectors['[data-vitrine-product]'][0];
    button.click();app.gallery.choose(choice);
    assert.equal(app.gallery.visible,false);
    assert.equal(app.selections().length,0);
    assert.equal(app.opens,1,'loader is visible while the chosen form is prepared');
    assert.equal(button.disabled,true);
    app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
    app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
    const sent=app.selections();assert.equal(sent.length,1);
    assert.equal(sent[0].data.mascotVideoOption,choice);
    app.message({type:'omascote-chat:visual-result',requestId:sent[0].data.requestId,ok:true});
    assert.equal(button.disabled,false);assert.equal(app.timers.size,0);
    assert.equal(app.gallery.opens,1,'no second gallery');
  }
});

test('Cancelar preview ou voltar durante espera impede seleção tardia e libera nova escolha', () => {
  for(const afterChoice of [false,true]) {
    const app=setup('',true),button=app.selectors['[data-vitrine-product]'][0];button.click();
    if(afterChoice){app.gallery.choose('chuva');app.selectors['[data-vitrine-home]'][0].click();}
    else app.gallery.cancel();
    assert.equal(app.ids.vitrineHome.hidden,false);assert.equal(app.gallery.visible,false);
    assert.equal(app.timers.size,0);assert.equal(button.disabled,false);
    app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
    assert.equal(app.selections().length,0);
    button.click();app.gallery.choose('image');
    assert.equal(app.selections().length,1);assert.equal(app.selections()[0].data.mascotVideoOption,'image');
  }
});

test('Falha, timeout e envio em andamento durante preview retornam à home com aviso visível', () => {
  for(const failure of ['busy','loader','throw','timeout']) {
    const app=setup('',true),button=app.selectors['[data-vitrine-product]'][0];button.click();
    if(failure==='busy')app.message({type:'omascote-chat:visual-ready',ready:true,busy:true});
    if(failure==='loader')app.loaderResult=false;
    if(failure==='throw')app.loaderError=true;
    app.gallery.choose('sol');
    if(failure==='timeout')app.expire();
    assert.equal(app.ids.vitrineHome.hidden,false,failure);
    assert.equal(app.gallery.visible,false,failure);
    assert.ok(app.ids.vitrineStatus.textContent,failure);
    assert.equal(button.disabled,false);assert.equal(app.timers.size,0);
    app.message({type:'omascote-chat:visual-ready',ready:true,busy:false});
    assert.equal(app.selections().length,0);
  }
});
