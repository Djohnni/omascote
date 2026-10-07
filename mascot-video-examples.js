/* Selection prepares a draft only. No order or payment is created here. */
(() => {
  'use strict';
  const chat = document.getElementById('integratedChatModal');
  const frame = document.getElementById('integratedChatFrame');
  const anchor = document.getElementById('escudo3dExamples');
  const options = window.OmascoteMascotVideoOptions;
  if (!chat || !frame || !anchor || !Array.isArray(options) || options.length !== 3) return;
  const section = document.createElement('section');
  section.id = 'mascotVideoExamples';
  section.className = 'mascotExamples';
  section.hidden = true;
  section.tabIndex = -1;
  section.setAttribute('aria-labelledby', 'mascotExamplesTitle');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const price = value => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(value);
  const icons = {sol:'☀️', chuva:'🌧️', ascensao_epica:'⚡'};
  section.innerHTML = `
    <div class="mascotExamples__heading">
      <div><h2 id="mascotExamplesTitle">Escolha o vídeo do seu mascote</h2><p>Três opções para dar vida ao mascote do seu time.</p></div>
      <button class="mascotExamples__close" type="button" data-mascot-close aria-label="Voltar ao mascote">×</button>
    </div>
    <div class="mascotExamples__grid">${options.map(option => `
      <article class="mascotExamples__card" data-mascot-option="${escape(option.id)}">
        <h3>${escape(option.name)}</h3><strong class="mascotExamples__price">${price(option.price)}</strong>
        <div class="mascotExamples__media mascotExamples__media--${escape(option.id)}">
          ${option.videoSrc ? `<video preload="none" playsinline width="720" height="1280" data-src="${escape(option.videoSrc)}"${option.posterSrc ? ` data-poster="${escape(option.posterSrc)}"` : ''} aria-label="Exemplo de ${escape(option.name)}"></video><button class="mascotExamples__play" type="button" data-mascot-play aria-label="Assistir ao exemplo de ${escape(option.name)}">▶ Assistir</button>` : option.posterSrc ? `<img class="mascotExamples__poster" src="${escape(option.posterSrc)}" alt="Exemplo de mascote na chuva" loading="lazy" width="941" height="1672"><span class="mascotExamples__video-soon">Vídeo em breve</span>` : `<div class="mascotExamples__placeholder"><span aria-hidden="true">${icons[option.id] || '▶'}</span><span>Exemplo em breve</span></div>`}
        </div>
        <p class="mascotExamples__status" role="status"></p>
        <button class="mascotExamples__choose" type="button" data-mascot-choice="${escape(option.id)}">Escolher ${escape(option.name)}</button>
      </article>`).join('')}
    </div>
    <p class="mascotExamples__pending">Toque em Assistir para ver cada exemplo e escolha o seu favorito.</p>
    <button class="mascotExamples__image" type="button" data-mascot-choice="image">Prefiro somente imagem · R$ 18,00</button>`;
  anchor.before(section);
  let onSelect = null;
  const videos = [...section.querySelectorAll('video')];
  const cachedVideos = new Map(), requestedVideos = new Set(), failedPrefetches = new Set();
  let activeVideo = null, prefetchJob = null, prefetchEnabled = false;
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  const pauseAll = () => videos.forEach(video => video.pause());
  const canPrefetch = () => prefetchEnabled && !section.hidden && !document.hidden && activeVideo;
  function stopPrefetch() {
    // Keep the job until its promise settles: even a slow abort cannot start a second fetch.
    prefetchJob?.controller.abort();
  }
  async function prefetchNext() {
    if (prefetchJob || !canPrefetch()) return;
    const video = videos.find(item => item !== activeVideo && !requestedVideos.has(item) &&
      !cachedVideos.has(item) && !failedPrefetches.has(item));
    if (!video) return;
    const job = {video, controller:new AbortController()};
    prefetchJob = job;
    try {
      const response = await fetch(video.dataset.src, {signal:job.controller.signal, cache:'force-cache'});
      if (!response.ok) throw new Error('Video unavailable');
      const blob = await response.blob();
      if (job.controller.signal.aborted || prefetchJob !== job || requestedVideos.has(video)) return;
      if (!blob.size) throw new Error('Empty video');
      // Do not change a media element's source while the customer is interacting with it.
      cachedVideos.set(video, URL.createObjectURL(blob));
    } catch {
      if (!job.controller.signal.aborted) failedPrefetches.add(video);
    } finally {
      if (prefetchJob === job) prefetchJob = null;
      if (canPrefetch()) void prefetchNext();
    }
  }
  function selectVideo(video) {
    if (activeVideo !== video) {prefetchEnabled = false;stopPrefetch();}
    activeVideo = video;
    requestedVideos.add(video);
    videos.forEach(other => {if (other !== video) other.pause();});
  }
  function close() {
    prefetchEnabled = false;
    stopPrefetch();
    pauseAll();
    section.hidden = true;
    onSelect = null;
    frame.focus({preventScroll:true});
    chat.scrollIntoView({behavior:motion(),block:'start'});
  }
  window.OmascoteMascotExamples = Object.freeze({
    options,
    open(callback) {
      if (typeof callback !== 'function') return false;
      onSelect = callback;
      prefetchEnabled = false;
      stopPrefetch();
      pauseAll();
      section.hidden = false;
      chat.classList.remove('is-expanded');
      document.body.classList.remove('integratedChatOpen');
      // Opening loads only posters. Background video transfers start after actual playback.
      videos.forEach(video => { if (!video.poster && video.dataset.poster) video.poster = video.dataset.poster; });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (section.hidden) return;
        section.focus({preventScroll:true});
        section.scrollIntoView({behavior:motion(),block:'start'});
      }));
      return true;
    },
    close
  });
  section.querySelector('[data-mascot-close]').addEventListener('click',close);
  section.addEventListener('keydown',event => {if (event.key === 'Escape') {event.preventDefault();close();}});
  section.querySelectorAll('[data-mascot-choice]').forEach(button => button.addEventListener('click',() => {
    const choice = button.dataset.mascotChoice;
    if (!onSelect || (choice !== 'image' && !options.some(option => option.id === choice))) return;
    if (onSelect(choice) !== false) close();
  }));
  section.querySelectorAll('[data-mascot-play]').forEach(button => {
    const card = button.closest('article'), video = card.querySelector('video'), status = card.querySelector('[role="status"]');
    let failedPlayback = false, playAttempt = 0;
    const allowRetry = () => {failedPlayback = true;button.hidden = false;};
    const showError = error => {
      if (error?.name === 'AbortError' || activeVideo !== video || section.hidden || document.hidden) return;
      allowRetry();status.textContent = 'Não foi possível carregar o exemplo. Tente novamente.';
    };
    button.addEventListener('click',() => {
      selectVideo(video);status.textContent = '';
      if (failedPlayback || video.error) {
        const cached = cachedVideos.get(video);
        cachedVideos.delete(video);
        video.src = video.dataset.src;
        if (cached) URL.revokeObjectURL(cached);
        video.load();
        failedPlayback = false;
      } else if (!video.getAttribute('src')) video.src = cachedVideos.get(video) || video.dataset.src;
      video.controls = true;button.hidden = true;
      const attempt = ++playAttempt;
      // Keep play in the click gesture; awaiting a pending download would break mobile playback.
      video.play().catch(error => {if (attempt === playAttempt) showError(error);});
    });
    video.addEventListener('error',() => {if (requestedVideos.has(video)) {allowRetry();showError();}});
    video.addEventListener('play',() => {if (!video.paused && !section.hidden && !document.hidden) selectVideo(video);});
    video.addEventListener('playing',() => {
      if (activeVideo !== video || section.hidden || document.hidden) {video.pause();return;}
      if (video.paused || video.ended) return;
      button.hidden = true;status.textContent = '';
      prefetchEnabled = true;
      void prefetchNext();
    });
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) {prefetchEnabled = false;stopPrefetch();pauseAll();}
    else if (canPrefetch()) void prefetchNext();
  });
  window.addEventListener('pagehide',event => {
    prefetchEnabled = false;
    stopPrefetch();pauseAll();
    if (!event.persisted) {
      cachedVideos.forEach(url => URL.revokeObjectURL(url));
      cachedVideos.clear();
    }
  });
  frame.addEventListener('load',() => {if (!section.hidden) close();});
})();
