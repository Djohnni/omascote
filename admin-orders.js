/* Administrator-only, read-only view. Every data and image request is authorized by the API. */
(() => {
  'use strict';
  const accountPanel = document.getElementById('accountMenuPanel');
  if (!accountPanel) return;
  const api = (typeof API_BASE === 'string' ? API_BASE : window.OMASCOTE_API_BASE_RESOLVED || 'https://api.omascote.com.br').replace(/\/$/, '');
  const entry = document.createElement('button');
  entry.type = 'button'; entry.id = 'btnAdminPedidos'; entry.className = 'adminOrdersEntry';
  entry.textContent = 'Painel administrativo'; entry.hidden = true; entry.setAttribute('aria-controls', 'adminOrdersDialog');
  const accountMeta = accountPanel.querySelector('.accountMenuMeta');
  if (accountMeta) accountMeta.after(entry); else accountPanel.append(entry);
  const dialog = document.createElement('dialog');
  dialog.id = 'adminOrdersDialog'; dialog.className = 'adminOrdersDialog'; dialog.setAttribute('aria-labelledby', 'adminOrdersTitle');
  dialog.innerHTML = `
    <header class="adminOrdersHeader"><div><span>ACESSO DO ADMINISTRADOR</span><h2 id="adminOrdersTitle">Clientes e imagens</h2><p>Acompanhe os pedidos do site e da nuvem.</p></div><button type="button" data-admin-close>Fechar</button></header>
    <div class="adminOrdersBody">
      <form class="adminOrdersFilters">
        <label>De<input type="date" name="desde" required></label><label>Até<input type="date" name="ate" required></label>
        <label class="adminOrdersSearch">Cliente, time ou pedido<input type="search" name="busca" maxlength="180" placeholder="Nome do time, e-mail ou número do pedido"></label>
        <label>Status<select name="status"><option value="">Todos</option value="fila">Na fila</option><option value="gerando">Em produção</option><option value="pronto">Pronto</option><option value="erro">Erro</option><option value="aguardando_pagamento">Aguardando pagamento</option><option value="cancelado">Cancelado / expirado</option><option value="sem_imagem">Resultado indisponível</option></select></label>
        <label>Pagamento<select name="pagamento"><option value="">Todos</option><option value="gratis">Arte grátis</option><option value="pago">Pago</option><option value="plano">Plano de imagens</option><option value="pendente">Pagamento pendente</option><option value="devolvido">Devolvido / estornado</option><option value="nao_informado">Não informado</option></select></label>
        <label>Produto<select name="produto"><option value="">Todos</option></select></label>
        <button type="submit" class="adminOrdersPrimary">Filtrar</button><button type="button" data-admin-refresh>Atualizar</button>
      </form>
      <p class="adminOrdersNotice" role="status" aria-live="polite"></p>
      <div class="adminOrdersSummary" aria-label="Resumo dos pedidos encontrados"></div>
      <div class="adminOrdersList" aria-label="Pedidos encontrados"></div>
      <footer class="adminOrdersFooter"><div><p data-admin-page></p><small data-admin-updated>Atualização automática a cada 30 segundos enquanto o painel estiver aberto.</small></div><div><button type="button" data-admin-previous>Anterior</button><button type="button" data-admin-next>Próxima</button></div></footer>
    </div>`;
  document.body.append(dialog);
  const photo = document.createElement('dialog'); photo.className = 'adminOrdersPhoto'; photo.setAttribute('aria-label', 'Imagem do pedido');
  photo.innerHTML = '<button type="button">Fechar imagem</button><p role="status"></p><img alt="Imagem gerada para o cliente">'; document.body.append(photo);
  const form = dialog.querySelector('form'), notice = dialog.querySelector('.adminOrdersNotice'), list = dialog.querySelector('.adminOrdersList');
  const token = () => localStorage.getItem('omascote_token') || '';
  const date = value => new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:'America/Sao_Paulo' }).format(new Date(value));
  const day = value => new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'America/Sao_Paulo' }).format(value);
  const money = value => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(value);
  form.elements.desde.value = day(new Date(Date.now() - 6 * 86400000)); form.elements.ate.value = day(new Date());
  let allowed = false, page = 1, pages = 1, revision = 0, controller, observer, session = '', loading = false, openedFromLink = false;
  const urls = new Set(), imageQueue = []; let imageRequests = 0;
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function clearImages() { observer?.disconnect(); imageQueue.length = 0; urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }
  function cleanup() { revision++; controller?.abort(); clearImages(); list.replaceChildren(); dialog.querySelector('.adminOrdersSummary').replaceChildren(); notice.textContent = ''; photo.close(); photo.querySelector('img').removeAttribute('src'); session = ''; }
  function setAccount(account) {
    allowed = account?.tester_bonus_admin === true;
    entry.hidden = !allowed;
    if (!allowed) { cleanup(); if (dialog.open) dialog.close(); }
    if (allowed && !openedFromLink && new URLSearchParams(location.search).get('painel') === 'pedidos') { openedFromLink = true; open(); }
  }
  async function request(path, signal) {
    const auth = session;
    if (!allowed || !auth || token() !== auth) throw new Error('A sessão mudou. Entre novamente na sua conta.');
    const response = await fetch(api + path, { headers:{ Authorization:'Bearer ' + auth }, cache:'no-store', signal });
    if (token() !== auth || !allowed || !dialog.open) throw new DOMException('Sessão alterada', 'AbortError');
    if (response.status === 401 || response.status === 403) { setAccount(null); throw new Error('Entre com a conta de administrador para abrir o painel.'); }
    return response;
  }
  async function imageUrl(order, mini, signal) {
    const response = await request('/admin/pedidos/' + encodeURIComponent(order.id) + '/imagem' + (mini ? '?mini=1' : ''), signal);
    if (!response.ok) throw new Error('Imagem indisponível no momento.');
    const blob = await response.blob();
    if (signal?.aborted || !allowed || token() !== session) throw new DOMException('Cancelado', 'AbortError');
    const url = URL.createObjectURL(blob); urls.add(url); return url;
  }
  function pumpImages() {
    while (imageRequests < 3 && imageQueue.length) {
      const item = imageQueue.shift(); if (item.revision !== revision) continue;
      imageRequests++;
      imageUrl(item.order, true, item.signal).then(url => { if (item.revision === revision) item.img.src = url; })
        .catch(error => { if (error.name !== 'AbortError' && item.revision === revision) item.img.alt = 'Imagem temporariamente indisponível'; })
        .finally(() => { imageRequests--; pumpImages(); });
    }
  }
  async function openPhoto(order) {
    const stamp = revision;
    photo.querySelector('img').removeAttribute('src'); photo.querySelector('p').textContent = 'Carregando imagem…'; photo.showModal();
    try { const url = await imageUrl(order, false, controller.signal); if (stamp === revision && photo.open) { photo.querySelector('img').src = url; photo.querySelector('p').textContent = ''; } }
    catch (error) { if (error.name !== 'AbortError') photo.querySelector('p').textContent = error.message; }
  }
  function render(data) {
    clearImages(); list.replaceChildren();
    const summary = dialog.querySelector('.adminOrdersSummary'); summary.replaceChildren();
    for (const [key, label] of [['pedidos','Pedidos'],['clientes','Clientes'],['gratis','Artes grátis'],['pagos','Pagos'],['planos','Pelo plano'],['pendentes','Pagamento pendente']]) {
      const card = element('div'); card.append(element('strong', String(data.resumo[key] || 0)), element('span', label)); summary.append(card);
    }
    const selected = form.elements.produto.value;
    form.elements.produto.replaceChildren(new Option('Todos', ''), ...data.produtos.map(product => new Option(product.nome, product.id)));
    if ([...form.elements.produto.options].some(option => option.value === selected)) form.elements.produto.value = selected;
    observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { const img = entry.target; observer.unobserve(img); imageQueue.push(img._adminImage); pumpImages(); } }, { root:dialog, rootMargin:'250px' });
    for (const order of data.pedidos) {
      const card = element('article', undefined, 'adminOrderCard');
      const preview = element('button', undefined, 'adminOrderPreview'); preview.type = 'button'; preview.disabled = !order.imagem_pronta;
      if (order.imagem_pronta) {
        preview.setAttribute('aria-label', 'Ver imagem de ' + order.produto + ' · ' + order.cliente.nome_time);
        const img = element('img'); img.alt = 'Imagem de ' + order.produto; img.width = 90; img.height = 128;
        img._adminImage = { img, order, revision, signal:controller.signal }; preview.append(img); observer.observe(img); preview.addEventListener('click', () => openPhoto(order));
      } else preview.append(element('span', 'Imagem ainda não disponível'));
      const details = element('div', undefined, 'adminOrderDetails'); details.append(element('h3', order.produto), element('p', order.entrega, 'adminOrderMuted'), element('code', order.id), element('p', date(order.criado_em), 'adminOrderMuted'));
      const client = element('div', undefined, 'adminOrderClient'); client.append(element('small', 'CLIENTE'), element('strong', order.cliente.nome_time), element('p', order.cliente.email || order.cliente.login), element('small', 'Conta: ' + order.cliente.id));
      const state = element('div', undefined, 'adminOrderState'); state.append(element('span', order.status_rotulo, 'adminOrderBadge adminOrderBadge--' + order.status));
      const payment = element('span', order.pagamento.rotulo, 'adminOrderBadge adminOrderBadge--' + order.pagamento.tipo); state.append(payment);
      if (order.pagamento.valor !== null) state.append(element('strong', money(order.pagamento.valor)));
      card.append(preview, details, client, state); list.append(card);
    }
    if (!data.pedidos.length) list.append(element('p', 'Nenhum pedido encontrado para esses filtros.', 'adminOrdersEmpty'));
    page = data.pagina; pages = data.paginas;
    dialog.querySelector('[data-admin-page]').textContent = `Página ${page} de ${pages} · ${data.total} pedidos encontrados`;
    dialog.querySelector('[data-admin-previous]').disabled = page <= 1; dialog.querySelector('[data-admin-next]').disabled = page >= pages;
    dialog.querySelector('[data-admin-updated]').textContent = 'Atualizado em ' + date(data.atualizado_em) + ' · horário de Brasília. Atualiza a cada 30 s.';
    if (data.registros_ilegíveis) notice.textContent = 'Alguns registros antigos não puderam ser lidos: ' + data.registros_ilegíveis + '.';
  }
  async function load() {
    if (!allowed || !dialog.open) return;
    const stamp = ++revision; controller?.abort(); controller = new AbortController(); imageQueue.length = 0; observer?.disconnect();
    loading = true; notice.textContent = 'Consultando pedidos…'; list.setAttribute('aria-busy', 'true');
    const params = new URLSearchParams(new FormData(form)); params.set('pagina', String(page)); params.set('limite', '25');
    try {
      const response = await request('/admin/pedidos?' + params, controller.signal), data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Não foi possível consultar os pedidos.');
      if (stamp !== revision) return;
      notice.textContent = ''; render(data);
    } catch (error) { if (stamp === revision && error.name !== 'AbortError') notice.textContent = error.message; }
    finally { if (stamp === revision) { loading = false; list.setAttribute('aria-busy', 'false'); } }
  }
  function open() { if (!allowed || !token()) return; session = token(); if (!dialog.open) dialog.showModal(); page = 1; void load(); }
  entry.addEventListener('click', open);
  form.addEventListener('submit', event => { event.preventDefault(); page = 1; void load(); });
  dialog.querySelector('[data-admin-refresh]').addEventListener('click', () => void load());
  dialog.querySelector('[data-admin-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', cleanup);
  photo.querySelector('button').addEventListener('click', () => photo.close());
  photo.addEventListener('close', () => { const img = photo.querySelector('img'), url = img.getAttribute('src'); img.removeAttribute('src'); if (url) { URL.revokeObjectURL(url); urls.delete(url); } });
  dialog.querySelector('[data-admin-previous]').addEventListener('click', () => { if (page > 1) { page--; void load(); } });
  dialog.querySelector('[data-admin-next]').addEventListener('click', () => { if (page < pages) { page++; void load(); } });
  window.addEventListener('storage', event => { if (event.key === 'omascote_token' || event.key === null) setAccount(null); });
  document.getElementById('btnSair')?.addEventListener('click', () => setAccount(null));
  window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); else cleanup(); });
  setInterval(() => { if (dialog.open && allowed && !document.hidden && !photo.open && !loading) void load(); }, 30000);
  window.OmascoteAdminOrders = Object.freeze({ setAccount });
  setAccount(window.omascoteTesterAccount || null);
})();
