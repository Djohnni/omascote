/* Administrative grants and the customer's image allowance. Server authorization is authoritative. */
(() => {
  'use strict';
  const header = document.querySelector('.vitrineHeader');
  const panel = document.getElementById('accountMenuPanel');
  if (!header || !panel) return;
  const api = typeof API_BASE === 'string' ? API_BASE : 'https://api.omascote.com.br';
  const banner = document.createElement('section');
  banner.className = 'testerBonusBanner';
  banner.id = 'testerImageBonusBanner';
  banner.hidden = true;
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = '<strong data-tester-remaining></strong>';
  header.after(banner);
  const section = document.createElement('section');
  section.className = 'testerBonusAccount';
  section.hidden = true;
  section.innerHTML = `
    <div data-tester-account-summary hidden><strong data-tester-account-title></strong><p>Cada pedido de somente imagem usa uma unidade. Downloads repetidos não gastam outra imagem.</p></div>
    <form data-tester-password-form hidden>
      <h3>Troque sua senha temporária</h3>
      <label>Senha atual<input name="current_password" type="password" autocomplete="current-password" required maxlength="128"></label>
      <label>Nova senha<input name="new_password" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></label>
      <button type="submit">Salvar nova senha</button><p data-tester-password-message role="status"></p>
    </form>
    <details data-tester-admin hidden>
      <summary>Liberar imagens para um cliente</summary>
      <form data-tester-grant-form>
        <label>Gmail ou login da conta<input name="login" type="text" autocomplete="off" required maxlength="254"></label>
        <label class="testerBonusCheckbox"><input name="create_account" type="checkbox">Criar conta se este Gmail ainda não tiver cadastro</label>
        <p>A liberação concede cinco imagens uma única vez. Repetir a liberação preserva as unidades já utilizadas.</p>
        <div class="testerBonusActions"><button type="submit">Liberar 5 imagens</button><button type="button" data-tester-lookup>Consultar cota</button></div>
        <p data-tester-grant-message role="status"></p>
      </form>
      <section data-tester-credentials hidden>
        <strong>Dados da nova conta</strong><p>Copie estes dados para entregar ao cliente. A senha é exibida somente nesta criação.</p>
        <pre data-tester-credentials-text></pre><button type="button" data-tester-copy>Copiar acesso</button><button type="button" data-tester-dismiss>Ocultar senha</button>
      </section>
    </details>`;
  const plan = document.getElementById('weeklyPlanAccountCard');
  if (plan) plan.after(section); else panel.append(section);
  let account = null;
  let credentialsText = '';
  const node = selector => section.querySelector(selector);
  const token = () => localStorage.getItem('omascote_token') || '';
  const isGranted = summary => Boolean(summary && (summary.granted || summary.grantId) && [2,5].includes(Number(summary.limit)));
  const remaining = summary => Math.max(0, Math.min(Number(summary?.limit) || 0, Number(summary?.remaining) || 0));
  function clearCredentials() {
    credentialsText = '';
    node('[data-tester-credentials-text]').textContent = '';
    node('[data-tester-credentials]').hidden = true;
  }
  function render() {
    const summary = account?.tester_image_bonus;
    const granted = isGranted(summary);
    const count = remaining(summary);
    banner.hidden = !granted;
    banner.querySelector('[data-tester-remaining]').textContent = count + (count === 1 ? ' arte grátis' : ' artes grátis');
    node('[data-tester-account-summary]').hidden = !granted;
    node('[data-tester-account-title]').textContent = count + ' de ' + summary?.limit + ' imagens grátis disponíveis';
    document.querySelectorAll('[data-image-allowance-price]').forEach(price => {
      price.textContent = count > 0 ? 'GRÁTIS' : price.dataset.imageAllowancePrice;
      price.classList.toggle('imagePrice--free', count > 0);
    });
    const crestChoice = document.querySelector('#escudo3dExamples [data-delivery-choice="image"]');
    crestChoice?.setAttribute('aria-label','Escolher somente imagem — ' + (count > 0 ? 'GRÁTIS' : 'R$ 4,00'));
    const admin = account?.tester_bonus_admin === true;
    const temporary = account?.senha_temporaria === true;
    node('[data-tester-admin]').hidden = !admin;
    node('[data-tester-password-form]').hidden = !temporary;
    section.hidden = !granted && !admin && !temporary;
    if (!admin) clearCredentials();
    const publicSummary = granted ? { ...summary, remaining: count } : null;
    window.dispatchEvent(new CustomEvent('omascote:tester-bonus', {detail:publicSummary}));
    const frame = document.getElementById('integratedChatFrame');
    frame?.contentWindow?.postMessage({type:'omascote-chat:tester-bonus', summary:publicSummary}, location.origin);
  }
  async function request(path, body) {
    const auth = token();
    if (!auth) throw new Error('Entre na sua conta para continuar.');
    const response = await fetch(api + path, {
      method:body ? 'POST' : 'GET',
      cache:'no-store',
      headers:{Authorization:'Bearer ' + auth, ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(() => ({}));
    if (auth !== token()) throw new Error('A sessão mudou. Entre novamente para continuar.');
    if (data.credentials?.password) {
      if (account?.tester_bonus_admin !== true) throw new Error('Entre na conta administrativa para consultar o acesso.');
      credentialsText = 'Login: ' + String(data.credentials.email || data.credentials.login || '') + '\nSenha temporária: ' + String(data.credentials.password);
      node('[data-tester-credentials-text]').textContent = credentialsText;
      node('[data-tester-credentials]').hidden = false;
    }
    if (!response.ok || data.ok !== true) throw new Error(data.error || data.bonus_error || 'Não foi possível concluir. Confira a conta e tente novamente.');
    return data;
  }
  function lockForm(form, disabled) {
    for (const element of form.elements) element.disabled = disabled;
  }
  node('[data-tester-grant-form]').addEventListener('submit', async event => {
    event.preventDefault();
    if (account?.tester_bonus_admin !== true) return;
    const form = event.currentTarget;
    const login = form.elements.login.value.trim();
    const create = form.elements.create_account.checked;
    const message = node('[data-tester-grant-message]');
    clearCredentials();
    lockForm(form, true);
    message.textContent = 'Conferindo conta e liberando imagens…';
    try {
      const data = await request('/admin/tester-bonus/grant', {login, create_account:create});
      if (data.bonus_pending === true) {
        message.textContent = data.bonus_error || 'A conta foi criada, mas o bônus ainda está pendente. Repita a liberação para esta conta.';
        return;
      }
      const count = remaining(data.bonus);
      message.textContent = (data.grant?.replayed ? 'Benefício já liberado. ' : 'Benefício liberado. ') + 'Restam ' + count + ' de 5 imagens para esta conta.';
      if (data.account?.login_type === 'google') message.textContent += ' O cliente continua entrando com o Google.';
      if (typeof window.refreshMe === 'function') void window.refreshMe();
    } catch (error) { message.textContent = error.message; }
    finally { lockForm(form, false); }
  });
  node('[data-tester-lookup]').addEventListener('click', async () => {
    if (account?.tester_bonus_admin !== true) return;
    const form = node('[data-tester-grant-form]');
    const login = form.elements.login.value.trim();
    const message = node('[data-tester-grant-message]');
    if (!login) { message.textContent = 'Informe o Gmail ou login da conta.'; return; }
    lockForm(form, true);
    try {
      const data = await request('/admin/tester-bonus/' + encodeURIComponent(login));
      const summary = data.bonus;
      message.textContent = isGranted(summary) ? 'Esta conta tem ' + remaining(summary) + ' de ' + summary.limit + ' imagens disponíveis.' : 'Esta conta ainda não recebeu o benefício.';
    } catch (error) { message.textContent = error.message; }
    finally { lockForm(form, false); }
  });
  node('[data-tester-password-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const current = form.elements.current_password.value;
    const next = form.elements.new_password.value;
    const message = node('[data-tester-password-message]');
    if (next.length < 10 || new TextEncoder().encode(next).length > 72) {
      message.textContent = 'Use pelo menos 10 caracteres. Se a senha for muito longa, escolha uma mais curta.';
      return;
    }
    lockForm(form, true);
    try {
      await request('/auth/change-password', {current_password:current, new_password:next});
      form.reset();
      message.textContent = 'Nova senha salva.';
      account = {...account, senha_temporaria:false};
      render();
      if (typeof window.refreshMe === 'function') void window.refreshMe();
    } catch (error) { message.textContent = error.message; }
    finally { lockForm(form, false); }
  });
  node('[data-tester-copy]').addEventListener('click', async () => {
    if (credentialsText) {
      try { await navigator.clipboard.writeText(credentialsText); }
      catch { node('[data-tester-grant-message]').textContent = 'Selecione e copie os dados de acesso exibidos.'; }
    }
  });
  node('[data-tester-dismiss]').addEventListener('click', clearCredentials);
  document.getElementById('btnSair')?.addEventListener('click', () => window.OmascoteTesterBonus.setAccount(null));
  window.addEventListener('storage', event => { if (event.key === 'omascote_token' && !event.newValue) window.OmascoteTesterBonus.setAccount(null); });
  document.getElementById('integratedChatFrame')?.addEventListener('load', render);
  window.OmascoteTesterBonus = Object.freeze({
    setAccount(data) { account = data && typeof data === 'object' ? data : null; render(); },
    clear:() => window.OmascoteTesterBonus.setAccount(null)
  });
  window.OmascoteTesterBonus.setAccount(window.omascoteTesterAccount || null);
})();
