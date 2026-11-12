(function(root){
 'use strict';
 const TABLES=['accounts','trades','legs','actions','quotes','lists','settings'];
 const version=r=>r?String(r._rev)+':'+r._change:'';
 const plain=r=>r?Object.fromEntries(Object.entries(r).filter(([key])=>!key.startsWith('_'))):null;

 class NeonStore{
  constructor(request,{readOnly=true}={}){
   this.request=request;
   this.backend='neon';
   this.readOnly=readOnly;
   this.data={};
   this.initialized=true;
   this.busy=false;
   this.uncertain=false;
  }
  all(table,deleted=false){return(this.data[table]?.records||[]).filter(r=>deleted||!r._deleted);}
  get(table,id){return this.all(table,true).find(r=>r.id===id);}
  fingerprint(tradeId){return['trades','legs','actions'].map(table=>this.all(table,true).filter(r=>table==='trades'?r.id===tradeId:r.tradeId===tradeId).map(r=>table+':'+r.id+':'+version(r)).sort().join('|')).join('||');}
  async load(){
   const snapshot=await this.request();
   if(!Array.isArray(snapshot?.records)||!Array.isArray(snapshot?.history))throw new Error('The journal returned an invalid response.');
   const next=Object.fromEntries(TABLES.map(table=>[table,{records:[],versions:[],conflicts:[]}]));
   for(const row of snapshot.records){
    const table=row.entity_type;
    if(!next[table]||!row.data||typeof row.data!=='object'||Array.isArray(row.data))throw new Error('The journal returned an invalid record.');
    const record={...row.data,id:row.record_id,_rev:Number(row.revision),_change:row.transaction_id,_at:row.updated_at,_deleted:Boolean(row.deleted)};
    if(!record.id||!Number.isInteger(record._rev)||record._rev<1||!record._change)throw new Error('The journal returned an invalid record.');
    next[table].records.push(record);
    next[table].versions.push(record);
   }
   next.history={records:snapshot.history.map(row=>({
    id:row.id,entity:row.entity_type,recordId:row.record_id,
    before:row.before_data,beforeDeleted:Boolean(row.before_deleted),
    after:row.after_data,afterDeleted:Boolean(row.after_deleted),
    transactionId:row.transaction_id,note:row.note||'',
    _rev:1,_change:row.transaction_id,_at:row.created_at,_deleted:false
   })),versions:[],conflicts:[]};
   this.data=next;
   return this;
  }
  async commit(mutations,{guards=[],note='Saved from dashboard',resolveConflict=false,validate}={}){
   if(this.readOnly)throw new Error('Neon preview is read-only until the journal migration is complete.');
   if(this.busy)throw new Error('A save is already in progress.');
   if(this.uncertain)throw new Error('A previous save could not be confirmed. Reload the journal before saving again.');
   if(!mutations.length)return;
   this.busy=true;
   const transactionId=crypto.randomUUID();
   try{
    await this.load();
    for(const guard of guards)if(this.fingerprint(guard.id)!==guard.fingerprint)throw new Error('This trade changed in another window. Reload and review before saving.');
    const unique=new Set();
    for(const m of mutations){
     if(!TABLES.includes(m.table)||typeof m.id!=='string'||!m.id||!m.data||m.data.id!==m.id)throw new Error('Invalid journal record.');
     const key=m.table+':'+m.id;
     if(unique.has(key))throw new Error('Duplicate record in save.');
     unique.add(key);
     if(version(this.get(m.table,m.id))!==m.expected)throw new Error('This record changed elsewhere. Reload and try again.');
     if(JSON.stringify(m.data).length>40000)throw new Error('This record is too large. Shorten its notes.');
    }
    if(validate)validate(this,mutations);
    let result;
    try{result=await this.request({transactionId,mutations,note,resolveConflict});}
    catch(error){
     // The response can be lost after a successful commit. Check the audit trail first.
     try{await this.load();if(this.all('history').some(h=>h.transactionId===transactionId))return{transactionId,recovered:true};}
     catch(_){this.uncertain=true;}
     throw error;
    }
    try{await this.load();}catch(_){this.uncertain=true;throw new Error('The save may have reached Neon, but reload failed. Reload the journal before making another change.');}
    return result||{transactionId};
   }finally{this.busy=false;}
  }
 }
 const api={NeonStore,version,plain};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeonJournalStore=api;
})(typeof window!=='undefined'?window:globalThis);
