/* Navigation measurement only. Never collect answers, uploads, credentials or Pix data. */
(() => {
  'use strict';
  if (document.body.dataset.page !== 'home' || document.body.dataset.vitrine !== 'true') return;
  const home = document.getElementById('vitrineHome');
  const frame = document.getElementById('integratedChatFrame');
  if (!home || !frame) return;
  const products = {
    mascote_uniforme:'Mascote do Time', proximo_jogo:'Próximo Jogo', resultado:'Resultado do Jogo',
    jogador_escudo:'Jogador + Escudo', contratacao:'Contratação', escalacao:'Escalação',
    patrocinador:'Patrocinador', escudo3d:'Escudo 3D', proximo_jogo_jogador:'Próximo Jogo + Jogador',
    resultado_jogo_jogador:'Resultado + Jogador'
  };
  const labels = {
    inicio:'Início', catalogo:'Todas as artes', ajuda:'Ajuda / conversa', resultado:'Pedido enviado / resultado',
    conta:'Minha conta', pedidos:'Meus pedidos', saldo:'Adicionar saldo', pix:'Pagamento Pix',
    planos:'Planos', login:'Login', cadastro:'Cadastro', exemplos:'Exemplos de Escudo 3D'
  };
  const stages = {
    mascot:'Seu mascote', crest:'Seu escudo', sport:'Esporte', 'other_sport-sport_context':'Modalidade',
    matchup:'Confronto', 'match_datetime-competition':'Data e competição', 'home_crest-away_crest':'Escudos dos times',
    'competition-headline':'Competição e texto', score:'Placar', 'team_crest':'Escudo',
    'players-player_photos':'Atletas e fotos', players:'Atletas', 'player_photos-jersey_reference':'Fotos e camiseta',
    'athlete_photos':'Foto do atleta', 'title-team_crest':'Título e escudo',
    sponsor_logos:'Patrocinadores', 'team_crest-opponent_crest':'Escudos dos times',
    'photo_mode':'Fotos', 'mascot-details':'Detalhes do mascote', optional:'Opcionais', final:'Finalizar pedido'
  };
  const fields = {
    sport:'Esporte', other_sport:'Modalidade', sport_context:'Local e equipamentos', matchup:'Confronto',
    match_datetime:'Data e horário', competition:'Competição', venue:'Local', score:'Placar',
    team_crest:'Escudo', home_crest:'Escudo do Time A', away_crest:'Escudo do Time B', opponent_crest:'Escudo adversário',
    team_photo:'Foto da equipe', photo_mode:'Fotos', section_title:'Título', headline:'Texto da arte', scorers:'Quem marcou',
    players:'Atletas', player_photos:'Fotos dos atletas', athlete_photos:'Fotos do atleta', jersey_reference:'Camiseta',
    reference_layout:'Referência', title:'Título', sponsor_logos:'Patrocinadores', coupon_code:'Cupom',
    uniform_image:'Camiseta', mascot_description:'Animal ou personagem', visual_style:'Estilo', scenario_id:'Cenário'
  };
  let base = {id:'inicio', name:labels.inicio, product:''}, current = null, previous = '', lastForm = null;
  let entered = Date.now(), visibleSince = document.visibilityState === 'hidden' ? null : entered, visibleMs = 0;
  let previousLocation = location.href, pending = [], ended = false;
  const target = 'G-98RSV0WJ0J';
  function google(name, params) {
    const command = [name, {...params, send_to:target}];
    if (window.OmascoteAnalyticsReady && typeof window.gtag === 'function') window.gtag('event', ...command);
    else pending.push(command);
  }
  function track(name, params) {
    try { window.ia4Evento?.(name, params); } catch (_) {}
    try { google(name, params); } catch (_) {}
  }
  function flush() {
    if (!window.OmascoteAnalyticsReady || typeof window.gtag !== 'function') return;
    const queue = pending;
    pending = [];
    queue.forEach(command => window.gtag('event', ...command));
  }
  window.addEventListener('omascote:analytics-ready', flush);
  function params(view = current) {
    return {aba_id:view.id, aba_nome:view.name, aba_anterior:previous, produto:view.product || '',
      etapa:view.step || 0, etapas_total:view.total || 0};
  }
  function elapsed() {
    return Math.max(0, Math.round((visibleMs + (visibleSince === null ? 0 : Date.now() - visibleSince)) / 1000));
  }
  function visit(view) {
    if (current?.id === view.id) { current = view; return; }
    const initial = !current;
    if (current) track('aba_tempo', {...params(), tempo_ativo_seg:elapsed()});
    previous = current?.id || '';
    current = view;
    entered = Date.now(); visibleMs = 0;
    visibleSince = document.visibilityState === 'hidden' ? null : entered;
    track('aba_visitada', params());
    // The existing Google tag owns the initial page_view. Only actual screen changes add a view.
    if (!initial) {
      const virtual = new URL(location.href);
      virtual.hash = '/aba/' + view.id;
      google('page_view', {page_title:'O Mascote | ' + view.name, page_location:virtual.href,
        page_referrer:previousLocation, ...params()});
      previousLocation = virtual.href;
    }
  }
  const visible = node => !!node && !node.hidden && node.getClientRects().length > 0;
  const open = id => {
    const node = document.getElementById(id);
    return visible(node) && node.classList.contains('open');
  };
  function refresh() {
    let id = '';
    if (open('pixQrModal')) id = 'pix';
    else if (open('authVisitanteModal')) id = document.getElementById('authCriarContaBtn')?.style.display === 'none' ? 'login' : 'cadastro';
    else if (open('weeklyPlansModal')) id = 'planos';
    else if (open('saldoMenu')) id = 'saldo';
    else if (open('menuPedidosTopo')) id = 'pedidos';
    else if (visible(document.getElementById('accountMenuPanel'))) id = 'conta';
    else if (visible(document.getElementById('escudo3dExamples'))) id = 'exemplos';
    if (id) visit({id, name:labels[id], product:base.product});
    else if (!home.hidden) { base = {id:'inicio',name:labels.inicio,product:''}; visit(base); }
    else visit(base);
  }
  function setBase(view) { base = view; refresh(); }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || !home.hidden) return;
    const data = event.data || {};
    if (data.type === 'omascote-chat:guided-stage' && data.active === true && Object.hasOwn(products,data.productId)) {
      if (!Number.isInteger(data.step) || !Number.isInteger(data.total) || data.step < 1 || data.step > data.total || data.total > 30) return;
      // Stage keys come from schema metadata, never from a customer's answer or athlete name.
      const stage = /^contract-athlete-\d+$/.test(data.stageKey) ? 'atleta' : data.stageKey;
      if (typeof stage !== 'string') return;
      const parts = stage.split('-');
      const name = (Object.hasOwn(stages,stage) ? stages[stage] : '') || (stage === 'atleta' ? 'Detalhes do atleta' :
        parts.every(key => Object.hasOwn(fields,key)) ? parts.map(key => fields[key]).join(' / ') : '');
      if (!name) return;
      lastForm = {id:data.productId + '/' + stage, name:(products[data.productId] + ' — ' + name).slice(0,100),
        product:data.productId, step:data.step, total:data.total};
      setBase(lastForm);
    }
    if (data.type === 'omascote-chat:analytics-screen' && ['catalogo','resultado','ajuda'].includes(data.screen)) {
      setBase({id:data.screen,name:labels[data.screen],product:data.screen === 'resultado' ? base.product : ''});
    }
    if (data.type === 'omascote-chat:analytics-screen' && data.screen === 'formulario' && lastForm) setBase(lastForm);
    if (data.type === 'omascote-chat:analytics-blocked' && Object.hasOwn(products,data.productId) && ['continuar','enviar'].includes(data.action)) {
      track('aba_bloqueio', {...params(base), acao:data.action, motivo:'validacao'});
    }
  });
  const observer = new MutationObserver(refresh);
  ['vitrineHome','pixQrModal','authVisitanteModal','authCriarContaBtn','weeklyPlansModal',
    'saldoMenu','menuPedidosTopo','accountMenuPanel','escudo3dExamples'].forEach(id => {
    const node = document.getElementById(id);
    if (node) observer.observe(node,{attributes:true,attributeFilter:['class','hidden','style','aria-hidden']});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (visibleSince !== null) visibleMs += Date.now() - visibleSince;
      visibleSince = null;
    } else visibleSince = Date.now();
  });
  window.addEventListener('pagehide', () => {
    if (ended || !current) return;
    ended = true;
    track('aba_ultima', {...params(), tempo_ativo_seg:elapsed()});
    flush();
    try { window.ia4EnviarEventos?.(); } catch (_) {}
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { ended = false; visibleSince = Date.now(); } });
  refresh();
  flush();
})();
