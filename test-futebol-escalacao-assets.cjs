'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'app.html'),'utf8');
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'atendimento/futebol-batch-campaign.json'),'utf8'))
  .filter(row=>/^E[12]-[AB]$/.test(row.id));
assert.equal(rows.length,4);
function section(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert(a>=0&&b>a,'Missing app implementation: '+start);
  return html.slice(a,b);
}
const window={};
const context={window,File,FormData,ArrayBuffer,Date,
  PRODUCTS:{escalacao:{mode:'flyer',flyerTipo:'zz1fs',title:'Escalação',price:20}},
  RESULTADO_SCENARIO_CURRENT_ID:'resultado_atual_v1',
  appendIa4AccessContext(){},
  getSavedEscudo1File(){throw Error('Saved crest must not supply a batch asset');},
  fetch(){throw Error('This regression test must never contact an API');},
  integratedChatFrame:{contentWindow:{OmascoteFutebol:{selection(order,rank,id){
    const row=rows.find(row=>row.id===id);assert(row);assert.equal(order.product_id,'escalacao');
    return {id,cents:row.cents};
  }}}}};
vm.createContext(context);
vm.runInContext(section('const SCENARIO_SUPPORTED_PRODUCT_IDS','function getProductScenarioById'),context);
vm.runInContext(section('const CLEAN_PRODUCT_SCHEMA_VERSION','function isCleanCouponField'),context);
vm.runInContext(section('function appendCleanTextLegacy','function getIa4AccessContext'),context);
vm.runInContext(section('function omascoteChatLines','function omascoteChatClientRequestId'),context);
vm.runInContext(section('function buildLegacyFormDataFromClean','function buildEscudo3dLegacyFormData'),context);

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8HkAAAAASUVORK5CYII=','base64');
const image=name=>new File([png],name,{type:'image/png'});
for(const row of rows){
  const grouped=Object.fromEntries(Object.entries(row.arquivos).map(([key,names])=>[key,names.map(image)]));
  const [item]=context.omascoteChatBuildCleanOrders({flow:row.flow,values:row.values},[],grouped);
  const fd=context.buildLegacyFormDataFromClean(item.productKey,item.order,{allowSavedEscudoFallback:false});
  const fields=JSON.parse(fd.get('fields_json'));
  assert.equal(fd.get('product_id'),'escalacao');assert.equal(fd.get('flyer_tipo'),'zz1fs');
  assert.equal(fields.futebol_scene,row.id);assert.equal(fields.delivery_mode,'image_video');
  assert.equal(fields.video_model,'omni');assert.equal(fields.futebol_price_cents,row.cents);
  assert.equal(fields.players.length,7);assert.equal(fd.get('time_principal'),'Morro Alto');
  assert.equal(fd.get('time_adversario'),'Vila do Cedro');
  for(const [legacy,field]of [['escudo1','home_crest'],['escudo2','away_crest']]){
    const files=fd.getAll(legacy);assert.equal(files.length,1,row.id+' '+legacy);
    assert.equal(files[0].name,row.arquivos[field][0]);assert(files[0].size>0);
    assert.equal(files[0].type,'image/png');
  }
  assert.equal(fd.getAll('mascote').length,row.id.startsWith('E1')?1:0);
  const native={...grouped,team_crest:[image('native-home.png')],opponent_crest:[image('native-away.png')]};
  const nativeOrder=context.omascoteChatBaseCleanOrder('escalacao',row.values,native);
  const nativePayload=context.buildLegacyFormDataFromClean('escalacao',nativeOrder,{allowSavedEscudoFallback:false});
  assert.equal(nativePayload.get('escudo1').name,'native-home.png');
  assert.equal(nativePayload.get('escudo2').name,'native-away.png');
}
const absent=context.omascoteChatBaseCleanOrder('escalacao',rows[0].values,{});
assert.equal(absent.assets.team_crest.files.length,0);assert.equal(absent.assets.opponent_crest.files.length,0);
console.log('PASS: all4E scenes retain both crest files in the actual API FormData; scene/price/players/photos stay intact; native channels take precedence; no saved crest or network.');
