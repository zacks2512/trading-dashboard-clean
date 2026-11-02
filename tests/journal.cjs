const assert=require('node:assert/strict');
const E=require('../journal-engine.js'),{Store,TABLES,HEADER,version,parseRows}=require('../journal-store.js');
const crypto=require('node:crypto');global.crypto=crypto.webcrypto;
const trade=(extra={})=>({id:'t1',accountId:'a1',title:'Example',symbol:'XYZ',entryDate:'2026-01-01',mode:'package',side:'long',structure:'Long Call',multiplier:100,contractsPerPackage:1,strike:50,expiry:'2026-02-01',...extra});
const action=(kind,quantity,price,date='2026-01-01',extra={})=>({id:crypto.randomUUID(),tradeId:'t1',date,kind,order:kind==='open'?1:2,feeMode:'actual',fee:quantity,feeRate:0,fills:[{unitId:'package',quantity,price}],...extra});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
{
 const t=trade(),open=action('open',2,2),close=action('close',1,3,'2026-01-02');
 const s=E.summarize(t,[],[open,close],[{unitId:'package',price:4,at:'2026-01-03T00:00:00Z'}]);
 near(s.realized,98);near(s.unrealized,199);near(s.combined,297);assert.equal(s.status,'open');near(s.initialRisk,402);assert.equal(s.timeline[0].date,'2026-01-02');
 const done=E.summarize(t,[],[open,close,action('close',1,4,'2026-01-04')]);near(done.realized,296);assert.equal(done.status,'closed');near(done.capitalReturn??0,0);
 assert.throws(()=>E.summarize(t,[],[open,action('close',3,2,'2026-01-02')]),/more contracts/);
 assert.throws(()=>E.summarize(t,[],[open,action('expire',2,1,'2026-01-02')]),/zero settlement/);
 assert.throws(()=>E.summarize(t,[],[action('close',1,3)]),/first action/);
 const q=E.summarize(t,[],[open]);assert.equal(q.unrealized,null);assert.equal(q.combined,null);
 const changed=E.summarize(t,[],[open,action('increase',1,1,'2026-01-02')]);assert(changed.riskReview);assert.equal(changed.riskBasis,null);
 const manual=E.summarize(trade({capitalBasis:1000,riskBasis:600}),[],[open,close,action('close',1,4,'2026-01-04')]);near(manual.capitalReturn,29.6);near(manual.riskReturn,296/600*100);
}
{
 const t=trade({side:'short',structure:'Short Put',strike:50});
 const s=E.summarize(t,[],[action('open',2,2),action('close',1,.5,'2026-01-02')],[{unitId:'package',price:.25,at:'2026-01-03T00:00:00Z'}]);near(s.realized,148);near(s.unrealized,174);near(s.initialRisk,9602);
 const expiry=E.summarize(t,[],[action('open',1,2),action('expire',1,0,'2026-01-02')]);near(expiry.realized,198);
 assert.equal(E.initialRisk(trade({side:'short',structure:'Short Call'}),[],action('open',1,2)),null);
}
{
 const t=trade({mode:'legs',structure:'Debit Vertical'}),legs=[{id:'l1',kind:'Call',side:'long',strike:50,expiry:'2026-02-01',ratio:1,multiplier:100},{id:'l2',kind:'Call',side:'short',strike:55,expiry:'2026-02-01',ratio:1,multiplier:100}];
 const open={id:'o',date:'2026-01-01',kind:'open',feeMode:'auto',feeRate:.65,fills:[{unitId:'l1',quantity:2,price:3},{unitId:'l2',quantity:2,price:1}]};
 const close={id:'c',date:'2026-01-02',kind:'close',feeMode:'auto',feeRate:.65,fills:[{unitId:'l1',quantity:1,price:4},{unitId:'l2',quantity:1,price:.5}]};
 const s=E.summarize(t,legs,[open,close]);near(s.realized,147.4);near(s.fees,3.9);near(s.initialRisk,402.6);assert.equal(s.positions.length,2);
 assert.equal(E.summarize(t,legs,[open,close],[{unitId:'l1',price:4,at:'2026-01-03'}]).unrealized,null);
 const legClose={...close,fills:[{unitId:'l1',quantity:2,price:4}]};const uneven=E.summarize(t,legs,[open,legClose]);assert.equal(uneven.positions.length,1);assert.equal(uneven.status,'open');assert(uneven.riskReview);assert.equal(uneven.riskBasis,null);
 const spread=trade({side:'short',structure:'Credit Vertical',width:5});near(E.initialRisk(spread,[],action('open',1,1),0),400);
 assert.throws(()=>E.summarize(t,legs,[{...open,fills:[{unitId:'unknown',quantity:1,price:1}]}]),/Unknown leg/);
 const fee=E.feeOf(action('open',2,1,'2026-01-01',{feeMode:'auto',feeRate:.65}),trade(),legs,0);near(fee,2.6);
 near(E.feeOf(action('open',2,1,'2026-01-01',{feeMode:'auto',feeRate:10,feeRecorded:2.6}),trade(),[],10),2.6);
}
{
 const first=trade(),second=trade({id:'t2',rollFromId:'t1'});assert.equal(E.chain('t2',[first,second],new Map()).length,2);
 assert.equal(E.summarize(trade({legacySummary:{pnl:123,pct:10,exitDate:'2026-02-01'}}),[],[]).realized,123);
 assert.throws(()=>E.date('2026-02-30'));assert.throws(()=>E.qty(1.5));assert.throws(()=>E.number('','Price'));
}
class MemoryTransport{
 constructor(){this.sheets=new Map();this.writes=0;this.loseResponse=false;this.fail=false;}
 async request(path,options={}){
  if(this.fail){const error=new Error('Network failed');error.uncertain=options.method==='POST';throw error;}
  if(path==='?fields=sheets(properties(sheetId,title))')return{sheets:[...this.sheets].map(([title,s])=>({properties:{title,sheetId:s.id}}))};
  if(path.startsWith('/values:batchGet?')){const params=new URLSearchParams(path.split('?')[1]);return{valueRanges:params.getAll('ranges').map(range=>({values:this.sheets.get(range.match(/^'([^']+)'/)[1]).rows}))};}
  if(path.startsWith('/values/')){const name=decodeURIComponent(path.slice(8)).match(/^'([^']+)'/)[1];return{values:this.sheets.get(name).rows.slice(0,1)};}
  if(path===':batchUpdate'){
   this.writes++;assert.equal(options.method,'POST');
   // Model a single atomic Google request. All user data is stringValue, never formulaValue.
   const next=new Map([...this.sheets].map(([k,v])=>[k,{id:v.id,rows:v.rows.map(r=>r.slice())}]));
   for(const req of options.body.requests){if(req.addSheet){const p=req.addSheet.properties;assert(!next.has(p.title));next.set(p.title,{id:p.sheetId,rows:[]})}else if(req.updateCells||req.appendCells){const op=req.updateCells||req.appendCells;const target=[...next.values()].find(s=>s.id===(op.sheetId??op.start.sheetId));const rows=op.rows.map(row=>row.values.map(c=>{assert.deepEqual(Object.keys(c.userEnteredValue),['stringValue']);return c.userEnteredValue.stringValue}));if(req.updateCells)target.rows=rows;else target.rows.push(...rows)}}
   this.sheets=next;if(this.loseResponse){this.loseResponse=false;const e=new Error('Response lost');e.uncertain=true;throw e;}return{};
  }
  throw new Error(path);
 }
}
(async()=>{
 const transport=new MemoryTransport();transport.sheets.set('All Data',{id:10,rows:[['Do not touch'],['Original']]});const db=new Store(transport);await db.initialize();assert(db.initialized);assert.equal(transport.sheets.size,9);assert.deepEqual(transport.sheets.get('All Data').rows,[['Do not touch'],['Original']]);
 const unchanged=transport.writes;await db.initialize();assert.equal(transport.writes,unchanged);
 await db.commit([{table:'accounts',id:'a',expected:'',data:{id:'a',name:'<img src=x onerror=alert(1)>'}}]);assert.equal(db.all('accounts').length,1);assert.equal(db.all('history').length,1);
 const old=db.get('accounts','a');await db.commit([{table:'accounts',id:'a',expected:version(old),data:{id:'a',name:'Renamed'}}]);assert.equal(db.data.accounts.versions.length,2);assert.equal(db.all('accounts')[0].name,'Renamed');
 await assert.rejects(()=>db.commit([{table:'accounts',id:'a',expected:version(old),data:{id:'a',name:'Stale'}}]),/changed elsewhere/);
 transport.loseResponse=true;const current=db.get('accounts','a');const recovered=await db.commit([{table:'accounts',id:'a',expected:version(current),data:{id:'a',name:'Recovered'}}]);assert(recovered.recovered);assert.equal(db.all('accounts')[0].name,'Recovered');assert.equal(db.data.accounts.versions.length,3);
 const last=db.get('accounts','a');await db.commit([{table:'accounts',id:'a',expected:version(last),data:{id:'a',name:'Recovered'},deleted:true}]);assert.equal(db.all('accounts').length,0);assert.equal(db.all('accounts',true).length,1);
 const deleted=db.get('accounts','a');await db.commit([{table:'accounts',id:'a',expected:version(deleted),data:{id:'a',name:'Recovered'}}]);assert.equal(db.all('accounts').length,1);
 const conflict=parseRows([HEADER,['a','1','x','2026-01-01','false','{}'],['a','1','y','2026-01-01','false','{}']],'accounts');assert.deepEqual(conflict.conflicts,['a']);
 const duplicate=parseRows([HEADER,['a','1','x','2026-01-01','false','{}'],['a','1','x','2026-01-01','false','{}']],'accounts');assert.equal(duplicate.versions.length,1);
 const unsafe=new MemoryTransport();unsafe.sheets.set(TABLES.trades,{id:1,rows:[['User sheet with other columns']]});await assert.rejects(()=>new Store(unsafe).initialize(),/unexpected columns/);assert.equal(unsafe.writes,0);
 console.log('PASS: long/short partial closes; weighted cost and fee allocation; leg accounting; expiry; missing marks; risk and capital metrics; roll chains; legacy; date/quantity validation; atomic setup preserving All Data; revision history; stale edits; lost-write recovery; soft delete/restore; duplicate/conflicting revisions; schema validation; RAW-safe cell writes.');
})().catch(e=>{console.error(e);process.exit(1)});
