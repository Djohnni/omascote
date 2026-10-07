/* Visual navigation to the existing integrated chat. No order/payment payloads. */
(() => {
  'use strict';
  if (document.body.dataset.page !== 'home' || document.body.dataset.vitrine !== 'true') return;
  const home = document.getElementById('vitrineHome');
  const nav = document.getElementById('vitrineChatNav');
  const frame = document.getElementById('integratedChatFrame');
  const chat = document.getElementById('integratedChatModal');
  const status = document.getElementById('vitrineStatus');
  if (!home || !nav || !frame || !chat) return;
  let ready = false, busy = false, pending = null, sequence = 0, viewMode = 'chat', retryLoad = false;
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  function setMode(mode) {
    viewMode = mode;
    document.body.classList.toggle('vitrineProductActive', mode === 'product');
    if (mode !== 'product') document.body.classList.remove('vitrineGuidedActive');
    if (mode !== 'product') chat.style.height = '';
    frame.contentWindow?.postMessage({ type:'omascote-chat:visual-mode', mode }, location.origin);
  }
  function showChat(mode = 'chat') {
    setMode(mode);
    home.hidden = true;
    nav.hidden = false;
    document.body.classList.add('vitrineChatActive');
    status.textContent = '';
    window.abrirAtendimentoIntegrado?.();
  }
  function showHome() {
    window.OmascoteMascotExamples?.close();
    const close = document.querySelector('#escudo3dExamples:not([hidden]) [data-close-examples]');
    close?.click();
    window.fecharAtendimentoIntegrado?.();
    home.hidden = false;
    nav.hidden = true;
    document.body.classList.remove('vitrineChatActive');
    document.body.classList.remove('vitrineGuidedActive');
    home.scrollIntoView({ behavior:motion(), block:'start' });
  }
  function clearPending() {
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.button.disabled = false;
    pending = null;
  }
  function dispatch() {
    if (!pending || !ready || pending.sent) return;
    if (busy) {
      status.textContent = 'Aguarde o envio atual para escolher outra arte.';
      clearPending();
      return;
    }
    pending.sent = true;
    showChat('product');
    frame.contentWindow.postMessage({ type:pending.type, productId:pending.productId, gift:pending.gift, requestId:pending.id }, location.origin);
  }
  function request(button, type, productId) {
    if (pending) return;
    button.disabled = true;
    status.textContent = ready ? '' : 'Preparando atendimento…';
    pending = { button, type, productId, gift:button.hasAttribute('data-vitrine-gift'), id:'vitrine-'+(++sequence), sent:false };
    if(pending.gift) window.ia4Track?.('escudo_brinde_aberto', {produto:'escudo3d'});
    pending.timeout = setTimeout(() => {
      retryLoad = !ready;
      showHome();
      status.textContent = 'O atendimento ainda não carregou. Tente novamente em instantes.';
      clearPending();
    }, 15000);
    // Product selection waits for visual-ready, so start the deferred frame before waiting.
    try {
      if (window.carregarAtendimentoIntegrado?.({retry:!ready && retryLoad}) === false) {
        status.textContent = 'Não foi possível carregar o atendimento. Tente novamente.';
        clearPending();
        return;
      }
      retryLoad = false;
    } catch {
      retryLoad = !ready;
      status.textContent = 'Não foi possível carregar o atendimento. Tente novamente.';
      clearPending();
      return;
    }
    dispatch();
    if (!ready) frame.contentWindow?.postMessage({ type:'omascote-chat:visual-state' }, location.origin);
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.type === 'omascote-chat:guided-stage') {
      document.body.classList.toggle('vitrineGuidedActive', viewMode === 'product' && event.data.active === true);
    }
    if (viewMode === 'product' && event.data?.type === 'omascote-chat:guided-home') showHome();
    if (viewMode === 'product' && event.data?.type === 'omascote-chat:guided-help') showChat('chat');
    if (viewMode === 'product' && event.data?.type === 'omascote-chat:guided-scroll') {
      chat.scrollIntoView({behavior:motion(), block:'start'});
    }
    if (event.data?.type === 'omascote-chat:visual-ready') {
      ready = event.data.ready === true;
      if (ready) retryLoad = false;
      busy = event.data.busy === true;
      frame.contentWindow.postMessage({ type:'omascote-chat:visual-mode', mode:viewMode }, location.origin);
      dispatch();
    }
    if (event.data?.type === 'omascote-chat:presentation') {
      const {mode, height, guided} = event.data;
      if (!['product', 'chat'].includes(mode)) return;
      viewMode = mode;
      document.body.classList.toggle('vitrineProductActive', mode === 'product');
      document.body.classList.toggle('vitrineGuidedActive', mode === 'product' && guided === true);
      if (mode === 'product' && Number.isFinite(height) && height >= 320 && height <= 20000) chat.style.height = height + 'px';
      else if (mode === 'chat') chat.style.height = '';
    }
    if (event.data?.type === 'omascote-chat:visual-result' && pending && event.data.requestId === pending.id) {
      if (event.data.ok !== true) {
        showHome();
        status.textContent = event.data.error || 'Não foi possível abrir a arte. Tente novamente.';
      }
      clearPending();
    }
    if (['omascote-chat:open-account','omascote-chat:open-orders'].includes(event.data?.type)) {
      // The original bridge performs the action; keep its account controls visible.
      document.body.classList.add('vitrineChatActive');
    }
  });
  document.querySelectorAll('[data-vitrine-product]').forEach(button => button.addEventListener('click', () => request(button, 'omascote-chat:select-product', button.dataset.vitrineProduct)));
  document.querySelectorAll('[data-vitrine-options]').forEach(button => button.addEventListener('click', () => request(button, 'omascote-chat:open-catalog')));
  document.querySelectorAll('[data-vitrine-home]').forEach(button => button.addEventListener('click', showHome));
  document.querySelectorAll('[data-vitrine-chat]').forEach(button => button.addEventListener('click', () => showChat('chat')));
  document.querySelectorAll('[data-vitrine-account]').forEach(button => button.addEventListener('click', () => window.abrirMinhaContaPeloAtendimento?.()));
  document.querySelectorAll('[data-vitrine-orders]').forEach(button => button.addEventListener('click', () => window.abrirPedidosPeloAtendimento?.()));
  frame.addEventListener('load', () => {
    frame.contentWindow?.postMessage({ type:'omascote-chat:visual-mode', mode:viewMode }, location.origin);
    frame.contentWindow?.postMessage({ type:'omascote-chat:visual-state' }, location.origin);
  });
  if (new URLSearchParams(location.search).get('chat_preview') === '1') showChat();
})();
