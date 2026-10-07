// Execute the real compiled selection functions with offline state and message stubs.
// No browser, network, upload, order, payment or generation is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const bundle = fs.readFileSync(path.join(__dirname,'../atendimento/assets/index-BYWG3Byi.js'),'utf8');
function extract(startText,endText) {
  const start=bundle.indexOf(startText),end=bundle.indexOf(endText,start);
  assert.ok(start>=0 && end>start,startText);return bundle.slice(start,end);
}
const selection=extract('function omascoteSelectMascotVideo(', 'function Me(');
const receiver=extract('function t(t){if(t.source!==window.parent||t.origin!==e)return;', 'return window.addEventListener(`message`,t)');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(draft=null) {
  const replies=[],created=[],saved=[],conflicts=[],catalog=[],gallery=[];
  const parent={postMessage:(message,origin)=>replies.push({message:plain(message),origin})};
  const context={
    window:{parent},e:'https://omascote.com.br',n:true,c:false,U:{current:false},V:{current:{draft}},
    js:id=>['mascote_uniforme','escudo3d','resultado','personalizada'].includes(id),
    omascoteMascotGallery:()=>({open:callback=>{gallery.push(callback);return true;}}),
    omascoteEscudoGallery:()=>({open:()=>true}),
    ye:(value,immediate)=>{saved.push({value:plain(value),immediate});context.V.current.draft=value;},
    Se:(flow,seed)=>{created.push({flow,seed:plain(seed)});context.V.current.draft={id:'new-draft',flow,values:seed,files:[]};},
    E:value=>conflicts.push(plain(value)),p:open=>catalog.push(open),A(){},d(){},M(){},G(){},cc:value=>value
  };
  vm.createContext(context);vm.runInContext(selection+receiver+';globalThis.receive=t;',context);
  return {context,replies,created,saved,conflicts,catalog,gallery,
    send(data={},overrides={}){context.receive({source:parent,origin:context.e,
      data:{type:'omascote-chat:select-product',productId:'mascote_uniforme',requestId:'selection-1',...data},...overrides});}
  };
}

test('Escolha direta cria somente o rascunho escolhido sem reabrir a galeria', () => {
  for (const choice of ['image','sol','chuva','ascensao_epica']) {
    const f=fixture();f.send({mascotVideoOption:choice,values:{mascot_animal:'ignored'},gift:true});
    assert.equal(f.created.length,1);assert.equal(f.gallery.length,0);assert.equal(f.replies.length,1);
    assert.deepEqual(f.created[0],{flow:'mascote_uniforme',seed:{mascot_video_option:choice==='image'?'':choice,
      delivery_mode:choice==='image'?'image':'image_video'}});
    assert.deepEqual(f.replies[0].message,{type:'omascote-chat:visual-result',requestId:'selection-1',ok:true});
  }
});

test('Escolha direta preserva os campos, arquivos e identidade do rascunho de mascote existente', () => {
  const draft={id:'existing',flow:'mascote_uniforme',stage:'collect',values:{mascot_animal:'Leão',sport:'Futebol',mascot_video_option:'sol'},files:[{id:'crest'}]};
  const f=fixture(draft);f.send({mascotVideoOption:'chuva'});
  assert.equal(f.created.length,0);assert.equal(f.conflicts.length,0);assert.equal(f.saved.length,1);
  assert.deepEqual(f.saved[0],{value:{...draft,values:{...draft.values,mascot_video_option:'chuva',delivery_mode:'image_video'}},immediate:true});
});

test('Outro rascunho exige a confirmação existente de troca antes de criar mascote', () => {
  const draft={id:'other',flow:'resultado',values:{score:'2x1'},files:[{id:'photo'}]};
  const f=fixture(draft);f.send({mascotVideoOption:'ascensao_epica'});
  assert.equal(f.created.length,0);assert.equal(f.saved.length,0);assert.equal(f.context.V.current.draft,draft);
  assert.deepEqual(f.conflicts,[{flow:'mascote_uniforme',seed:{mascot_video_option:'ascensao_epica',delivery_mode:'image_video'}}]);
});

test('Escolhas inválidas e escolha aplicada a outro produto ou catálogo são rejeitadas', () => {
  for (const choice of [undefined,null,{},[],1,'','image_video','escrita_personalizada','SOL',' chuva ']) {
    const f=fixture();f.send({mascotVideoOption:choice});
    assert.equal(f.replies[0].message.ok,false);assert.equal(f.created.length,0);assert.equal(f.saved.length,0);
  }
  for (const data of [{productId:'escudo3d',gift:true},{type:'omascote-chat:open-catalog'}]) {
    const f=fixture();f.send({...data,mascotVideoOption:'sol'});
    assert.equal(f.replies[0].message.ok,false);assert.equal(f.created.length,0);assert.equal(f.catalog.length,0);
  }
});

test('Origem, prontidão e bloqueio de envio continuam protegendo seleção e merge', () => {
  for (const overrides of [{origin:'https://other.test'},{source:{}}]) {
    const f=fixture();f.send({mascotVideoOption:'sol'},overrides);
    assert.equal(f.replies.length,0);assert.equal(f.created.length,0);
  }
  for (const flag of ['loading','busy','lock']) {
    const f=fixture();if(flag==='loading')f.context.n=false;else if(flag==='busy')f.context.c=true;else f.context.U.current=true;
    f.send({mascotVideoOption:'sol'});
    assert.equal(f.replies[0].message.ok,false);assert.equal(f.created.length,0);assert.equal(f.saved.length,0);
    assert.match(f.replies[0].message.error,flag==='loading'?/carregando/:/envio atual/);
  }
});

test('Sem campo novo mantém galeria antiga, callback compartilhado e escudo de brinde', () => {
  const f=fixture();f.send();assert.equal(f.gallery.length,1);assert.equal(f.created.length,0);
  assert.equal(f.gallery[0]('sol'),true);assert.equal(f.created[0].seed.mascot_video_option,'sol');
  f.context.U.current=true;assert.equal(f.gallery[0]('chuva'),false);assert.equal(f.saved.length,0);
  const gift=fixture();gift.send({productId:'escudo3d',gift:true});
  assert.deepEqual(gift.created,[{flow:'escudo3d',seed:{delivery_mode:'image',video_model:'',brinde_escudo_login:'1'}}]);
  assert.equal(gift.replies[0].message.ok,true);
});
