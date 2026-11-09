(function(root){
 'use strict';
 const I=typeof module!=='undefined'&&module.exports?require('./ibkr-import'):root.IBKRImport;
 const FORMAT='trading-journal-ibkr-reconciliation';
 // Compare calendar dates consistently with the original Israel-based journal,
 // even when the importer is opened on a computer in another timezone.
 function journalDate(value){
  if(!value)return '';
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const date=new Date(value);
  if(!Number.isFinite(+date))throw new Error('Invalid historical date in reconciliation.');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
 }
 function identity(p){
  return JSON.stringify([p.name,p.symbol,Number(p.pnl),journalDate(p.entryDate),journalDate(p.exitDate),
   String(p.strike||''),String(p.contracts||''),String(p.expiry||''),String(p.entryPrice||''),String(p.exitPrice||'')]);
 }
 function read(text){
  const bundle=JSON.parse(text);
  if(bundle?.format!==FORMAT||bundle.version!==1||typeof bundle.csv!=='string'||
   !Array.isArray(bundle.groups)||!bundle.groups.length||bundle.groups.length>2000)throw new Error('Unsupported IBKR reconciliation file.');
  const ids=new Set(),sources=new Set();
  for(const group of bundle.groups){
   if(!Array.isArray(group.tradeIds)||!group.tradeIds.length||!Array.isArray(group.sources)||!group.sources.length||
    typeof group.expectedNet!=='number'||!Number.isFinite(group.expectedNet))throw new Error('Incomplete reconciliation group.');
   for(const id of group.tradeIds){
    if(typeof id!=='string'||!/^\d+$/.test(id)||ids.has(id))throw new Error('A TradeID is allocated more than once in the reconciliation.');
    ids.add(id);
   }
   for(const source of group.sources){
    const key=identity(source);
    if(sources.has(key))throw new Error('A historical source is allocated to multiple trades.');
    sources.add(key);
   }
  }
  for(const id of bundle.heldTradeIds||[]){
   if(typeof id!=='string'||!/^\d+$/.test(id)||ids.has(id))throw new Error('Held executions must not be allocated to a reconciled trade.');
  }
  return bundle;
 }
 function plan(rows,options,bundle){
  if(!bundle)return I.plan(rows,options);
  // Validate objects passed by callers as well as uploaded JSON.
  bundle=read(JSON.stringify(bundle));
  const {accountId,engine,trades=[],actions=[],legs=[],legacy=[]}=options;
  if(!accountId)throw new Error('Choose the journal account for this reconciliation.');
  const byId=new Map();
  for(const row of rows.filter(r=>r.AssetClass==='OPT')){
   if(byId.has(row.TradeID))throw new Error('Repeated TradeID in reconciliation CSV.');
   byId.set(row.TradeID,row);
  }
  const known=new Map(actions.map(a=>[a.id,a]));
  const mutations=[],results=[],consumed=new Set(),sourceKeys=new Set();
  let newTrades=0,updatedTrades=0,linkedSources=0;
  const result=(row,status,reason)=>({line:row.line,symbol:row.Symbol,date:row.DateTime,status,reason});
  for(const group of bundle.groups){
   const executions=group.tradeIds.map(id=>{
    const row=byId.get(id);
    if(!row)throw new Error('The reconciliation CSV is missing TradeID '+id+'.');
    consumed.add(id);
    return {row,...I.normalize(row),id:'ibkr:'+accountId+':'+id,signature:I.signature(row)};
   }).sort((a,b)=>a.order-b.order||a.row.line-b.row.line);
   const stored=executions.map(x=>known.get(x.id));
   if(stored.some(Boolean)){
    if(!stored.every((a,i)=>a&&a.ibkrSignature===executions[i].signature))throw new Error('This reconciliation overlaps partial or changed executions. Reload the journal and resolve those records first.');
    const ownerIds=new Set(stored.map(a=>a.tradeId));
    const owner=trades.find(t=>ownerIds.size===1&&ownerIds.has(t.id));
    if(!owner?.ibkrReconciliation||owner.accountId!==accountId)throw new Error('These executions already belong to a trade without this historical reconciliation.');
    const fingerprints=new Set((owner.legacyOriginals||[]).map(x=>identity(x.source)));
    if(group.sources.some(s=>!fingerprints.has(identity(s))))throw new Error('The stored historical allocation differs from this reconciliation.');
    for(const key of owner.legacyKeys||[])sourceKeys.add(key);
    for(const x of executions)results.push(result(x.row,'duplicate','Execution already reconciled and recorded.'));
    continue;
   }
   const originals=group.sources.map(source=>{
    const matches=legacy.filter(l=>l.source&&identity(l.source)===identity(source));
    if(matches.length!==1)throw new Error('Historical source missing or ambiguous: '+source.name+'. Load the original All Data tab in its assigned account.');
    const match=matches[0];
    if(!match.key||sourceKeys.has(match.key))throw new Error('Historical source was allocated more than once.');
    sourceKeys.add(match.key);
    return match;
   });
   const managed=trades.filter(t=>originals.some(l=>t.legacyKey===l.key||(t.legacyKeys||[]).includes(l.key)));
   if(managed.some(t=>t._deleted||!t.legacySummary||t.accountId!==accountId||
    actions.some(a=>a.tradeId===t.id)||legs.some(l=>l.tradeId===t.id)))throw new Error('A matched historical record is already managed, deleted or has execution history. Review it before reconciliation.');
   const first=executions[0];
   if(new Set(executions.map(x=>x.symbol)).size!==1)throw new Error('Reconciliation cannot combine different underlying symbols.');
   const units=new Map();
   for(const x of executions){
    const key=x.conid+':'+x.side;
    if(!units.has(key))units.set(key,{...x,remaining:0,opened:0});
    const unit=units.get(key);
    if(['symbol','strike','expiry','option','multiplier'].some(k=>unit[k]!==x[k]))throw new Error('Inconsistent contract terms in reconciliation.');
   }
   const detailed=units.size>1;
   const tradeId=managed[0]?.id||first.id+':trade';
   const trade={id:tradeId,accountId,title:group.title||originals[0].title,symbol:first.symbol,entryDate:first.date,
    mode:detailed?'legs':'package',side:first.side,structure:detailed?'Other':(first.side==='long'?'Long ':'Short ')+first.option,
    multiplier:first.multiplier,contractsPerPackage:units.size,strike:detailed?'':first.strike,expiry:first.expiry,
    ibkrImported:true,ibkrReconciliation:true,legacyKeys:originals.map(l=>l.key),legacyKey:originals[0].key,
    legacyOriginals:originals.map(l=>({key:l.key,source:l.source}))};
   if(!detailed)trade.ibkrConid=first.conid;
   const annotationKeys=['strategy','confidence','entryReason','targetProfit','lossLimit','capitalBasis','riskBasis'];
   const data=originals.map(l=>managed.find(t=>t.legacyKey===l.key)||l.data||{});
   for(const key of annotationKeys){if(data[0][key]!=null)trade[key]=data[0][key]}
   trade.notes=[...new Set(data.map(p=>p.notes).filter(Boolean))].join('\n\n');
   for(const key of ['entryEmotions','exitEmotions','mistakes'])trade[key]=[...new Set(data.flatMap(p=>p[key]||[]))];
   const importedLegs=detailed?[...units.values()].map(u=>({id:tradeId+':leg:'+u.conid+':'+u.side,
    tradeId,kind:u.option,side:u.side,strike:u.strike,expiry:u.expiry,ratio:1,multiplier:u.multiplier,ibkrConid:u.conid})):[];
   const importedActions=[];
   for(const x of executions){
    const codes=x.row['Notes/Codes'].split(';').filter(Boolean);
    if(codes.some(c=>!['O','C','P','Ep'].includes(c))||(codes.includes('Ep')&&(x.opening||x.price!==0))||
     (x.price===0&&(x.opening||!codes.includes('Ep'))))throw new Error('Unsupported settlement event in a reconciled group.');
    const unit=units.get(x.conid+':'+x.side);
    if(!x.opening&&x.quantity>unit.remaining)throw new Error('Reconciled group is missing opening history.');
    const kind=x.opening?(importedActions.length?'increase':'open'):(codes.includes('Ep')?'expire':'close');
    importedActions.push({id:x.id,tradeId,date:x.date,order:x.order+x.row.line/(rows.length+2),kind,
     feeMode:'actual',fee:x.fee,ibkrSignature:x.signature,
     fills:[{unitId:detailed?tradeId+':leg:'+x.conid+':'+x.side:'package',quantity:x.quantity,price:x.price}]});
    unit.remaining+=x.opening?x.quantity:-x.quantity;
    if(x.opening)unit.opened+=x.quantity;
   }
   if([...units.values()].some(u=>u.remaining!==0))throw new Error('Reconciliation must contain the full closed position.');
   // Ratios describe total quantities, reduced by GCD for unequal leg counts.
   const gcd=(a,b)=>b?gcd(b,a%b):a;
   const divisor=[...units.values()].map(u=>u.opened).reduce(gcd);
   for(const leg of importedLegs)leg.ratio=units.get(leg.ibkrConid+':'+leg.side).opened/divisor;
   const summary=engine.summarize(trade,importedLegs,importedActions);
   if(summary.status!=='closed'||Math.abs(summary.realized-group.expectedNet)>.000001)throw new Error('IBKR net result differs from the approved reconciliation for '+trade.title+'.');
   mutations.push({table:'trades',data:trade},...importedLegs.map(data=>({table:'legs',data})),...importedActions.map(data=>({table:'actions',data})));
   // Multiple historical summaries can be replaced by one position. Existing
   // adopted summaries remain recoverable through revisioned deletion.
   for(const other of managed.slice(1))mutations.push({table:'trades',data:other,deleted:true});
   if(managed.length)updatedTrades++;else newTrades++;
   linkedSources+=originals.length;
   for(const x of executions)results.push(result(x.row,'ready','Reconcile historical position; retain annotations and actual IBKR fees.'));
  }
  for(const id of bundle.heldTradeIds||[]){
   const row=byId.get(id);
   if(!row)throw new Error('Held execution is missing from the reconciliation CSV.');
   consumed.add(id);
   results.push(result(row,'review','Historical position preserved unchanged; earlier opening history is required.'));
  }
  // Remaining broker records go through the ordinary, conservative importer.
  const extraTrades=mutations.filter(m=>m.table==='trades'&&!m.deleted).map(m=>m.data);
  const base=I.plan(rows.filter(row=>!consumed.has(row.TradeID)),{...options,
   trades:[...trades.filter(t=>!extraTrades.some(x=>x.id===t.id)),...extraTrades],
   actions:[...actions,...mutations.filter(m=>m.table==='actions').map(m=>m.data)],
   legs:[...legs,...mutations.filter(m=>m.table==='legs').map(m=>m.data)],
   legacy:legacy.filter(l=>!sourceKeys.has(l.key))});
  return {...base,results:[...results,...base.results].sort((a,b)=>a.line-b.line),mutations:[...mutations,...base.mutations],
   newTrades:newTrades+base.newTrades,updatedTrades:updatedTrades+base.updatedTrades,
   reconciliation:{positions:bundle.groups.length,linkedSources,preserved:bundle.preserved?.length||0}};
 }
 const api={FORMAT,read,plan,identity,journalDate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IBKRReconcile=api;
})(typeof window!=='undefined'?window:globalThis);
