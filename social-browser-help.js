/* Google-first account presentation; existing authentication handlers remain in control. */
(() => {
  'use strict';
  if (typeof ia4DetectarAmbienteNavegacao !== 'function') return;
  const environment = ia4DetectarAmbienteNavegacao();
  const modal = document.getElementById('authVisitanteModal');
  const googleBox = document.getElementById('googleLoginBox');
  if (!modal || !googleBox) return;
  const headline = 'Entre com o Google para ganhar as 2 artes grátis.';
  const explanation = 'As artes grátis são liberadas somente ao entrar com o Google pelo navegador. Clique em “Abrir no navegador” para continuar.';
  const signature = 'Atenciosamente, equipe IA4Tube.';
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const note = () => { const p = make('p', '', 'socialSignupNote'); p.append(make('em', explanation)); return p; };
  const footer = () => make('p', signature, 'socialSignupSignature');
  const direct = ia4DestinoAppSeguro(); direct.searchParams.set('cadastro', 'google');
  const external = ia4DestinoContinuarSeguro(direct);
  const intro = googleBox.querySelector('p');
  if (intro) { intro.textContent = headline; intro.classList.add('socialSignupTitle'); intro.tabIndex = -1; }
  googleBox.querySelector('#googleLoginModal')?.after(footer());

  // Keep the real inputs and their existing listeners, IDs and submit handlers.
  const details = make('details', '', 'socialPasswordOptions'); details.id = 'passwordLoginOptions';
  const summary = make('summary', 'Entrar ou cadastrar com senha');
  const manual = make('div', '', 'socialPasswordFields');
  const first = document.getElementById('labelNomeTime');
  const message = document.getElementById('authVisitanteMsg');
  if (first && message) {
    first.before(details); details.append(summary, manual);
    let node = first;
    while (node && node !== message) { const next = node.nextSibling; manual.append(node); node = next; }
  }
  let primary = true;
  function prepare(options = {}) {
    primary = options.primary !== false;
    modal.classList.toggle('socialGoogleFirst', primary);
    details.open = !primary;
    if (primary) modal.querySelector('.modalCard')?.setAttribute('aria-label', 'Cadastro com Google');
    else modal.querySelector('.modalCard')?.setAttribute('aria-label', 'Entrar ou criar conta');
  }
  function focus() {
    const target = details.open ? document.getElementById('authWhatsapp')
      : modal.querySelector('#googleLoginWebviewHelp .socialSignupTitle') || intro || modal.querySelector('.modalClose');
    target?.focus({ preventScroll:true });
  }
  window.OmascoteSignupUI = Object.freeze({ prepare, focus });
  prepare();

  if (environment.navegadorInterno && !ia4RotaPublicaAtual()) {
    const home = document.getElementById('vitrineHome'), hero = home?.querySelector('.vitrineHero');
    const notice = document.getElementById('ia4WebviewNotice');
    if (hero && notice) {
      hero.after(notice); notice.classList.add('socialSignupNotice');
      notice.querySelector('.ia4WebviewNoticeIcon')?.remove();
      const title = document.getElementById('ia4WebviewNoticeTitle');
      const actions = notice.querySelector('.ia4WebviewNoticeActions');
      const status = document.getElementById('ia4WebviewNoticeHint');
      title.textContent = headline; title.classList.add('socialSignupTitle');
      document.getElementById('ia4WebviewContinue').hidden = true;
      document.getElementById('ia4WebviewCopyLink').hidden = false;
      status.textContent = ''; status.className = 'socialSignupStatus'; status.setAttribute('role', 'status');
      title.parentElement.replaceChildren(title, actions, note(), footer(), status);
    }
    const box = make('aside', '', 'socialSignupNotice'); box.id = 'googleLoginWebviewHelp';
    const title = make('strong', headline, 'socialSignupTitle'); title.tabIndex = -1;
    const actions = make('div', '', 'socialSignupActions');
    const link = make('a', 'Abrir no navegador', 'googleLoginWebviewOpen'); link.rel = 'noopener';
    link.href = environment.sistema === 'android' ? ia4IntentChromeParaUrl(external) : external.href;
    if (environment.sistema !== 'android') link.target = '_blank';
    const copy = make('button', 'Copiar link'); copy.type = 'button';
    const status = make('small', '', 'socialSignupStatus'); status.setAttribute('role', 'status');
    actions.append(link, copy); box.append(title, actions, note(), footer(), status); googleBox.before(box);
    link.addEventListener('click', async event => {
      try { ia4Evento('abriu_navegador_externo_login', { aplicativo:environment.appSocial }); } catch (_) {}
      if (!localStorage.getItem('omascote_token')) return;
      event.preventDefault();
      const handoff = await ia4CriarBrowserHandoff(direct);
      ia4NavegarParaDestinoExterno(handoff.ok ? handoff.destino : direct);
    });
    copy.addEventListener('click', async () => {
      let target = external;
      if (localStorage.getItem('omascote_token')) {
        const handoff = await ia4CriarBrowserHandoff(direct);
        if (handoff.ok) target = handoff.destino;
      }
      const copied = await ia4CopiarTextoSeguro(target.href);
      status.textContent = copied ? 'Link copiado.' : 'Não foi possível copiar o link. Tente novamente.';
      try { ia4Evento('copiou_link_login_externo', { aplicativo:environment.appSocial, sucesso:copied }); } catch (_) {}
    });
  }
  if (!ia4RotaPublicaAtual() && new URLSearchParams(location.search).get('cadastro') === 'google') {
    abrirCadastroVisitanteModal();
    const current = new URL(location.href); current.searchParams.delete('cadastro');
    history.replaceState(history.state, '', current.pathname + current.search + current.hash);
  }
})();
