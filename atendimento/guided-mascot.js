/* Presentation only. Fields, validation, uploads and order handlers come from the existing chat. */
(() => {
  'use strict';
  let deliveryRequest = null;
  const sessions = new Map();
  const firstKeys = new Set(['mascot_animal', 'sport', 'other_sport', 'sport_context']);
  const uploadKeys = new Set(['team_crest', 'uniform_image']);
  const labels = {
    mascot_animal: 'Animal ou personagem', sport: 'Esporte', other_sport: 'Modalidade',
    sport_context: 'Local e equipamentos', team_crest: 'Escudo', uniform_image: 'Camiseta',
    scenario_id: 'Cenário', coupon_code: 'Cupom', visual_style: 'Estilo'
  };
  const notify = data => window.parent.postMessage(data, location.origin);
  const isProduct = () => document.body.dataset.productView === 'product';

  function hideDelivery(delivery) {
    return !!(deliveryRequest && delivery && !delivery.batch &&
      delivery.drafts.length === 1 && delivery.drafts[0].id === deliveryRequest.id && isProduct()) ||
      !!window.OmascoteGuidedProducts?.hideDelivery(delivery);
  }

  function Form(props) {
    const React = props.react, h = React.createElement;
    const draft = props.draft;
    const fields = window.OmascoteGuidedProducts.visibleFields(props.fields);
    // Match the original chat's optional presentation; the scenario keeps its
    // required metadata and valid default while its renderer also contains style.
    const isOptional = field => !field.required || field.key === 'scenario_id';
    const optional = fields.filter(isOptional);
    const groupOptionals = optional.length >= 2;
    const total = groupOptionals ? 4 : 3;
    const first = fields.filter(field => firstKeys.has(field.key) && (!groupOptionals || !isOptional(field)));
    first.sort((a, b) => (a.key === 'mascot_animal' ? -1 : b.key === 'mascot_animal' ? 1 : 0));
    const uploads = fields.filter(field => uploadKeys.has(field.key));
    const extras = fields.filter(field => !firstKeys.has(field.key) && !uploadKeys.has(field.key));
    const second = groupOptionals
      ? fields.filter(field => !firstKeys.has(field.key) && !isOptional(field)) : uploads;
    const [productMode, setProductMode] = React.useState(isProduct);
    const saved = sessions.get(draft.id);
    const [step, setStep] = React.useState(Math.min(saved?.step || 1, total));
    const [delivery, setDelivery] = React.useState(saved?.delivery || 'image');
    const [error, setError] = React.useState('');
    const [extrasOpen, setExtrasOpen] = React.useState(false);
    const [shirtOpen, setShirtOpen] = React.useState(false);
    const [sportsOpen, setSportsOpen] = React.useState(false);
    const container = React.useRef(null);
    const submitLock = React.useRef(false);
    const active = props.integrated && productMode && draft.flow === 'mascote_uniforme';

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
          stageKey:step === total ? 'final' : groupOptionals && step === total - 1 ? 'optional' : step === 1 ? 'mascot' : 'crest'});
      }
      return () => {
        delete document.body.dataset.guidedMascot;
        notify({type:'omascote-chat:guided-stage', active:false});
      };
    }, [active, draft.id, step, delivery, total]);
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
      const group = step === 1 ? first : step === 2 ? second : optional;
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
      const issues = props.validate(draft);
      if (issues.length) {
        notify({type:'omascote-chat:analytics-blocked',productId:draft.flow,action:'enviar'});
        const invalidFirst = issuesFor(first), invalidSecond = issuesFor(second);
        setStep(invalidFirst.length ? 1 : invalidSecond.length ? 2 : groupOptionals ? total - 1 : total);
        if (!groupOptionals && !invalidFirst.length && !invalidSecond.length) setExtrasOpen(true);
        setError(issues.join('; '));
        return;
      }
      submitLock.current = true;
      setError('');
      deliveryRequest = {id:draft.id, mode:props.canVideo ? delivery : 'image'};
      // Same sequence as the chat: ze() validates, then Be() uses its reviewed draft.
      void props.submit();
    }
    function field(field) {
      if (!field) return null;
      let visibleField = field;
      if (field.key === 'sport' && !sportsOpen) {
        visibleField = {...field, options:field.options.filter(option => ['Futebol','Futsal','Vôlei',draft.values.sport].includes(option))};
      }
      return h('div', {className:'guided-field', 'data-field':field.key, key:field.key, tabIndex:-1},
        h('div', {className:'guided-label', id:`guided-label-${field.key}`}, labels[field.key] || field.label),
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
    const shield = draft.files.find(file => file.field === 'team_crest');
    const shirt = draft.files.some(file => file.field === 'uniform_image');
    return h('section', {className:'lab-form guided-mascot', 'data-step':step,
      'data-stage-key':step === total ? 'final' : groupOptionals && step === total - 1 ? 'optional' : step === 1 ? 'mascot' : 'crest',
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
        (groupOptionals ? ['Seu mascote','Seu escudo','Os itens abaixo são opcionais','Finalizar'] : ['Seu mascote','Seu escudo','Finalizar'])[step-1]),
        h('span', {className:'sr-only', 'aria-live':'polite'}, props.saveStatus)),
      draft.stage !== 'collect' ? h('div', {className:'lab-submit-status', role:'status'}, 'Enviando pedido…') :
      h('fieldset', {className:'guided-fields', disabled:props.busy},
        step === 1 ? first.map(field) : null,
        step === 2 && groupOptionals ? second.map(field) : step === 2 ? h(React.Fragment, null,
          field(uploads.find(field => field.key === 'team_crest')),
          h('details', {className:'guided-optional-shirt', open:shirtOpen || shirt,
            onToggle:event=>setShirtOpen(event.currentTarget.open)},
            h('summary', null, '+ Camiseta (opcional)'), field(uploads.find(field => field.key === 'uniform_image')))) : null,
        groupOptionals && step === total - 1 ? optional.map(field) : null,
        step === total ? h(React.Fragment, null,
          h('fieldset', {className:'guided-delivery', 'aria-label':'Como você quer receber?'},
            option('image', 'Somente imagem', props.product.priceLabel),
            props.canVideo ? option('image_video', 'Imagem + vídeo', props.videoPrice) : null),
          h('button', {type:'button', className:'guided-primary', disabled:props.busy,
            'aria-label':'Enviar pedido', onClick:send}, 'Enviar pedido →'),
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
          !groupOptionals && extras.length ? h('details', {className:'guided-extras', open:extrasOpen,
            onToggle:event=>setExtrasOpen(event.currentTarget.open)}, h('summary', null, 'Personalizar (opcional)'), extras.map(field)) : null) : null,
        step !== total && error ? h('p', {className:'guided-error', role:'alert'}, error) : null,
        step !== total ? h('button', {type:'button', className:'guided-primary', disabled:props.busy,
          'aria-label':'Continuar', onClick:next}, 'Continuar →') : null),
      h('button', {type:'button', className:'guided-help', disabled:props.busy,
        onClick:()=>notify({type:'omascote-chat:guided-help'})}, 'Ajuda'));
  }

  window.OmascoteGuidedMascot = {Form, hideDelivery};
})();
