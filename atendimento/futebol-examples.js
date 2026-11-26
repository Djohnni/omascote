(() => {
  'use strict';
  const products = new Set(['proximo_jogo','resultado','proximo_jogo_jogador','resultado_jogo_jogador',
    'jogador_escudo','escalacao','contratacao','patrocinador']);
  const money = cents => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const mediaUrl = name => '/atendimento/exemplos-futebol/' + name + '?v=futebol-gallery-38-1';
  const sorted = row => [...row.options].sort((a,b) => a.cents-b.cents);
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  let catalog, pilot, closeGallery, request, lastToken, galleryDocument;
  let available = false;

  async function load() {
    const token = localStorage.getItem('omascote_token') || '';
    if (!request || token !== lastToken) {
      lastToken = token;
      available = false;
      notify();
      const base = window.parent.OMASCOTE_API_BASE_RESOLVED || 'https://api.omascote.com.br';
      request = fetch(base + '/catalogo/futebol-videos', {headers:token ? {Authorization:'Bearer '+token} : {},
        cache:'no-store', signal:AbortSignal.timeout(6500)}).then(async response => {
        if (!response.ok) throw new Error('Galeria indisponível.');
        const data = await response.json();
        if (token !== lastToken) return false;
        catalog = window.createFutebolCatalog(data.catalog);
        pilot = data.pilot;
        available = data.available === true;
        notify();
        return available;
      }).catch(() => {
        if (token === lastToken) {request = null; available = false; notify();}
        return false;
      });
    }
    return request;
  }
  function minimum(product) {
    if (!available || !catalog || !products.has(product)) return null;
    const prices = catalog.catalog.filter(row => row.product === product).flatMap(row => row.options.map(option => option.cents));
    return prices.length ? Math.min(...prices) : null;
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function element(tag, text) {
    const node = (galleryDocument || document).createElement(tag);
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
    closeGallery?.();
    galleryDocument = document;
    try {
      if (window.parent !== window && window.parent.location.origin === location.origin &&
          window.parent.document.getElementById('escudo3dExamples')) galleryDocument = window.parent.document;
    } catch {}
    const host = galleryDocument, hostWindow = host.defaultView || window;
    const chat = host.getElementById?.('integratedChatModal');
    const frame = host.getElementById?.('integratedChatFrame');
    const anchor = host.getElementById?.('escudo3dExamples');
    const box = element('section'); box.className = 'escudoExamples futebol-models';
    box.id = 'futebolVideoExamples'; box.dataset.productId = product; box.tabIndex = -1;
    box.setAttribute('aria-labelledby','futebolModelsTitle');
    const videos = [];
    const pauseAll = () => videos.forEach(video => video.pause());
    const motion = () => hostWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    const close = () => {
      if (closeGallery !== close) return;
      pauseAll();
      host.removeEventListener?.('visibilitychange',visibility);
      frame?.removeEventListener?.('load',close);
      box.remove(); closeGallery = null;
      frame?.focus?.({preventScroll:true});
      chat?.scrollIntoView?.({behavior:motion(),block:'start'});
    };
    const visibility = () => {if (host.hidden) pauseAll();};
    closeGallery = close;
    host.addEventListener?.('visibilitychange',visibility);
    frame?.addEventListener?.('load',close);
    box.addEventListener('keydown',event => {if (event.key === 'Escape') {event.preventDefault();close();}});
    const finish = seed => {
      if (closeGallery!==close) return;
      close(); done(seed);
    };
    const heading = element('div'); heading.className = 'escudoExamples__heading';
    const title = element('div');
    const h2 = element('h2',info.name); h2.id = 'futebolModelsTitle';
    title.append(h2,element('p','O estilo escolhido será adaptado ao esporte e ao local informados no formulário.'));
    const closeButton = choice('×',close); closeButton.className = 'escudoExamples__close';
    closeButton.setAttribute('aria-label','Voltar aos produtos');
    heading.append(title,closeButton); box.append(heading);
    const select = element('select');
    if (rows.length > 1) {
      const label = element('label','Escolha a versão da arte'); label.className='futebol-models__version';
      label.append(select); box.append(label);
      for (const row of rows) {
        const opt = element('option',row.title); opt.value=row.code; select.append(opt);
      }
    }
    const cards = element('div'); cards.className='escudoExamples__grid modelos'; box.append(cards);
    const draw = () => {
      const row = rows.find(r => r.code === select.value) || rows[0];
      const picks = sorted(row); pauseAll(); videos.length=0; cards.replaceChildren();
      const photo = {mask:'Mascote',desc:'Não tenho mascote',person:'Jogador',team:'Time',bare:'Sem foto'};
      const seed = {futebol_version:row.code,
        ...(photo[row.kind] && ['proximo_jogo','resultado'].includes(product) ? {photo_mode:photo[row.kind]} : {}),
        ...(product === 'contratacao' ? {announcement:row.kind === 'renew' ? 'Renovado' : 'Contratado'} : {})};
      const imagePrice = window.OmascoteTesterImageBonus?.imagePriceLabel({productId:product,
        deliveryMode:'image',unitPrice:info.price,regularLabel:info.priceLabel}) || info.priceLabel;
      const image = element('img'); image.src=pilot ? info.image : mediaUrl(row.code+'.jpg'); image.alt=row.title;
      image.className='escudoExamples__poster'; image.loading='lazy'; image.width=720; image.height=1280;
      const imageMedia=element('div'); imageMedia.className='escudoExamples__media'; imageMedia.append(image);
      const first=element('article'); first.className='escudoExamples__card';
      const imageAmount=element('strong',imagePrice); imageAmount.className='escudoExamples__price' + (imagePrice === 'GRÁTIS' ? ' imagePrice--free' : '');
      const imageChoice=choice('Escolher imagem',() => finish({...seed,futebol_gallery:'image',delivery_mode:'image'}));
      imageChoice.className='escudoExamples__choose';
      first.append(element('h3','Somente imagem'),imageAmount,imageMedia,imageChoice);
      cards.append(first);
      picks.forEach((option,rank) => {
        const card = element('article'); card.className='escudoExamples__card';
        const amount=element('strong','A partir de '+money(option.cents)); amount.className='escudoExamples__price';
        card.append(element('h3',option.title),amount);
        if (!pilot) {
          const media=element('div'); media.className='escudoExamples__media';
          const video = element('video'); video.playsInline=true; video.preload='none';
          video.poster=mediaUrl(option.id+'.jpg'); video.width=720; video.height=1280;
          video.setAttribute('aria-label',option.title); videos.push(video);
          const status=element('p'); status.className='escudoExamples__error'; status.setAttribute('role','status');
          const showError=() => {play.hidden=false;status.textContent='Não foi possível carregar o exemplo. Toque em Assistir para tentar novamente.';};
          const play=choice('▶ Assistir',() => {
            pauseAll(); status.textContent='';
            if (!video.getAttribute('src')) video.src=mediaUrl(option.id+'.mp4');
            if (video.error) video.load();
            video.controls=true; play.hidden=true;
            try {Promise.resolve(video.play()).catch(showError);} catch {showError();}
          });
          play.className='escudoExamples__play videoPreviewPlay'; play.innerHTML='<span class="videoPreviewPlay__icon" aria-hidden="true"></span><span class="videoPreviewPlay__label" aria-hidden="true">VÍDEO</span>'; play.setAttribute('aria-label','Assistir ao exemplo de '+option.title);
          video.addEventListener('error',showError);
          video.addEventListener('play',() => videos.forEach(other => {if (other!==video) other.pause();}));
          media.append(video,play); card.append(media,status);
        }
        const videoChoice=choice('Escolher vídeo',() =>
          finish({...seed,futebol_gallery:'video',futebol_rank:String(rank),futebol_scene:option.id,delivery_mode:'image_video',video_model:'omni'}));
        videoChoice.className='escudoExamples__choose';
        card.append(element('p','Imagem + vídeo · 10 s · 720p'),videoChoice);
        cards.append(card);
      });
    };
    select.onchange=draw; draw();
    const skip=choice('Continuar sem escolher modelo',() => finish({})); skip.className='escudoExamples__image'; box.append(skip);
    if (anchor) anchor.before(box); else host.body.append(box);
    chat?.classList?.remove('is-expanded'); host.body.classList?.remove('integratedChatOpen');
    const raf=hostWindow.requestAnimationFrame?.bind(hostWindow) || (callback => callback());
    raf(() => raf(() => {
      if (closeGallery!==close) return;
      box.focus?.({preventScroll:true}); box.scrollIntoView?.({behavior:motion(),block:'start'});
    }));
  }
  window.OmascoteFutebol = {supports:id => products.has(id),open,selection,money,load,minimum,subscribe};
  window.addEventListener('storage', event => {
    if (event.key === 'omascote_token' || event.key === null) void load();
  });
  // Restore a saved review after a reload.
  if (window.parent !== window) void load();
})();

