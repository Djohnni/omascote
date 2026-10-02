/* Presentation only: every answer, upload, validator and submit handler belongs to the original chat. */
(() => {
  'use strict';
  const sessions = new Map();
  let deliveryRequest = null;
  const flows = new Set(['proximo_jogo','resultado','jogador_escudo','contratacao','escalacao',
    'patrocinador','escudo3d','proximo_jogo_jogador','resultado_jogo_jogador']);
  const plans = {
    proximo_jogo: [['matchup'],['match_datetime','competition'],['home_crest','away_crest'],
      ['photo_mode'],['scenario_id'],['venue','section_title'],['coupon_code']],
    resultado: [['score'],['competition','headline'],['home_crest','away_crest'],['photo_mode'],
      ['scorers','section_title'],['scenario_id'],['coupon_code']],
    jogador_escudo: [['team_crest'],['players','player_photos'],['visual_style','coupon_code']],
    contratacao: [['team_crest'],['players'],['player_photos','jersey_reference'],
      ['visual_style','reference_layout'],['coupon_code']],
    escalacao: [['matchup'],['players'],['match_datetime','competition'],['venue','team_photo'],
      ['team_crest','opponent_crest'],['scenario_id'],['coupon_code']],
    patrocinador: [['title','team_crest'],['sponsor_logos'],['headline','visual_style'],['coupon_code']],
    escudo3d: [['team_crest'],['visual_style','coupon_code']],
    proximo_jogo_jogador: [['matchup'],['match_datetime','competition'],
      ['home_crest','away_crest'],['athlete_photos'],['venue','visual_style'],['coupon_code']],
    resultado_jogo_jogador: [['score'],['competition','headline'],['home_crest','away_crest'],
      ['athlete_photos'],['visual_style','coupon_code']]
  };
  const labels = {
    sport:'Esporte', other_sport:'Modalidade', sport_context:'Local e equipamentos',
    matchup:'Confronto', match_datetime:'Data e horário', competition:'Competição', venue:'Local',
    score:'Placar', team_crest:'Escudo', home_crest:'Escudo do Time A', away_crest:'Escudo do Time B',
    opponent_crest:'Escudo adversário', team_photo:'Foto da equipe', photo_mode:'Fotos (opcional)',
    mascot_description:'Animal ou personagem', match_photo:'Foto', uniform_image:'Camiseta',
    scenario_id:'Cenário', visual_style:'Estilo', section_title:'Título (opcional)',
    headline:'Texto da arte', scorers:'Quem marcou (opcional)', players:'Atletas',
    player_photos:'Fotos dos atletas', athlete_photos:'Fotos do atleta',
    jersey_reference:'Camiseta', reference_layout:'Referência (opcional)',
    title:'Título', sponsor_logos:'Patrocinadores', coupon_code:'Cupom (opcional)'
  };
  const isProduct = () => document.body.dataset.productView === 'product';
  const notify = data => window.parent.postMessage(data, location.origin);

  function hideDelivery(delivery) {
    return !!(deliveryRequest && delivery && !delivery.batch && delivery.drafts.length === 1 &&
      delivery.drafts[0].id === deliveryRequest.id && isProduct());
  }

  function groupFields(flow, fields, draft) {
    const lookup = new Map(fields.map(field => [field.key, field]));
    const ordered = [['sport'],['other_sport','sport_context'],...(plans[flow] || [])];
    const used = new Set(ordered.flat());
    const remaining = fields.filter(field => !used.has(field.key));
    for (let index = 0; index < remaining.length; index += 2) {
      ordered.push(remaining.slice(index,index + 2).map(field => field.key));
    }
    const groups = [];
    ordered.forEach((keys,index) => {
      const group = {id:keys.join('-'),rank:index * 100,
        fields:keys.map(key => lookup.get(key)).filter(Boolean)};
      if (!group.fields.length) return;
      groups.push(group);
      if (keys.includes('photo_mode') && ['Mascote','Não tenho mascote'].includes(draft.values.photo_mode)) {
        const details = [];
        if (draft.values.photo_mode === 'Não tenho mascote') details.push({key:'mascot_description',
          label:'Qual animal ou personagem você quer como mascote?',type:'text',required:true,presentationPart:'mascot-description'});
        details.push({key:'uniform_image',label:'Camiseta do time',type:'images',required:false,presentationPart:'mascot-shirt'});
        groups.push({id:'mascot-details',rank:index * 100 + 1,fields:details});
      }
      if (flow === 'contratacao' && keys.includes('players')) {
        const athletes = (draft.values.players || '').split('\n').filter(line => line.trim()).slice(0,10);
        athletes.forEach((line,athleteIndex) => groups.push({id:`contract-athlete-${athleteIndex}`,rank:index * 100 + athleteIndex + 1,
          fields:[{key:`__contract_${athleteIndex}`,label:line.split('|')[0].trim(),type:'contract-options',
            presentationPart:'contract-athlete',athleteIndex}]}));
      }
    });
    return groups;
  }

  function Form(props) {
    const React = props.react, h = React.createElement, draft = props.draft;
    const saved = sessions.get(draft.id);
    const [productMode,setProductMode] = React.useState(isProduct);
    const [stageKey,setStageKey] = React.useState(saved?.stageKey || 'sport');
    const [delivery,setDelivery] = React.useState(saved?.delivery ||
      (draft.values.delivery_mode === 'image_video' ? 'image_video' : 'image'));
    const [error,setError] = React.useState('');
    const [sportsOpen,setSportsOpen] = React.useState(false);
    const container = React.useRef(null), submitLock = React.useRef(false);
    const lastRank = React.useRef(saved?.rank || 0);
    const active = !!(props.integrated && productMode && flows.has(draft.flow));
    const groups = groupFields(draft.flow, props.fields, draft);
    let groupIndex = groups.findIndex(group => group.id === stageKey);
    if (stageKey !== 'final' && groupIndex < 0) {
      groupIndex = groups.findIndex(group => group.rank >= lastRank.current);
      if (groupIndex < 0) groupIndex = Math.max(0,groups.length - 1);
    }
    const current = stageKey === 'final' ? null : groups[groupIndex];
    const effectiveKey = current?.id || 'final';
    const total = groups.length + 1, step = current ? groupIndex + 1 : total;

    React.useEffect(() => {
      const update = () => setProductMode(isProduct());
      window.addEventListener('omascote:product-mode',update);
      update();
      return () => window.removeEventListener('omascote:product-mode',update);
    },[]);
    React.useEffect(() => {
      if (!active) return;
      if (effectiveKey !== stageKey) setStageKey(effectiveKey);
      if (current) lastRank.current = current.rank;
      sessions.set(draft.id,{stageKey:effectiveKey,delivery,rank:lastRank.current});
      document.body.dataset.guidedProduct = String(step);
      notify({type:'omascote-chat:guided-stage',active:true,step,total});
      return () => {
        delete document.body.dataset.guidedProduct;
        notify({type:'omascote-chat:guided-stage',active:false});
      };
    },[active,draft.id,effectiveKey,stageKey,step,total,delivery]);
    React.useEffect(() => {
      if (!active || !hideDelivery(props.pendingDelivery)) return;
      const request = deliveryRequest;
      deliveryRequest = null; // Consume before Be(): StrictMode and double clicks cannot send twice.
      submitLock.current = false;
      void props.confirmDelivery(request.mode);
    },[active,props.pendingDelivery,props.confirmDelivery]);
    React.useEffect(() => {
      if (props.error) {
        submitLock.current = false;
        if (deliveryRequest?.id === draft.id) deliveryRequest = null;
      }
    },[props.error,draft.id]);
    React.useEffect(() => () => {
      if (deliveryRequest?.id === draft.id) deliveryRequest = null;
    },[draft.id]);
    React.useEffect(() => setSportsOpen(false),[draft.values.sport]);

    if (!active) return props.original;

    function focusField(key) {
      requestAnimationFrame(() => {
        const field = container.current?.querySelector(`[data-field="${key}"]`);
        (field?.querySelector('input:not([type="file"]),textarea,[role="radio"],[tabindex="0"]') || field)?.focus();
      });
    }
    function navigate(key) {
      if (props.busy) return;
      setError('');
      setStageKey(key);
      requestAnimationFrame(() => {
        container.current?.querySelector('.guided-title')?.focus();
        notify({type:'omascote-chat:guided-scroll'});
      });
    }
    function issueKey(issue) {
      const direct = groups.flatMap(group => group.fields).find(field => field.type !== 'contract-options' && issue.includes(field.label));
      if (direct) return direct.key;
      if (issue === 'Informe o nome da modalidade.') return 'other_sport';
      if (issue.startsWith('Informe os dois participantes')) return 'matchup';
      if (issue.startsWith('Confira os dois times e os dois valores')) return 'score';
      if (issue.startsWith('Envie uma foto para cada atleta')) return 'player_photos';
      if (issue.startsWith('O limite é 10 atletas') || issue.startsWith('Informe nome e posição/categoria') ||
          issue.startsWith('Informe pelo menos dois atletas')) return 'players';
      if (issue.includes('Qual animal ou personagem')) return 'mascot_description';
      if (issue.includes('foto que vai aparecer')) return 'photo_mode';
      if (issue.includes('visual da arte') && props.fields.some(field => field.key === 'scenario_id')) return 'scenario_id';
      return null;
    }
    function blockingIssues() {
      // ze() first normalizes natural-language dates. Do not bypass or obstruct that original path.
      return props.validate(draft).filter(issue => !issue.startsWith('Não consegui entender a data e o horário.'));
    }
    function next() {
      if (props.busy || !current) return;
      const issues = blockingIssues().filter(issue => current.fields.some(field => field.key === issueKey(issue)));
      if (issues.length) {
        setError(issues.join('; '));
        focusField(issueKey(issues[0]));
        return;
      }
      navigate(groups[groupIndex + 1]?.id || 'final');
    }
    function send() {
      if (props.busy || submitLock.current) return;
      const issues = blockingIssues();
      if (issues.length) {
        const invalid = groups.find(group => group.fields.some(field => issues.some(issue => issueKey(issue) === field.key)));
        if (invalid) setStageKey(invalid.id);
        setError(issues.join('; '));
        focusField(issueKey(issues[0]));
        return;
      }
      submitLock.current = true;
      setError('');
      // Escudo 3D already has a model/delivery seed from its original gallery and ze() sends it directly.
      if (draft.flow !== 'escudo3d') deliveryRequest = {id:draft.id,mode:props.canVideo ? delivery : 'image'};
      void props.submit();
    }
    function containsFile(node) {
      if (!React.isValidElement(node)) return false;
      return (node.type === 'input' && node.props.type === 'file') ||
        React.Children.toArray(node.props.children).some(containsFile);
    }
    function accessibleUpload(node) {
      if (!React.isValidElement(node)) return node;
      const keyboard = node.type === 'label' && containsFile(node) ? {
        tabIndex:props.busy ? -1 : 0,
        onKeyDown:event => {
          if (!props.busy && ['Enter',' '].includes(event.key)) {
            event.preventDefault();
            event.currentTarget.querySelector('input[type="file"]')?.click();
          }
        }
      } : {};
      return React.cloneElement(node,keyboard,React.Children.map(node.props.children,accessibleUpload));
    }
    function originalPart(field) {
      if (['mascot-description','mascot-shirt'].includes(field.presentationPart)) {
        const source = props.fields.find(item => item.key === 'photo_mode');
        if (!source) return null;
        const node = props.renderField(source);
        const children = node.props.children; // Keep the original null slots: the indices are intentional.
        return children[field.presentationPart === 'mascot-description' ? 1 : 2];
      }
      if (field.presentationPart === 'contract-athlete') {
        const source = props.fields.find(item => item.key === 'players');
        if (!source) return null;
        const node = props.renderField(source);
        return React.Children.toArray(node.props.children).filter(child => child.type === 'fieldset')[field.athleteIndex];
      }
      const node = props.renderField(field);
      if (field.key === 'photo_mode') {
        const children = node.props.children;
        return React.cloneElement(node,{},children[0],children[3]);
      }
      if (draft.flow === 'contratacao' && field.key === 'players') {
        return React.cloneElement(node,{},node.props.children[0]);
      }
      return node;
    }
    function shortLabel(field) {
      if (field.label && (/símbolo|logo do outro participante/.test(field.label) ||
          /^Quem participa|^Qual foi o resultado/.test(field.label))) return field.label;
      const label = labels[field.key] || field.label;
      return field.label?.includes('equipe') ? label?.replace(/Time/g,'Equipe') : label;
    }
    function field(field) {
      let visible = field;
      if (field.key === 'sport' && !sportsOpen) {
        visible = {...field,options:field.options.filter(option => ['Futebol','Futsal','Vôlei',draft.values.sport].includes(option))};
      }
      const needsHint = ['players','player_photos','sport_context'].includes(field.key);
      const hideLabel = ['contract-athlete','mascot-shirt'].includes(field.presentationPart);
      return h('div',{className:'guided-field','data-field':field.key,key:field.key,tabIndex:-1},
        h('div',{className:hideLabel ? 'sr-only' : 'guided-label',id:`guided-product-label-${field.key}`},shortLabel(field)),
        needsHint && field.hint ? h('p',{className:'guided-hint'},field.hint) : null,
        h('div',{role:'group','aria-labelledby':`guided-product-label-${field.key}`},accessibleUpload(originalPart(visible))),
        field.key === 'sport' && !sportsOpen ? h('button',{type:'button',className:'guided-text-button',
          onClick:()=>setSportsOpen(true)},'Outro esporte') : null);
    }
    function option(mode,text,price) {
      return h('label',{className:'guided-delivery-option',key:mode},
        h('input',{type:'radio',name:`guided-product-delivery-${draft.id}`,value:mode,checked:delivery === mode,
          onChange:()=>setDelivery(mode),disabled:props.busy}),
        h('span',null,text),h('strong',null,price));
    }
    function deliveryOptions() {
      if (draft.flow !== 'escudo3d') return h('fieldset',{className:'guided-delivery','aria-label':'Como você quer receber?'},
        option('image','Somente imagem',props.product.priceLabel),
        props.canVideo ? option('image_video','Imagem + vídeo',props.videoPrice) : null);
      const video = draft.values.delivery_mode === 'image_video', omni = video && draft.values.video_model === 'omni';
      return h('div',{className:'guided-delivery guided-selected-delivery','aria-label':'Entrega escolhida'},
        h('div',{className:'guided-delivery-option'},h('span',null,video ? `Imagem + vídeo de ${omni ? 10 : 8} segundos` : 'Somente imagem'),
          h('strong',null,video ? omni ? 'R$ 19,90' : props.videoPrice : props.product.priceLabel)));
    }
    function review() {
      const extra = ['mascot_description','match_photo','uniform_image','visual_style'];
      const all = [...props.fields,...extra.filter(key => !props.fields.some(field => field.key === key))
        .map(key => ({key,type:['match_photo','uniform_image'].includes(key) ? 'images' : 'text'}))];
      const rows = all.map(item => {
        const files = draft.files.filter(file => file.field === item.key), value = draft.values[item.key];
        if (!files.length && !value?.trim()) return null;
        const related = item.key === 'match_photo' ? 'photo_mode' :
          item.key === 'visual_style' && props.fields.some(field => field.key === 'scenario_id') ? 'scenario_id' : item.key;
        const group = groups.find(group => group.fields.some(field => field.key === related));
        if (!group) return null;
        return h('div',{className:'guided-review-row',key:item.key,'data-review-field':item.key},
          h('div',{className:'guided-review-answer'},h('small',null,shortLabel(item) || item.key),
            files.length ? h('div',{className:'guided-review-files'},files.map(file => h('span',{key:file.id},
              h('img',{src:file.url,alt:file.name,width:36,height:36,loading:'lazy'}),h('span',null,file.name)))) : h('span',null,value)),
          h('button',{type:'button',className:'guided-text-button','aria-label':`Editar ${shortLabel(item)}`,
            onClick:()=>navigate(group.id)},'Editar'));
      }).filter(Boolean);
      return h('div',{className:'guided-review','aria-label':'Revisão do pedido'},
        h('h3',null,'Revisão'),...rows);
    }
    const problem = error; // Backend/upload failures keep their original form-error outside this presentation.
    const button = h('button',{type:'button',className:'guided-primary',disabled:props.busy,
      'aria-label':current ? 'Continuar' : 'Enviar pedido',onClick:current ? next : send},
      current ? 'Continuar →' : 'Enviar pedido →');
    return h('section',{className:'lab-form guided-product','data-step':step,'data-stage-key':effectiveKey,
      'data-final':String(!current),'aria-label':`Informações para ${props.product.name}`,ref:container},
      h('div',{className:'guided-progress',role:'progressbar','aria-label':'Etapas do pedido',
        'aria-valuemin':0,'aria-valuemax':total,'aria-valuenow':step,'aria-valuetext':`Etapa ${step} de ${total}`,
        style:{gridTemplateColumns:`repeat(${total},minmax(0,1fr))`}},
        Array.from({length:total},(_,index) => h('span',{key:index,className:index < step ? 'is-active' : '','aria-hidden':true}))),
      h('div',{className:'guided-top'},h('button',{type:'button',className:'guided-back',disabled:props.busy,
        onClick:()=>step > 1 ? navigate(groups[step - 2].id) : notify({type:'omascote-chat:guided-home'})},'← Voltar'),
        h('span',{className:'guided-count','aria-label':`Etapa ${step} de ${total}`},`${step}/${total}`)),
      h('div',{className:'lab-form-heading'},h('strong',{className:'guided-title',role:'heading','aria-level':2,tabIndex:-1},
        current ? props.product.name : 'Finalizar'),h('span',{className:'sr-only','aria-live':'polite'},props.saveStatus)),
      draft.stage !== 'collect' ? h('div',{className:'lab-submit-status',role:'status'},'Enviando pedido…') :
        h('fieldset',{className:'guided-fields',disabled:props.busy},
          current ? current.fields.map(field) : deliveryOptions(),
          problem ? h('p',{className:'guided-error',role:'alert'},problem) : null,
          button,!current ? review() : null),
      h('button',{type:'button',className:'guided-help',disabled:props.busy,
        onClick:()=>notify({type:'omascote-chat:guided-help'})},'Ajuda'));
  }

  window.OmascoteGuidedProducts = {Form,hideDelivery};
})();
