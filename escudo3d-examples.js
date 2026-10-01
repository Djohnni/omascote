/* Examples are local static media; this controller never creates or charges an order. */
(() => {
  'use strict';
  const section = document.getElementById('escudo3dExamples');
  const chat = document.getElementById('integratedChatModal');
  const frame = document.getElementById('integratedChatFrame');
  if (!section || !chat || !frame) return;
  let selectDelivery = null;
  const videos = [...section.querySelectorAll('video')];
  const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  const pauseAll = () => videos.forEach(video => video.pause());
  function returnToChat() {
    pauseAll();
    section.hidden = true;
    selectDelivery = null;
    frame.focus({ preventScroll: true });
    chat.scrollIntoView({ behavior: motion(), block: 'start' });
  }
  window.OmascoteEscudoExamples = Object.freeze({
    open(onSelect) {
      if (typeof onSelect !== 'function') return false;
      selectDelivery = onSelect;
      pauseAll();
      section.hidden = false;
      chat.classList.remove('is-expanded');
      document.body.classList.remove('integratedChatOpen');
      // No src is assigned to a video until its own play button is pressed.
      videos.forEach(video => { if (!video.poster) video.poster = video.dataset.poster; });
      // Let React close the product menu before transferring focus out of the iframe.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (section.hidden) return;
        section.focus({ preventScroll: true });
        section.scrollIntoView({ behavior: motion(), block: 'start' });
      }));
      return true;
    }
  });
  section.querySelector('[data-close-examples]').addEventListener('click', returnToChat);
  section.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); returnToChat(); }
  });
  section.querySelectorAll('[data-delivery-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const choice = button.dataset.deliveryChoice;
      if (!['image', 'fast', 'omni'].includes(choice) || !selectDelivery) return;
      if (selectDelivery(choice) !== false) returnToChat();
    });
  });
  section.querySelectorAll('[data-play-example]').forEach(button => {
    const card = button.closest('article');
    const video = card.querySelector('video');
    const error = card.querySelector('[role="status"]');
    function showError() {
      button.hidden = false;
      error.textContent = 'Não foi possível carregar o exemplo. Toque em Assistir para tentar novamente.';
    }
    button.addEventListener('click', () => {
      pauseAll();
      error.textContent = '';
      if (!video.getAttribute('src')) video.src = video.dataset.src;
      if (video.error) video.load();
      video.controls = true;
      button.hidden = true;
      video.play().catch(showError);
    });
    video.addEventListener('error', showError);
    video.addEventListener('play', () => videos.forEach(other => { if (other !== video) other.pause(); }));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
  frame.addEventListener('load', () => { if (!section.hidden) returnToChat(); });
})();
