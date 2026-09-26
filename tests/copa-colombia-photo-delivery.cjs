const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app.html', 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/application\/ld\+json/i.test(match[1]))
  .map(match => match[2]).filter(source => source.trim());
for(const [index, source] of scripts.entries()) new vm.Script(source, { filename:`app.html script ${index + 1}` });

const helperStart = html.indexOf('function getCopaColombiaPhotoMode(');
const helperEnd = html.indexOf('function clearCleanPhotoRoleSelections(', helperStart);
const serializeStart = html.indexOf('function serializeCleanProductForm(');
const serializeEnd = html.indexOf('function appendCleanTextLegacy(', serializeStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && serializeStart >= 0 && serializeEnd > serializeStart);

let role = '';
const sandbox = {
  getCleanAssetRoles: () => role ? [role] : [],
  getCleanProductSchema: () => ({ fields:[] }),
  getCleanAssetFiles: () => [],
  productSupportsScenario: () => false,
  CLEAN_PRODUCT_SCHEMA_VERSION: 2,
  PRODUCTS: { proximo_jogo:{ price:7 }, resultado:{ price:8 } },
  formatCleanProductPrice: product => `R$${product.price},00`,
};
const api = vm.runInNewContext(`${html.slice(helperStart, helperEnd)}\n${html.slice(serializeStart, serializeEnd)}\n({ getCopaColombiaPhotoMode, updateCopaColombiaDeliveryUi, serializeCleanProductForm })`, sandbox);

for(const productKey of ['proximo_jogo', 'resultado']){
  const image = { checked:false };
  const videoLabel = { hidden:false };
  const video = { checked:true, disabled:false, closest:() => videoLabel };
  const price = { textContent:'' };
  const submit = { textContent:'' };
  const description = { value:'Leão com uniforme azul' };
  const form = {
    dataset:{ comissaoOrigem:'copacolombia', productForm:productKey },
    querySelector(selector){
      if(selector === '.copaChampionshipDelivery') return { querySelector:key => key.includes('image_video') ? video : image };
      if(selector.includes('image_video')) return video;
      if(selector === '.cleanProductPrice') return price;
      if(selector === '.cleanSubmitBtn') return submit;
      if(selector === '[data-copa-mascot-description]') return description;
      return null;
    },
  };

  role = '';
  video.checked = true;
  api.updateCopaColombiaDeliveryUi(form);
  assert.equal(video.disabled, false);
  assert.equal(videoLabel.hidden, false);
  const simpleOrder = api.serializeCleanProductForm(productKey, form);
  assert.equal(simpleOrder.fields.delivery_mode, 'image_video');
  assert.equal(simpleOrder.fields.match_photo_type, undefined);
  assert.equal(simpleOrder.fields.mascot_description, undefined);

  for(const currentRole of ['player_photo', 'team_photo']){
    role = currentRole;
    delete form.dataset.copaPhotoMode;
    video.checked = true;
    image.checked = false;
    api.updateCopaColombiaDeliveryUi(form);
    assert.equal(video.disabled, true);
    assert.equal(videoLabel.hidden, true);
    assert.equal(image.checked, true);
    const order = api.serializeCleanProductForm(productKey, form);
    assert.equal(order.fields.delivery_mode, 'image');
    assert.equal(order.fields.video_model, undefined);
  }

  role = 'mascot_photo';
  video.checked = true;
  api.updateCopaColombiaDeliveryUi(form);
  assert.equal(video.disabled, false);
  assert.equal(videoLabel.hidden, false);
  assert.equal(price.textContent, 'R$14,90');
  assert.equal(api.serializeCleanProductForm(productKey, form).fields.delivery_mode, 'image_video');

  role = '';
  form.dataset.copaPhotoMode = 'mascot_description';
  api.updateCopaColombiaDeliveryUi(form);
  const order = api.serializeCleanProductForm(productKey, form);
  assert.equal(order.fields.photo_mode, 'mascot_description');
  assert.equal(order.fields.mascot_description, 'Leão com uniforme azul');
  assert.equal(order.fields.match_photo_type, 'mascot_photo');
  assert.equal(order.fields.delivery_mode, 'image_video');
}
console.log('OK: Copa oferece vídeo com mascote ou sem foto; jogador e time são somente imagem');
