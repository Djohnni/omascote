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
  const icons = {sol:'☀️', chuva:'🌧️', escrita_personalizada:'✍️'};
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
    <p class="mascotExamples__pending">Chuva já está disponível para pedidos. Sol e Escrita personalizada estão em preparação.</p>
    <button class="mascotExamples__image" type="button" data-mascot-choice="image">Prefiro somente imagem · R$ 18,00</button>`;
  anchor.before(section);
  let onSelect = null;
  const videos = [...section.querySelectorAll('video')];
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  const pauseAll = () => videos.forEach(video => video.pause());
  function close() {
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
      pauseAll();
      section.hidden = false;
      chat.classList.remove('is-expanded');
      document.body.classList.remove('integratedChatOpen');
      // Match the crest gallery: load the lightweight poster on open, and video only on play.
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
    const showError = () => {button.hidden = false;status.textContent = 'Não foi possível carregar o exemplo. Tente novamente.';};
    button.addEventListener('click',() => {
      pauseAll();status.textContent = '';
      if (!video.getAttribute('src')) video.src = video.dataset.src;
      if (video.error) video.load();
      video.controls = true;button.hidden = true;
      video.play().catch(showError);
    });
    video.addEventListener('error',showError);
    video.addEventListener('play',() => videos.forEach(other => {if (other !== video) other.pause();}));
  });
  document.addEventListener('visibilitychange',() => {if (document.hidden) pauseAll();});
  frame.addEventListener('load',() => {if (!section.hidden) close();});
})();
