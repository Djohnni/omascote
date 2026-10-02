const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let clock = 1000, refresh;
const listeners = {}, docListeners = {}, google = [], internal = [];
const nodes = new Map();
function node(id, hidden = true) {
  const classes = new Set();
  const element = {hidden,style:{display:'none'},classList:{contains:key => classes.has(key)},
    getClientRects:() => element.hidden ? [] : [{}],classes};
  nodes.set(id,element);
  return element;
}
const home = node('vitrineHome',false), frame = node('integratedChatFrame',false);
frame.contentWindow = {};
for (const id of ['pixQrModal','authVisitanteModal','authCriarContaBtn','weeklyPlansModal','saldoMenu',
  'menuPedidosTopo','accountMenuPanel','escudo3dExamples']) node(id);
const location = {origin:'https://omascote.com.br',href:'https://omascote.com.br/app.html?utm_id=120250628532270466&utm_source=ig'};
const document = {body:{dataset:{page:'home',vitrine:'true'}},visibilityState:'visible',
  getElementById:id => nodes.get(id),addEventListener:(name,fn) => {docListeners[name]=fn;}};
const window = {addEventListener:(name,fn) => {listeners[name]=fn;},
  ia4Evento:(name,params) => internal.push({name,params}),
  gtag:(command,name,params) => google.push({command,name,params})};
vm.runInNewContext(fs.readFileSync(__dirname+'/analytics-tabs.js','utf8'),{
  document,window,location,URL,Date:{now:() => clock},MutationObserver:class {constructor(fn){refresh=fn;} observe(){}},
});
assert.equal(internal[0].params.aba_id,'inicio');
assert.equal(google.length,0,'early visits wait for Google configuration');
window.OmascoteAnalyticsReady = true;
listeners['omascote:analytics-ready']();
assert.equal(google[0].name,'aba_visitada');
assert.equal(google.filter(event => event.name === 'page_view').length,0,'initial automatic page_view is never duplicated');
function message(data,source = frame.contentWindow,origin = location.origin) {listeners.message({data,source,origin});}
const mascot = {type:'omascote-chat:guided-stage',active:true,productId:'mascote_uniforme',stageKey:'mascot',step:1,total:4,
  answer:'PRIVATE ANSWER',files:['PRIVATE FILE'],password:'PRIVATE PASSWORD'};
message(mascot);
assert.equal(internal.length,1,'hidden iframe forms do not count as visits');
home.hidden=true;
message(mascot,{},location.origin);
message(mascot,frame.contentWindow,'https://untrusted.example');
assert.equal(internal.length,1,'only the actual same-origin chat iframe can report navigation');
message(mascot);
message({...mascot});
assert.equal(internal.filter(event => event.name === 'aba_visitada').length,2,'effect rerenders do not duplicate visits');
let view = google.find(event => event.name === 'page_view');
assert.equal(new URL(view.params.page_location).searchParams.get('utm_id'),'120250628532270466','ad attribution survives virtual views');
assert.equal(location.href.includes('#'),false,'measurement never navigates the customer');
clock+=2000;
document.visibilityState='hidden'; docListeners.visibilitychange(); clock+=50000;
document.visibilityState='visible'; docListeners.visibilitychange(); clock+=1000;
message({...mascot,stageKey:'crest',step:2});
assert.equal(internal.filter(event => event.name === 'aba_tempo').at(-1).params.tempo_ativo_seg,3,'background time is excluded');
message({type:'omascote-chat:analytics-blocked',productId:'mascote_uniforme',action:'continuar',error:'PRIVATE ERROR'});
assert.equal(internal.at(-1).params.aba_id,'mascote_uniforme/crest','blocking is assigned to the current form tab');
const auth = nodes.get('authVisitanteModal'), create = nodes.get('authCriarContaBtn');
auth.hidden=false; auth.classes.add('open'); refresh();
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'login');
create.style.display='block';refresh();
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'cadastro');
const pix = nodes.get('pixQrModal'); pix.hidden=false; pix.classes.add('open');refresh();
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'pix');
auth.classes.delete('open');pix.classes.delete('open');refresh();
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'mascote_uniforme/crest','closing an overlay restores the actual form tab');
message({...mascot,stageKey:'PRIVATE UNKNOWN STAGE',step:3});
message({...mascot,productId:'__proto__'});
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'mascote_uniforme/crest','unrecognized metadata is rejected');
message({type:'omascote-chat:analytics-screen',screen:'catalogo'});
message({type:'omascote-chat:analytics-screen',screen:'formulario'});
assert.equal(internal.filter(event => event.name === 'aba_visitada').at(-1).params.aba_id,'mascote_uniforme/crest','closing the catalog restores the saved tab');
listeners.pagehide(); listeners.pagehide();
assert.equal(internal.filter(event => event.name === 'aba_ultima').length,1,'departure reports the last tab once');
assert.equal(internal.at(-1).params.aba_id,'mascote_uniforme/crest');
assert.equal(JSON.stringify({internal,google}).includes('PRIVATE'),false,'no customer values, files, errors or credentials leave the form');
console.log('OK: actual screens, trusted bridge, no duplicate views, ad attribution, visible time, validation blocks, overlays, last tab and privacy');
