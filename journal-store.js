(function(root){
 'use strict';
 const HEADER=['id','revision','change_id','updated_at','deleted','data'];
 const TABLES={accounts:'TJ_Accounts',trades:'TJ_Trades',legs:'TJ_Legs',actions:'TJ_Actions',quotes:'TJ_Quotes',lists:'TJ_Lists',settings:'TJ_Settings',history:'TJ_History'};
 const cells=values=>({values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))});
 const version=r=>r?String(r._rev)+':'+r._change:'';
 const plain=r=>r?Object.fromEntries(Object.entries(r).filter(([key])=>!key.startsWith('_'))):null;
 function parseRows(rows,table){
  if(!rows?.length)return{records:[],versions:[],conflicts:[],hasHeader:false};
  if(JSON.stringify(rows[0].slice(0,6))!==JSON.stringify(HEADER))throw new Error(TABLES[table]+' has unexpected columns. No data was overwritten.');
  const byId=new Map(),versions=[],seen=new Set();
  for(const row of rows.slice(1)){
   if(!row.some(String))continue;
   const [id,rev,change,at,deleted,json]=row;
   if(!id||!change||!Number.isInteger(Number(rev))||Number(rev)<1)throw new Error('Invalid record in '+TABLES[table]+'.');
   const key=id+':'+rev+':'+change;if(seen.has(key))continue;seen.add(key);
   let data;try{data=JSON.parse(json)}catch(_){throw new Error('Invalid record JSON in '+TABLES[table]+'.');}
   const record={...data,id,_rev:Number(rev),_change:change,_at:at,_deleted:String(deleted)==='true'};
   versions.push(record);const records=byId.get(id)||[];records.push(record);byId.set(id,records);
  }
  const records=[],conflicts=[];
  for(const [id,vs] of byId){vs.sort((a,b)=>b._rev-a._rev||String(b._at).localeCompare(String(a._at))||String(b._change).localeCompare(String(a._change)));records.push(vs[0]);if(vs.filter(v=>v._rev===vs[0]._rev).length>1)conflicts.push(id);}
  return{records,versions,conflicts,hasHeader:true};
 }
 class Store{
  constructor(transport){this.transport=transport;this.tables={};this.data={};this.initialized=false;this.busy=false;this.uncertain=false;}
  clear(){this.tables={};this.data={};this.initialized=false;this.uncertain=false;}
  all(table,deleted=false){return(this.data[table]?.records||[]).filter(r=>deleted||!r._deleted);}
  get(table,id){return this.all(table,true).find(r=>r.id===id);}
  fingerprint(tradeId){return['trades','legs','actions'].map(table=>this.all(table,true).filter(r=>table==='trades'?r.id===tradeId:r.tradeId===tradeId).map(r=>table+':'+r.id+':'+version(r)).sort().join('|')).join('||');}
  async load(){
   const meta=await this.transport.request('?fields=sheets(properties(sheetId,title))');
   this.tables={};
   for(const [key,title] of Object.entries(TABLES)){const sheet=meta.sheets?.find(s=>s.properties.title===title);if(sheet)this.tables[key]=sheet.properties.sheetId;}
   const entries=Object.keys(this.tables);
   if(entries.length){const query=entries.map(key=>'ranges='+encodeURIComponent("'"+TABLES[key]+"'!A:F")).join('&');const response=await this.transport.request('/values:batchGet?'+query+'&valueRenderOption=UNFORMATTED_VALUE');const data={};entries.forEach((key,i)=>data[key]=parseRows(response.valueRanges?.[i]?.values||[],key));this.data=data;}else this.data={};
   this.initialized=entries.length===Object.keys(TABLES).length&&entries.every(key=>this.data[key].hasHeader);
   return this;
  }
  async initialize(){
   if(this.busy)throw new Error('A save is already in progress.');this.busy=true;
   try{
    await this.load();
    const requests=[],used=new Set(Object.values(this.tables));
    for(const [key,title] of Object.entries(TABLES)){
     if(key in this.tables){if(!this.data[key]?.versions?.length&&!this.data[key]?.records?.length){const check=await this.transport.request('/values/'+encodeURIComponent("'"+title+"'!A1:F1"));if(!check.values?.length)requests.push({updateCells:{start:{sheetId:this.tables[key],rowIndex:0,columnIndex:0},rows:[cells(HEADER)],fields:'userEnteredValue'}});}continue;}
     let sheetId;do{sheetId=Math.floor(Math.random()*1900000000)+1}while(used.has(sheetId));used.add(sheetId);
     requests.push({addSheet:{properties:{sheetId,title,gridProperties:{rowCount:1000,columnCount:6,frozenRowCount:1}}}});
     requests.push({updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[cells(HEADER)],fields:'userEnteredValue'}});
     requests.push({repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:.08,green:.11,blue:.16},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat'}});
    }
    if(requests.length)await this.transport.request(':batchUpdate',{method:'POST',body:{requests}});
    await this.load();
   }finally{this.busy=false;}
  }
  async commit(mutations,{guards=[],note='Saved from dashboard',resolveConflict=false,validate}={}){
   if(this.busy)throw new Error('A save is already in progress.');
   if(this.uncertain)throw new Error('A previous save could not be confirmed. Reload the journal before saving again.');
   if(!mutations.length)return;
   this.busy=true;
   const transactionId=crypto.randomUUID(),at=new Date().toISOString();
   try{
    await this.load();if(!this.initialized)throw new Error('Set up journal tabs first.');
    for(const guard of guards)if(this.fingerprint(guard.id)!==guard.fingerprint)throw new Error('This trade changed in another window. Reload and review before saving.');
    const unique=new Set();
    for(const m of mutations){
     if(!TABLES[m.table]||m.table==='history')throw new Error('Invalid journal table.');
     const key=m.table+':'+m.id;if(unique.has(key))throw new Error('Duplicate record in save.');unique.add(key);
     const previous=this.get(m.table,m.id);
     if(version(previous)!==(m.expected||''))throw new Error('This record changed elsewhere. Reload and try again.');
     if(this.data[m.table]?.conflicts.includes(m.id)&&!resolveConflict)throw new Error('Conflicting changes exist. Resolve this record from History.');
     if(JSON.stringify(m.data).length>40000)throw new Error('This record is too large. Shorten its notes.');
    }
    if(validate)validate(this,mutations);
    const grouped=new Map();const push=(table,row)=>{const rows=grouped.get(table)||[];rows.push(cells(row));grouped.set(table,rows)};
    for(const m of mutations){
     const previous=this.get(m.table,m.id),rev=(previous?._rev||0)+1,after={...m.data,id:m.id};
     push(m.table,[m.id,rev,transactionId,at,Boolean(m.deleted),JSON.stringify(after)]);
     const audit={entity:m.table,recordId:m.id,before:plain(previous),beforeDeleted:Boolean(previous?._deleted),after,afterDeleted:Boolean(m.deleted),transactionId,note};
     push('history',[crypto.randomUUID(),1,transactionId,at,false,JSON.stringify(audit)]);
    }
    const requests=[...grouped].map(([table,rows])=>({appendCells:{sheetId:this.tables[table],rows,fields:'userEnteredValue'}}));
    try{await this.transport.request(':batchUpdate',{method:'POST',body:{requests}});}catch(error){
     // A failed response can follow a successful server commit. Never blindly retry a financial write.
     try{await this.load();if(this.all('history').some(h=>h.transactionId===transactionId))return{transactionId,recovered:true};}catch(_){}
     if(error.uncertain)this.uncertain=true;
     throw error;
    }
    try{await this.load();}catch(_){this.uncertain=true;throw new Error('The save reached Google but reload failed. Reload the journal before making another change.');}return{transactionId};
   }finally{this.busy=false;}
  }
 }
 const api={Store,TABLES,HEADER,version,plain,parseRows};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JournalStore=api;
})(typeof window!=='undefined'?window:globalThis);
