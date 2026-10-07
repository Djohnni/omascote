// Offline media events and controlled fetches; no browser, network or paid generation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'mascot-video-examples.js'),'utf8');
const flush = async () => {for (let i=0;i<8;i++) await Promise.resolve();};
function deferred() {
  let resolve,reject;const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function node() {
  const listeners = new Map(),attrs = new Map();
  return {
    hidden:false,dataset:{},textContent:'',classList:{remove(){}},
    addEventListener(type,fn) {listeners.set(type,[...(listeners.get(type)||[]),fn]);},
    emit(type,event={}) {for (const fn of listeners.get(type)||[]) fn(event);},
    setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key)??null,
    focus(){},scrollIntoView(){},pause(){},click(){this.emit('click');},
    get src(){return attrs.get('src')||'';},set src(value){attrs.set('src',value);}
  };
}
function fixture() {
  const scope = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'mascot-video-options.js'),'utf8'),scope);
  const options = scope.window.OmascoteMascotVideoOptions;
  const section = node(),close = node(),frame = node(),chat = node();
  const videos = options.map(option=>Object.assign(node(),{
    dataset:{src:option.videoSrc,poster:option.posterSrc},paused:true,ended:false,error:null,playCount:0,loadCount:0,
    play(){this.playCount++;this.paused=false;this.ended=false;this.emit('play');return this.nextPlay || Promise.resolve();},
    pause(){this.paused=true;this.emit('pause');},
    load(){this.loadCount++;this.error=null;},
    begin(){this.paused=false;this.ended=false;this.emit('playing');}
  }));
  const statuses = videos.map(()=>node()),buttons = videos.map(()=>node());
  const choices = [...options.map(option=>option.id),'image'].map(id=>Object.assign(node(),{dataset:{mascotChoice:id}}));
  buttons.forEach((button,index)=>{button.closest=()=>({querySelector:selector=>selector==='video'?videos[index]:statuses[index]});});
  section.querySelector=()=>close;
  section.querySelectorAll=selector=>selector==='video'?videos:selector==='[data-mascot-play]'?buttons:choices;
  const document = Object.assign(node(),{
    hidden:false,body:node(),createElement:()=>section,
    getElementById:id=>({integratedChatFrame:frame,integratedChatModal:chat,escudo3dExamples:{before(){}}})[id]
  });
  const window = Object.assign(node(),scope.window),requests=[],created=[],revoked=[];
  function fetch(url,{signal}) {
    const headers = deferred(),body = deferred();
    const request = {url,signal,ignoreAbort:false,bodyRead:false};
    const abortError = () => Object.assign(new Error('aborted'),{name:'AbortError'});
    signal.addEventListener('abort',()=>{
      if (request.ignoreAbort) return;
      headers.reject(abortError());
      if (request.bodyRead) body.reject(abortError());
    });
    request.finish = (ok=true) => {
      headers.resolve({ok,blob:()=>{
        request.bodyRead=true;
        return signal.aborted && !request.ignoreAbort ? Promise.reject(abortError()) : body.promise;
      }});
      body.resolve({size:1024,type:'video/mp4'});
    };
    request.fail = () => headers.reject(new Error('simulated offline'));
    requests.push(request);return headers.promise;
  }
  vm.runInNewContext(source,{
    window,document,fetch,AbortController,Intl,
    URL:{createObjectURL:blob=>{const url=`blob:cached-${created.length+1}`;created.push({url,blob});return url;},revokeObjectURL:url=>revoked.push(url)},
    matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>fn()
  });
  return {window,document,section,close,frame,chat,videos,buttons,statuses,choices,requests,created,revoked,options,
    open(){window.OmascoteMascotExamples.open(()=>true);},
    hide(hidden){document.hidden=hidden;document.emit('visibilitychange');}
  };
}

test('Nenhum fetch ao abrir; playing inicia um download por vez e completa a fila após fim/pausa', async () => {
  const f=fixture();assert.equal(f.requests.length,0);f.open();assert.equal(f.requests.length,0);
  assert.ok(f.videos.every(video=>!video.src));
  f.buttons[0].click();assert.equal(f.requests.length,0);
  assert.equal(f.videos[0].src,f.options[0].videoSrc);
  f.videos[0].begin();assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,f.options[1].videoSrc);
  assert.equal(f.created.length,0);
  f.videos[0].pause();f.videos[0].ended=true;f.videos[0].emit('ended');
  assert.equal(f.requests[0].signal.aborted,false);
  f.requests[0].finish();await flush();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,f.options[2].videoSrc);
  assert.equal(f.created.length,1);assert.equal(f.videos[1].src,'');
  f.requests[1].finish();await flush();
  assert.equal(f.created.length,2);assert.equal(f.requests.length,2);
  assert.deepEqual(Array.from(f.videos,video=>video.playCount),[1,0,0],'background videos never autoplay');
  f.buttons[1].click();assert.equal(f.videos[1].src,'blob:cached-1');f.videos[1].begin();
  f.buttons[2].click();assert.equal(f.videos[2].src,'blob:cached-2');f.videos[2].begin();await flush();
  assert.equal(f.requests.length,2,'completed Blobs are reused without another fetch');
});

test('Trocar durante download aborta, toca imediatamente e ignora resolução atrasada sem disparar fila prematura', async () => {
  const f=fixture();f.open();f.buttons[0].click();f.videos[0].begin();
  const stale=f.requests[0];stale.ignoreAbort=true;
  f.buttons[1].click();
  assert.equal(stale.signal.aborted,true);
  assert.equal(f.videos[1].playCount,1,'no await can consume the mobile user gesture');
  assert.equal(f.videos[1].src,f.options[1].videoSrc);
  assert.equal(f.requests.length,1,'aborted job remains until settlement');
  stale.finish();await flush();
  assert.equal(f.created.length,0);assert.equal(f.requests.length,1,'new selection must actually play first');
  f.videos[1].begin();assert.equal(f.requests.length,2);
  assert.equal(f.requests[1].url,f.options[2].videoSrc);
  f.requests[1].finish();await flush();
  assert.equal(f.created.length,1);
  assert.equal(f.videos[1].src,f.options[1].videoSrc,'late download cannot replace the source in use');
});

test('Fechar ou ocultar aborta sem erro; reabrir/voltar não transfere até tocar novamente', async () => {
  const f=fixture();f.open();f.buttons[0].click();f.videos[0].begin();
  f.close.click();assert.equal(f.requests[0].signal.aborted,true);await flush();
  assert.equal(f.requests.length,1);assert.ok(f.statuses.every(status=>!status.textContent));
  f.open();await flush();assert.equal(f.requests.length,1);
  f.buttons[0].click();assert.equal(f.requests.length,1);f.videos[0].begin();
  assert.equal(f.requests.length,2);
  f.hide(true);assert.equal(f.requests[1].signal.aborted,true);await flush();
  f.hide(false);await flush();assert.equal(f.requests.length,2);
  f.buttons[0].click();f.videos[0].begin();assert.equal(f.requests.length,3);
  f.requests[2].finish();await flush();assert.equal(f.requests.length,4);
  f.requests[3].finish();await flush();
  assert.ok(f.statuses.every(status=>!status.textContent));
});

test('Falha secundária é silenciosa, avança para o próximo e permite tentativa manual por HTTP', async () => {
  const f=fixture();f.open();f.buttons[0].click();f.videos[0].begin();
  f.requests[0].fail();await flush();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,f.options[2].videoSrc);
  assert.ok(f.statuses.every(status=>!status.textContent));
  f.requests[1].finish();await flush();
  f.buttons[1].click();assert.equal(f.videos[1].src,f.options[1].videoSrc);
  f.videos[1].begin();await flush();assert.equal(f.requests.length,2);
});

test('Erro nativo atrasado restaura Assistir mesmo no vídeo inativo; nova tentativa recarrega HTTP', async () => {
  const f=fixture();f.open();f.buttons[0].click();f.videos[0].begin();
  f.requests[0].finish();await flush();f.requests[1].finish();await flush();
  f.buttons[1].click();f.videos[1].begin();assert.equal(f.videos[1].src,'blob:cached-1');
  f.buttons[2].click();f.videos[2].begin();
  f.videos[1].error={code:3};f.videos[1].emit('error');
  assert.equal(f.buttons[1].hidden,false);
  assert.equal(f.statuses[1].textContent,'','inactive error does not interrupt current playback');
  f.buttons[1].click();
  assert.equal(f.videos[1].src,f.options[1].videoSrc);
  assert.equal(f.videos[1].loadCount,1);
  assert.ok(f.revoked.includes('blob:cached-1'));
});

test('AbortError de play é silencioso; erro real mantém os controles de tentativa', async () => {
  const f=fixture();f.open();
  let play=deferred();f.videos[0].nextPlay=play.promise;f.buttons[0].click();
  play.reject(Object.assign(new Error('paused'),{name:'AbortError'}));await flush();
  assert.equal(f.statuses[0].textContent,'');
  play=deferred();f.videos[0].nextPlay=play.promise;f.buttons[0].click();
  play.reject(new Error('decode failed'));await flush();
  assert.equal(f.buttons[0].hidden,false);assert.match(f.statuses[0].textContent,/Tente novamente/);
  f.videos[0].nextPlay=null;f.buttons[0].click();
  assert.equal(f.videos[0].src,f.options[0].videoSrc);assert.equal(f.videos[0].loadCount,1);
});

test('BFCache preserva URLs sem retomar downloads; saída definitiva libera o cache', async () => {
  const f=fixture();f.open();f.buttons[0].click();f.videos[0].begin();
  f.requests[0].finish();await flush();f.requests[1].finish();await flush();
  f.window.emit('pagehide',{persisted:true});await flush();
  assert.equal(f.revoked.length,0);assert.equal(f.requests.length,2);
  assert.ok(f.videos.every(video=>video.paused));
  f.buttons[1].click();assert.equal(f.videos[1].src,'blob:cached-1');
  f.window.emit('pagehide',{persisted:false});await flush();
  assert.deepEqual(f.revoked,['blob:cached-1','blob:cached-2']);
});
