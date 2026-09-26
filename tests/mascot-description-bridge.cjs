const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app.html', 'utf8');
const start = html.indexOf('function omascoteChatBaseCleanOrder(');
const end = html.indexOf('function omascoteChatBuildCleanOrders(', start);
assert.ok(start >= 0 && end > start, 'ponte do chat encontrada');

const sandbox = {
  OMASCOTE_CHAT_IMAGE_ONLY_PRODUCTS: new Set(),
  CLEAN_PRODUCT_SCHEMA_VERSION: 2,
  omascoteChatSportContext: () => ({ sport: 'Handebol', individual: false, structuredScore: true, resultTitle: 'Resultado' }),
  splitCleanMatchupText: () => ({ home: 'Time A', away: 'Time B' }),
  omascoteChatSplitScore: () => ({ home_score: 2, away_score: 1 }),
  omascoteChatScenarioId: () => 'Cenário atual',
  omascoteChatAsset: () => ({ files: [] }),
  omascoteChatApplyMatchPhotoRole: () => {},
  omascoteChatLines: () => [],
};
const makeOrder = vm.runInNewContext(`${html.slice(start, end)}\nomascoteChatBaseCleanOrder`, sandbox);

for (const [product, values] of [
  ['proximo_jogo', { matchup: 'Time A x Time B' }],
  ['resultado', { score: 'Time A 2 x 1 Time B' }],
]) {
  const order = makeOrder(product, {
    ...values,
    photo_mode: 'Não tenho mascote',
    mascot_description: 'Leão de uniforme azul',
    delivery_mode: 'image_video',
  }, {});
  assert.equal(order.fields.photo_mode, 'mascot_description');
  assert.equal(order.fields.mascot_description, 'Leão de uniforme azul');
  assert.equal(order.fields.match_photo_type, 'mascot_photo');
  assert.equal(order.fields.delivery_mode, 'image_video');
  assert.equal(order.assets.match_photo.files.length, 0);
  assert.throws(() => makeOrder(product, { ...values, photo_mode: 'Não tenho mascote' }, {}), /Descreva qual animal/);
  const ordinary = makeOrder(product, { ...values, photo_mode: 'Sem foto' }, {});
  assert.equal(ordinary.fields.mascot_description, undefined);
}
console.log('OK: descrição do mascote chega ao pedido de ambos os produtos sem exigir foto');
