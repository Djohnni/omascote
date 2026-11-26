/* Help visitors use Google sign-in from supported browsers without forcing navigation. */
(() => {
  'use strict';
  if (typeof ia4DetectarAmbienteNavegacao !== 'function') return;
  const environment = ia4DetectarAmbienteNavegacao();
  if (!environment.navegadorInterno || ia4RotaPublicaAtual()) return;
  const home = document.getElementById('vitrineHome');
  const hero = home?.querySelector('.vitrineHero');
  const notice = document.getElementById('ia4WebviewNotice');
  if (hero && notice) {
    hero.after(notice);
    notice.querySelector('p').textContent = 'Para entrar com Google e receber as 2 artes grátis, abra este site no Chrome ou Safari. Você pode continuar vendo os exemplos aqui.';
  }
  const googleBox = document.getElementById('googleLoginBox');
  if (!googleBox) return;
  const box = document.createElement('aside');
  box.id = 'googleLoginWebviewHelp'; box.className = 'googleLoginWebviewHelp';
  box.innerHTML = '<strong>Entre com Google pelo seu navegador</strong><p>Para cadastrar com Google e ganhar 2 artes grátis, abra este site no Chrome ou Safari.</p><a class="googleLoginWebviewOpen" rel="noopener">Abrir no navegador</a><button type="button">Copiar link</button><small role="status"></small>';
  googleBox.before(box);
  const link = box.querySelector('a'), copy = box.querySelector('button'), hint = box.querySelector('small');
  const direct = ia4DestinoAppSeguro(), external = ia4DestinoContinuarSeguro(direct);
  const app = ia4NomeAppSocial(environment.appSocial);
  link.href = environment.sistema === 'android' ? ia4IntentChromeParaUrl(external) : external.href;
  if (environment.sistema !== 'android') link.target = '_blank';
  hint.textContent = environment.sistema === 'ios'
    ? `No ${app}, toque no menu ⋯ e escolha abrir no navegador. Se necessário, copie o link e cole no Safari.`
    : `Se o Chrome não abrir, use o menu ⋮ do ${app} e escolha abrir no navegador, ou copie o link.`;
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
    hint.textContent = copied ? 'Link copiado. Cole no Chrome ou Safari para entrar com Google.' : 'Copie o endereço deste site e abra no Chrome ou Safari.';
    try { ia4Evento('copiou_link_login_externo', { aplicativo:environment.appSocial, sucesso:copied }); } catch (_) {}
  });
})();
