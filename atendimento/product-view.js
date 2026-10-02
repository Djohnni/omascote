/* Presentation only: the original form, draft, uploads and submit handlers stay mounted. */
(() => {
  'use strict';
  if (window.parent === window) return;
  let mode = 'chat', scheduled = false, observed = null, lastHeight = 0, lastGuided = null;
  const observer = new ResizeObserver(schedule);

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function setMode(next) {
    if (!['product', 'chat'].includes(next)) return;
    mode = next;
    document.body.dataset.productView = mode;
    window.dispatchEvent(new Event('omascote:product-mode'));
    lastHeight = 0;
    lastGuided = null;
    schedule();
  }

  function refresh() {
    scheduled = false;
    const frame = document.querySelector('.lab-frame.is-integrated');
    if (!frame) return;
    if (observed !== frame) {
      observer.disconnect();
      observer.observe(frame);
      observed = frame;
    }
    const scroll = frame.querySelector('.lab-scroll');
    const outcomes = [...(scroll?.querySelectorAll(':scope > .lab-message:has(.lab-post-order-actions)') || [])];
    const latest = scroll?.querySelector('.lab-form') ? null : outcomes.at(-1);
    outcomes.forEach(message => message.classList.toggle('is-product-outcome', message === latest));
    if (mode === 'chat') {
      window.parent.postMessage({type:'omascote-chat:presentation', mode, guided:false}, location.origin);
      return;
    }
    const height = Math.max(320, Math.ceil(frame.getBoundingClientRect().height) + 4);
    const guided = !!(document.body.dataset.guidedMascot || document.body.dataset.guidedProduct);
    if (height !== lastHeight || guided !== lastGuided) {
      lastHeight = height;
      lastGuided = guided;
      window.parent.postMessage({type:'omascote-chat:presentation', mode, height, guided}, location.origin);
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === 'omascote-chat:visual-mode') setMode(event.data.mode);
    if (['omascote-chat:select-product', 'omascote-chat:open-catalog'].includes(event.data?.type)) setMode('product');
  });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.product-card__copy button, .lab-products-list section[aria-label="Criar uma arte"] button');
    if (button && !button.disabled) setMode('product');
  }, true);
  new MutationObserver(schedule).observe(document.getElementById('root'), {childList:true, subtree:true, characterData:true});
  schedule();
})();
