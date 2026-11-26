/* Presentation only. Fields, validation, uploads and order handlers come from the existing chat. */
(() => {
  'use strict';
  let deliveryRequest = null;
  const sessions = new Map();
  const firstKeys = new Set(['mascot_animal', 'sport', 'other_sport', 'sport_context']);
  const labels = {
    mascot_animal: 'Animal ou personagem', sport: 'Esporte', other_sport: 'Modalidade',
    sport_context: 'Local e equipamentos', team_crest: 'Escudo', uniform_image: 'Camiseta',
    scenario_id: 'Cenário', visual_style: 'Estilo'
  };
  function localPlaceholder(values) {
    const selected = values.sport === 'Outro esporte' ? values.other_sport : values.sport;
    const sport = String(selected || 'Futebol').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (['futebol','futebol de campo','society','futebol society'].includes(sport)) return 'Seu vídeo será no campo de futebol ou escolha um lugar';
    const places = {futsal:'na quadra de futsal',basquete:'na quadra de basquete',volei:'na quadra de vôlei',
      handebol:'na quadra de handebol',tenis:'na quadra de tênis','beach tennis':'na quadra de areia de beach tennis',
      padel:'na quadra de padel',corrida:'no percurso de corrida',ciclismo:'no percurso de ciclismo',
      natacao:'na piscina','jiu-jitsu':'no tatame de jiu-jítsu',judo:'no tatame de judô',
      boxe:'no ringue de boxe',mma:'no octógono de MMA'};
    return `Seu vídeo será ${places[sport] || 'no ambiente da modalidade escolhida'} ou edite aqui`;
  }
  const notify = data => window.parent.postMessage(data, location.origin);
  const isProduct = () => document.body.dataset.productView === 'product';
  const gallery = () => {
    try {return window.parent !== window && window.parent.location.origin === location.origin ? window.parent.OmascoteMascotExamples : null;}
    catch {return null;}
  };

  function hideDelivery(delivery) {
    return !!(deliveryRequest && delivery && !delivery.batch &&
      delivery.drafts.length === 1 && delivery.drafts[0].id === deliveryRequest.id && isProduct()) ||
      !!window.OmascoteGuidedProducts?.hideDelivery(delivery);
  }

  function Form(props) {
    const React = props.react, h = React.createElement;
    const draft = props.draft;
    const [bonusSummary,setBonusSummary] = React.useState(() => window.OmascoteTesterImageBonus?.getSummary() || null);
    React.useEffect(() => window.OmascoteTesterImageBonus?.subscribe(setBonusSummary), []);
    const fields = window.OmascoteGuidedProducts.visibleFields(props.fields).filter(field => field.key !== 'coupon_code');
    if (!fields.some(field => field.key === 'sport_context')) fields.push({key:'sport_context',
      label:'Local da imagem (opcional)',type:'text',required:false});
    const isOptional = field => !field.required || field.key === 'scenario_id';
    const first = fields.filter(field => firstKeys.has(field.key) && !isOptional(field));
    first.sort((a, b) => (a.key === 'mascot_animal' ? -1 : b.key === 'mascot_animal' ? 1 : 0));
    const second = fields.filter(field => !firstKeys.has(field.key) && !isOptional(field));
    const optional = fields.filter(isOptional);
    const groups = [{key:'mascot',title:'Seu mascote',fields:first},{key:'crest',title:'Seu escudo',fields:second},
      {key:'optional',title:'Os itens abaixo são opcionais',fields:optional}].filter(group => group.fields.length);
    const total = groups.length;
    const [productMode, setProductMode] = React.useState(isProduct);
    const saved = sessions.get(draft.id);
    const [step, setStep] = React.useState(Math.min(saved?.step || 1, total));
    const [delivery, setDelivery] = React.useState(draft.values.mascot_video_option
      ? draft.values.delivery_mode || 'image' : saved?.delivery || 'image');
    const selectedVideo = gallery()?.options.find(option => option.id === draft.values.mascot_video_option);
    const videoSelected = delivery === 'image_video' && !!selectedVideo;
    const imagePrice = window.OmascoteTesterImageBonus?.imagePriceLabel({productId:draft.flow,draft,
      deliveryMode:'image',regularLabel:props.product.priceLabel,summary:bonusSummary}) || props.product.priceLabel;
    const imagePriceContent = h('span',{className:imagePrice === 'GRÁTIS' ? 'imagePrice--free' : undefined},imagePrice);
    const preparedVideo = videoSelected && selectedVideo.orderEnabled !== true;
    const [error, setError] = React.useState('');
    const [sportsOpen, setSportsOpen] = React.useState(false);
    const container = React.useRef(null);
    const submitLock = React.useRef(false);
    const active = props.integrated && productMode && draft.flow === 'mascote_uniforme';
    const needsUpload = field => field.type === 'images' && !isOptional(field) &&
      !draft.files.some(file => file.field === field.key);
    const current = groups[Math.min(step,total)-1];
    const currentFields = current.fields;
    const uploadPending = currentFields.some(needsUpload);

    React.useEffect(() => {
      const update = () => setProductMode(isProduct());
      window.addEventListener('omascote:product-mode', update);
      update();
      return () => window.removeEventListener('omascote:product-mode', update);
    }, []);
    React.useEffect(() => {
      if (active) {
        sessions.set(draft.id, {step, delivery});
        document.body.dataset.guidedMascot = String(step);
        notify({type:'omascote-chat:guided-stage', active:true, step, total, productId:draft.flow,
          stageKey:step === total ? 'final' : current.key});
      }
      return () => {
        delete document.body.dataset.guidedMascot;
        notify({type:'omascote-chat:guided-stage', active:false});
      };
    }, [active, draft.id, step, delivery, total]);
    React.useEffect(() => {
      if (active && draft.values.coupon_code) props.changeField('coupon_code','');
    }, [active, draft.id, draft.values.coupon_code]);
    React.useEffect(() => {
      if (!active || !hideDelivery(props.pendingDelivery)) return;
      const request = deliveryRequest;
      deliveryRequest = null; // Consume before the original handler: StrictMode cannot send twice.
      submitLock.current = false;
      void props.confirmDelivery(request.mode);
    }, [active, props.pendingDelivery, props.confirmDelivery]);
    React.useEffect(() => {
      if (props.error) {
        submitLock.current = false;
        if (deliveryRequest?.id === draft.id) deliveryRequest = null;
      }
    }, [props.error, draft.id]);
    React.useEffect(() => () => {
      if (deliveryRequest?.id === draft.id) deliveryRequest = null;
    }, [draft.id]);
    React.useEffect(() => setSportsOpen(false), [draft.values.sport]);
    React.useEffect(() => {
      if (draft.values.mascot_video_option || draft.values.delivery_mode === 'image') {
        setDelivery(draft.values.delivery_mode || 'image');
      }
    }, [draft.values.mascot_video_option, draft.values.delivery_mode]);

    if (!active) return draft.flow !== 'mascote_uniforme' && window.OmascoteGuidedProducts
      ? h(window.OmascoteGuidedProducts.Form, {...props, key:draft.id})
      : window.OmascoteGuidedProducts.hideAppearance(React,props.original);
    function focusField(key) {
      requestAnimationFrame(() => {
        const field = container.current?.querySelector(`[data-field="${key}"]`);
        (field?.querySelector('input:not([type="file"]), textarea, [role="radio"], summary') || field)?.focus();
      });
    }
    function navigate(next) {
      setError('');
      setStep(next);
      requestAnimationFrame(() => {
        container.current?.querySelector('.guided-title')?.focus();
        notify({type:'omascote-chat:guided-scroll'});
      });
    }
    function issuesFor(group) {
      return props.validate(draft).filter(issue => group.some(field => issue.includes(field.label)) ||
        (group.some(field => field.key === 'other_sport') && issue === 'Informe o nome da modalidade.'));
    }
    function next() {
      const group = currentFields;
      const issues = issuesFor(group);
      if (issues.length) {
        notify({type:'omascote-chat:analytics-blocked',productId:draft.flow,action:'continuar'});
        setError(issues.join('; '));
        focusField(group.find(field => field.required && (field.type === 'images'
          ? !draft.files.some(file => file.field === field.key) : !draft.values[field.key]?.trim()))?.key || group[0]?.key);
        return;
      }
      navigate(step + 1);
    }
    function send() {
      if (props.busy || submitLock.current) return;
      if (preparedVideo) {setError('Esta opção de vídeo está em preparação.');return;}
      const issues = props.validate(draft);
      if (issues.length) {
        notify({type:'omascote-chat:analytics-blocked',productId:draft.flow,action:'enviar'});
        const invalidFirst = issuesFor(first), invalidSecond = issuesFor(second);
        setStep(invalidFirst.length ? 1 : invalidSecond.length ? 2 : total);
        setError(issues.join('; '));
        return;
      }
      window.OmascoteTesterImageBonus?.recordReviewed(draft,props.canVideo ? delivery : 'image');
      submitLock.current = true;
      setError('');
      deliveryRequest = {id:draft.id, mode:props.canVideo ? delivery : 'image'};
      // Same sequence as the chat: ze() validates, then Be() uses its reviewed draft.
      void props.submit();
    }
    function field(field) {
      if (!field) return null;
      let visibleField = field;
      const optionalLocal = field.key === 'sport_context' && !field.required;
      if (optionalLocal) visibleField = {...field,placeholder:localPlaceholder(draft.values)};
      if (field.key === 'sport' && !sportsOpen) {
        visibleField = {...field, options:field.options.filter(option => ['Futebol','Futsal','Vôlei',draft.values.sport].includes(option))};
      }
      return h('div', {className:`guided-field${needsUpload(field) ? ' guided-upload-pending' : ''}`, 'data-field':field.key, key:field.key, tabIndex:-1},
        h('div', {className:'guided-label', id:`guided-label-${field.key}`}, optionalLocal ? 'Local da imagem (opcional)' : labels[field.key] || field.label),
        field.hint && ['sport_context'].includes(field.key) ? h('p', {className:'guided-hint'}, field.hint) : null,
        h('div', {role:'group', 'aria-labelledby':`guided-label-${field.key}`}, accessibleUpload(props.renderField(visibleField))),
        field.key === 'sport' && !sportsOpen
          ? h('button', {type:'button', className:'guided-text-button', onClick:()=>setSportsOpen(true)}, 'Outro esporte') : null);
    }
    function accessibleUpload(node) {
      if (!React.isValidElement(node)) return node;
      const children = React.Children.map(node.props.children, accessibleUpload);
      const keyboard = node.type === 'label' && node.props.className === 'upload-button' ? {
        tabIndex:props.busy ? -1 : 0,
        onKeyDown:event => {
          if (!props.busy && ['Enter',' '].includes(event.key)) {
            event.preventDefault();
            event.currentTarget.querySelector('input[type="file"]')?.click();
          }
        }
      } : {};
      return React.cloneElement(node, keyboard, children);
    }
    function option(value, text, price) {
      return h('label', {className:'guided-delivery-option', key:value},
        h('input', {type:'radio', name:`guided-delivery-${draft.id}`, value, checked:delivery === value,
          onChange:()=>setDelivery(value), disabled:props.busy}),
        h('span', null, text), h('strong', null, price));
    }
    function changeVideo() {
      if (props.busy) return;
      gallery()?.open(choice => {
        props.changeField('mascot_video_option', choice === 'image' ? '' : choice);
        props.changeField('delivery_mode', choice === 'image' ? 'image' : 'image_video');
        setDelivery(choice === 'image' ? 'image' : 'image_video');
        return true;
      });
    }
    const shield = draft.files.find(file => file.field === 'team_crest');
    return h('section', {className:'lab-form guided-mascot', 'data-step':step,
      'data-stage-key':step === total ? 'final' : current.key,'data-final':String(step === total),
      'aria-label':'Informações para Mascote do Time', ref:container},
      h('div', {className:'guided-progress', role:'progressbar', 'aria-label':'Etapas do pedido',
        style:{gridTemplateColumns:`repeat(${total},minmax(0,1fr))`},
        'aria-valuemin':0, 'aria-valuemax':total, 'aria-valuenow':step, 'aria-valuetext':`Etapa ${step} de ${total}`},
        Array.from({length:total}, (_,index) => h('span', {key:index, className:index < step ? 'is-active' : '', 'aria-hidden':true}))),
      h('div', {className:'guided-top'},
        h('button', {type:'button', className:'guided-back', disabled:props.busy, onClick:()=>step > 1
          ? navigate(step - 1) : notify({type:'omascote-chat:guided-home'})}, '← Voltar'),
        h('span', {className:'guided-count', 'aria-label':`Etapa ${step} de ${total}`}, `${step}/${total}`)),
      h('div', {className:'lab-form-heading'}, h('strong', {className:'guided-title', role:'heading', 'aria-level':2, tabIndex:-1},
        current.title),
        h('span', {className:'sr-only', 'aria-live':'polite'}, props.saveStatus)),
      draft.stage !== 'collect' ? h('div', {className:'lab-submit-status', role:'status'}, 'Enviando pedido…') :
      h('fieldset', {className:'guided-fields', disabled:props.busy},
        currentFields.map(field),
        step === total ? h(React.Fragment, null,
          h('fieldset', {className:'guided-delivery', 'aria-label':'Como você quer receber?'},
            gallery() ? h(React.Fragment, null,
              h('p', null, videoSelected ? `Imagem + vídeo · ${selectedVideo.name}` : 'Somente imagem',
                ' · ', videoSelected ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(selectedVideo.price) : imagePriceContent),
              h('button', {type:'button', className:'guided-text-button', disabled:props.busy, onClick:changeVideo}, 'Trocar opção'))
              : h(React.Fragment, null, option('image', 'Somente imagem', imagePriceContent),
                props.canVideo ? option('image_video', 'Imagem + vídeo', props.videoPrice) : null)),
          preparedVideo ? h('p', {className:'mascot-video-pending',role:'status'},
            'Esta opção está em preparação. O envio de pedidos de vídeo será liberado quando estiver disponível.') : null,
          h('button', {type:'button', className:'guided-primary', disabled:props.busy || preparedVideo,
            'aria-label':preparedVideo ? 'Vídeo em preparação' : 'Enviar pedido', onClick:send}, preparedVideo ? 'Vídeo em preparação' : 'Enviar pedido →'),
          h(window.OmascoteGuidedProducts.PurchaseSafety, {React}),
          error ? h('p', {className:'guided-error', role:'alert'}, error) : null,
          h('div', {className:'guided-review'},
            h('span', null, [draft.values.mascot_animal, draft.values.sport === 'Outro esporte'
              ? draft.values.other_sport : draft.values.sport].filter(Boolean).join(' · ')),
            h('button', {type:'button', className:'guided-text-button', onClick:()=>navigate(1)}, 'Editar'),
            shield ? h('div', {className:'guided-review-shield'},
              h('img', {src:shield.url, alt:'Escudo enviado', width:36, height:36}),
              h('span', null, '✓ Escudo'),
              h('button', {type:'button', className:'guided-text-button', 'aria-label':'Editar escudo', onClick:()=>navigate(2)}, 'Editar')) : null),
          null) : null,
        step !== total && error ? h('p', {className:'guided-error', role:'alert'}, error) : null,
        step !== total ? h('button', {type:'button', className:`guided-primary${uploadPending ? ' guided-continue-pending' : ''}`, disabled:props.busy,
          'aria-label':'Continuar', onClick:next}, 'Continuar →') : null),
      h('button', {type:'button', className:'guided-help', disabled:props.busy,
        onClick:()=>notify({type:'omascote-chat:guided-help'})}, 'Ajuda'));
  }

  window.OmascoteGuidedMascot = {Form, hideDelivery};
})();
