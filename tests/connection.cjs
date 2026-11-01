const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',children:[],replaceChildren(){this.children=[];this.value=''},append(x){this.children.push(x);if(!this.value)this.value=x.value}});return elements.get(id)}
const saved=new Map();let resetCount=0;let ingested=[];let callback;let pending=[];let scope;let mode='normal';
const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
const ctx={console,Map,Date,Number,String,Boolean,Error,Object,encodeURIComponent,Promise,localStorage:storage,setTimeout:()=>1,clearTimeout(){},location:{origin:'https://zacks2512.github.io'},COL:{name:'Full name',symbol:'Symbol'},resetPrivateView(){resetCount++;ingested=[]},ingest(rows){ingested=rows},sw(){},showStatus(msg){ctx.status=msg},document:{getElementById:element,createElement:()=>({}),head:{append(s){s.onload()}}},fetch:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer TEST_TOKEN');assert(!url.includes('TEST_TOKEN'));if(mode==='delay')await new Promise(r=>pending.push(r));return{status:mode==='unauthorized'?401:200,ok:mode!=='unauthorized',json:async()=>url.includes('/values/')?{values:mode==='empty'?[['Full name','Symbol']]:[['Full name','Symbol'],['Example','XYZ']]}:{sheets:[{properties:{sheetId:623391435,title:"Trader's Journal",gridProperties:{}}}]}}}};
ctx.window=ctx;ctx.google={accounts:{oauth2:{initTokenClient(c){callback=c.callback;scope=c.scope;assert.equal(c.include_granted_scopes,false);return{requestAccessToken(){callback({access_token:'TEST_TOKEN',expires_in:3600})}}},hasGrantedAllScopes:()=>true,revoke(){}}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('private-sheets.js','utf8'),ctx);
async function run(){
 assert(element('google-pick').disabled);assert.equal(ingested.length,0);
 await ctx.connectGoogle();assert.equal(scope,'https://www.googleapis.com/auth/drive.file');assert(!element('google-pick').disabled);
 await vm.runInContext("openPrivateSheet('test-file', sessionGeneration)",ctx);assert.equal(ingested.length,1);assert.equal(element('private-tab').value,'623391435');
 assert.equal(saved.size,0);
 mode='empty';await ctx.loadPrivateTab();assert.equal(ingested.length,0);
 mode='normal';await ctx.loadPrivateTab();assert.equal(ingested.length,1);
 mode='delay';const loading=ctx.loadPrivateTab();while(!pending.length)await Promise.resolve();ctx.disconnectGoogle();pending.shift()();await loading;assert.equal(ingested.length,0);assert(element('google-pick').disabled);
 mode='normal';await ctx.connectGoogle();await vm.runInContext("openPrivateSheet('test-file', sessionGeneration)",ctx);assert.equal(ingested.length,1);
 mode='unauthorized';await ctx.loadPrivateTab();assert.equal(ingested.length,0);assert(element('google-pick').disabled);
 assert(!fs.readFileSync('index.html','utf8').includes('RAW_DATA'));
 assert(!fs.readFileSync('index.html','utf8').includes('corsproxy'));
 console.log('PASS: file-scoped authorization, private metadata/values reads, worksheet selection, empty data, in-flight disconnect, expiry, no token/data persistence, no embedded data or proxy.');
}
run().catch(e=>{console.error(e);process.exit(1)});
