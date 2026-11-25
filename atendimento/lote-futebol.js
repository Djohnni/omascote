(function(global) {
  'use strict';
  const CAMPAIGN='futebol-omni360-20261125';
  const DONE=new Set(['qa_approved','ready']);
  const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  async function hash(text) {
    const bytes=await global.crypto.subtle.digest('SHA-256',typeof text==='string'?new TextEncoder().encode(text):text);
    return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
  }
  function validateRows(rows) {
    if(!Array.isArray(rows)||rows.length!==38)throw new Error('A campanha deve conter as 38 cenas.');
    const ids=new Set();
    for(const row of rows){
      if(!/^(P[1-5]|R[1-5]|A[12]|J1|E[12]|C[12]|S[12])-[AB]$/.test(row.id)||ids.has(row.id))throw new Error('Cena ausente ou repetida.');
      ids.add(row.id);
      if(!row.values||!row.arquivos||row.values.futebol_scene!==row.id||row.values.delivery_mode!=='image_video')throw new Error('Campos inválidos em '+row.id);
      if(!Number.isInteger(row.cents)||row.cents<1890||row.cents>2790)throw new Error('Preço inválido em '+row.id);
      for(const names of Object.values(row.arquivos))if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||/[\\/]/.test(name)))throw new Error('Referência inválida em '+row.id);
    }
    return rows;
  }
  function classify(data){
    if(data.video_pronto===true&&data.video_generation?.status==='ready'&&data.video_generation?.ready===true)return 'ready';
    if(data.pagamento_pendente===true)return 'payment';
    const status=String(data.video_generation?.status||data.status||'').toLowerCase();
    return /falh|fail|error|review|quality/.test(status)?'quality_pending':'processing';
  }
  class Queue {
    constructor(rows,io,saved={}){
      this.io=io;this.paused=true;this.rows=validateRows(rows).map(row=>{
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
      const picked=this.pending().slice(0,Math.min(2,Math.max(0,4-this.active())));
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
  const api={Queue,validateRows,classify,canonical,hash,CAMPAIGN};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.OmascoteFootballBatch=api;
  const $=id=>document.getElementById(id),frame=$('site-bridge');
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
    $('summary').textContent=sent+'/38 pedidos criados · '+ready+' concluídos · '+queue.active()+'/4 ativos · '+queue.pending().length+' a enfileirar';
    $('progress').value=ready;
    const pending=queue.rows.filter(row=>!row.orderId);
    $('totals').textContent='Restantes: preço das cenas '+money(pending.reduce((sum,row)=>sum+(row.baseCents??row.cents),0))+' · cobrança administrativa conferida '+(validated?money(pending.reduce((sum,row)=>sum+(row.finalCents||0),0)):'após conferir o cupom')+'.';
    $('start').disabled=!validated||running||!queue.pending().length;$('pause').disabled=!running;$('refresh').disabled=!account;
    if(storageKey)localStorage.setItem(storageKey,JSON.stringify({campaign:CAMPAIGN,dataset,rows:queue.snapshot()}));
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
  function couponFor(row){return row.use_demo_coupon===true?$('coupon').value.trim():'';}
  async function prepared(row){return bridge.prepare(row,await records(row),row.requestId,couponFor(row));}
  async function installRows(rows,resume){
    validateRows(rows);
    const nextDataset=await hash(canonical(rows.map(row=>({id:row.id,flow:row.flow,values:row.values,arquivos:row.arquivos,use_demo_coupon:row.use_demo_coupon===true}))));
    const old=resume||JSON.parse(localStorage.getItem(storageKey)||'null');
    if(old&&old.dataset!==nextDataset)throw new Error('Os dados desta campanha mudaram. Preserve o andamento anterior antes de substituir a lista.');
    dataset=nextDataset;
    queue=new Queue(rows,{
      changed:render,
      inspect:row=>bridge.info(row.orderId),
      async lookup(row){const result=await bridge.lookup(row.requestId);if(result.encontrado&&result.pedido?.pedido_id)return {id:result.pedido.pedido_id,state:classify(result.pedido)};if(result.status===404)return null;throw new Error(result.error||'Consulta de tentativa indisponível; envio interrompido.');},
      async submit(row){
        if(!validated)throw new Error('Confira novamente os arquivos e preços.');
        const items=await prepared(row);const fingerprint=await payloadFingerprint(items);
        if(fingerprint!==row.fingerprint)throw new Error('Dados, arquivos ou cupom mudaram depois da revisão.');
        const result=await bridge.submit(items);return result.orders?.[0];
      }
    },old?.rows||{});
    for(const row of queue.rows)row.requestId='futebol_lote_'+(await hash(account.id+'|'+CAMPAIGN+'|'+dataset+'|'+row.id)).slice(0,48);
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
    bridge=frame.contentWindow.OmascoteAdminBatch;account=await bridge.session(true);storageKey='omascote_futebol_lote_v1:'+account.id+':'+CAMPAIGN;
    $('auth').textContent='Conta administradora confirmada. Os pedidos serão feitos nesta conta.';$('controls').disabled=false;
    if(!queue){const response=await fetch('/atendimento/futebol-batch-campaign.json?v=batch-1',{cache:'no-store'});if(!response.ok)throw new Error('Não foi possível carregar a campanha.');await installRows(await response.json());}
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
      say('Conferindo '+row.id+' ('+(index+1)+'/38)…');
      const items=await prepared(row),option=items[0].futebolOption;
      if(option.id!==row.id||option.cents!==row.cents)throw new Error('A cena ou preço do catálogo mudou em '+row.id+'.');
      const quote=await bridge.quote(items,couponFor(row));
      const original=Math.round(Number(quote.valor_original)*100),final=Math.round(Number(quote.valor_final)*100);
      if(original!==option.cents||!Number.isFinite(final)||final<0)throw new Error('A API não confirmou o preço de '+row.id+'.');
      if(row.use_demo_coupon===true&&final!==0)throw new Error('O cupom não zerou a demonstração '+row.id+'. Nenhum pedido foi enviado.');
      const fingerprint=await payloadFingerprint(items);
      if(row.fingerprint&&row.fingerprint!==fingerprint)throw new Error('A tentativa '+row.id+' já foi preparada com outros arquivos/campos/cupom.');
      Object.assign(row,{baseCents:original,finalCents:final,fingerprint});render();
    }
    validated=true;say('38 cenas conferidas. Confirme abaixo para enfileirar somente os pedidos restantes.');render();
  }
  async function run(){
    if(running||!validated)return;
    const start=async lock=>{
      if(!lock)throw new Error('Outra aba está enviando esta campanha.');
      running=true;queue.paused=false;$('controls').disabled=true;$('error').textContent='';render();
      try{while(!queue.paused){await queue.step();render();if(!queue.paused){say(queue.active()>=4?'Aguardando uma das 4 vagas ativas…':'Acompanhando produção e retomando vagas…');await new Promise(resolve=>{timer=setTimeout(resolve,8000);});}}say('Novos envios pausados. Pedidos existentes foram preservados.');}
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
  $('queue-file').onchange=event=>{const file=event.target.files[0];if(file)file.text().then(JSON.parse).then(installRows).catch(fail);};
  $('resume-file').onchange=event=>{const file=event.target.files[0];if(file)file.text().then(JSON.parse).then(data=>{if(data.campaign!==CAMPAIGN)throw new Error('Andamento de outra campanha.');return installRows(queue.rows,data);}).catch(fail);};
  $('export').onclick=()=>{if(!queue)return;const packet={campaign:CAMPAIGN,dataset,rows:queue.snapshot()};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));a.download='andamento-galeria-futebol.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  connect().catch(fail);
})(typeof globalThis==='object'?globalThis:this);
