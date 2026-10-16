const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
function source(name) {
  const match = html.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, name);
  return match[0];
}

function element() {
  return {dataset:{}, style:{display:'none'}, classList:{add(){}}, removeAttribute(){}, closest:()=>null};
}

function resultHarness() {
  const elements = Object.fromEntries(['box', 'status', 'preview', 'image', 'video'].map(key => [key, element()]));
  const selectors = {'[data-clean-result-box]':'box', '[data-clean-result-status]':'status',
    '[data-clean-result-preview]':'preview', '[data-clean-result-download]':'image', '[data-clean-video-download]':'video'};
  const form = {querySelector:selector => elements[selectors[selector]] || null};
  const actions = [];
  const sandbox = {API_BASE:'https://api.example.test', registrarStatusDownloadPedido(){},
    restaurarImagemOriginalDoProduto(){}, exibirImagemFinalPedido(){},
    baixarPedido:id => actions.push(['image',id]), aprovarPedido:id => actions.push(['approve-image',id]),
    baixarVideoPedido:id => actions.push(['video',id]), aprovarEBaixarVideoPedido:id => actions.push(['approve-video',id])};
  vm.createContext(sandbox);
  vm.runInContext(['pedidoIncluiVideoPago','estadoEntregaVideoPedido','configurarAcaoDownloadPedido',
    'configurarAcaoDownloadVideoPedido','atualizarResultadoProntoClean'].map(source).join('\n'), sandbox);
  return {elements, form, actions, sandbox, update:data => sandbox.atualizarResultadoProntoClean('paid-order',form,data)};
}

const ready = {imagem_pronta:true,video_pronto:true,pagamento_pendente:false,
  video_generation:{requested:true,commercial:true,delivery_mode:'image_video',status:'ready'}};

test('pedido pronto reaberto oferece imagem e vídeo, com aprovação pelo formato escolhido', async () => {
  for(const approved of [false,true]) {
    const h=resultHarness();
    h.update({...ready,aprovado_cliente:approved});
    assert.equal(h.elements.box.style.display,'block');
    assert.equal(h.elements.image.style.display,'inline-block');
    assert.equal(h.elements.video.style.display,'inline-block');
    assert.equal(h.elements.video.textContent,'🎬 Baixar vídeo');
    await h.elements.video.onclick({preventDefault(){}});
    assert.deepEqual(h.actions,[[approved?'video':'approve-video','paid-order']]);
    assert.match(h.elements.status.textContent,/imagem e seu vídeo estão prontos/);
  }
});

test('pagamento pendente, imagem sem vídeo e vídeo ainda indisponível não liberam o MP4', () => {
  const unpaid=resultHarness();
  unpaid.update({...ready,pagamento_pendente:true});
  assert.equal(unpaid.elements.image.style.display,'none');
  assert.equal(unpaid.elements.video.style.display,'none');
  for(const data of [
    {imagem_pronta:true},
    {...ready,video_pronto:false,video_generation:{...ready.video_generation,status:'processing'}},
    {...ready,video_pronto:false,video_generation:{...ready.video_generation,status:'failed'}}
  ]) {
    const h=resultHarness();h.update(data);
    assert.equal(h.elements.image.style.display,'inline-block');
    assert.equal(h.elements.video.style.display,'none');
    assert.deepEqual(h.actions,[]);
  }
});

test('atualizações do histórico preservam a imagem final já exibida', () => {
  const h=resultHarness();h.update({...ready,aprovado_cliente:true});
  h.elements.preview.src='blob:final-image';
  h.update({...ready,aprovado_cliente:true});
  assert.equal(h.elements.preview.src,'blob:final-image');
});

test('a reabertura acompanha o vídeo pendente até liberar o download', async () => {
  const h=resultHarness();const timers=[];let queries=0;
  Object.assign(h.sandbox,{token:'local-test',cleanProductResultWatchers:new Map(),
    finalizarProgressoNoProduto(){},atualizarPedidoCopaColombiaLocal(){},ia4TratarAuthInvalida:()=>'',
    ia4LerJsonSeguro:r=>r,clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;},
    fetch:async()=>({ok:true,...ready,video_pronto:++queries > 1})});
  vm.runInContext(source('acompanharResultadoClean'),h.sandbox);
  await h.sandbox.acompanharResultadoClean('paid-order',h.form);
  assert.equal(h.elements.video.style.display,'none');
  assert.equal(timers.length,1);
  await timers.shift()();
  assert.equal(queries,2);
  assert.equal(h.elements.video.style.display,'inline-block');
  assert.equal(h.sandbox.cleanProductResultWatchers.size,0);
});

test('restaurar um pedido ativo já pronto recupera os botões sem reiniciar a consulta', () => {
  const form={};const calls=[];
  const sandbox={
    limparPedidosAtivosAntigos(){},listarPedidosAtivosLocal:()=>[{pedido_id:'paid-order',product_id:'proximo_jogo'}],
    getCleanProductPickerSelectedRaw:()=>'',getPedidosBaixados:()=>[],getCleanProductFormByProductId:()=>form,
    selectCleanProductForPicker(){},atualizarPedidoCopaColombiaLocal(){},getCleanProductImageFromForm:()=>null,
    finalizarProgressoNoProduto(){},atualizarResultadoProntoClean:(...args)=>calls.push(args),
    acompanharResultadoClean:()=>{throw Error('pedido pronto não deve reiniciar a consulta');},
    removerPedidoAtivoLocal(){},cleanProductProgressTimers:new WeakMap()
  };
  vm.createContext(sandbox);vm.runInContext(source('restaurarPedidosAtivos'),sandbox);
  const order={id:'paid-order',...ready};sandbox.restaurarPedidosAtivos([order]);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'paid-order');assert.equal(calls[0][1],form);
  assert.equal(calls[0][2],order);
});

function copaHarness(records, product='proximo_jogo', account='account-a') {
  const queries=[];
  const sandbox={chaveContaMapaCopaColombia:()=>account,
    localStorage:{getItem:key => records[key]||null},
    acompanharResultadoClean:(id,form)=>{queries.push({id,form});return Promise.resolve();}};
  vm.createContext(sandbox);vm.runInContext(source('restaurarEntregaPedidoCopaColombia'),sandbox);
  const form={dataset:{comissaoOrigem:'copacolombia',comissaoJogoId:'j24',productForm:product}};
  return {queries,form,restore:()=>sandbox.restaurarEntregaPedidoCopaColombia(form)};
}

test('Copa recupera o pedido salvo da conta e do produto, mesmo após baixar a imagem', () => {
  const records={'account-a':JSON.stringify({
    'j24:proximo_jogo':{pedido_id:'paid-video-order',produto:'proximo_jogo',status:'pronto'},
    'j24:resultado':{pedido_id:'result-order',produto:'resultado',status:'pronto'}
  })};
  for(const [product,id] of [['proximo_jogo','paid-video-order'],['resultado','result-order']]) {
    const h=copaHarness(records,product);
    assert.equal(h.restore(),true);assert.equal(h.queries.length,1);assert.equal(h.queries[0].id,id);
  }
  const otherAccount=copaHarness(records,'proximo_jogo','account-b');
  assert.equal(otherAccount.restore(),false);assert.equal(otherAccount.queries.length,0);
});

test('Copa ignora registros inválidos e não mistura o resultado com o flyer antigo', () => {
  for(const value of ['{',JSON.stringify({'j24:proximo_jogo':{pedido_id:'../other'}}),
    JSON.stringify({'j24:proximo_jogo':{pedido_id:'other',produto:'resultado'}})]) {
    const h=copaHarness({'account-a':value});assert.equal(h.restore(),false);assert.equal(h.queries.length,0);
  }
  const records={'account-a':JSON.stringify({j24:{pedido_id:'legacy-flyer'}})};
  assert.equal(copaHarness(records).restore(),true);
  assert.equal(copaHarness(records,'resultado').restore(),false);
});
