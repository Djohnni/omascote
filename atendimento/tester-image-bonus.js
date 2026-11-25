/* Checkout presentation only. The API reserves and authorizes every image. */
(() => {
  'use strict';
  const products = new Set(['resultado','escalacao','contratacao','proximo_jogo','patrocinador',
    'escudo3d','proximo_jogo_jogador','resultado_jogo_jogador','jogador_escudo','mascote_uniforme']);
  const subscribers = new Set();
  let summary = null;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const truthy = value => value === true || value === 1 || ['1','true','sim','yes','on'].includes(String(value || '').trim().toLowerCase());
  const normalized = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s+_-]+/g,'');

  function normalizeSummary(value) {
    if (!object(value) || value.granted !== true || ![2,5].includes(Number(value.limit))) return null;
    const remaining = Number(value.remaining);
    if (!Number.isInteger(remaining) || remaining < 0 || remaining > Number(value.limit)) return null;
    return Object.freeze({granted:true,active:value.active === true,limit:Number(value.limit),remaining});
  }
  function update(value) {
    const next = normalizeSummary(value);
    if (next?.limit === summary?.limit && next?.remaining === summary?.remaining && next?.active === summary?.active && Boolean(next) === Boolean(summary)) return;
    summary = next;
    subscribers.forEach(callback => callback(summary));
  }
  function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    callback(summary);
    return () => subscribers.delete(callback);
  }
  function useSummary(React) {
    const [value,setValue] = React.useState(() => summary);
    React.useEffect(() => subscribe(setValue), []);
    return value;
  }
  function fieldsOf(draft) {
    return object(draft?.values) ? draft.values : object(draft) ? draft : {};
  }
  function hasVideo(fields) {
    for (const key of ['delivery_mode','modo_entrega','tipo_entrega']) {
      if (fields[key] !== undefined && !['','image','imagem','somenteimagem','imageonly'].includes(normalized(fields[key]))) return true;
    }
    if (['video_requested','request_video','gerar_video','com_video','include_video','internal_test','video_teste']
      .some(key => truthy(fields[key]))) return true;
    if (object(fields.video_generation) && (truthy(fields.video_generation.requested) ||
      truthy(fields.video_generation.internal_test) || normalized(fields.video_generation.delivery_mode) === 'imagevideo')) return true;
    if (String(fields.video_model || '').trim()) return true;
    const mascotChoice = String(fields.mascot_video_option || '').trim();
    return Boolean(mascotChoice && mascotChoice !== 'image');
  }
  function hasPaidAddon(productId, fields) {
    if (truthy(fields.hasPaidAddon) || truthy(fields.has_paid_addon)) return true;
    if (productId !== 'contratacao') return false;
    if (truthy(fields.jersey_enabled)) return true;
    return String(fields.players || '').split(/\r?\n/).some(line => truthy(line.split('|')[3]));
  }
  function imageCount(productId, fields) {
    if (!['contratacao','jogador_escudo'].includes(productId)) return 1;
    return Math.max(1,String(fields.players || '').split(/\r?\n/).filter(line => line.trim()).length);
  }
  function eligibleImage(productId, draft, {deliveryMode,summary:provided = summary} = {}) {
    const bonus = normalizeSummary(provided);
    const product = String(productId || '').trim().toLowerCase();
    const fields = fieldsOf(draft);
    if (!bonus || !bonus.active || bonus.remaining <= 0 || !products.has(product) || hasVideo(fields) || hasVideo(draft || {})) return false;
    if (deliveryMode !== undefined && !['image','imagem','somenteimagem','imageonly'].includes(normalized(deliveryMode))) return false;
    if (hasPaidAddon(product,fields) || imageCount(product,fields) > 10) return false;
    return true;
  }
  function imagePriceLabel({productId,draft,unitPrice,deliveryMode = 'image',regularLabel,summary:provided = summary} = {}) {
    const count = imageCount(productId,fieldsOf(draft));
    const covered = eligibleImage(productId,draft,{deliveryMode,summary:provided})
      ? Math.min(count,provided.remaining) : 0;
    if (count > 1 && provided?.granted && productId === 'jogador_escudo' && Number.isFinite(unitPrice)) {
      const paid = count - covered;
      const total = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(paid * unitPrice);
      if (!paid) return count + ' imagens incluídas no bônus';
      return covered + ' grátis + ' + paid + (paid === 1 ? ' paga' : ' pagas') + ' · Total ' + total;
    }
    if (!covered) return regularLabel;
    if (count > covered && Number.isFinite(unitPrice)) {
      const total = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((count - covered) * unitPrice);
      return covered + ' grátis · Total ' + total;
    }
    if (covered < count) return `Bônus para ${covered} de ${count} imagens; demais com cobrança normal`;
    return count > 1 ? 'Imagens incluídas no bônus' : 'Incluída no bônus';
  }

  const reviewed = new Map();
  function recordReviewed(draft,deliveryMode) {
    const count = eligibleImage(draft.flow,draft,{deliveryMode})
      ? Math.min(imageCount(draft.flow,fieldsOf(draft)),summary.remaining) : 0;
    reviewed.set(draft.id,count);
  }
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent || event.origin !== location.origin ||
      event.data?.type !== 'omascote-chat:tester-bonus') return;
    update(event.data.summary);
  });
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) {
      update(window.parent.omascoteTesterAccount?.tester_image_bonus);
    }
  } catch { /* A standalone or cross-origin frame starts without a benefit. */ }
  window.OmascoteTesterImageBonus = Object.freeze({getSummary:()=>summary,subscribe,useSummary,eligibleImage,imagePriceLabel,recordReviewed,reviewedFreeCount:id=>reviewed.get(id) || 0});
})();
