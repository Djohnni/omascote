// Offline contract tests. No browser, network, order, payment or generation is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('app.html');
const optionScope = {window:{}};
vm.runInNewContext(read('mascot-video-options.js'), optionScope);
const options = optionScope.window.OmascoteMascotVideoOptions;

function extract(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, startText);
  return html.slice(start, end);
}
const sandbox = {
  OMASCOTE_CHAT_IMAGE_ONLY_PRODUCTS: new Set(['contratacao','proximo_jogo_jogador','resultado_jogo_jogador']),
  CLEAN_PRODUCT_SCHEMA_VERSION: 2,
  PRODUCTS: {mascote_uniforme:{title:'Mascote do Time',flyerTipo:'mascote_uniforme'}},
  FormData,
  omascoteChatSportContext: values => ({sport:values.sport || 'Futebol'}),
  omascoteChatScenarioId: (product, value) => value || `${product}_atual_v1`,
  omascoteChatAsset: (files, field, legacyName) => ({files:files[field] || [],legacyName}),
  getCleanProductSchema: () => ({fields:[],legacyDefaults:{}}),
  appendCleanTextLegacy: (fd, key, value) => fd.append(key, value),
  appendIa4AccessContext: () => {}
};
vm.createContext(sandbox);
vm.runInContext(extract('function omascoteChatBaseCleanOrder(', 'function omascoteChatBuildCleanOrders('), sandbox);
vm.runInContext(extract('function buildLegacyFormDataFromClean(', 'function buildEscudo3dLegacyFormData('), sandbox);

test('As três opções habilitadas têm nomes, preços e mídia próprios', () => {
  assert.deepEqual(Array.from(options, option => [option.id,option.name,option.price]), [
    ['sol','Sol',25], ['chuva','Chuva',28], ['ascensao_epica','Ascensão Épica',28]
  ]);
  for (const option of options) {
    assert.equal(option.orderEnabled, true);
    assert.match(option.videoSrc, /^\/media\/mascote\/exemplo-.+-10s-20261007\.mp4$/);
    assert.match(option.posterSrc, /^\/media\/mascote\/capa-.+-10s-20261007\.webp$/);
  }
  assert.equal(new Set(options.map(option=>option.videoSrc)).size, 3);
});

test('Cada escolha chega ao fields_json de cobrança com modelo Omni e sem texto personalizado', () => {
  for (const option of options) {
    const order = sandbox.omascoteChatBaseCleanOrder('mascote_uniforme', {
      mascot_animal:'Leão',sport:'Futebol',delivery_mode:'image_video',video_model:'fast',
      mascot_video_option:option.id,mascot_video_text:'Mensagem de um rascunho antigo'
    }, {});
    const fd = sandbox.buildLegacyFormDataFromClean('mascote_uniforme',order,{allowSavedEscudoFallback:false});
    const fields = JSON.parse(fd.get('fields_json'));
    assert.equal(fd.get('product_id'),'mascote_uniforme');
    assert.equal(fields.mascot_video_option,option.id);
    assert.equal(fields.video_model,'omni');
    assert.equal(fields.delivery_mode,'image_video');
    assert.equal(fields.mascot_animal,'Leão');
    assert.equal(fields.mascot_video_text,undefined);
  }
});

test('Escolhas removidas ou desconhecidas são rejeitadas antes de cobrança', () => {
  for (const mascot_video_option of ['escrita_personalizada','desconhecido']) {
    assert.throws(()=>sandbox.omascoteChatBaseCleanOrder('mascote_uniforme',{
      delivery_mode:'image_video',mascot_video_option
    },{}),/opções de vídeo disponíveis/);
  }
});

test('Somente imagem descarta a opção de vídeo salva sem alterar outros produtos', () => {
  const image = sandbox.omascoteChatBaseCleanOrder('mascote_uniforme', {
    delivery_mode:'image',mascot_video_option:'ascensao_epica',mascot_animal:'Leão'
  },{});
  assert.equal(image.fields.delivery_mode,'image');
  assert.equal(image.fields.video_model,'');
  assert.equal(image.fields.mascot_video_option,undefined);
  const sponsor = sandbox.omascoteChatBaseCleanOrder('patrocinador', {
    delivery_mode:'image_video',video_model:'fast',mascot_video_option:'ascensao_epica'
  },{});
  assert.equal(sponsor.fields.video_model,'fast');
  assert.equal(sponsor.fields.mascot_video_option,undefined);
});

function renderFinal(option) {
  const location = {origin:'https://local.test'};
  const window = {
    parent:{location,OmascoteMascotExamples:{options}},
    OmascoteGuidedProducts:{visibleFields:fields=>fields,PurchaseSafety:()=>null}
  };
  const scope = {window,location,document:{body:{dataset:{productView:'product'}}}};
  vm.runInNewContext(read('atendimento/guided-mascot.js'),scope);
  let stateIndex = 0;
  const React = {
    createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
    useState:initial=>[stateIndex++ === 1 ? 3 : typeof initial === 'function' ? initial() : initial,()=>{}],
    useRef:()=>({current:null}), useEffect:()=>{}, Fragment:'Fragment'
  };
  return window.OmascoteGuidedMascot.Form({
    react:React,integrated:true,busy:false,canVideo:true,fields:[],
    draft:{id:`draft-${option.id}`,flow:'mascote_uniforme',stage:'collect',files:[],
      values:{mascot_animal:'Leão',sport:'Futebol',delivery_mode:'image_video',mascot_video_option:option.id}},
    product:{priceLabel:'R$ 18,00'},validate:()=>[]
  });
}
function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node,...(node.children||[]).flatMap(descendants)];
}
function textContent(node) {
  if (node == null || node === false) return '';
  return typeof node === 'object' ? (node.children||[]).map(textContent).join('') : String(node);
}

test('Finalizar habilita todas as opções e não pede escrita para Ascensão Épica', () => {
  for (const option of options) {
    const tree = renderFinal(option);
    const nodes = descendants(tree);
    const send = nodes.find(node=>node.type==='button' && node.props['aria-label']==='Enviar pedido');
    assert.ok(send,option.id);
    assert.equal(send.props.disabled,false,option.id);
    assert.equal(nodes.some(node=>node.type==='textarea'),false,option.id);
    assert.ok(textContent(tree).includes(`Imagem + vídeo · ${option.name}`));
    assert.ok(textContent(tree).includes(`${option.price},00`));
  }
});
