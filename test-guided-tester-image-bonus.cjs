// Checkout-only allowance presentation; these tests never reserve quota or create orders.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const origin = 'https://omascote.example';
const grant = (remaining=5, extra={}) => ({granted:true,active:true,limit:5,remaining,...extra});
function fixture(initial=grant()) {
  const listeners = new Map();
  const parent = {location:{origin},omascoteTesterAccount:{tester_image_bonus:initial},postMessage() {},
    OmascoteMascotExamples:{options:[{id:'sol',name:'Sol',price:25,orderEnabled:true},{id:'chuva',name:'Chuva',price:28,orderEnabled:true}],open() {}}};
  const window = {parent,addEventListener(type,listener) {listeners.set(type,listener);},removeEventListener() {}};
  const context = vm.createContext({window,location:{origin},document:{body:{dataset:{productView:'product'}}},requestAnimationFrame:callback=>callback(),Intl});
  for (const file of ['tester-image-bonus.js','guided-products.js','guided-mascot.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'atendimento',file),'utf8'),context,{filename:file});
  }
  return {window,parent,helper:window.OmascoteTesterImageBonus,message(summary, overrides={}) {
    listeners.get('message')({source:parent,origin,data:{type:'omascote-chat:tester-bonus',summary},...overrides});
  }};
}
function ReactFinal(kind) {
  let stateIndex = 0;
  return {Fragment:'fragment',createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial) {const index=stateIndex++;return [index===2 ? kind==='mascot'?3:'final' : typeof initial==='function'?initial():initial,()=>{}];},
    useEffect() {},useRef:()=>({current:null}),isValidElement:node=>Boolean(node&&typeof node==='object'&&'type' in node),
    Children:{toArray:children=>(Array.isArray(children)?children:[children]).filter(Boolean),map:(children,callback)=>(Array.isArray(children)?children:[children]).map(callback)},
    cloneElement:(node,props,children)=>({...node,props:{...node.props,...props,children}})};
}
function renderedText(f, flow, values={}) {
  const kind=flow==='mascote_uniforme'?'mascot':'product';
  const props={react:ReactFinal(kind),integrated:true,draft:{id:'draft-'+flow,flow,values,files:[],stage:'collect'},
    product:{name:'Produto',priceLabel:flow==='mascote_uniforme'?'R$ 18,00':'R$ 4,00'},fields:[],busy:false,
    canVideo:true,videoPrice:'R$ 14,90',validate:()=>[],renderField:()=>null,changeField() {},submit() {}};
  const tree=(kind==='mascot'?f.window.OmascoteGuidedMascot:f.window.OmascoteGuidedProducts).Form(props);
  function text(node) {return node===null||node===undefined||typeof node==='boolean'?'':typeof node==='string'?node:Array.isArray(node)?node.map(text).join(' '):text(node.props?.children);}
  return text(tree);
}

test('trusted parent bootstrap supplies checkout allowance, without changing the catalog',()=>{
  const f=fixture();
  assert.equal(f.helper.getSummary().remaining,5);
  assert.equal(f.helper.eligibleImage('mascote_uniforme',{values:{delivery_mode:'image'}}),true);
  assert.equal(f.helper.imagePriceLabel({productId:'mascote_uniforme',draft:{values:{}},regularLabel:'R$ 18,00'}),'Incluída no bônus');
});
test('messages require both the parent source and the same origin',()=>{
  const f=fixture();
  f.message(grant(1),{source:{}});assert.equal(f.helper.getSummary().remaining,5);
  f.message(grant(1),{origin:'https://outside.example'});assert.equal(f.helper.getSummary().remaining,5);
  f.message(grant(1),{data:{type:'other',summary:grant(1)}});assert.equal(f.helper.getSummary().remaining,5);
  f.message(grant(1));assert.equal(f.helper.getSummary().remaining,1);
  f.message(null);assert.equal(f.helper.getSummary(),null);
});
test('subscribers receive current summary and can unsubscribe',()=>{
  const f=fixture();const values=[];const stop=f.helper.subscribe(value=>values.push(value?.remaining??null));
  f.message(grant(4));stop();f.message(grant(3));assert.deepEqual(values,[5,4]);
});
test('inactive, exhausted and malformed grants never advertise covered images',()=>{
  for(const value of [null,{},grant(0),grant(5,{active:false}),grant(5,{active:undefined}),grant(5,{granted:false}),grant(6),grant(-1),grant(1.5),grant(5,{limit:6})]) {
    const f=fixture(value);assert.equal(f.helper.eligibleImage('escudo3d',{values:{delivery_mode:'image'}}),false);
  }
});
test('each approved image product can use the allowance; unknown products cannot',()=>{
  const f=fixture();
  for(const product of ['resultado','escalacao','contratacao','proximo_jogo','patrocinador','escudo3d','proximo_jogo_jogador','resultado_jogo_jogador','jogador_escudo','mascote_uniforme']) {
    assert.equal(f.helper.eligibleImage(product,{values:{delivery_mode:'image'}}),true,product);
  }
  assert.equal(f.helper.eligibleImage('future_product',{values:{delivery_mode:'image'}}),false);
});
test('video modes, models and request flags keep the normal checkout price',()=>{
  const f=fixture();
  for(const values of [{delivery_mode:'image_video'},{delivery_mode:'Imagem + vídeo'},{delivery_mode:'video'},{video_model:'omni'},
    {mascot_video_option:'chuva'},{include_video:'sim'},{video_requested:1},{internal_test:true},{video_generation:{requested:true}}]) {
    assert.equal(f.helper.eligibleImage('mascote_uniforme',{values}),false,JSON.stringify(values));
  }
  assert.equal(f.helper.eligibleImage('mascote_uniforme',{values:{delivery_mode:'image'}},{deliveryMode:'image_video'}),false);
});
test('paid shirt additions are excluded but an optional mascot uniform is not an addon',()=>{
  const f=fixture();
  assert.equal(f.helper.eligibleImage('contratacao',{values:{jersey_enabled:'1'}}),false);
  assert.equal(f.helper.eligibleImage('contratacao',{values:{players:'João | Goleiro | Contratado | Sim'}}),false);
  assert.equal(f.helper.eligibleImage('contratacao',{values:{players:'João | Goleiro | Contratado | Não'}}),true);
  assert.equal(f.helper.eligibleImage('mascote_uniforme',{values:{uniform_image:'reference'}}),true);
});
test('coupon presence does not stack a discount or hide an available image allowance',()=>{
  const f=fixture();assert.equal(f.helper.imagePriceLabel({productId:'escudo3d',draft:{values:{coupon_code:'PROMO'}},regularLabel:'R$ 4,00'}),'Incluída no bônus');
});
test('a mixed-size athlete batch does not claim that every image is covered',()=>{
  const f=fixture(grant(1));
  const draft={values:{players:'João | Goleiro | Contratado | Não\nJosé | Atacante | Contratado | Não'}};
  assert.equal(f.helper.imagePriceLabel({productId:'contratacao',draft,regularLabel:'R$ 7,80'}),'Bônus para 1 de 2 imagens; demais com cobrança normal');
});
test('three players with the Gmail allowance show the paid total before submission',()=>{
  const f=fixture(grant(2,{limit:2}));
  const draft={id:'three',flow:'jogador_escudo',values:{players:'A\nB\nC'}};
  assert.match(f.helper.imagePriceLabel({productId:draft.flow,draft,unitPrice:6}),/2 grátis \+ 1 paga.*R\$\s*6,00/);
  f.helper.recordReviewed(draft,'image');
  assert.equal(f.helper.reviewedFreeCount('three'),2);
  f.message(grant(0,{limit:2}));
  assert.equal(f.helper.reviewedFreeCount('three'),2);
  f.helper.recordReviewed(draft,'image_video');
  assert.equal(f.helper.reviewedFreeCount('three'),0);
});

test('guided mascot final summary shows the benefit only for its static image',()=>{
  const f=fixture();
  assert.match(renderedText(f,'mascote_uniforme',{delivery_mode:'image'}),/Incluída no bônus/);
  const video=renderedText(f,'mascote_uniforme',{delivery_mode:'image_video',mascot_video_option:'sol'});
  assert.match(video,/25,00/);assert.doesNotMatch(video,/Incluída no bônus/);
});
test('guided product summaries preserve video pricing and stop promising a sixth free shield',()=>{
  const f=fixture();
  assert.match(renderedText(f,'escudo3d',{delivery_mode:'image'}),/Incluída no bônus/);
  const video=renderedText(f,'escudo3d',{delivery_mode:'image_video',video_model:'omni'});
  assert.match(video,/19,90/);assert.doesNotMatch(video,/Incluída no bônus/);
  f.message(grant(0));
  const exhausted=renderedText(f,'escudo3d',{delivery_mode:'image',brinde_escudo_login:'1'});
  assert.match(exhausted,/R\$ 4,00/);assert.doesNotMatch(exhausted,/Grátis|Sem pagamento|Incluída no bônus/);
});
