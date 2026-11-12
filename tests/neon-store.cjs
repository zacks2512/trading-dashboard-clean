const assert=require('node:assert/strict');
const {NeonStore}=require('../neon-journal-store.js');

(async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const calls=[];
 const request=async body=>{
  calls.push(body);
  if(body)return{transactionId:body.transactionId};
  return{records:[
   {entity_type:'accounts',record_id:'a1',revision:2,transaction_id:id,updated_at:'2026-11-12T00:00:00Z',deleted:false,data:{id:'a1',name:'Main'}},
   {entity_type:'trades',record_id:'t1',revision:1,transaction_id:id,updated_at:'2026-11-12T00:00:00Z',deleted:true,data:{id:'t1',accountId:'a1',title:'Old'}}
  ],history:[{id:'h1',transaction_id:id,entity_type:'accounts',record_id:'a1',before_data:null,after_data:{id:'a1',name:'Main'},before_deleted:false,after_deleted:false,created_at:'2026-11-12T00:00:00Z'}]};
 };
 const db=new NeonStore(request);
 await db.load();
 assert(db.initialized);
 assert.equal(db.get('accounts','a1')._rev,2);
 assert.equal(db.all('trades').length,0);
 assert.equal(db.all('trades',true).length,1);
 assert.equal(db.all('history')[0].transactionId,id);
 assert.match(db.fingerprint('t1'),/trades:t1:1:/);
 await assert.rejects(()=>db.commit([{table:'accounts',id:'a1',expected:'2:'+id,data:{id:'a1',name:'New'}}]),/read-only/);
 assert.equal(calls.length,1);
 const writable=new NeonStore(request,{readOnly:false});
 await writable.load();
 await assert.rejects(()=>writable.commit([{table:'accounts',id:'a1',expected:'wrong',data:{id:'a1',name:'New'}}]),/changed elsewhere/);
 assert.equal(calls.filter(Boolean).length,0);
 console.log('PASS: Neon snapshot mapping, deleted records, history, guard fingerprints and read-only protection.');
})().catch(error=>{console.error(error);process.exitCode=1});
