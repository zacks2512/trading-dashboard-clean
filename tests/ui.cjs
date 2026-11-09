// DOM integration checks use real journal accounting/storage and an in-memory Sheets transport.
// Layout, native dialog focus, and actual OAuth still require browser verification.
const {JSDOM}=require(process.env.JOURNAL_JSDOM_MODULE||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://journal.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){}});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
const errors=[];w.addEventListener('error',e=>errors.push(e.error));
for(const file of ['vendor/purify.min.js','journal-engine.js','journal-store.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
for(const script of d.querySelectorAll('script:not([src])'))w.eval(script.textContent);
// Use a deterministic clock to verify status lifetimes without waiting five seconds.
const timers=new Map();let nextTimer=0;w.setTimeout=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn:()=>{timers.delete(id);fn()},ms});return id};w.clearTimeout=id=>timers.delete(id);
// Analytics canvas drawing is covered separately by the browser suite, not emulated here.
w.renderAll=()=>{};
w.eval(fs.readFileSync(path.join(root,'ibkr-import.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'journal-app.js'),'utf8'));
const rows=new Map(),headers=['id','revision','change_id','updated_at','deleted','data'];let lastWrite=[];
const transport={request:async(endpoint,options={})=>{
 if(endpoint.startsWith('?'))return{sheets:[...rows].map(([title,s])=>({properties:{title,sheetId:s.id}}))};
 if(endpoint.startsWith('/values:batchGet')){const qs=new URLSearchParams(endpoint.split('?')[1]);return{valueRanges:qs.getAll('ranges').map(range=>({values:rows.get(range.match(/^'([^']+)'/)[1]).rows}))}};
 if(endpoint.startsWith('/values/'))return{values:[]};
 if(endpoint===':batchUpdate'){lastWrite=options.body.requests;for(const r of lastWrite){if(r.addSheet){const s=r.addSheet.properties;rows.set(s.title,{id:s.sheetId,rows:[]})}const op=r.updateCells||r.appendCells;if(op){const s=[...rows.values()].find(s=>s.id===(op.sheetId??op.start.sheetId));const entries=op.rows.map(r=>r.values.map(c=>c.userEnteredValue.stringValue));if(r.updateCells)s.rows=entries;else s.rows.push(...entries)}}return{replies:[]}}
 throw Error('Unexpected request '+endpoint);
}};
function saved(table){return(rows.get(table)?.rows||[]).slice(1).map(r=>({...JSON.parse(r[5]),_deleted:r[4]==='true'})).reduce((m,r)=>m.set(r.id,r),new Map())}
const dialog=()=>d.querySelector('dialog[open]');
const buttons=(name,scope=d)=>[...scope.querySelectorAll('button')].filter(b=>b.textContent===name);
function click(name,scope=d){const bs=buttons(name,scope);assert(bs.length,'Missing button '+name);bs[0].click()}
function control(label,scope=dialog()){const labelNode=[...scope.querySelectorAll('label')].find(l=>l.textContent===label);assert(labelNode,'Missing label '+label);return d.getElementById(labelNode.htmlFor)}
function set(label,value,scope=dialog()){const c=control(label,scope);c.value=value;c.dispatchEvent(new w.Event('change',{bubbles:true}));return c}
function submit(){const form=dialog().querySelector('form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}
async function settled(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));if(dialog()?.querySelector('.journal-error'))throw Error(dialog().querySelector('.journal-error').textContent)}
async function save(){submit();await settled();assert(!dialog(),'Save should close dialog')}
function status(value){const b=d.querySelector('[data-status="'+value+'"]');assert(b);b.click()}
function tradeLink(name){const b=[...d.querySelectorAll('.journal-trade-link')].find(b=>b.textContent===name);assert(b,'Missing trade '+name);return b}
function fillPackage(name,price='5',quantity='1'){
 w.JournalApp.tradeEditor();set('Trade name',name);set('Underlying symbol','AAPL');set('Entry date','2026-11-02');set('Expiry (package)','2026-12-18');set('Strike (single option)','250');set('Whole strategy — quantity (0 to skip)',quantity);set('Price per share / strategy unit (USD)',price);
}
(async()=>{
 assert.equal(d.querySelectorAll('.workspace-toolbar').length,1);assert.equal(d.querySelectorAll('#journal-account').length,1);assert(!d.querySelector('.journal-toolbar'));
 assert.equal(d.querySelector('#journal-account').closest('.workspace-toolbar'),d.querySelector('#google-refresh').closest('.workspace-toolbar'));
 for(const id of ['google-connect','google-pick','private-tab','google-disconnect'])assert(d.querySelector('#connection-menu').contains(d.getElementById(id)));
 assert(!d.querySelector('#connection-menu').open);
 const menu=d.querySelector('#connection-menu');menu.open=true;d.querySelector('.logo').click();assert(!menu.open);menu.open=true;d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!menu.open);assert.equal(d.activeElement,menu.querySelector('summary'));
 const statusBox=d.querySelector('#loadStatus');w.showStatus('Success');assert.equal(statusBox.style.display,'block');assert.equal([...timers.values()][0].ms,5000);
 w.showStatus('Persistent error',true);assert.equal(timers.size,0);assert.equal(statusBox.getAttribute('role'),'alert');assert.equal(statusBox.dataset.kind,'error');assert.equal(statusBox.style.display,'block');
 w.showStatus('New success');assert.equal(statusBox.getAttribute('role'),'status');assert.equal(timers.size,1);[...timers.values()][0].fn();assert.equal(statusBox.style.display,'none');assert.equal(statusBox.textContent,'');
 w.showStatus('First success');w.showStatus('Second success');assert.equal(timers.size,1);
 w.showStatus('');assert.equal(statusBox.style.display,'none');timers.clear();
 await w.JournalApp.connect(transport);click('Set up journal tabs');set('First account name','Main');set('Default commission per contract (USD)','2');await save();assert.equal(rows.size,8);
 fillPackage('One Call');assert(!dialog().textContent.includes('Prepare opening details'));
 assert.equal(dialog().querySelector('.journal-order-preview strong').textContent,'$502.00');
 assert(control('Strategy').getAttribute('role')==='group');click('Technical Setup',control('Strategy'));
 const review=[...dialog().querySelectorAll('details')].find(s=>s.firstChild.textContent==='Planning & personal review');assert(!review.open);review.open=true;
 click('Confidence',control('Entry emotions'));click('Patience',control('Entry emotions'));click('Confidence',control('Entry emotions'));
 click('No Mistake',control('Mistakes'));await save();
 let t=[...saved('TJ_Trades').values()][0];assert.equal(t.strategy,'Technical Setup');assert.deepEqual(t.entryEmotions,['Patience']);assert.deepEqual(t.exitEmotions,[]);assert.deepEqual(t.mistakes,['No Mistake']);
 tradeLink('One Call').click();assert(dialog().classList.contains('journal-drawer'));assert(dialog().querySelector('details.journal-section'));click('Update prices');set('Whole strategy — price per share / package','6');await save();
 assert(d.querySelector('#page-open-trades').textContent.includes('$98.00'));
 assert.equal(d.querySelector('#page-open-trades .journal-positive').textContent,'$98.00');
 // Search retains its focused input and selection across list reconstruction.
 const search=d.querySelector('[aria-label="Search trades"]');search.focus();search.value='One';search.setSelectionRange(3,3);search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.activeElement,search);assert.equal(search.selectionStart,3);assert.equal(d.querySelectorAll('.journal-trade-link').length,1);
 search.value='no match';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert(d.querySelector('.journal-empty').textContent.includes('No matching trades'));click('Clear filters');
 // Actual commission switches fields and applies the actual fee, including a zero override.
 tradeLink('One Call').click();click('Add execution');set('Date','2026-11-02');set('Whole strategy — quantity (0 to skip)','1');set('Price per share / strategy unit (USD)','6');set('Commission mode','actual');assert(control('Commission per contract (USD)').closest('.journal-field').hidden);assert(!control('Actual total commission (USD)').closest('.journal-field').hidden);set('Actual total commission (USD)','0');await save();status('closed');assert(d.querySelector('#page-open-trades').textContent.includes('$98.00'));
 // Short structures automatically select credit cash flow for new trades.
 status('open');fillPackage('Short Put');set('Structure','Short Put');assert.equal(control('Package opening cash flow').value,'short');await save();
 // Detailed legs rebuild opening fills after valid edits, preserving entered prices.
 w.JournalApp.tradeEditor();set('Trade name','Spread');set('Underlying symbol','MSFT');set('Entry date','2026-11-02');set('Price accounting mode','legs');set('Structure','Debit Vertical');click('Add leg');click('Add leg');
 const legs=[...dialog().querySelectorAll('.journal-section .journal-leg')];assert.equal(legs.length,2);
 for(let i=0;i<2;i++){set('Strike',i?'105':'100',legs[i]);set('Expiry','2026-12-18',legs[i]);}set('Position','short',legs[1]);
 let prices=[...dialog().querySelectorAll('label')].filter(l=>l.textContent==='Price per share / strategy unit (USD)').map(l=>d.getElementById(l.htmlFor));assert.equal(prices.length,2);prices[0].value='3';prices[1].value='1';set('Contract multiplier','100');
 prices=[...dialog().querySelectorAll('label')].filter(l=>l.textContent==='Price per share / strategy unit (USD)').map(l=>d.getElementById(l.htmlFor));assert.equal(prices[0].value,'3');assert.equal(prices[1].value,'1');await save();
 assert.equal([...saved('TJ_Trades').values()].find(t=>t.title==='Spread').mode,'legs');
 // Single/multiple-choice tags survive edits. Zero P&L remains neutral.
 tradeLink('Spread').click();const zero=[...dialog().querySelectorAll('.journal-stat strong')].find(x=>x.textContent==='$0.00');assert(zero&&!zero.classList.contains('journal-positive')&&!zero.classList.contains('journal-negative'));click('Close',dialog());
 status('all');assert.equal(d.querySelectorAll('.journal-trade-link').length,3);
 const symbol=d.querySelector('[aria-label="Filter by symbol"]');symbol.value='MSFT';symbol.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelectorAll('.journal-trade-link').length,1);click('Clear filters');
 tradeLink('One Call').click();click('Edit trade');assert.equal(control('Strategy').value,'Technical Setup');assert.equal(control('Entry emotions').selectedValues().join(','),'Patience');click('Cancel',dialog());
 // Losses stay red in both the table and drawer; tag choices cannot become accidental defaults.
 fillPackage('Loss Call');await save();tradeLink('Loss Call').click();click('Update prices');set('Whole strategy — price per share / package','4');await save();
 const lossRow=tradeLink('Loss Call').closest('tr');assert.equal(lossRow.querySelector('.journal-negative').textContent,'-$102.00');tradeLink('Loss Call').click();assert([...dialog().querySelectorAll('.journal-stat strong.journal-negative')].some(x=>x.textContent==='-$102.00'));click('Close',dialog());
 // Delete and restore remain revisioned through the same real store implementation.
 tradeLink('One Call').click();click('Delete trade');click('Move to recycle bin');await settled();assert(saved('TJ_Trades').get(t.id)._deleted);assert(![...d.querySelectorAll('.journal-trade-link')].some(b=>b.textContent==='One Call'));
 d.querySelector('.tab[data-page="journal-settings"]').click();click('History & recycle bin');click('Restore deleted record');await settled();assert(!saved('TJ_Trades').get(t.id)._deleted);
 const csv = [
  'AssetClass,Symbol,Conid,UnderlyingSymbol,Multiplier,Strike,Expiry,Put/Call,Buy/Sell,CurrencyPrimary,TradeID,DateTime,Quantity,TradePrice,IBCommission,IBCommissionCurrency,Open/CloseIndicator,IBOrderID,IBExecID,Notes/Codes',
  'OPT,IBKR Test,123,IMPORT,100,50,20/03/2026,C,BUY,USD,1,01/02/2026;10:00:00,1,3,-1,USD,O,1,,',
  'OPT,IBKR Test,123,IMPORT,100,50,20/03/2026,C,SELL,USD,2,20/03/2026;10:00:00,-1,0,0,USD,C,2,,Ep'
 ].join('\n');
 const accountId = [...saved('TJ_Accounts').keys()][0];
 async function previewIBKR(){
  d.querySelector('.tab[data-page="open-trades"]').click();
  click('Import from IBKR');
  set('Journal account',accountId);
  const file = control('IBKR CSV');
  Object.defineProperty(file,'files',{value:[{size:csv.length,text:async()=>csv}]});
  file.dispatchEvent(new w.Event('change',{bubbles:true}));
  await settled();
 }
 // Drive the header file picker that previously disconnected Google.
 let disconnects = 0;
 w.disconnectGoogle = ()=>{disconnects++;w.JournalApp.clear()};
 w.FileReader = class {
  readAsText(file){file.text().then(text=>this.onload({target:{result:text}}))}
 };
 w.loadFile({target:{files:[],value:''}});
 assert.equal(disconnects,0);
 const headerPicker = {files:[{name:'IBKR.CSV',size:csv.length,text:async()=>csv}],value:'selected'};
 const tradesBeforeHeaderImport = saved('TJ_Trades').size;
 w.loadFile({target:headerPicker});
 await settled();
 assert.equal(disconnects,0);
 assert.equal(headerPicker.value,'');
 assert(dialog().textContent.includes('Selected file: IBKR.CSV'));
 assert(!d.querySelector('#badge').textContent.includes('391'));
 assert.equal(saved('TJ_Trades').size,tradesBeforeHeaderImport);
 set('Journal account',accountId);
 await settled();
 assert(dialog().textContent.includes('1 new trades'));
 assert(![...saved('TJ_Trades').values()].some(t=>t.symbol==='IMPORT'));
 await save();
 assert([...saved('TJ_Trades').values()].some(t=>t.symbol==='IMPORT'));
 assert([...saved('TJ_Actions').values()].some(a=>a.id==='ibkr:'+accountId+':2' && a.kind==='expire'));
 await previewIBKR();
 assert(dialog().querySelector('button[type="submit"]').disabled);
 assert.equal([...dialog().querySelectorAll('.journal-stat strong')][2].textContent,'2');
 click('Cancel',dialog());
 assert.equal(errors.length,0);w.JournalApp.clear();assert(!d.body.textContent.includes('One Call'));
 console.log('PASS: DOM integration — consolidated account/connection toolbar, menu containment/outside-click/Escape, temporary success and persistent errors, setup, immediate opening fields, cash preview, single/multiple tags, selection persistence, drawer sections, marks, net P&L and zero colors, focused search, filters, closing and actual commissions, short defaults, detailed legs and fill preservation, edit, revisioned delete/restore, header IBKR route preserves session and waits for account/confirmation, IBKR preview, commit and repeat import, disconnect. Sheets mocked; visual/browser QA not covered.');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
