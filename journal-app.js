(function(){
 'use strict';
 const E=JournalEngine,S=JournalStore;
 const $=id=>document.getElementById(id),uuid=()=>crypto.randomUUID();
 const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
 const val=x=>x==null?'':String(x),money=x=>x==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x),pct=x=>x==null?'—':x.toFixed(2)+'%';
 const node=(tag,props={},...children)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(props)){if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='text')n.textContent=v;else if(k==='value')n.value=val(v);else if(k==='checked'||k==='disabled'||k==='required'||k==='multiple')n[k]=Boolean(v);else n.setAttribute(k,v);}for(const c of children.flat(Infinity))if(c!==null&&c!==undefined)n.append(c instanceof Node?c:document.createTextNode(val(c)));return n;};
 const button=(text,fn,primary=false)=>node('button',{class:'btn'+(primary?' p':''),type:'button',onclick:fn},text);
 const notice=(text,kind='')=>node('div',{class:'journal-notice '+kind},text);
 const fmtDate=value=>{
  if(!value)return '—';
  const match=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date=match?new Date(+match[1],+match[2]-1,+match[3]):new Date(value);
  if(!Number.isFinite(date.getTime())||(match&&(date.getFullYear()!==+match[1]||date.getMonth()!==+match[2]-1||date.getDate()!==+match[3])))return '—';
  return [String(date.getDate()).padStart(2,'0'),String(date.getMonth()+1).padStart(2,'0'),date.getFullYear()].join('/');
 };
 function tradeLabel(t){
  const original=t.title||t.name||'';
  if(!t.ibkrConid&&!t.ibkrImported)return original;
  const m=original.match(/^([A-Z0-9.\/-]+)\s+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if(!m)return original;
  const expiry='20'+m[2]+'-'+m[3]+'-'+m[4],strike=Number(m[6])/1000;
  const parsed=new Date(expiry+'T12:00:00Z');
  if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==expiry||
   (t.expiry&&t.expiry!==expiry)||(t.strike!==''&&t.strike!=null&&Number(t.strike)!==strike))return original;
  const month=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(m[3])-1];
  const side=t.side==='short'?'Sell ':t.side==='long'?'Buy ':'';
  return m[1]+' '+month+' '+m[4]+"'"+m[2]+' '+strike+'$ '+side+(m[5]==='C'?'Call':'Put');
 }
 let fieldCounter=0;
 function field(label,input,full=false){if(!input.id)input.id='journal-field-'+(++fieldCounter);const labelId=input.id+'-label';if(input.getAttribute('role')==='group')input.setAttribute('aria-labelledby',labelId);return node('div',{class:'journal-field'+(full?' full':'')+(input.type==='checkbox'?' journal-check':'')},node('label',{for:input.id,id:labelId},label),input);}
 function input(type,value='',extra={}){return node('input',{type,value,...extra});}
 function select(options,value,extra={}){const n=node('select',extra);for(const o of options){const [v,label]=Array.isArray(o)?o:[o,o];n.append(node('option',{value:v},label));}n.value=val(value);return n;}
 function table(headers,rows){return node('div',{class:'journal-table-wrap'},node('table',{},node('thead',{},node('tr',{},headers.map(h=>node('th',{},h)))),node('tbody',{},rows.length?rows:node('tr',{},node('td',{colspan:headers.length,class:'journal-empty'},'No records yet.')))));}
 function tone(value){return value>0?'journal-positive':value<0?'journal-negative':'';}
 function currencyCell(value,pnl=true){return node('td',{class:'journal-money '+(pnl?tone(value):'')},money(value));}
 function stat(label,value,amount=null){return node('div',{class:'journal-stat'},node('small',{},label),node('strong',{class:typeof amount==='number'?tone(amount):''},value));}
 function section(title,content,open=false){const summary=node('summary',{},title),body=node('div',{class:'journal-section-body'},content);const d=node('details',{class:'journal-section'},summary,body);d.open=open;return d;}
 let store=null,legacy=[],accountFilter='',epoch=0,search='',dialog=null,busy=false,selectedId=null,tradeStatus='open',symbolFilter='',strategyFilter='';
 let analyticsRefs=new WeakMap(),analyticsContext=null,dialogTransition=false;
 function records(table){return store?.all(table)||[];}
 function setting(id,fallback){return store?.get('settings',id)?.value??fallback;}
 function accountName(id){return store?.get('accounts',id)?.name||'Unassigned';}
 function activeTrades(){return records('trades').filter(t=>!accountFilter||t.accountId===accountFilter);}
 function related(table,id){return records(table).filter(x=>x.tradeId===id);}
 function sum(t){return E.summarize(t,related('legs',t.id),related('actions',t.id),related('quotes',t.id),{feeRate:setting('feeRate',0)});}
 function version(table,id){return S.version(store?.get(table,id));}
 function mutation(table,data,deleted=false){return{table,id:data.id,data:S.plain(data),expected:version(table,data.id),deleted};}
 function guard(id){return{id,fingerprint:store.fingerprint(id)};}
 function listChoices(group,current=[]){return[...new Set([...records('lists').filter(l=>l.group===group&&!l.archived).map(l=>l.label),...current].filter(Boolean))].sort();}
 function tags(group,current=[],multiple=true){
  const box=node('div',{class:'journal-tags',role:'group'}),selected=new Set(current.filter(Boolean));
  for(const label of listChoices(group,current)){
   const chip=button(label,()=>{if(multiple){if(selected.has(label))selected.delete(label);else selected.add(label)}else{const had=selected.has(label);selected.clear();if(!had)selected.add(label)}paint();box.dispatchEvent(new Event('change',{bubbles:true}));});
   chip.classList.add('journal-chip');chip.dataset.choice=label;box.append(chip);
  }
  function paint(){for(const chip of box.children){const active=selected.has(chip.dataset.choice);chip.setAttribute('aria-pressed',String(active));chip.classList.toggle('selected',active)}}
  paint();box.selectedValues=()=>[...selected];Object.defineProperty(box,'value',{get:()=>[...selected][0]||''});return box;
 }
 function multi(group,current=[]){return tags(group,current);}
 function choices(n){return n.selectedValues();}
 function openDialog(title,drawer=false){
  dialogTransition=true;try{if(dialog)dialog.close()}finally{dialogTransition=false}
  const d=node('dialog',{class:'journal-dialog'+(drawer||analyticsContext?' journal-drawer':'')}),heading=node('h2',{id:'journal-dialog-title'},title);dialog=d;
  const close=button('×',()=>{if(!busy)d.close()});close.classList.add('journal-dismiss');close.setAttribute('aria-label','Close dialog');
  d.setAttribute('aria-labelledby',heading.id);d.append(node('header',{class:'journal-dialog-header'},heading,close));document.body.append(d);
  d.addEventListener('close',()=>{d.remove();if(dialog===d){dialog=null;selectedId=null;if(!dialogTransition)analyticsContext=null;}});
  d.addEventListener('cancel',event=>{if(busy)event.preventDefault();});d.showModal();return d;
 }
 function errorIn(d,error){let area=d.querySelector('.journal-error');if(!area){area=node('div',{class:'journal-error',role:'alert'});const footer=d.querySelector('footer');if(footer)footer.before(area);else d.append(area)}area.textContent=error.message||String(error);for(const parent of [area.closest('details')].filter(Boolean))parent.open=true;area.scrollIntoView({block:'nearest'});}
 function formFooter(d,form,label='Save'){
  const save=node('button',{class:'btn p',type:'submit'},label),cancel=button('Cancel',()=>{if(analyticsContext?.currentRef)openAnalyticsRecord(analyticsContext.currentRef);else d.close()});form.append(node('footer',{},cancel,save));return save;
 }
 function validateState(db,mutations){
  const data={};for(const name of ['trades','legs','actions','quotes']){data[name]=new Map(db.all(name).map(x=>[x.id,x]));for(const m of mutations.filter(m=>m.table===name)){if(m.deleted)data[name].delete(m.id);else data[name].set(m.id,m.data);}}
  for(const t of data.trades.values()){
   const relatedTo=name=>[...data[name].values()].filter(x=>x.tradeId===t.id);
   E.summarize(t,relatedTo('legs'),relatedTo('actions'),relatedTo('quotes'),{feeRate:setting('feeRate',0)});
  }
 }
 async function saveChanges(mutations,options={},d=dialog){
  if(busy)return false;busy=true;const generation=epoch,db=store,context=analyticsContext;
  if($('journal-save-state'))$('journal-save-state').textContent='Saving…';
  if(d)d.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await db.commit(mutations,{...options,validate:(latest,changes)=>{
   options.preflight?.(latest);
   validateState(latest,changes);
  }});if(generation!==epoch)return false;if(d)d.close();render();showStatus('Saved to your private Google Sheet.');
   if(context&&context.epoch===epoch){analyticsContext=context;if(context.currentRef)openAnalyticsRecord(context.currentRef);else analyticsList()}
   return true;}
  catch(error){if(generation===epoch){if(d)errorIn(d,error);else showStatus(error.message,true);}return false;}
  finally{busy=false;if(generation===epoch&&$('journal-save-state'))$('journal-save-state').textContent='';if(d?.isConnected)d.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 function clear(){epoch++;analyticsContext=null;analyticsRefs=new WeakMap();store=null;legacy=[];selectedId=null;accountFilter='';search='';symbolFilter='';strategyFilter='';tradeStatus='open';if(dialog)dialog.close();render();}
 async function connect(transport){
  epoch++;analyticsContext=null;analyticsRefs=new WeakMap();const generation=epoch;store=new S.Store(transport);legacy=[];accountFilter='';
  try{await store.load();if(generation!==epoch)return;render();}catch(error){if(generation===epoch)showStatus(error.message,true);}
 }
 function requireSetup(){if(!store?.initialized){showStatus('Connect your private sheet, then choose Set up journal tabs.',true);return false;}return true;}
 function setup(){
  if(!store)return;
  const d=openDialog('Set up your trading journal');
  d.append(notice('This creates eight TJ_ tabs in the selected Google file. All Data and your existing worksheets stay untouched. Make a backup copy in Google Sheets first.'));
  const form=node('form',{}),name=input('text','Main account',{required:true,maxlength:100}),rate=input('number',0,{min:0,step:.01,required:true});
  form.append(node('div',{class:'journal-fields'},field('First account name',name),field('Default commission per contract (USD)',rate)),node('small',{},'Enter your own broker tariff. A value of 0 means no estimated fees. Actual fees can always override it.'));
  formFooter(d,form,'Create journal tabs');d.append(form);
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;const generation=epoch,db=store;form.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{
    if(!name.value.trim())throw new Error('Enter an account name.');
    await db.initialize();if(generation!==epoch)return;
    if(!db.all('accounts').length){
     const id=uuid(),m=[{table:'accounts',id,data:{id,name:name.value.trim(),archived:false},expected:''},{table:'settings',id:'defaultAccount',data:{id:'defaultAccount',value:id},expected:version('settings','defaultAccount')},{table:'settings',id:'legacyAccount',data:{id:'legacyAccount',value:id},expected:version('settings','legacyAccount')},{table:'settings',id:'feeRate',data:{id:'feeRate',value:E.number(rate.value,'Commission')},expected:version('settings','feeRate')}];
     const seeds={strategy:['Technical Setup','Portfolio Income Strategy','Directional Bullish/Bearish','Hedge or Protection','Speculative Idea','Earnings Play','Volatility Play'],emotion:['Confidence','Patience','Discipline','FOMO','Fear','Greed','Stress','Curiosity','Acceptance','Boredom'],mistake:['No Mistake','Cut Winner Too Early','Impulse Entry (FOMO)','Early Entry (No Confirmation)','Oversized Position','No Valid Setup']};
     for(const [group,labels]of Object.entries(seeds))for(const label of labels){const lid=uuid();m.push({table:'lists',id:lid,data:{id:lid,group,label,archived:false},expected:''})}
     await db.commit(m,{note:'Initial journal setup'});
    }
    if(generation!==epoch)return;d.close();render();showStatus('Journal tabs are ready. You can add your first trade.');
   }catch(error){if(generation===epoch)errorIn(d,error)}finally{busy=false;if(d.isConnected)form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
 }
 function textArea(value=''){return node('textarea',{maxlength:10000},value);}
 function accountEditor(existing){
  if(!requireSetup())return;const d=openDialog(existing?'Edit account':'Add account'),form=node('form',{}),name=input('text',existing?.name||'',{required:true,maxlength:100});
  const archived=input('checkbox','',{checked:existing?.archived});form.append(field('Account name',name),field('Archive account (history is retained)',archived));formFooter(d,form);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!name.value.trim())return;const data={...S.plain(existing),id:existing?.id||uuid(),name:name.value.trim(),archived:archived.checked};if(data.archived&&setting('defaultAccount','')===data.id){errorIn(d,new Error('Choose another default account before archiving this account.'));return;}saveChanges([mutation('accounts',data)],{note:'Account updated'},d)};
 }
 function listEditor(group,existing){
  if(!requireSetup())return;const d=openDialog(existing?'Edit list value':'Add list value'),form=node('form',{}),label=input('text',existing?.label||'',{required:true,maxlength:100}),archived=input('checkbox','',{checked:existing?.archived});
  form.append(field('Label',label),field('Archive for future entry',archived),node('small',{},'Existing trades retain the labels captured when they were saved.'));formFooter(d,form);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!label.value.trim())return;saveChanges([mutation('lists',{...S.plain(existing),id:existing?.id||uuid(),group,label:label.value.trim(),archived:archived.checked})],{note:'List updated'},d)};
 }
 function legEditor(container,leg={},canRemove=true){
  const legId=leg.id||uuid();const row=node('div',{class:'journal-leg'}),fields=node('div',{class:'journal-fields'});
  const controls={kind:select(['Call','Put'],leg.kind||'Call'),side:select(['long','short'],leg.side||'long'),strike:input('number',leg.strike??'',{min:0,step:'any'}),expiry:input('date',leg.expiry||''),ratio:input('number',leg.ratio||1,{min:1,step:1}),multiplier:input('number',leg.multiplier||100,{min:1,step:'any'})};
  for(const [key,label]of Object.entries({kind:'Option type',side:'Position',strike:'Strike',expiry:'Expiry',ratio:'Contracts per strategy unit',multiplier:'Contract multiplier'}))fields.append(field(label,controls[key]));
  row.append(fields);if(canRemove)row.append(button('Remove leg',()=>row.remove()));container.append(row);
  row.read=()=>({...S.plain(leg),id:legId,...Object.fromEntries(Object.entries(controls).map(([key,c])=>[key,c.value]))});return row;
 }
 function actionFields(container,trade,legs,kind='open',existing){
  const box=node('fieldset',{}),dateControl=input('date',existing?.date||today(),{required:true}),kindControl=select(E.TYPES,existing?.kind||kind),feeMode=select([['auto','Per contract'],['actual','Actual total']],existing?.feeMode||'auto'),fee=input('number',existing?.fee??0,{min:0,step:'any'}),rate=input('number',existing?.feeRate??setting('feeRate',0),{min:0,step:'any'}),notes=textArea(existing?.notes||'');
  box.append(node('legend',{},'Execution'),node('div',{class:'journal-fields'},field('Date',dateControl),field('Event',kindControl),field('Commission mode',feeMode),field('Commission per contract (USD)',rate),field('Actual total commission (USD)',fee),field('Notes / settlement evidence',notes,true)));
  const feeField=fee.closest('.journal-field'),rateField=rate.closest('.journal-field');function feeVisibility(){feeField.hidden=feeMode.value!=='actual';rateField.hidden=feeMode.value==='actual'}feeMode.addEventListener('change',feeVisibility);feeVisibility();
  const fillBox=node('div',{});box.append(fillBox);container.append(box);
  const fills=[];
  for(const unit of E.actionUnits(trade,legs)){
   const original=existing?.fills?.find(f=>f.unitId===unit.id),q=input('number',original?.quantity??(existing?0:kind==='open'?unit.ratio:0),{min:0,step:1}),price=input('number',original?.price??'',{min:0,step:'any'});
   fillBox.append(node('div',{class:'journal-fields journal-leg'},field(unit.label+' — quantity (0 to skip)',q),field('Price per share / strategy unit (USD)',price)));
   fills.push({unit,q,price});
  }
  box.append(node('small',{},'Prices are quoted per underlying share; multiplier and quantities are applied once. Use zero only for a worthless expiry. For exercise/assignment enter the option-only settlement value from your broker; no stock position is created.'));
  return{box,kindControl,dateControl,capture:()=>({date:dateControl.value,feeMode:feeMode.value,fee:fee.value,rate:rate.value,notes:notes.value,fills:fills.map(f=>({unitId:f.unit.id,quantity:f.q.value,price:f.price.value}))}),restore:snapshot=>{if(!snapshot)return;dateControl.value=snapshot.date;feeMode.value=snapshot.feeMode;fee.value=snapshot.fee;rate.value=snapshot.rate;notes.value=snapshot.notes;for(const f of fills){const old=snapshot.fills.find(x=>x.unitId===f.unit.id);if(old){f.q.value=old.quantity;f.price.value=old.price}}feeVisibility()},read:()=>{
   const rows=fills.filter(f=>Number(f.q.value)>0).map(f=>({unitId:f.unit.id,quantity:E.qty(f.q.value),price:E.number(f.price.value,'Execution price')}));
   if(!rows.length)throw new Error('Enter a quantity and price for at least one fill.');
   const k=kindControl.value;if(['exercise','assignment'].includes(k)&&!notes.value.trim())throw new Error('Add settlement evidence / notes for exercise or assignment.');
   const action={...S.plain(existing),id:existing?.id||uuid(),tradeId:trade.id,date:E.date(dateControl.value),kind:k,order:existing?.order??Date.now(),feeMode:feeMode.value,fee:E.number(fee.value,'Commission'),feeRate:E.number(rate.value,'Commission rate'),notes:notes.value,manual:true,fills:rows};
   delete action.feeRecorded;action.feeRecorded=E.feeOf(action,trade,legs,0);return action;
  }};
 }
 function tradeEditor(existing=null,roll=null,legacySource=null){
  if(!requireSetup())return;
  const id=existing?.id||uuid(),d=openDialog(roll?'Roll — new linked trade':existing?'Edit trade':'New options trade'),form=node('form',{class:'journal-trade-form'});
  if(analyticsContext?.currentRef)analyticsBack(d,'Back to trade',()=>openAnalyticsRecord(analyticsContext.currentRef));
  const legacySnapshot=legacySource?JSON.stringify(legacySource.parsed):null;
  const accounts=records('accounts').filter(a=>!a.archived||a.id===existing?.accountId),hasActions=existing&&related('actions',id).length>0;
  if(!accounts.length){d.append(notice('Add an active account first.'));return;}
  const defaults=existing||roll?.trade||{},account=select(accounts.map(a=>[a.id,a.name]),existing?.accountId||roll?.trade.accountId||setting('defaultAccount',accounts[0].id));
  const fields={title:input('text',existing?.title||'',{required:true,maxlength:200,placeholder:'e.g. AAPL December Call'}),symbol:input('text',defaults.symbol||'',{required:true,maxlength:30,placeholder:'AAPL',autocapitalize:'characters'}),entryDate:input('date',existing?.entryDate||roll?.action.date||today(),{required:true}),mode:select([['package','One total strategy price'],['legs','Individual leg prices']],defaults.mode||'package',{disabled:Boolean(hasActions)}),side:select([['long','Debit / long'],['short','Credit / short']],defaults.side||'long'),structure:select(['Long Call','Long Put','Short Call','Short Put','Debit Vertical','Credit Vertical','Other'],defaults.structure||'Long Call'),multiplier:input('number',defaults.multiplier||100,{min:1,step:'any'}),contractsPerPackage:input('number',defaults.contractsPerPackage||1,{min:1,step:1}),strike:input('number',defaults.strike??'',{min:0,step:'any'}),expiry:input('date',defaults.expiry||''),width:input('number',defaults.width??'',{min:0,step:'any'})};
  const labels={title:'Trade name',symbol:'Underlying symbol',entryDate:'Entry date',mode:'Price accounting mode',side:'Package opening cash flow',structure:'Structure',multiplier:'Contract multiplier',contractsPerPackage:'Contracts per package (for fees)',strike:'Strike (single option)',expiry:'Expiry (package)',width:'Strike width (credit vertical)'};
  form.append(node('p',{class:'journal-form-intro'},existing?'Update the trade details. Executions are managed separately.':'Record an options trade in your private journal.'));
  const grid=node('div',{class:'journal-fields'},field('Account',account));
  for(const key of ['title','symbol','structure','entryDate','expiry','strike','width'])grid.append(field(labels[key],fields[key]));form.append(grid);
  const oldLegs=existing?related('legs',id):[],legsBox=node('div',{});
  const initialLegs=existing?oldLegs:roll?related('legs',roll.trade.id).map(l=>({...S.plain(l),id:uuid(),tradeId:id})):[];
  initialLegs.forEach(l=>legEditor(legsBox,l,!hasActions));
  const addLeg=button('Add leg',()=>{legEditor(legsBox);syncOpening()});if(hasActions)addLeg.disabled=true;
  const strategy=tags('strategy',defaults.strategy?[defaults.strategy]:[],false),confidence=input('number',defaults.confidence??'',{min:0,max:5,step:1}),emotions=multi('emotion',existing?.entryEmotions||[]),exitEmotions=multi('emotion',existing?.exitEmotions||[]),mistakes=multi('mistake',existing?.mistakes||[]);
  const extras={entryReason:textArea(existing?.entryReason||''),notes:textArea(existing?.notes||''),targetProfit:input('number',existing?.targetProfit??'',{min:0,step:'any'}),lossLimit:input('number',existing?.lossLimit??'',{min:0,step:'any'}),capitalBasis:input('number',existing?.capitalBasis??'',{min:0,step:'any'}),riskBasis:input('number',existing?.riskBasis??'',{min:0,step:'any'})};
  extras.entryReason.setAttribute('placeholder','What is the setup or reason for entering?');
  form.append(field('Strategy',strategy,true),field('Entry reason',extras.entryReason,true));
  const advanced=node('div',{},notice('Choose individual leg prices before opening if you plan to close legs separately. The accounting mode is fixed after the first execution.'),node('div',{class:'journal-fields'},...['mode','side','multiplier','contractsPerPackage'].map(key=>field(labels[key],fields[key]))),node('h3',{},'Leg details'),legsBox,addLeg);
  form.append(section('Advanced accounting & option legs',advanced,defaults.mode==='legs'));
  let initialBuilder=null,closingBuilder=null,lastOpening=null,lastClosing=null;
  const closed=input('checkbox',''),actionArea=node('div',{class:'journal-opening'}),openingTotal=node('div',{class:'journal-order-preview',role:'status','aria-live':'polite'});
  if(!existing){form.append(node('h3',{},'Opening execution'),field('This trade is already fully closed',closed),actionArea,openingTotal);}
  const review=node('div',{class:'journal-fields'},field('Confidence (0–5)',confidence),field('Entry emotions',emotions,true),field('Exit emotions',exitEmotions,true),field('Mistakes',mistakes,true),field('Trade notes',extras.notes,true),field('Profit target (USD)',extras.targetProfit),field('Planned loss limit (USD)',extras.lossLimit));
  form.append(section('Planning & personal review',review),section('Capital & risk basis',node('div',{},node('p',{class:'journal-help'},'Optional denominators for return calculations. Leave blank when unknown; missing values are never treated as zero.'),node('div',{class:'journal-fields'},field('Capital allocated — return denominator (USD)',extras.capitalBasis),field('Manual maximum-risk basis (USD)',extras.riskBasis)))));
  function readLegs(){return[...legsBox.children].map(row=>({...row.read(),tradeId:id}));}
  function draftTrade(){return{...S.plain(existing),id,accountId:account.value,...Object.fromEntries(Object.entries(fields).map(([k,c])=>[k,c.value])),strategy:strategy.value,confidence:confidence.value,entryEmotions:choices(emotions),exitEmotions:choices(exitEmotions),mistakes:choices(mistakes),...Object.fromEntries(Object.entries(extras).map(([k,c])=>[k,c.value])),manual:true};}
  function readTrade(){const t=draftTrade();if(roll)t.rollFromId=roll.trade.id;return E.cleanTrade(t);}
  function conditionalFields(){const packageMode=fields.mode.value==='package',single=['Long Call','Long Put','Short Call','Short Put'].includes(fields.structure.value);fields.strike.closest('.journal-field').hidden=!packageMode||!single;fields.width.closest('.journal-field').hidden=!packageMode||fields.structure.value!=='Credit Vertical';fields.expiry.closest('.journal-field').hidden=!packageMode;}
  function updateTotal(){if(existing)return;try{const t=readTrade(),ls=readLegs(),a=initialBuilder?.read();if(!a)throw Error();const units=E.actionUnits(t,ls);const cash=a.fills.reduce((n,f)=>{const u=units.find(u=>u.id===f.unitId);return n+f.quantity*f.price*u.multiplier*(u.side==='long'?1:-1)},0);const net=cash+a.feeRecorded;openingTotal.replaceChildren(node('span',{},net>=0?'Opening debit, including fees':'Opening credit, after fees'),node('strong',{},money(Math.abs(net))));}catch(_){openingTotal.replaceChildren(node('span',{},'Enter a quantity and price to preview the opening cash flow.'));}}
  function syncOpening(){
   conditionalFields();if(existing)return;
   lastOpening=initialBuilder?.capture()||lastOpening;lastClosing=closingBuilder?.capture()||lastClosing;initialBuilder=null;closingBuilder=null;actionArea.replaceChildren();
   try{const t=draftTrade(),ls=readLegs();ls.forEach(E.cleanLeg);E.actionUnits(t,ls);initialBuilder=actionFields(actionArea,t,ls,'open');initialBuilder.restore(lastOpening);initialBuilder.kindControl.value='open';initialBuilder.kindControl.disabled=true;initialBuilder.kindControl.closest('.journal-field').hidden=true;initialBuilder.dateControl.value=fields.entryDate.value;initialBuilder.dateControl.closest('.journal-field').hidden=true;
    if(closed.checked){closingBuilder=actionFields(actionArea,t,ls,'close');closingBuilder.restore(lastClosing);closingBuilder.kindControl.disabled=true;closingBuilder.kindControl.closest('.journal-field').hidden=true;}
   }catch(_){actionArea.append(notice('Complete the leg details above to enter the opening prices.'));}updateTotal();
  }
  fields.structure.addEventListener('change',()=>{if(!hasActions){if(['Short Call','Short Put','Credit Vertical'].includes(fields.structure.value))fields.side.value='short';else if(['Long Call','Long Put','Debit Vertical'].includes(fields.structure.value))fields.side.value='long';}syncOpening()});
  for(const key of ['mode','side','multiplier','contractsPerPackage','entryDate'])fields[key].addEventListener('change',syncOpening);
  legsBox.addEventListener('change',syncOpening);legsBox.addEventListener('click',event=>{if(event.target.closest('button'))syncOpening()});closed.addEventListener('change',syncOpening);form.addEventListener('input',updateTotal);form.addEventListener('change',updateTotal);
  const existingSummary=existing?.legacySummary;let legacyPnl,legacyPct,legacyExit;
  if(existingSummary){legacyPnl=input('number',existingSummary.pnl,{step:'any',required:true});legacyPct=input('number',existingSummary.pct??'',{step:'any'});legacyExit=input('date',existingSummary.exitDate||existing.entryDate,{required:true});form.append(section('Historical summary',node('div',{},notice('Original net result; no execution history is invented.'),node('div',{class:'journal-fields'},field('Net P&L (USD; already includes fees)',legacyPnl),field('Original reported return (%)',legacyPct),field('Exit date',legacyExit))),true));}
  formFooter(d,form,roll?'Save roll & linked opening':'Save trade');d.append(form);syncOpening();
  form.addEventListener('invalid',e=>{const hiddenSection=e.target.closest('details');if(hiddenSection)hiddenSection.open=true;},true);
  const tradeGuard=existing?guard(existing.id):null;
  form.onsubmit=event=>{event.preventDefault();try{
   const t=readTrade(),ls=readLegs();if(t.mode==='legs'&&!ls.length)throw new Error('Add at least one leg.');ls.forEach(E.cleanLeg);
   if(existingSummary)t.legacySummary={pnl:Number(legacyPnl.value),pct:legacyPct.value===''?null:Number(legacyPct.value),exitDate:E.date(legacyExit.value)};
   if(existingSummary&&fields.structure.value!==defaults.structure)delete t.legacyType;
   const mutations=[mutation('trades',t),...ls.map(l=>mutation('legs',l))];
   for(const l of oldLegs)if(!ls.some(x=>x.id===l.id))mutations.push(mutation('legs',l,true));
   if(!existing){if(!initialBuilder)throw new Error('Complete the option leg details before saving.');const a=initialBuilder.read();a.date=t.entryDate;a.kind='open';mutations.push(mutation('actions',a));if(closingBuilder){const c=closingBuilder.read();c.kind='close';c.order=a.order+1;mutations.push(mutation('actions',c));const summary=E.summarize(t,ls,[a,c]);if(summary.status!=='closed')throw new Error('Close all opening quantities for a historical closed trade.');}}
   const guards=tradeGuard?[tradeGuard]:[];if(roll){mutations.push(mutation('actions',roll.action));guards.push(roll.guard)}
   saveChanges(mutations,{guards,note:roll?'Rolled position into linked trade':existing?'Trade edited':'Trade created',
    preflight:legacySource?latest=>{
     if(!legacy.some(l=>l.key===legacySource.key&&JSON.stringify(l.parsed)===legacySnapshot)||
      latest.all('trades',true).some(x=>x.id!==t.id&&(x.legacyKey===legacySource.key||(x.legacyKeys||[]).includes(legacySource.key))))
      throw new Error('This historical source changed or was adopted elsewhere. Reopen it before saving.');
    }:undefined},d);
  }catch(error){errorIn(d,error)}};
 }
 function actionEditor(t,existing=null){
  const d=openDialog(existing?'Edit execution':'Add execution'),form=node('form',{}),builder=actionFields(form,t,related('legs',t.id),'close',existing),g=guard(t.id);
  d.append(notice('Cost basis: weighted average per package or per leg. Entry commissions are allocated proportionally to closing quantities. This journal is not a tax report.'));
  formFooter(d,form);d.append(form);form.onsubmit=e=>{e.preventDefault();try{const a=builder.read();saveChanges([mutation('actions',a)],{guards:[g],note:existing?'Execution corrected':'Execution added'},d)}catch(error){errorIn(d,error)}};
 }
 function rollEditor(t){
  const d=openDialog('Roll — close old position'),form=node('form',{}),builder=actionFields(form,t,related('legs',t.id),'close'),g=guard(t.id);
  builder.kindControl.value='close';builder.kindControl.disabled=true;d.append(notice('Step 1 of 2. Enter the old position closing fills. Nothing is saved until you also complete and save the new linked trade.'));
  formFooter(d,form,'Next: new linked trade');d.append(form);form.onsubmit=e=>{e.preventDefault();try{const a=builder.read();a.kind='close';E.summarize(t,related('legs',t.id),[...related('actions',t.id),a]);d.close();tradeEditor(null,{trade:t,action:a,guard:g});}catch(error){errorIn(d,error)}};
 }
 function quoteEditor(t){
  const d=openDialog('Update current prices'),form=node('form',{}),s=sum(t),at=input('datetime-local',new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16),{required:true}),controls=[];
  form.append(field('Price observation time (your local time)',at));for(const p of s.positions){const price=input('number',p.mark??'',{min:0,step:'any',required:true});form.append(field(p.label+' — price per share / package',price));controls.push({p,price})}
  form.append(notice('Unrealized P&L deducts the opening fees allocated to remaining contracts. Future closing fees are not estimated.'));formFooter(d,form);d.append(form);
  form.onsubmit=e=>{e.preventDefault();try{const time=new Date(at.value);if(!Number.isFinite(time.getTime()))throw new Error('Enter a valid observation time.');const m=controls.map(({p,price})=>mutation('quotes',{id:t.id+':'+p.id,tradeId:t.id,unitId:p.id,price:E.number(price.value,'Current price'),at:time.toISOString(),manual:true}));saveChanges(m,{note:'Manual market prices updated'},d)}catch(error){errorIn(d,error)}};
 }
 function deleteRecord(table,record){
  const d=openDialog('Move to recycle bin'),form=node('form',{});d.append(notice('This preserves the original record in History. Dependent calculations are checked before deletion.'));formFooter(d,form,'Move to recycle bin');d.append(form);form.onsubmit=e=>{e.preventDefault();saveChanges([mutation(table,record,true)],{guards:record.tradeId?[guard(record.tradeId)]:[],note:'Soft deletion'},d)};
 }
 function summaryView(t,s){
  return node('div',{},node('div',{class:'journal-stats'},stat('Realized net P&L',money(s.realized),s.realized),stat('Unrealized net P&L',money(s.unrealized),s.unrealized),stat('Total net P&L',money(s.combined),s.combined),stat('Recorded commissions',s.feeLegacy?'Included in legacy net':money(s.fees))),table(['Metric','Result','Denominator / meaning'],[
   node('tr',{},node('td',{},'Return on allocated capital'),node('td',{class:'journal-money '+tone(s.capitalReturn)},pct(s.capitalReturn)),node('td',{},money(t.capitalBasis>0?Number(t.capitalBasis):null))),
   node('tr',{},node('td',{},'Return on maximum-risk basis'),node('td',{class:'journal-money '+tone(s.riskReturn)},pct(s.riskReturn)),node('td',{},money(s.riskBasis??s.initialRisk))),
   node('tr',{},node('td',{},'Return relative to opening premium'),node('td',{class:'journal-money '+tone(s.premiumReturn)},pct(s.premiumReturn)),node('td',{},s.feeLegacy?'Original reported legacy percentage':money(s.premiumBase))),
  ]),notice('USD • Weighted average cost • Portfolio return is not calculated by averaging trade percentages. Maximum-risk estimates assume the defined position is managed as a whole; assignment and changed positions need review.'),s.riskReview?notice('Position size or leg balance changed. Review and enter a maximum-risk basis; the initial automatic risk is not reused as a current denominator.','warn'):null);
 }
 function detail(id){
  const t=store.get('trades',id);if(!t||t._deleted)return;selectedId=id;
  const d=openDialog(tradeLabel(t),true);d.classList.add('journal');let s;try{s=sum(t)}catch(error){d.append(notice(error.message,'error'));}
  const actions=node('div',{class:'journal-actions'},button('Edit trade',()=>tradeEditor(t)),button('History',()=>historyView(t.id)),button('Delete trade',()=>deleteRecord('trades',t)),button('Close',()=>d.close()));
  [...actions.children].find(b=>b.textContent==='Delete trade').classList.add('journal-danger');
  if(analyticsContext)analyticsBack(d,analyticsContext.selection.field?'Back to results':'Back to Overview',()=>analyticsContext.selection.field?analyticsList():d.close());
  if(s&&s.status!=='closed'&&!t.legacySummary)actions.prepend(button('Add execution',()=>actionEditor(t),true));
  if(s?.status==='open'&&!t.legacySummary)actions.prepend(button('Update prices',()=>quoteEditor(t)),button('Roll',()=>rollEditor(t)));
  d.append(node('small',{},accountName(t.accountId)+' · '+t.symbol+' · '+t.mode+' · '+(s?.status||'Needs repair')),actions);
  if(s)d.append(summaryView(t,s));
  if(s?.positions.length)d.append(node('h3',{},'Remaining positions'),table(['Position','Quantity','Average entry','Current price','Observation time'],s.positions.map(p=>node('tr',{},node('td',{},p.label),node('td',{},p.quantity),currencyCell(p.average,false),currencyCell(p.mark,false),node('td',{},p.markAt?new Date(p.markAt).toLocaleString():'Not entered')))));
  d.append(node('h3',{},'Plan & review'),node('p',{},'Strategy: '+(t.strategy||'Not set')+' · Confidence: '+(t.confidence??'—')),node('p',{},'Entry emotions: '+(t.entryEmotions||[]).join(', ')),node('p',{},'Exit emotions: '+(t.exitEmotions||[]).join(', ')),node('p',{},'Mistakes: '+(t.mistakes||[]).join(', ')),node('p',{},'Target: '+money(t.targetProfit!==''&&t.targetProfit!=null?Number(t.targetProfit):null)+' · Planned loss limit: '+money(t.lossLimit!==''&&t.lossLimit!=null?Number(t.lossLimit):null)),node('p',{class:'journal-history'},(t.entryReason||'')+'\n'+(t.notes||'')));
  const ls=related('legs',id);if(ls.length)d.append(node('h3',{},'Legs'),table(['Position','Type','Strike','Expiry','Ratio','Multiplier'],ls.map(l=>node('tr',{},...['side','kind','strike','expiry','ratio','multiplier'].map(k=>node('td',{},l[k]))))));
  if(!t.legacySummary)d.append(node('h3',{},'Execution history'),table(['Date','Event','Fills','Fees','Actions'],related('actions',id).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.order||0)-(b.order||0)).map(a=>node('tr',{},node('td',{},a.date),node('td',{},a.kind),node('td',{class:'wrap'},a.fills.map(f=>f.quantity+' × '+money(f.price)+' ['+(ls.find(l=>l.id===f.unitId)?.kind||'package')+']').join('; ')),currencyCell(E.feeOf(a,t,ls,setting('feeRate',0)),false),node('td',{},button('Edit',()=>actionEditor(t,a)),button('Delete',()=>deleteRecord('actions',a)))))));
  const summaries=new Map();for(const x of records('trades'))try{summaries.set(x.id,sum(x))}catch(_){}
  const chain=E.chain(id,records('trades'),summaries);if(chain.length>1){const net=chain.reduce((n,c)=>n+(c.summary?.realized||0),0);d.append(node('h3',{},'Roll chain — realized '+money(net)),table(['Trade','Status','Realized'],chain.map(c=>node('tr',{},node('td',{},button(tradeLabel(c.trade),()=>detail(c.trade.id))),node('td',{},c.summary?.status||'Invalid'),currencyCell(c.summary?.realized)))));}
  // Keep the overview and primary actions visible; expand the rest on demand.
  const headers=[...d.querySelectorAll(':scope > h3')];for(const heading of headers){const content=[];let sibling=heading.nextSibling;while(sibling&&!(sibling.nodeType===1&&sibling.tagName==='H3')){const next=sibling.nextSibling;content.push(sibling);sibling=next;}const title=heading.textContent;heading.replaceWith(section(title,content,title==='Remaining positions'));}

 }
 function historyView(tradeId=null){
  if(!requireSetup())return;const d=openDialog(tradeId?'Trade history':'History & recycle bin');d.classList.add('journal');
  const entries=records('history').filter(h=>!tradeId||h.recordId===tradeId||h.after?.tradeId===tradeId||h.before?.tradeId===tradeId).sort((a,b)=>String(b._at).localeCompare(String(a._at)));
  d.append(notice('Every save adds a revision. Restore creates another revision; it never erases history. Restoring a trade does not automatically restore deleted executions — restore those separately.'));
  for(const h of entries){const block=node('details',{},node('summary',{},new Date(h._at).toLocaleString()+' · '+h.entity+' · '+h.note+(h.afterDeleted?' · deleted':'')));block.append(node('pre',{class:'journal-history'},JSON.stringify({before:h.before,after:h.after,deleted:h.afterDeleted},null,2)),button('Restore this version',()=>{
   const current=store.get(h.entity,h.recordId);if(!confirm('Restore this revision as a new change?'))return;
   saveChanges([{table:h.entity,id:h.recordId,expected:S.version(current),data:h.after,deleted:h.afterDeleted}],{resolveConflict:true,note:'Restored revision '+h._change},d);
  }));d.append(block);}
  for(const name of Object.keys(S.TABLES).filter(k=>k!=='history'))for(const record of store.all(name,true).filter(r=>r._deleted))d.append(node('div',{class:'journal-notice'},name+': '+(record.title||record.name||record.id)+' ',button('Restore deleted record',()=>saveChanges([{table:name,id:record.id,expected:S.version(record),data:S.plain(record),deleted:false}],{note:'Restored deleted record',resolveConflict:true},d))));
  d.append(button('Close',()=>d.close()));
 }
 function legacyItems(){
  const account=setting('legacyAccount',setting('defaultAccount',''));
  return legacy.filter(l=>!accountFilter||accountFilter===account).filter(l=>!(store?.all('trades',true)||[]).some(t=>t.legacyKey===l.key||(t.legacyKeys||[]).includes(l.key))).map(l=>({...l,accountId:account}));
 }
 function analyticsBack(d,label,action){const back=button('← '+label,action);back.classList.add('journal-drill-back');d.querySelector('header').after(back)}
 function resolveAnalytics(ref){
  if(!ref||analyticsContext?.epoch!==epoch)return null;
  const t=ref.kind==='managed'?store?.get('trades',ref.id):records('trades').find(t=>t.legacyKey===ref.key||(t.legacyKeys||[]).includes(ref.key));
  if(t)return !t._deleted&&(!accountFilter||t.accountId===accountFilter)?{trade:t}:null;
  if(ref.kind==='legacy'){
   if((store?.all('trades',true)||[]).some(t=>t.legacyKey===ref.key||(t.legacyKeys||[]).includes(ref.key)))return null;
   const l=legacyItems().find(l=>l.key===ref.key);if(l)return{legacy:l};
  }
  return null;
 }
 function openAnalytics(selection){
  if(busy)return;
  if(selection.trade){
   const ref=analyticsRefs.get(selection.trade);if(!ref){showStatus('The chart data changed. Select the point again.',true);return;}
   analyticsContext={epoch,selection:{note:selection.note||''},currentRef:ref};openAnalyticsRecord(ref);
  }else if(['strategy','type','symbol','mistakes'].includes(selection.field)){
   analyticsContext={epoch,selection:{field:selection.field,value:selection.value,title:selection.title},currentRef:null};analyticsList();
  }
 }
 function analyticsList(){
  if(!analyticsContext||analyticsContext.epoch!==epoch)return;
  analyticsContext.currentRef=null;
  const selection=analyticsContext.selection;
  const entries=selection.field?trades.filter(t=>t[selection.field]===selection.value):[];
  const d=openDialog(selection.title||'Selected trade',true);d.classList.add('journal');
  const net=entries.reduce((n,t)=>n+t.pnl,0);
  d.append(node('div',{class:'journal-stats'},stat('Trades',entries.length),stat('Net P&L',money(net),net)),
   node('p',{class:'journal-help'},'These are the closed trades included in this chart category for the selected account. Open a trade or edit its strategy, emotions and notes.'),
   table(['Trade','Account','Closed','Net P&L','Actions'],entries.map(t=>{
    const ref=analyticsRefs.get(t),record=resolveAnalytics(ref),name=button(t.name,()=>openAnalyticsRecord(ref));name.classList.add('journal-trade-link');
    return node('tr',{},node('td',{class:'wrap'},name),node('td',{},accountName(record?.trade?.accountId||record?.legacy?.accountId)),
     node('td',{},t.exitDate?fmtDate(t.exitDate):'—'),currencyCell(t.pnl),node('td',{},button('Edit',()=>editAnalyticsRecord(ref))));
   })),button('Close',()=>d.close()));
 }
 function openAnalyticsRecord(ref){
  if(!analyticsContext)return;
  const record=resolveAnalytics(ref);
  if(!record){analyticsList();return;}
  analyticsContext.currentRef=ref;
  if(record.trade){detail(record.trade.id);if(analyticsContext.selection.note)dialog.append(notice(analyticsContext.selection.note));return;}
  const l=record.legacy,p=l.parsed,d=openDialog(p.name,true);d.classList.add('journal');
  analyticsBack(d,analyticsContext.selection.field?'Back to results':'Back to Overview',()=>analyticsContext.selection.field?analyticsList():d.close());
  const edit=button('Edit trade',()=>editAnalyticsRecord(ref),true);edit.disabled=!store?.initialized||!l.accountId;
  d.append(node('small',{},accountName(l.accountId)+' · '+p.symbol+' · Historical summary'),node('div',{class:'journal-actions'},edit,button('Close',()=>d.close())),
   node('div',{class:'journal-stats'},stat('Net P&L',money(p.pnl),p.pnl),stat('Trade type',p.type)),
   notice('This is a historical summary. Editing saves a managed journal record; the original worksheet row stays untouched and is not counted twice. No executions are invented.'),
   node('p',{},'Opened: '+fmtDate(p.entryDate)+' · Closed: '+fmtDate(p.exitDate)),
   node('p',{},'Strategy: '+p.strategy),node('p',{},'Entry emotions: '+p.entry),node('p',{},'Exit emotions: '+p.exit),
   node('p',{},'Mistakes: '+p.mistakes),node('p',{class:'journal-history'},p.comments||''));
  if(edit.disabled)d.append(notice('Connect your private sheet, set up the journal and assign the historical account before editing.'));
  if(analyticsContext.selection.note)d.append(notice(analyticsContext.selection.note));
 }
 function editAnalyticsRecord(ref){
  if(!analyticsContext||!requireSetup())return;
  const record=resolveAnalytics(ref);if(!record){analyticsList();return;}
  analyticsContext.currentRef=ref;
  if(record.trade)tradeEditor(record.trade);
  else if(record.legacy.accountId)tradeEditor(draftLegacyTrade(record.legacy),null,record.legacy);
 }
 function draftLegacyTrade(l){
  const p=l.parsed,iso=d=>d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10):today();
  return{id:uuid(),accountId:l.accountId,title:p.name,symbol:p.symbol,entryDate:iso(p.entryDate),mode:'package',side:'long',structure:'Other',multiplier:100,contractsPerPackage:1,strategy:p.strategy,confidence:p.confidence,entryEmotions:semo(p.entry),exitEmotions:semo(p.exit),mistakes:p.mistakes==='—'?[]:[p.mistakes],notes:p.comments,legacyKey:l.key,legacyType:p.type,legacyOriginal:JSON.parse(JSON.stringify(p)),legacySummary:{pnl:p.pnl,pct:p.pct,exitDate:iso(p.exitDate||p.entryDate)},manual:true};
 }
 function importLegacy(l){
  if(!requireSetup())return;const p=l.parsed;if(!l.accountId){showStatus('Choose the legacy account in Journal settings first.',true);return;}
  const t=draftLegacyTrade(l);
  const d=openDialog('Manage historical summary');d.append(notice('This creates an editable historical summary in TJ_Trades. The original All Data row is left untouched and excluded from duplicate display while this record exists. No execution history is invented.'));
  d.append(button('Create managed summary',()=>saveChanges([mutation('trades',t)],{note:'Legacy summary adopted'},d),true),button('Cancel',()=>d.close()));
 }
 function importIBKR(initialFile){
  let suppliedFile = typeof initialFile?.text === 'function' ? initialFile : null;
  if(!requireSetup() || busy) return;
  const accounts = records('accounts').filter(a => !a.archived);
  if(!accounts.length){showStatus('Add an active journal account before importing.',true);return;}
  const d = openDialog('Import from IBKR');
  d.classList.add('journal');
  const account = select(accounts.map(a => [a.id,a.name]),'');
  account.prepend(node('option',{value:''},'Choose the account used in IBKR'));
  account.value = '';
  const file = input('file','',{accept:'.csv,.json,text/csv,application/json'});
  const preview = node('div',{'aria-live':'polite'});
  const form = node('form',{},notice('Choose an Activity Flex CSV and the journal account it belongs to. Setup tags and emotions can be added later.'),
   field('Journal account',account),field('IBKR CSV',file),notice('You can also choose an approved history reconciliation JSON. It links the original summaries in bulk; no row-by-row matching is needed.'),preview);
  const fileName = node('small',{},suppliedFile ? 'Selected file: '+suppliedFile.name : '');
  file.after(fileName);
  const save = formFooter(d,form,'Import ready executions');
  save.disabled = true;
  d.append(form);

  const db = store, generation = epoch;
  let request = 0, prepared = null;
  let historicalLinks = {};
  const legacySnapshot = () => JSON.stringify(legacy);
  const snapshot = current => JSON.stringify(['accounts','trades','actions','legs'].map(
   name => current.all(name,true).map(r => [r.id,S.version(r)]).sort((a,b) => a[0].localeCompare(b[0]))
  ));
  const iso = value => value ? new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,10) : null;
  async function inspect(){
   if(busy) return;
   const current = ++request;
   prepared = null;
   save.disabled = true;
   d.querySelector('.journal-error')?.remove();
   preview.replaceChildren();
   const selected = file.files?.[0] || suppliedFile, accountId = account.value;
   if(!selected || !accountId) return;
   try{
    if(selected.size > 5000000) throw new Error('Choose an IBKR CSV smaller than 5 MB.');
    const text = await selected.text();
    const bundle = /^\s*\{/.test(text) ? IBKRReconcile.read(text) : null;
    const rows = IBKRImport.readCSV(bundle ? bundle.csv : text);
    if(current !== request || !d.open || generation !== epoch) return;
    const sourceAccounts = new Set(rows.filter(r => r.AssetClass === 'OPT' && r.AccountId).map(r => r.AccountId));
    if(sourceAccounts.size > 1) throw new Error('Export one IBKR account per file.');
    const historical = accountId === setting('legacyAccount',setting('defaultAccount','')) ?
     legacy.map(({parsed:p,key}) => ({
      key,source:{...p,entryDate:iso(p.entryDate),exitDate:iso(p.exitDate)},title:p.name,symbol:String(p.symbol).toUpperCase(),start:iso(p.entryDate),end:iso(p.exitDate),pnl:p.pnl,
      data:{strategy:p.strategy,notes:p.comments,confidence:p.confidence,
       entryEmotions:semo(p.entry),exitEmotions:semo(p.exit),mistakes:p.mistakes === '—'?[]:[p.mistakes]}
     })) : [];
    const plan = IBKRReconcile.plan(rows,{
     accountId,engine:E,trades:db.all('trades',true),actions:db.all('actions',true),
     legs:db.all('legs'),legacy:historical,links:historicalLinks
    },bundle);
    const counts = Object.fromEntries(['ready','review','duplicate'].map(status => [
     status,plan.results.filter(r => r.status === status).length
    ]));
    preview.append(node('div',{class:'journal-stats'},
     stat('Ready executions',counts.ready),stat('Needs review',counts.review),
     stat('Already recorded / repeated',counts.duplicate),stat('Other assets skipped',plan.ignored)));
    preview.append(node('p',{},plan.newTrades+' new trades · '+plan.updatedTrades+' trades to update'));
    if(plan.reconciliation)preview.append(notice('Approved history mapping: '+plan.reconciliation.positions+' positions; '+plan.reconciliation.linkedSources+' historical summaries to reconcile. '+plan.reconciliation.preserved+' unmatched historical summaries remain unchanged. Original values and notes are retained.'));
    if(plan.matches.length){
     const matching = node('div',{},notice('For each possible overlap, choose the historical entry for this same trade. Its displayed summary will be replaced by IBKR execution totals, retaining notes and tags. Compare dates and net P&L before choosing. Choose Separate trade only for a distinct position.'));
     for(const match of plan.matches){
      const candidates = match.candidates.filter(candidate => candidate.eligible);
      const options = [['','Skip until reviewed'],...candidates.map(candidate => [
       candidate.id,candidate.title+' | '+(candidate.start || '?')+' – '+(candidate.end || '?')+' | net '+money(candidate.pnl)
      ]),['separate','Separate trade — keep historical entries']];
      const choice = select(options,match.choice,{'aria-label':'Historical match for '+match.title});
      choice.addEventListener('change',()=>{
       historicalLinks[match.id] = choice.value;
       inspect();
      });
      matching.append(node('div',{class:'journal-notice'},
       node('strong',{},match.title),node('p',{},match.start+' – '+(match.end || 'Open')+' | Imported net '+money(match.pnl)),
       field('Match historical entry',choice),
       !candidates.length ? node('small',{},'No replaceable closed summary matches this period. Review the position before choosing Separate trade.') : null));
     }
     preview.append(section('Match historical entries',matching,true));
    }
    if(counts.review) preview.append(notice('Rows marked for review will be skipped. Import any missing opening history or review these events in IBKR before recording them manually.','warn'));
    if(plan.results.length) preview.append(section('Execution details',table(['CSV row','Contract','Time','Status','Details'],
     [...plan.results].sort((a,b) => Number(b.status === 'review') - Number(a.status === 'review')).map(r => node('tr',{},node('td',{},r.line),node('td',{class:'wrap'},r.symbol),
      node('td',{},r.date),node('td',{},r.status),node('td',{class:'wrap'},r.reason)))),Boolean(counts.review)));
    prepared = {plan,state:snapshot(db),legacyState:legacySnapshot()};
    save.disabled = !counts.ready;
   }catch(error){
    if(current === request && d.open && generation === epoch) errorIn(d,error);
   }
  }
  file.addEventListener('change',()=>{
   suppliedFile = null;
   historicalLinks = {};
   fileName.textContent = file.files?.[0] ? 'Selected file: '+file.files[0].name : '';
   inspect();
  });
  account.addEventListener('change',()=>{historicalLinks = {};inspect()});
  form.onsubmit = async event => {
   event.preventDefault();
   if(busy || !prepared?.plan.mutations.length || generation !== epoch) return;
   const {plan,state,legacyState} = prepared;
   file.disabled = account.disabled = true;
   const success = await saveChanges(plan.mutations.map(m => mutation(m.table,m.data,Boolean(m.deleted))),{
    note:'IBKR Activity Flex import',
    preflight:latest=>{
     if(snapshot(latest) !== state || legacySnapshot() !== legacyState) throw new Error('The journal changed after preview. Recheck the file before importing.');
    }
   },d);
   if(!success && d.open){
    prepared = null;
    file.disabled = account.disabled = false;
    save.disabled = true;
    if(!form.querySelector('[data-import-recheck]')){
     const recheck = button('Recheck file',inspect);
     recheck.dataset.importRecheck = '';
     form.querySelector('footer').prepend(recheck);
    }
   }
  };
 }
 function matchesFilters(t){return(!search||(t.title+' '+tradeLabel(t)+' '+t.symbol+' '+(t.strategy||'')).toLowerCase().includes(search.toLowerCase()))&&(!symbolFilter||t.symbol===symbolFilter)&&(!strategyFilter||(t.strategy||'')===strategyFilter);}
 function filteredTrades(){return activeTrades().filter(matchesFilters);}
 function filteredLegacy(){return legacyItems().filter(l=>matchesFilters({title:l.parsed.name,symbol:l.parsed.symbol,strategy:l.parsed.strategy}));}
 function setTradeStatus(status){tradeStatus=status;listPage();sw('open-trades');}
 function listPage(){
  const target=$('page-open-trades');if(!target)return;target.replaceChildren();target.classList.add('journal');
  target.append(node('div',{class:'journal-heading'},node('div',{},node('p',{class:'journal-eyebrow'},'YOUR JOURNAL'),node('h1',{},'Trades'),node('small',{},'Your positions, from first entry to final close.')),button('New trade',()=>tradeEditor(),true)));
  if(!store){target.append(node('div',{class:'journal-welcome'},node('div',{class:'journal-welcome-icon'},'↗'),node('h2',{},'Your next trade starts here'),node('p',{},'Connect Google and select your private spreadsheet to view positions and record trades.'),button('Connect Google',()=>connectGoogle(),true)));return;}
  if(!store.initialized){target.append(notice('Set up the journal once to start. Your existing worksheets stay untouched.'),button('Set up journal tabs',setup,true));return;}
  const heading = target.querySelector('.journal-heading');
  const newTrade = heading.lastElementChild;
  heading.append(node('div',{class:'journal-actions'},button('Import from IBKR',importIBKR),newTrade));
  const all=[];for(const t of filteredTrades()){try{all.push({t,s:sum(t)})}catch(error){all.push({t,error})}}
  const historical=filteredLegacy(),visible=all.filter(({s})=>!s||tradeStatus==='all'||(tradeStatus==='open'?s.status!=='closed':s.status==='closed'));
  const realized=visible.reduce((n,x)=>n+(x.s?.realized||0),0)+(tradeStatus==='open'?0:historical.reduce((n,l)=>n+l.parsed.pnl,0)),open=visible.filter(x=>x.s&&x.s.status!=='closed'),missing=open.some(x=>x.s.unrealized==null),unrealized=missing?null:open.reduce((n,x)=>n+x.s.unrealized,0),outcomes=[...visible.filter(x=>x.s?.status==='closed').map(x=>x.s.realized),...(tradeStatus==='open'?[]:historical.map(l=>l.parsed.pnl))];
  target.append(node('div',{class:'journal-stats'},stat('Trades in view',visible.length+(tradeStatus==='open'?0:historical.length)),stat('Realized net P&L',money(realized),realized),stat('Unrealized net P&L',open.length?(missing?'Prices needed':money(unrealized)):'—',open.length?unrealized:null),stat('Closed-trade win rate',outcomes.length?(100*outcomes.filter(x=>x>0).length/outcomes.length).toFixed(1)+'%':'—')));
  const tabs=node('div',{class:'journal-status-tabs',role:'group','aria-label':'Trade status'});for(const [key,label]of [['open','Open'],['closed','Closed'],['all','All']]){const count=all.filter(x=>!x.s||key==='all'||(key==='closed'?x.s.status==='closed':x.s.status!=='closed')).length+(key==='open'?0:historical.length);const b=button(label+' '+count,()=>setTradeStatus(key));b.dataset.status=key;b.setAttribute('aria-pressed',String(tradeStatus===key));b.classList.toggle('selected',tradeStatus===key);tabs.append(b)}
  target.append(tabs);
  const rows=[];for(const {t,s,error}of visible){const openTrade=()=>detail(t.id),titleButton=button(tradeLabel(t),openTrade);titleButton.classList.add('journal-trade-link');
   if(error){rows.push(node('tr',{},node('td',{class:'wrap'},titleButton),node('td',{colspan:6},notice(error.message,'error'))));continue;}
   const status=t.legacySummary?'Historical':s.status==='closed'?'Closed':s.status==='draft'?'Draft':'Open';
   rows.push(node('tr',{class:'clickable',onclick:e=>{if(!e.target.closest('button'))openTrade()}},node('td',{class:'wrap'},titleButton,node('div',{class:'journal-row-subtitle'},node('span',{class:'journal-symbol'},t.symbol),t.strategy||'No strategy')),node('td',{},accountName(t.accountId)),node('td',{},fmtDate(s.status==='closed'?s.closedDate:s.firstDate)),currencyCell(s.realized),currencyCell(s.status==='closed'?(tradeStatus==='closed'?s.combined:null):s.unrealized),node('td',{class:'wrap'},s.status==='closed'?pct(s.riskReturn):s.positions.map(p=>p.quantity+' '+p.label).join('; ')),node('td',{},node('span',{class:'journal-badge '+(s.status==='closed'?'closed':'open')},status))));
  }
  if(tradeStatus!=='open')for(const l of historical){const p=l.parsed;rows.push(node('tr',{},node('td',{class:'wrap'},node('strong',{},p.name),node('div',{class:'journal-row-subtitle'},p.symbol+' · '+(p.strategy||'No strategy'))),node('td',{},accountName(l.accountId)),node('td',{},p.exitDate?p.exitDate.toLocaleDateString():'—'),currencyCell(p.pnl),currencyCell(p.pnl),node('td',{},'Legacy basis'),node('td',{},button('Manage summary',()=>importLegacy(l)))));}
  const result=table(['Trade / strategy','Account','Opened / closed','Realized net',tradeStatus==='closed'?'Final net':'Unrealized net',tradeStatus==='closed'?'Return / max risk':'Position / return','Status'],rows);
  if(!rows.length){const empty=result.querySelector('.journal-empty');empty.replaceChildren(node('strong',{},search||symbolFilter||strategyFilter?'No matching trades':'No '+(tradeStatus==='all'?'':tradeStatus+' ')+'trades yet'),node('p',{},search||symbolFilter||strategyFilter?'Try another search or clear the filters.':'Add a trade to start building your journal.'));}
  target.append(result,node('p',{class:'journal-help'},'P&L is net of recorded fees. Win rate includes fully closed trades only; break-even is not a win.'));
 }
 function periodPage(){
  const target=$('page-realized');if(!target)return;target.replaceChildren();target.classList.add('journal');const groups=new Map();const add=(date,net)=>{if(!date)return;const m=date.slice(0,7);groups.set(m,(groups.get(m)||0)+net)};
  for(const t of activeTrades())try{for(const r of sum(t).timeline)add(r.date,r.net)}catch(_){}
  for(const l of legacyItems()){const d=l.parsed.exitDate||l.parsed.entryDate;if(d)add(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),l.parsed.pnl)}
  target.append(node('h1',{},'Realized P&L by month'),notice('Includes partial closings on the execution date, with proportionally allocated opening fees. Open trades do not increase the closed-trade win-rate count. Legacy net results are recognized on their recorded exit date.'),table(['Month','Net realized P&L (USD)'],[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([m,p])=>node('tr',{},node('td',{},m),currencyCell(p)))));
 }
 function settingsPage(){
  const target=$('page-journal-settings');if(!target)return;target.replaceChildren();target.classList.add('journal');target.append(node('h1',{},'Journal settings'));
  if(!store){target.append(notice('Connect a private spreadsheet first.'));return;}if(!store.initialized){target.append(button('Set up journal tabs',setup,true));return;}
  target.append(node('div',{class:'journal-actions'},button('Add account',()=>accountEditor(),true),button('History & recycle bin',()=>historyView()),button('Reload journal',()=>reload())));
  const accounts=records('accounts'),defaultSelect=select(accounts.filter(a=>!a.archived).map(a=>[a.id,a.name]),setting('defaultAccount','')),legacySelect=select(accounts.map(a=>[a.id,a.name]),setting('legacyAccount','')),rate=input('number',setting('feeRate',0),{min:0,step:'any'}),legacyTab=input('text',setting('legacyTab','All Data'),{maxlength:100});
  const form=node('form',{},node('div',{class:'journal-fields'},field('Default account',defaultSelect),field('Account for All Data history',legacySelect),field('Default fee per contract (USD)',rate),field('Legacy worksheet title',legacyTab)),node('button',{class:'btn p',type:'submit'},'Save settings'));
  form.onsubmit=e=>{e.preventDefault();try{const values={defaultAccount:defaultSelect.value,legacyAccount:legacySelect.value,feeRate:E.number(rate.value,'Fee rate'),legacyTab:legacyTab.value.trim()};saveChanges(Object.entries(values).map(([id,value])=>mutation('settings',{id,value})),{note:'Journal settings updated'},null)}catch(error){showStatus(error.message,true)}};
  target.append(form,notice('Fee changes affect future entries only: each action stores the rate used at the time. Current currency is USD for every account.'),node('h2',{},'Accounts'),table(['Name','Status','Edit'],accounts.map(a=>node('tr',{},node('td',{},a.name),node('td',{},a.archived?'Archived':a.id===setting('defaultAccount','')?'Default':'Active'),node('td',{},button('Edit',()=>accountEditor(a)))))));
  for(const group of ['strategy','emotion','mistake']){target.append(node('h2',{},group[0].toUpperCase()+group.slice(1)+' values'),button('Add '+group,()=>listEditor(group)),table(['Label','Status','Edit'],records('lists').filter(l=>l.group===group).map(l=>node('tr',{},node('td',{},l.label),node('td',{},l.archived?'Archived':'Available'),node('td',{},button('Edit',()=>listEditor(group,l)))))));}
  target.append(notice('Sheets is append-only for journal revisions. Use the dashboard for edits, not manual row sorting/deletion in TJ_ tabs. Concurrent saves are checked before writing, but Google Sheets is not a transactional database with conditional locks. Use one editing window per trade; conflicting revisions are retained for repair.','warn'));
 }
 function syncAnalytics(){
  const normalized=legacyItems().map(l=>{analyticsRefs.set(l.parsed,{kind:'legacy',key:l.key});return l.parsed});
  for(const t of activeTrades())try{const s=sum(t);if(s.status!=='closed')continue;const isoDate=iso=>iso?new Date(iso+'T12:00:00'):null;const parsed={name:tradeLabel(t),symbol:t.symbol,type:(t.legacySummary&&t.legacyType)||t.structure||'—',strategy:t.strategy||'—',pnl:s.realized,pct:s.premiumReturn,days:Math.max(0,Math.round((isoDate(s.closedDate)-isoDate(s.firstDate))/86400000)),mistakes:(t.mistakes||[]).join(', ')||'—',entry:(t.entryEmotions||[]).join(', ')||'—',exit:(t.exitEmotions||[]).join(', ')||'—',entryDate:isoDate(s.firstDate),exitDate:isoDate(s.closedDate),timeEff:null,comments:t.notes||'',confidence:t.confidence??'',strike:t.strike||'',entryPrice:'',exitPrice:'',grossPnl:s.gross,fees:s.fees,contracts:'',expiry:t.expiry||''};analyticsRefs.set(parsed,{kind:'managed',id:t.id});normalized.push(parsed);}catch(_){}
  resetPrivateView();trades=normalized.sort((a,b)=>(a.exitDate||a.entryDate||0)-(b.exitDate||b.entryDate||0));
  if(trades.length){$('badge').textContent='— Private journal · '+trades.length+' closed trades';renderAll();}
 }
 function render(){
  const filter=$('journal-account');if(filter){const options=[['','All accounts'],...records('accounts').map(a=>[a.id,a.name+(a.archived?' (archived)':'')])];filter.replaceChildren(...options.map(([v,n])=>node('option',{value:v},n)));filter.value=accountFilter;}
  listPage();periodPage();settingsPage();syncAnalytics();
  const conflicts=Object.entries(store?.data||{}).flatMap(([table,d])=>d.conflicts.map(id=>table+': '+id));
  const banner=$('journal-banner');if(banner){banner.replaceChildren();if(conflicts.length)banner.append(notice('Concurrent revisions detected. Open History to choose a revision: '+conflicts.join(', '),'error'));if(store?.uncertain)banner.append(notice('A save could not be confirmed. Reload before making more changes.','warn'));}
 }
 async function reload(){if(!store)return;const generation=epoch;try{await store.load();if(generation!==epoch)return;store.uncertain=false;render();showStatus('Journal reloaded.');}catch(error){if(generation===epoch)showStatus(error.message,true);}}
 function setLegacy(rows,source){
  // Only a selected legacy tab supplies history. TJ_ tabs are never interpreted as trade CSVs.
  legacy=rows.map((raw,i)=>({raw,parsed:rtt(raw),key:source+':'+(raw['No.']||i+2)})).filter(l=>l.parsed&&(!l.raw.Status||String(l.raw.Status).toLowerCase()==='closed'||l.parsed.exitDate));render();
 }
 function clearLegacy(){legacy=[];render();}
 $('journal-account').addEventListener('change',event=>{accountFilter=event.target.value;render()});
 document.querySelector('.tabs').before(node('div',{id:'journal-banner'}));
 const searchInput=input('search','',{class:'journal-search',placeholder:'Search trades…','aria-label':'Search trades',oninput:e=>{search=e.target.value;listPage()}});
 const symbolSelect=select([['','All symbols']],'',{'aria-label':'Filter by symbol',onchange:e=>{symbolFilter=e.target.value;listPage()}}),strategySelect=select([['','All strategies']],'',{'aria-label':'Filter by strategy',onchange:e=>{strategyFilter=e.target.value;listPage()}});
 const filters=node('div',{class:'journal-filters'},searchInput,symbolSelect,strategySelect,button('Clear filters',()=>{search='';symbolFilter='';strategyFilter='';accountFilter='';searchInput.value='';render()}));
 const updateFilters=()=>{searchInput.value=search;for(const [control,key,label,value]of [[symbolSelect,'symbol','All symbols',symbolFilter],[strategySelect,'strategy','All strategies',strategyFilter]]){const values=[...new Set([...records('trades').map(t=>t[key]),...legacy.map(l=>l.parsed[key])].filter(Boolean))].sort();control.replaceChildren(node('option',{value:''},label),...values.map(v=>node('option',{value:v},v)));control.value=value;}const page=$('page-open-trades');const tabs=page?.querySelector('.journal-status-tabs');if(tabs)tabs.after(filters);};
 const originalListPage=listPage;listPage=function(){const focused=document.activeElement,restoreFocus=filters.contains(focused),selection=focused===searchInput?[searchInput.selectionStart,searchInput.selectionEnd]:null;originalListPage();updateFilters();if(restoreFocus&&focused.isConnected){focused.focus({preventScroll:true});if(selection)searchInput.setSelectionRange(...selection)}};
 window.JournalApp={connect,clear,setLegacy,clearLegacy,reload,setup,render,tradeEditor,detail,setTradeStatus,importIBKR,openAnalytics,legacyTitle:()=>setting('legacyTab','All Data')};render();
})();
