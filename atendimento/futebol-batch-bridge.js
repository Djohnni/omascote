(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('futebol_batch_bridge') !== '1') return;
  let verifiedToken = '', verifiedAt = 0, account;
  async function session(force = false) {
    const current = localStorage.getItem('omascote_token') || '';
    if (!current) throw new Error('Entre na conta administradora pelo site.');
    if (force || current !== verifiedToken || Date.now() - verifiedAt > 30000) {
      token = current;
      const response = await fetch(API_BASE + '/me', {headers:buildOrderCreationHeaders(),cache:'no-store'});
      const data = await ia4LerJsonSeguro(response);
      if (!response.ok || data.ok !== true || data.tester_bonus_admin !== true || !data.perfil_id) {
        verifiedToken = ''; throw new Error('Esta página exige uma conta administradora autenticada.');
      }
      account = {id:String(data.perfil_id),saldo:Number(data.saldo || 0)};
      verifiedToken = current; verifiedAt = Date.now();
    }
    carregarAtendimentoIntegrado();
    const deadline = Date.now() + 25000;
    while (!integratedChatFrame.contentWindow?.OmascoteFutebol) {
      if (Date.now() > deadline) throw new Error('O formulário do site não carregou. Atualize a página.');
      await new Promise(resolve => setTimeout(resolve,150));
    }
    if (!await integratedChatFrame.contentWindow.OmascoteFutebol.load()) throw new Error('Galeria indisponível para esta conta.');
    return account;
  }
  async function prepare(entry,records,requestId,coupon) {
    await session();
    if (!/^futebol_lote_[a-f0-9]{48}$/.test(requestId)) throw new Error('Chave de retomada inválida.');
    const draft = {id:requestId,flow:entry.flow,values:{...entry.values,coupon_code:coupon || ''}};
    const localRecords=records.map(record=>({...record,bytes:new Uint8Array(record.bytes).slice().buffer}));
    const prepared = omascoteChatBuildCleanOrders(draft,localRecords).map((item,index) => ({...item,
      chatDraftId:requestId,chatOrderIndex:index,clientRequestId:requestId}));
    if (prepared.length !== 1 || prepared[0].order.fields.futebol_scene !== entry.id) throw new Error('Cena e pedido não correspondem.');
    return prepared;
  }
  window.OmascoteAdminBatch = {
    session,prepare,
    async submit(prepared) {await session(); return omascoteChatSubmitPreparedOrders(prepared,{adminBatch:true});},
    async lookup(key) {await session(); return consultarPedidoPorClientRequestId(key);},
    async info(id) {
      await session();
      const response = await fetch(API_BASE+'/pedidos/'+encodeURIComponent(id)+'/info', {headers:buildOrderCreationHeaders(),cache:'no-store'});
      const data = await ia4LerJsonSeguro(response);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível consultar o pedido.');
      return data;
    },
    async quote(prepared,coupon) {
      await session();
      const item = prepared[0],counts = {};
      for (const asset of Object.values(item.order.assets)) if (asset.legacyName) counts[asset.legacyName]=(counts[asset.legacyName]||0)+asset.files.length;
      const response = await fetch(API_BASE+'/cupons/preco', {method:'POST',headers:{...buildOrderCreationHeaders(),'Content-Type':'application/json'},
        body:JSON.stringify({product_id:item.productKey,cupom_codigo:coupon || '',fields_json:item.order.fields,
          futebol_upload_counts:{mascote:counts.mascote||0,patrocinadores:counts.patrocinadores||0}})});
      const data = await ia4LerJsonSeguro(response);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível conferir o preço na API.');
      return data;
    }
  };
})();
