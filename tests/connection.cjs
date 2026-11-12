const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const code=fs.readFileSync('private-sheets.js','utf8');
const KEY='trading-dashboard-clean.googleTabSession.v1';
const clock={now:Date.now()};
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}
const storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
function page({saved=new Map(),local=new Map(),denied=false,mode='normal',lifetime=3600,search=''}={}){
 const elements=new Map(),timers=new Map();let sequence=0;
 function element(id){if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',children:[],replaceChildren(){this.children=[];this.value=''},append(x){this.children.push(x);if(!this.value)this.value=x.value}});return elements.get(id)}
 const state={mode,pending:[],ingested:[],authorizations:0,requests:[],scope:null,revoked:0};
 const ctx={console,Map,Date:ClockDate,Number,String,Boolean,Error,Object,JSON,URLSearchParams,encodeURIComponent,Promise,
  localStorage:storage(local),sessionStorage:denied?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}}:storage(saved),
  setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
  location:{origin:'https://zacks2512.github.io',search},COL:{name:'Full name',symbol:'Symbol'},
  resetPrivateView(){state.ingested=[]},ingest(rows){state.ingested=rows},sw(){},showStatus(msg){state.status=msg},
  document:{getElementById:element,createElement:()=>({}),head:{append(s){s.onload()}}},
  fetch:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer TEST_TOKEN');assert(!url.includes('TEST_TOKEN'));
   assert.equal(options.method||'GET','GET');state.requests.push(url);
   if(state.mode==='delay')await new Promise(r=>state.pending.push(r));
   const unauthorized=state.mode==='unauthorized';
   return{status:unauthorized?401:200,ok:!unauthorized,json:async()=>url.includes('/values/')?
    {values:state.mode==='empty'?[['Full name','Symbol']]:[['Full name','Symbol'],['Example','XYZ']]}:
    {sheets:[{properties:{sheetId:623391435,title:"Trader's Journal",gridProperties:{}}},{properties:{sheetId:12,title:'Other history',gridProperties:{}}}]}};
  }};
 ctx.window=ctx;ctx.google={accounts:{oauth2:{
  initTokenClient(c){state.scope=c.scope;assert.equal(c.include_granted_scopes,false);return{requestAccessToken(){state.authorizations++;c.callback({access_token:'TEST_TOKEN',expires_in:lifetime})}}},
  hasGrantedAllScopes:()=>true,revoke(){state.revoked++}
 }}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,state,element,saved,local,timers,ready:vm.runInContext('googleRestoreReady',ctx),
  open:id=>vm.runInContext('openPrivateSheet('+JSON.stringify(id)+',sessionGeneration)',ctx)};
}
async function run(){
 const p=page();await p.ready;
 assert(p.element('google-pick').disabled);assert.equal(p.element('connection-state').textContent,'Disconnected');
 await p.ctx.connectGoogle();assert.equal(p.state.scope,'https://www.googleapis.com/auth/drive.file');
 assert.equal(p.element('connection-state').textContent,'Select a sheet');
 await p.open('test-file');assert.equal(p.state.ingested.length,1);assert.equal(p.element('connection-state').textContent,'Connected');
 const first=JSON.parse(p.saved.get(KEY));
 const neonPreview=page({saved:p.saved,search:'?journal=neon'});await neonPreview.ready;
 assert.equal(neonPreview.state.requests.length,0);
 assert.equal(neonPreview.element('connection-state').textContent,'Disconnected');
 assert.equal(first.accessToken,'TEST_TOKEN');assert.equal(first.fileId,'test-file');assert(!('trades' in first));assert.equal(p.local.size,0);
 assert.equal(first.expiresAt,clock.now+3570000);assert.equal(p.timers.size,1);
 p.element('private-tab').value='12';await p.ctx.loadPrivateTab();assert.equal(JSON.parse(p.saved.get(KEY)).worksheetId,'12');
 // A fresh JS context represents a full page reload in the same browser tab.
 clock.now+=300000;
 const refresh=page({saved:p.saved});await refresh.ready;
 assert.equal(refresh.state.authorizations,0);assert.equal(refresh.element('connection-state').textContent,'Connected');
 assert.equal(refresh.element('private-tab').value,'12');assert.equal(refresh.state.ingested.length,1);
 assert.equal(JSON.parse(refresh.saved.get(KEY)).expiresAt,first.expiresAt);
 assert.equal([...refresh.timers.values()][0].ms,first.expiresAt-clock.now);
 assert(refresh.element('google-session-info').textContent.includes('Refresh keeps this tab connected until'));
 refresh.state.mode='empty';await refresh.ctx.loadPrivateTab();assert.equal(refresh.state.ingested.length,0);
 refresh.state.mode='normal';await refresh.ctx.loadPrivateTab();assert.equal(refresh.state.ingested.length,1);
 refresh.state.mode='delay';const loading=refresh.ctx.loadPrivateTab();while(!refresh.state.pending.length)await Promise.resolve();
 refresh.ctx.disconnectGoogle();refresh.state.pending.shift()();await loading;
 assert.equal(refresh.state.ingested.length,0);assert(refresh.element('google-pick').disabled);assert.equal(refresh.saved.size,0);assert.equal(refresh.state.revoked,1);
 const loggedOut=page({saved:refresh.saved});await loggedOut.ready;assert.equal(loggedOut.state.requests.length,0);
 const separate=page();await separate.ready;assert.equal(separate.state.requests.length,0);assert(separate.element('google-pick').disabled);
 const noFile=page();await noFile.ready;await noFile.ctx.connectGoogle();
 const noFileRefresh=page({saved:noFile.saved});await noFileRefresh.ready;
 assert.equal(noFileRefresh.state.requests.length,0);assert.equal(noFileRefresh.state.authorizations,0);assert(!noFileRefresh.element('google-pick').disabled);
 // Expiry clears storage and cannot be extended by refreshing.
 const expiring=page();await expiring.ready;await expiring.ctx.connectGoogle();await expiring.open('test-file');
 const expState=JSON.parse(expiring.saved.get(KEY));clock.now=expState.expiresAt+1;
 const expired=page({saved:expiring.saved});await expired.ready;
 assert.equal(expired.saved.size,0);assert.equal(expired.state.requests.length,0);assert(expired.element('google-pick').disabled);
 [...expiring.timers.values()][0].fn();assert.equal(expiring.saved.size,0);assert.equal(expiring.state.ingested.length,0);
 // Server-side revocation clears the restored token on the first 401 response.
 const rev=page();await rev.ready;await rev.ctx.connectGoogle();await rev.open('test-file');
 const deniedRefresh=page({saved:rev.saved,mode:'unauthorized'});await deniedRefresh.ready;
 assert.equal(deniedRefresh.saved.size,0);assert(deniedRefresh.element('google-pick').disabled);assert.equal(deniedRefresh.state.ingested.length,0);
 for(const value of ['{bad json',JSON.stringify({...first,expiresAt:clock.now+999999999}),JSON.stringify({...first,scope:'other',expiresAt:clock.now+10000})]){
  const invalid=page({saved:new Map([[KEY,value]])});await invalid.ready;assert.equal(invalid.state.requests.length,0);assert.equal(invalid.saved.size,0);
 }
 const blocked=page({denied:true});await blocked.ready;await blocked.ctx.connectGoogle();await blocked.open('test-file');
 assert.equal(blocked.state.ingested.length,1);assert(blocked.element('google-session-info').textContent.includes('storage is unavailable'));
 const short=page({lifetime:120});await short.ready;await short.ctx.connectGoogle();assert.equal(JSON.parse(short.saved.get(KEY)).expiresAt,clock.now+90000);
 const long=page({lifetime:7200});await long.ready;await long.ctx.connectGoogle();assert.equal(JSON.parse(long.saved.get(KEY)).expiresAt,clock.now+3570000);
 const html=fs.readFileSync('index.html','utf8');assert(!html.includes('RAW_DATA'));assert(!html.includes('corsproxy'));
 console.log('PASS: file-scoped OAuth; tab reload restores token/file/worksheet with no popup or writes; original expiry and one-hour cap; independent tabs; disconnect, stale requests, expiry and 401 erase saved access; malformed storage rejected; denied-storage fallback; no trades/tokens in localStorage.');
}
run().catch(e=>{console.error(e);process.exit(1)});
