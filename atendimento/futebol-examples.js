(() => {
  'use strict';
  const products = new Set(['proximo_jogo','resultado','proximo_jogo_jogador','resultado_jogo_jogador',
    'jogador_escudo','escalacao','contratacao','patrocinador']);
  const money = cents => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const sorted = row => [...row.options].sort((a,b) => a.cents-b.cents);
  let catalog, pilot, dialog, request, lastToken;

  async function load() {
    const token = localStorage.getItem('omascote_token') || '';
    if (!request || token !== lastToken) {
      lastToken = token;
      const base = window.parent.OMASCOTE_API_BASE_RESOLVED || 'https://api.omascote.com.br';
      request = fetch(base + '/catalogo/futebol-videos', {headers:token ? {Authorization:'Bearer '+token} : {},
        cache:'no-store', signal:AbortSignal.timeout(6500)}).then(async response => {
        if (!response.ok) throw new Error('Galeria indisponível.');
        const data = await response.json();
        catalog = window.createFutebolCatalog(data.catalog);
        pilot = data.pilot;
        return data.available;
      }).catch(() => {request = null; return false;});
    }
    return request;
  }
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  function choice(label, act) {
    const b = element('button',label);
    b.type = 'button';
    b.onclick = act;
    return b;
  }
  function selection(order, rank, sceneId) {
    if (!catalog) throw new Error('Reabra o produto para conferir os modelos disponíveis.');
    const uploads = {};
    for (const asset of Object.values(order.assets)) {
      if (asset.legacyName && asset.files?.length) (uploads[asset.legacyName] ||= []).push(...asset.files);
    }
    const product = order.product_id;
    const {kind} = catalog.details(product, order.fields, uploads);
    const row = catalog.catalog.find(item => item.product === product && item.kind === kind);
    if (!row) throw new Error('Confira os arquivos e o tipo da arte.');
    const option = sceneId ? row.options.find(item => item.id === sceneId) : sorted(row)[rank];
    if (sceneId && !option) throw new Error('Os dados ou fotos não correspondem à cena escolhida. Reabra a galeria para escolher a versão correta.');
    if (!option) throw new Error('Confira o modelo de vídeo.');
    const fields = {...order.fields, futebol_scene:option.id};
    return {...option, cents:catalog.quote(product,fields,uploads)};
  }
  async function open(product, info, done) {
    if (!await load()) { done({}); return; }
    const rows = catalog.catalog.filter(row => row.product === product);
    if (!rows.length) { done({}); return; }
    dialog?.close();
    const box = element('dialog'); dialog = box; box.className = 'futebol-models';
    document.body.append(box);
    box.addEventListener('close', () => box.remove(), {once:true});
    const finish = seed => {box.close(); done(seed);};
    const heading = element('h2',info.name); box.append(heading);
    const close = choice('Fechar',() => box.close()); close.className='fechar'; box.append(close);
    const select = element('select');
    if (rows.length > 1) {
      const label = element('label','Escolha a versão da arte'); label.append(select); box.append(label);
      for (const row of rows) {
        const opt = element('option',row.title); opt.value=row.code; select.append(opt);
      }
    }
    const cards = element('div'); cards.className='modelos'; box.append(cards);
    const draw = () => {
      const row = rows.find(r => r.code === select.value) || rows[0];
      const picks = sorted(row); cards.replaceChildren();
      const photo = {mask:'Mascote',desc:'Não tenho mascote',person:'Jogador',team:'Time',bare:'Sem foto'};
      const seed = {sport:'Futebol', futebol_version:row.code,
        ...(photo[row.kind] && ['proximo_jogo','resultado'].includes(product) ? {photo_mode:photo[row.kind]} : {}),
        ...(product === 'contratacao' ? {announcement:row.kind === 'renew' ? 'Renovado' : 'Contratado'} : {})};
      const imagePrice = window.OmascoteTesterImageBonus?.imagePriceLabel({productId:product,
        deliveryMode:'image',unitPrice:info.price,regularLabel:info.priceLabel}) || info.priceLabel;
      const base = '/atendimento/exemplos-futebol/';
      const image = element('img'); image.src=pilot ? info.image : base+row.code+'.jpg'; image.alt=row.title;
      const first=element('article'); first.append(image,element('h3','Somente imagem'),
        element('p',imagePrice),choice('Escolher imagem',() => finish({...seed,futebol_gallery:'image',delivery_mode:'image'})));
      cards.append(first);
      picks.forEach((option,rank) => {
        const card = element('article');
        if (!pilot) {
          const video = element('video'); video.controls=true; video.playsInline=true; video.preload='metadata';
          video.src=base+option.id+'.mp4'; video.setAttribute('aria-label',option.title); card.append(video);
        }
        card.append(element('h3',option.title),element('p','Imagem + vídeo · 10 s · 360p'),
          element('strong','A partir de '+money(option.cents)),choice('Escolher vídeo',() =>
            finish({...seed,futebol_gallery:'video',futebol_rank:String(rank),futebol_scene:option.id,delivery_mode:'image_video',video_model:'omni'})));
        cards.append(card);
      });
    };
    select.onchange=draw; draw();
    box.append(choice('Outro esporte',() => finish({})));
    box.showModal();
  }
  window.OmascoteFutebol = {supports:id => products.has(id),open,selection,money,load};
  // Restore a saved review after a reload.
  if (window.parent !== window) void load();
})();

