(function(global) {
  'use strict';
  const CAMPAIGN='futebol-omni360-20261125';
  function modeFromSearch(search=''){
    const params=new URLSearchParams(search);
    if(params.has('parallel')){
      const run=params.get('run')||'';
      if(params.get('parallel')!=='4'||params.has('single')||params.has('scene')||!/^direct-[a-z0-9][a-z0-9-]{2,70}$/.test(run))throw new Error('Teste inválido. Use parallel=4 e uma identificação direct- estável, sem escolher outras cenas.');
      return {single:false,parallel:true,isolated:true,run,scenes:['P1-A','P1-B','P2-A','P2-B'],campaign:'futebol-direct-test4:'+run,total:4,maxActive:4,maxSubmit:2};
    }
    if(!params.has('single'))return {single:false,isolated:false,campaign:CAMPAIGN,total:38,maxActive:4,maxSubmit:2};
    const run=params.get('run')||'',scene=params.get('scene')||'P1-A';
    if(params.get('single')!=='1'||!/^direct-[a-z0-9][a-z0-9-]{2,70}$/.test(run)||scene!=='P1-A')throw new Error('Teste inválido. Use uma identificação direct- estável e somente a cena P1-A.');
    return {single:true,isolated:true,run,scene,scenes:[scene],campaign:'futebol-direct-test1:'+run+':'+scene,total:1,maxActive:1,maxSubmit:1};
  }
  const storageFor=(account,mode)=>'omascote_futebol_lote_v1:'+account+':'+mode.campaign;
  const DONE=new Set(['qa_approved','ready']);
  const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  async function hash(text) {
    const bytes=await global.crypto.subtle.digest('SHA-256',typeof text==='string'?new TextEncoder().encode(text):text);
    return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
  }
  function validateRows(rows,mode=modeFromSearch()) {
    if(!Array.isArray(rows)||rows.length!==mode.total)throw new Error(mode.single?'O teste deve conter somente uma cena.':mode.parallel?'O teste deve conter somente as quatro cenas definidas.':'A campanha deve conter as 38 cenas.');
    const ids=new Set();
    for(const row of rows){
      if(!/^(P[1-5]|R[1-5]|A[12]|J1|E[12]|C[12]|S[12])-[AB]$/.test(row.id)||ids.has(row.id))throw new Error('Cena ausente ou repetida.');
      ids.add(row.id);
      if(mode.isolated&&(!mode.scenes.includes(row.id)||row.use_demo_coupon!==false||row.existing_order_id||row.status))throw new Error('O teste deve ser novo, sem cupom e conter somente '+mode.scenes.join(', ')+'.');
      if(!row.values||!row.arquivos||row.values.futebol_scene!==row.id||row.values.delivery_mode!=='image_video')throw new Error('Campos inválidos em '+row.id);
      if(!Number.isInteger(row.cents)||row.cents<1890||row.cents>2790)throw new Error('Preço inválido em '+row.id);
      for(const names of Object.values(row.arquivos))if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||/[\\/]/.test(name)))throw new Error('Referência inválida em '+row.id);
    }
    return rows;
  }
  function selectRows(rows,mode){
    validateRows(rows);
    if(!mode.isolated)return rows;
    return validateRows(mode.scenes.map(scene=>{
      const {id,titulo,variante,cents,flow,values,arquivos}=rows.find(row=>row.id===scene);
      return {id,titulo,variante,cents,flow,values:JSON.parse(JSON.stringify(values)),arquivos:JSON.parse(JSON.stringify(arquivos)),use_demo_coupon:false};
    }),mode);
  }
  async function requestIdFor(account,mode,dataset,scene){return 'futebol_lote_'+(await hash(account+'|'+mode.campaign+'|'+dataset+'|'+scene)).slice(0,48);}
  function classify(data){
    if(data.video_pronto===true&&data.video_generation?.status==='ready'&&data.video_generation?.ready===true)return 'ready';
    if(data.pagamento_pendente===true)return 'payment';
    const status=String(data.video_generation?.status||data.status||'').toLowerCase();
    return /falh|fail|error|review|quality/.test(status)?'quality_pending':'processing';
  }
  function lookupResult(result){
    if(result.encontrado===true&&result.pedido?.pedido_id)return {id:result.pedido.pedido_id,state:classify(result.pedido)};
    if(result.status===200&&result.encontrado===false&&result.resposta?.ok===true&&result.resposta?.encontrado===false)return null;
    if(result.status===404&&result.encontrado===false&&result.resposta?.encontrado===false)return null;
    throw new Error(result.error||'Consulta de tentativa indisponível; envio interrompido.');
  }
  class Queue {
    constructor(rows,io,saved={},mode=modeFromSearch()){
      this.io=io;this.mode=mode;this.paused=true;this.rows=validateRows(rows,mode).map(row=>{
        const prior=saved[row.id]||{};
        if(row.existing_order_id&&prior.orderId&&row.existing_order_id!==prior.orderId)throw new Error('Dois pedidos registrados para '+row.id);
        const orderId=row.existing_order_id||prior.orderId||'';
        return {...row,orderId,state:orderId?(prior.state||row.status||'processing'):
          (['uncertain','submitting'].includes(prior.state)?'uncertain':'pending'),requestId:prior.requestId,
          fingerprint:prior.fingerprint,baseCents:prior.baseCents,finalCents:prior.finalCents,lastError:prior.lastError||''};
      });
    }
    active(){return this.rows.filter(row=>(row.orderId&&!DONE.has(row.state))||['submitting','uncertain'].includes(row.state)).length;}
    pending(){return this.rows.filter(row=>!row.orderId&&['pending','uncertain'].includes(row.state));}
    async poll(){
      const rows=this.rows.filter(row=>row.orderId&&!DONE.has(row.state));
      let cursor=0;
      await Promise.all([0,1].map(async()=>{while(cursor<rows.length){const row=rows[cursor++];try{const data=await this.io.inspect(row);row.state=classify(data);row.lastError='';}catch(error){row.lastError=error.message;}this.io.changed(this);}}));
    }
    async step(){
      await this.poll();
      if(this.paused)return;
      for(const row of this.rows.filter(item=>item.state==='uncertain'&&!item.orderId)){
        try{const found=await this.io.lookup(row);if(found){row.orderId=found.id;row.state=found.state||'processing';}else row.state='pending';row.lastError='';}
        catch(error){row.lastError=error.message;this.paused=true;}
        this.io.changed(this);
      }
      if(this.paused)return;
      const picked=this.pending().slice(0,Math.min(this.mode.maxSubmit,Math.max(0,this.mode.maxActive-this.active())));
      for(const row of picked)row.state='submitting';
      this.io.changed(this);
      await Promise.all(picked.map(async row=>{
        try{
          const found=await this.io.lookup(row);
          if(found){row.orderId=found.id;row.state=found.state||'processing';}
          else{
            const result=await this.io.submit(row);
            if(!result?.id)throw new Error('O site não confirmou o ID. A tentativa será consultada antes de retomar.');
            row.orderId=result.id;row.state=result.paymentPending?'payment':'processing';
          }
          row.lastError='';
        }catch(error){row.state='uncertain';row.lastError=error.message;this.paused=true;}
        this.io.changed(this);
      }));
      if(!this.pending().length&&!this.active())this.paused=true;
    }
    snapshot(){return Object.fromEntries(this.rows.map(row=>[row.id,{orderId:row.orderId,state:row.state,requestId:row.requestId,
      fingerprint:row.fingerprint,baseCents:row.baseCents,finalCents:row.finalCents,lastError:row.lastError||''} ]));}
  }
  const api={Queue,validateRows,selectRows,modeFromSearch,storageFor,requestIdFor,classify,lookupResult,canonical,hash,CAMPAIGN};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.OmascoteFootballBatch=api;
  const $=id=>document.getElementById(id),frame=$('site-bridge');
  let mode;
  try{mode=modeFromSearch(global.location.search);}catch(error){$('error').textContent=error.message;return;}
  if(mode.isolated){
    document.title=mode.single?'Teste único de vídeo · O Mascote':'Teste com 4 vídeos · O Mascote';
    $('page-title').textContent=mode.single?'Teste único · '+mode.scene:'Teste paralelo · 4 vídeos';
    $('intro').textContent=mode.single?'Somente 1 pedido novo, sem cupom. Este teste tem andamento separado da galeria de 38 cenas. Identificação: '+mode.run+'.':'Somente 4 pedidos novos, sem cupom: P1-A, P1-B, P2-A e P2-B. Até 4 ativos, enviados de 2 em 2. Este andamento fica separado da galeria e do teste único. Identificação: '+mode.run+'.';
    $('start').textContent=mode.single?'Confirmar e enviar 1 teste':'Confirmar e enviar 4 testes';
    $('validate').textContent=mode.single?'Preparar 1 teste e conferir preço':'Preparar 4 testes e conferir preços';
    $('summary').textContent=mode.single?'Carregando somente a cena '+mode.scene+'…':'Carregando somente as 4 cenas do teste…';
    $('coupon').disabled=true;$('coupon-label').style.display='none';
  }
  let bridge,account,queue,storageKey,dataset,files=new Map(),recordCache=new Map(),validated=false,running=false,timer;
  const say=text=>{$('status').textContent=text;};
  const fail=error=>{$('error').textContent=error?.message||String(error);};
  function render(){
    if(!queue)return;
    $('rows').replaceChildren();
    for(const row of queue.rows){
      const tr=document.createElement('tr');if(row.orderId)tr.id='pedido-'+row.orderId;
      const label=document.createElement('td');label.textContent=row.id+' · '+row.titulo;const sub=document.createElement('small');sub.textContent=row.variante;label.append(sub);tr.append(label);
      for(const text of [money(row.baseCents??row.cents),row.finalCents==null?'A conferir':money(row.finalCents),Object.values(row.arquivos).flat().length+' imagens']){const td=document.createElement('td');td.textContent=text;tr.append(td);}
      const td=document.createElement('td');td.className='state';
      const states={qa_approved:'Conferido',ready:'Vídeo pronto',submitted:'Já enviado',processing:'Em produção',pending:'A enfileirar',submitting:'Enviando',uncertain:'Consultar tentativa antes de retomar',quality_pending:'Aguardando conferência',payment:'Pagamento pendente'};
      td.textContent=states[row.state]||row.state;
      if(row.orderId){const a=document.createElement('a');a.href='#pedido-'+encodeURIComponent(row.orderId);a.textContent=row.orderId;a.onclick=event=>{event.preventDefault();bridge.info(row.orderId).then(data=>{row.state=classify(data);say('Pedido '+row.orderId+': '+(states[row.state]||row.state));render();}).catch(fail);};const small=document.createElement('small');small.append(a);td.append(small);}
      if(row.lastError){const small=document.createElement('small');small.className='error';small.textContent=row.lastError;td.append(small);}
      tr.append(td);$('rows').append(tr);
    }
    const sent=queue.rows.filter(row=>row.orderId).length,ready=queue.rows.filter(row=>DONE.has(row.state)).length;
    $('summary').textContent=sent+'/'+mode.total+' pedidos criados · '+ready+' concluídos · '+queue.active()+'/'+mode.maxActive+' ativos · '+queue.pending().length+' a enfileirar';
    $('progress').max=mode.total;$('progress').value=ready;
    const pending=queue.rows.filter(row=>!row.orderId);
    $('totals').textContent='Restantes: preço das cenas '+money(pending.reduce((sum,row)=>sum+(row.baseCents??row.cents),0))+' · cobrança administrativa conferida '+(validated?money(pending.reduce((sum,row)=>sum+(row.finalCents||0),0)):mode.isolated?'após conferir o preço':'após conferir o cupom')+'.';
    $('start').disabled=!validated||running||!queue.pending().length;$('pause').disabled=!running;$('refresh').disabled=!account;
    if(storageKey)localStorage.setItem(storageKey,JSON.stringify({campaign:mode.campaign,dataset,rows:queue.snapshot()}));
  }
  async function records(row){
    const all=[];
    for(const [field,names] of Object.entries(row.arquivos))for(const name of names){
      if(!files.has(name))throw new Error('Falta a referência '+name);
      if(!recordCache.has(name)){const file=files.get(name),bytes=await file.arrayBuffer();recordCache.set(name,{name,type:file.type,bytes,sha256:await hash(bytes)});}
      all.push({...recordCache.get(name),field});
    }
    return all;
  }
  function couponFor(row){return !mode.isolated&&row.use_demo_coupon===true?$('coupon').value.trim():'';}
  async function prepared(row){return bridge.prepare(row,await records(row),row.requestId,couponFor(row));}
  async function installRows(rows,resume){
    validateRows(rows,mode);
    const nextDataset=await hash(canonical(rows.map(row=>({id:row.id,flow:row.flow,values:row.values,arquivos:row.arquivos,use_demo_coupon:row.use_demo_coupon===true}))));
    const old=resume||JSON.parse(localStorage.getItem(storageKey)||'null');
    if(old&&old.campaign!==mode.campaign)throw new Error('Andamento de outra campanha ou teste.');
    if(old&&old.dataset!==nextDataset)throw new Error('Os dados desta campanha mudaram. Preserve o andamento anterior antes de substituir a lista.');
    dataset=nextDataset;
    queue=new Queue(rows,{
      changed:render,
      inspect:row=>bridge.info(row.orderId),
      async lookup(row){return lookupResult(await bridge.lookup(row.requestId));},
      async submit(row){
        if(!validated)throw new Error('Confira novamente os arquivos e preços.');
        const items=await prepared(row);const fingerprint=await payloadFingerprint(items);
        if(fingerprint!==row.fingerprint)throw new Error('Dados, arquivos ou cupom mudaram depois da revisão.');
        const result=await bridge.submit(items);return result.orders?.[0];
      }
    },old?.rows||{},mode);
    for(const row of queue.rows)row.requestId=await requestIdFor(account.id,mode,dataset,row.id);
    validated=false;render();
  }
  async function payloadFingerprint(items){
    const item=items[0],assets={};
    for(const [name,asset] of Object.entries(item.order.assets))assets[name]={legacyName:asset.legacyName,
      files:await Promise.all(asset.files.map(async file=>({name:file.name,sha256:recordCache.get(file.name)?.sha256||await hash(await file.arrayBuffer())}))) };
    return hash(canonical({fields:item.order.fields,assets}));
  }
  async function connect(){
    $('error').textContent='';const deadline=Date.now()+30000;
    while(!frame.contentWindow?.OmascoteAdminBatch){if(Date.now()>deadline)throw new Error('Não foi possível abrir os formulários do site. Atualize esta página.');await new Promise(resolve=>setTimeout(resolve,150));}
    bridge=frame.contentWindow.OmascoteAdminBatch;account=await bridge.session(true);storageKey=storageFor(account.id,mode);
    $('auth').textContent='Conta administradora confirmada. Os pedidos serão feitos nesta conta.';$('controls').disabled=false;
    if(!queue){const response=await fetch('/atendimento/futebol-batch-campaign.json?v=batch-1',{cache:'no-store'});if(!response.ok)throw new Error('Não foi possível carregar a campanha.');await installRows(selectRows(await response.json(),mode));}
    render();
  }
  async function validate(){
    if(running)return;$('error').textContent='';validated=false;
    if(!queue)throw new Error('Carregue os pedidos.');
    await bridge.session(true);
    const required=new Set(queue.rows.filter(row=>!row.orderId).flatMap(row=>Object.values(row.arquivos).flat()));
    for(const name of required)if(!files.has(name))throw new Error('Falta a referência '+name);
    for(const [index,row] of queue.rows.entries()){
      if(row.orderId)continue;
      if(row.use_demo_coupon===true&&!couponFor(row))throw new Error('Informe o cupom administrativo para as demonstrações.');
      say('Conferindo '+row.id+' ('+(index+1)+'/'+mode.total+')…');
      const items=await prepared(row),option=items[0].futebolOption;
      if(option.id!==row.id||option.cents!==row.cents)throw new Error('A cena ou preço do catálogo mudou em '+row.id+'.');
      const quote=await bridge.quote(items,couponFor(row));
      const original=Math.round(Number(quote.valor_original)*100),final=Math.round(Number(quote.valor_final)*100);
      if(original!==option.cents||!Number.isFinite(final)||final<0)throw new Error('A API não confirmou o preço de '+row.id+'.');
      if(mode.isolated&&final!==original)throw new Error('O teste deve usar o preço normal, sem cupom. Nenhum pedido foi enviado.');
      if(row.use_demo_coupon===true&&final!==0)throw new Error('O cupom não zerou a demonstração '+row.id+'. Nenhum pedido foi enviado.');
      const fingerprint=await payloadFingerprint(items);
      if(row.fingerprint&&row.fingerprint!==fingerprint)throw new Error('A tentativa '+row.id+' já foi preparada com outros arquivos/campos/cupom.');
      Object.assign(row,{baseCents:original,finalCents:final,fingerprint});render();
    }
    validated=true;say(mode.single?'1 teste preparado, sem cupom. Confirme abaixo para enviar somente este pedido.':mode.parallel?'4 testes preparados, sem cupom. Confirme abaixo para enviar somente estes quatro pedidos.':'38 cenas conferidas. Confirme abaixo para enfileirar somente os pedidos restantes.');render();
  }
  async function run(){
    if(running||!validated)return;
    const start=async lock=>{
      if(!lock)throw new Error('Outra aba está enviando esta campanha.');
      running=true;queue.paused=false;$('controls').disabled=true;$('error').textContent='';render();
      try{while(!queue.paused){await queue.step();render();if(!queue.paused){say(mode.single?'Acompanhando este único teste; nenhum outro pedido será enviado.':mode.parallel?'Acompanhando somente estes 4 testes; nenhum outro pedido será enviado.':queue.active()>=4?'Aguardando uma das 4 vagas ativas…':'Acompanhando produção e retomando vagas…');await new Promise(resolve=>{timer=setTimeout(resolve,8000);});}}say('Novos envios pausados. Pedidos existentes foram preservados.');}
      finally{running=false;$('controls').disabled=false;render();}
    };
    if(!navigator.locks)throw new Error('Abra esta página em um navegador com suporte a bloqueio de abas (Chrome ou Edge).');
    await navigator.locks.request(storageKey,{ifAvailable:true},start);
  }
  $('reconnect').onclick=()=>connect().catch(fail);
  $('validate').onclick=()=>validate().catch(error=>{validated=false;render();fail(error);});
  $('start').onclick=()=>run().catch(fail);
  $('pause').onclick=()=>{if(queue)queue.paused=true;say('Pausando novos envios; as tentativas já iniciadas serão preservadas.');};
  $('refresh').onclick=()=>queue?.poll().then(render).catch(fail);
  $('coupon').oninput=()=>{validated=false;render();};
  $('reference-files').onchange=event=>{files=new Map();recordCache.clear();validated=false;for(const file of event.target.files){if(files.has(file.name)){fail(new Error('Nome repetido nas referências: '+file.name));return;}files.set(file.name,file);}$('references').textContent=files.size+' referências selecionadas. Serão usados somente os arquivos indicados em cada pedido.';render();};
  $('queue-file').onchange=event=>{const file=event.target.files[0];if(file)file.text().then(JSON.parse).then(rows=>installRows(selectRows(rows,mode))).catch(fail);};
  $('resume-file').onchange=event=>{const file=event.target.files[0];if(file)file.text().then(JSON.parse).then(data=>{if(data.campaign!==mode.campaign)throw new Error('Andamento de outra campanha ou teste.');return installRows(queue.rows,data);}).catch(fail);};
  $('export').onclick=()=>{if(!queue)return;const packet={campaign:mode.campaign,dataset,rows:queue.snapshot()};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));a.download=mode.isolated?'andamento-teste-'+mode.run+'.json':'andamento-galeria-futebol.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  connect().catch(fail);
})(typeof globalThis==='object'?globalThis:this);
