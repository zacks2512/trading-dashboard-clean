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
w.eval(fs.readFileSync(path.join(root,'ibkr-reconcile.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'overview-drill.js'),'utf8'));
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
 for(const id of ['google-connect','google-pick','private-tab'])assert(d.querySelector('#connection-menu').contains(d.getElementById(id)));
 assert(d.querySelector('.workspace-connection').contains(d.getElementById('google-disconnect')));
 assert(!d.querySelector('#connection-menu').contains(d.getElementById('google-disconnect')));
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
 w.JournalApp.setLegacy([{
  'Full name':'Original imported option','Symbol':'IMPORT','Entry Date':'01/02/2026',
  'Exit Date':'20/03/2026','Net P&L':'-301','Net P&L (%)':'-100',
  'strategy':'Technical Setup','comments':'Preserve my history note'
 }],'migration-test');
 const tradesBeforeHeaderImport = saved('TJ_Trades').size;
 // Older cached import modules do not expose isCSV.
 delete w.IBKRImport.isCSV;
 w.loadFile({target:headerPicker});
 await settled();
 assert.equal(disconnects,0);
 assert.equal(headerPicker.value,'');
 assert(dialog().textContent.includes('Selected file: IBKR.CSV'));
 assert(!d.querySelector('#badge').textContent.includes('391'));
 assert.equal(saved('TJ_Trades').size,tradesBeforeHeaderImport);
 set('Journal account',accountId);
 await settled();
 assert.equal([...dialog().querySelectorAll('.journal-stat strong')][0].textContent,'0');
 const matching = control('Match historical entry');
 const legacyChoice = [...matching.options].find(option=>option.value.startsWith('legacy:'));
 assert(legacyChoice);
 matching.value=legacyChoice.value;
 matching.dispatchEvent(new w.Event('change',{bubbles:true}));
 await settled();
 assert(dialog().textContent.includes('1 new trades'));
 assert(![...saved('TJ_Trades').values()].some(t=>t.symbol==='IMPORT'));
 await save();
 const migrated = [...saved('TJ_Trades').values()].find(t=>t.symbol==='IMPORT');
 assert(migrated);
 assert.equal(migrated.legacyKey,'migration-test:2');
 assert.equal(migrated.notes,'Preserve my history note');
 assert.equal(w.trades.filter(t=>t.symbol==='IMPORT').length,1);
 assert([...saved('TJ_Actions').values()].some(a=>a.id==='ibkr:'+accountId+':2' && a.kind==='expire'));
 await previewIBKR();
 assert(dialog().querySelector('button[type="submit"]').disabled);
 assert.equal([...dialog().querySelectorAll('.journal-stat strong')][2].textContent,'2');
 click('Cancel',dialog());
 // A private reconciliation package uses the connected import route and links
 // two historical exits to one position without exposing broker data in source.
 const bulkCSV=[csv.split('\n')[0],
  'OPT,Bulk option,456,BULK,100,50,20/03/2026,C,BUY,USD,101,01/02/2026;10:00:00,3,3,-6,USD,O,101,,',
  'OPT,Bulk option,456,BULK,100,50,20/03/2026,C,SELL,USD,102,02/02/2026;10:00:00,-1,4,-2,USD,C,102,,',
  'OPT,Bulk option,456,BULK,100,50,20/03/2026,C,SELL,USD,103,03/02/2026;10:00:00,-2,4,-4,USD,C,103,,'
 ].join('\n');
 const sources=[
  {name:'Bulk partial',symbol:'BULK',pnl:96,entryDate:'2026-01-31T22:00:00.000Z',exitDate:'2026-02-01T22:00:00.000Z',strike:'50',contracts:'1',expiry:'20/03/26',entryPrice:'3',exitPrice:'4'},
  {name:'Bulk final',symbol:'BULK',pnl:192,entryDate:'2026-01-31T22:00:00.000Z',exitDate:'2026-02-02T22:00:00.000Z',strike:'50',contracts:'2',expiry:'20/03/26',entryPrice:'3',exitPrice:'4'}
 ];
 const rawBulk=sources.map((s,i)=>({'Full name':s.name,'Symbol':'BULK','Entry Date':'01/02/2026','Exit Date':i?'03/02/2026':'02/02/2026','Net P&L':String(s.pnl),'Strike':s.strike,'Contracts':s.contracts,'Expiry':s.expiry,'Entry Price':s.entryPrice,'Exit Price':s.exitPrice,'comments':i?'Second original note':'First original note','strategy':'Technical Setup'}));
 w.JournalApp.setLegacy([...rawBulk,{'Full name':'Preserved old option','Symbol':'OLD','Entry Date':'01/08/2025','Exit Date':'14/01/2026','Net P&L':'185'}],'bulk-test');
 const bundle={format:w.IBKRReconcile.FORMAT,version:1,csv:bulkCSV,groups:[{sources,tradeIds:['101','102','103'],expectedNet:288}],preserved:[{name:'Preserved old option'}]};
 const bundleText=JSON.stringify(bundle),bundleFile={name:'Approved-history.json',size:bundleText.length,text:async()=>bundleText};
 const beforeBulk=saved('TJ_Actions').size;
 w.loadFile({target:{files:[bundleFile],value:'selected'}});await settled();set('Journal account',accountId);await settled();
 assert.equal(disconnects,0);assert(dialog().textContent.includes('2 historical summaries to reconcile'));
 assert.equal(saved('TJ_Actions').size,beforeBulk);click('Cancel',dialog());
 w.loadFile({target:{files:[bundleFile],value:'selected'}});await settled();set('Journal account',accountId);await settled();await save();
 const bulk=[...saved('TJ_Trades').values()].find(t=>t.symbol==='BULK');
 assert.equal(bulk.legacyKeys.length,2);assert.equal(bulk.legacyOriginals.length,2);
 assert.equal(bulk.notes,'First original note\n\nSecond original note');
 assert.equal(w.trades.filter(t=>t.symbol==='BULK').length,1);assert.equal(w.trades.find(t=>t.symbol==='BULK').pnl,288);
 assert.equal(w.trades.find(t=>t.symbol==='OLD').pnl,185);
 const afterBulk=saved('TJ_Actions').size;
 // Replaying either the bundle or the ordinary annual CSV performs no writes.
 for(const file of [bundleFile,{name:'Annual.csv',size:bulkCSV.length,text:async()=>bulkCSV}]){
  w.loadFile({target:{files:[file],value:'selected'}});await settled();set('Journal account',accountId);await settled();
  assert(dialog().querySelector('button[type="submit"]').disabled);
  assert.equal([...dialog().querySelectorAll('.journal-stat strong')][2].textContent,'3');
  assert.equal(saved('TJ_Actions').size,afterBulk);click('Cancel',dialog());
 }
 // Chart drawing is stubbed here; real click/keyboard events, chart selection
 // adapters, accounting, side drawers and revisioned saves run unchanged.
 class ChartMock{
  constructor(canvas,config){this.canvas=canvas;this.data=config.data;this.options=config.options;this.chartArea={left:100,right:500,top:20,bottom:220};this.scales={x:{bottom:250,getValueForPixel:x=>Math.round((x-100)/30)},y:{left:0,getValueForPixel:y=>Math.floor((y-20)/20)}};if(config.type==='doughnut')this.legend={legendHitBoxes:this.data.labels.map((_,i)=>({left:520,top:20+i*20,width:100,height:18})),legendItems:this.data.labels.map((_,index)=>({index}))};}
  getElementsAtEventForMode(e){return e.clientY===0&&e.clientX>0?[{index:e.clientX-1,datasetIndex:e.detail||0}]:[]}
  destroy(){this.destroyed=true}
 }
 ChartMock.helpers={getRelativePosition:e=>({x:e.clientX,y:e.clientY})};w.Chart=ChartMock;
 w.renderAll=()=>{if(w.trades.length)w.renderOV()};w.JournalApp.render();
 const chartClick=(id,index)=>d.getElementById(id).dispatchEvent(new w.MouseEvent('click',{clientX:index+1,clientY:0,bubbles:true}));
 const pointIndex=name=>w.trades.findIndex(t=>t.name===name);
 const actionsBeforeDrill=saved('TJ_Actions').size;
 w.sw('overview');chartClick('cumulChart',pointIndex('One Call'));
 assert(dialog().classList.contains('journal-drawer'));assert(dialog().querySelector('h2').textContent==='One Call');
 assert.equal(d.body.dataset.page,'overview');click('Edit trade');assert(dialog().classList.contains('journal-drawer'));
 click('Volatility Play',control('Strategy'));click('Curiosity',control('Entry emotions'));set('Trade notes','Completed from Overview');
 submit();await settled();assert(dialog().querySelector('h2').textContent==='One Call');
 let edited=[...saved('TJ_Trades').values()].find(t=>t.title==='One Call');assert.equal(edited.strategy,'Volatility Play');assert(edited.entryEmotions.includes('Curiosity'));assert.equal(edited.notes,'Completed from Overview');
 assert.equal(saved('TJ_Actions').size,actionsBeforeDrill);assert.equal(d.body.dataset.page,'overview');click('Close',dialog());
 let strategyIndex=w.CX.stratChart.data.labels.indexOf('Volatility Play');
 chartClick('stratChart',strategyIndex);assert(dialog().querySelector('h2').textContent==='Strategy: Volatility Play');
 assert(dialog().textContent.includes('One Call'));assert(dialog().textContent.includes('$98.00'));
 click('Edit',dialog());click('Technical Setup',control('Strategy'));submit();await settled();click('← Back to results');
 assert(dialog().querySelector('h2').textContent==='Strategy: Volatility Play');assert(dialog().textContent.includes('No records yet.'));click('Close',dialog());
 // Category tick labels are clickable, not just the bar rectangles.
 strategyIndex=w.CX.stratChart.data.labels.indexOf('Technical Setup');
 d.getElementById('stratChart').dispatchEvent(new w.MouseEvent('click',{clientX:30,clientY:21+strategyIndex*20,bubbles:true}));
 const expectedGroup=w.trades.filter(t=>t.strategy==='Technical Setup');
 assert.equal(dialog().querySelectorAll('tbody tr').length,expectedGroup.length);
 const net=expectedGroup.reduce((n,t)=>n+t.pnl,0);assert(dialog().textContent.includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(net)));click('Close',dialog());
 for(const [canvas,chart,key]of [['typeChart','typeChart','type'],['symChart','sym','symbol'],['mistakeChart','mk','mistakes']]){
  const value=w.CX[chart].data.labels[0];chartClick(canvas,0);
  assert.equal(dialog().querySelectorAll('tbody tr').length,w.trades.filter(t=>t[key]===value).length);click('Close',dialog());
 }
 d.getElementById('mistakeChart').dispatchEvent(new w.MouseEvent('click',{clientX:530,clientY:25,bubbles:true}));assert(dialog().querySelector('h2').textContent.startsWith('Mistakes:'));click('Close',dialog());
 chartClick('drawdownChart',pointIndex('One Call'));assert.equal(dialog().querySelector('h2').textContent,'One Call');click('Close',dialog());
 // Keyboard activation opens the same trade as the corresponding chart point.
 const canvas=d.getElementById('cumulChart');canvas.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));canvas.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(dialog().querySelector('h2').textContent,w.trades[0].name);click('Close',dialog());
 // Historical summaries can be annotated on Save, without invented executions.
 const managedBeforeLegacy=saved('TJ_Trades').size;
 chartClick('cumulChart',pointIndex('Preserved old option'));assert.equal(saved('TJ_Trades').size,managedBeforeLegacy);click('Edit trade');click('Cancel',dialog());
 assert.equal(saved('TJ_Trades').size,managedBeforeLegacy);click('Edit trade');click('Volatility Play',control('Strategy'));set('Trade notes','Historical note from Overview');submit();await settled();
 assert.equal(w.trades.filter(t=>t.symbol==='OLD').length,1);assert.equal(w.trades.find(t=>t.symbol==='OLD').pnl,185);
 assert.equal(saved('TJ_Actions').size,actionsBeforeDrill);assert.equal([...saved('TJ_Trades').values()].find(t=>t.symbol==='OLD').notes,'Historical note from Overview');click('Close',dialog());
 // Drilldowns use the same account-filtered data as the charts.
 d.querySelector('.tab[data-page="journal-settings"]').click();click('Add account');set('Account name','Other account');await save();
 const otherAccount=[...saved('TJ_Accounts').values()].find(a=>a.name==='Other account').id;
 w.sw('overview');chartClick('cumulChart',pointIndex('Bulk partial'));click('Edit trade');set('Account',otherAccount);submit();await settled();click('Close',dialog());
 const accountFilter=d.getElementById('journal-account');accountFilter.value=accountId;accountFilter.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert(!w.trades.some(t=>t.symbol==='BULK'));
 chartClick('stratChart',w.CX.stratChart.data.labels.indexOf('Technical Setup'));
 assert(!dialog().textContent.includes('Bulk partial'));assert(!dialog().textContent.includes('Other account'));click('Close',dialog());
 accountFilter.value='';accountFilter.dispatchEvent(new w.Event('change',{bubbles:true}));assert(w.trades.some(t=>t.symbol==='BULK'));
 // Raw IBKR contract names are formatted at display time; stored titles and
 // accounting remain intact, and Date objects never render as verbose strings.
 chartClick('cumulChart',pointIndex('Original imported option'));click('Edit trade');set('Trade name','IMPORT  260320C00050000');submit();await settled();
 const readable="IMPORT MAR 20'26 50$ Buy Call";
 assert.equal(dialog().querySelector('h2').textContent,readable);
 assert.equal([...saved('TJ_Trades').values()].find(t=>t.symbol==='IMPORT').title,'IMPORT  260320C00050000');
 assert.equal(w.trades.find(t=>t.symbol==='IMPORT').name,readable);assert.equal(w.trades.find(t=>t.symbol==='IMPORT').pnl,-301);click('Close',dialog());
 chartClick('symChart',w.CX.sym.data.labels.indexOf('IMPORT'));
 assert(dialog().textContent.includes(readable));assert(dialog().textContent.includes('20/03/2026'));assert(!dialog().textContent.includes('GMT'));click('Close',dialog());
 // Repeated rerenders replace handlers; disconnected charts cannot reopen data.
 // Time-used analytics derive calendar-day percentages for imported packages
 // and same-expiry legs, preserving null for ambiguous/undefined durations.
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-06','2026-01-21'),25);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-01','2026-01-21'),0);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-21','2026-01-21'),100);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-22','2026-01-21'),100);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-01','2026-01-01'),null);
 assert.equal(w.timeUsedPercent('2026-01-02','2026-01-01','2026-01-21'),null);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-06',''),null);
 assert.equal(w.timeUsedPercent('2026-01-01','2026-01-06','2026-02-30'),null);
 assert.equal(w.timeUsedPercent('26/03/26','28/03/26','30/03/26'),50);
 assert.equal(w.trades.find(t=>t.symbol==='IMPORT').timeEff,100);
 assert.equal(w.trades.find(t=>t.name==='One Call').timeEff,0);
 const fixture=new w.JournalStore.Store(transport);await fixture.load();const changes=[];
 for(const id of ['timed','mixed','0dte']){
  const detailed=id!=='0dte',t={id,accountId,title:id+' fixture',symbol:'TIME',entryDate:'2026-01-01',mode:detailed?'legs':'package',side:'long',structure:detailed?'Other':'Long Call',multiplier:100,contractsPerPackage:detailed?2:1,strike:50,expiry:detailed?'':'2026-01-01',strategy:'Volatility Play'};
  changes.push({table:'trades',data:t});
  if(detailed)for(let i=0;i<2;i++)changes.push({table:'legs',data:{id:id+'leg'+i,tradeId:id,kind:'Call',side:i?'short':'long',strike:50+i*5,expiry:id==='mixed'&&i?'2026-02-21':'2026-01-21',ratio:1,multiplier:100}});
  for(const close of [false,true])changes.push({table:'actions',data:{id:id+(close?'close':'open'),tradeId:id,date:close&&detailed?'2026-01-06':'2026-01-01',order:close?2:1,kind:close?'close':'open',feeMode:'actual',fee:detailed?4:2,fills:detailed?[{unitId:id+'leg0',quantity:1,price:close?4:3},{unitId:id+'leg1',quantity:1,price:1}]:[{unitId:'package',quantity:1,price:close?4:3}]}});
 }
 await fixture.commit(changes.map(m=>({...m,id:m.data.id,expected:''})),{note:'Time-analysis fixtures'});await w.JournalApp.reload();
 assert.equal(w.trades.find(t=>t.name==='timed fixture').timeEff,25);
 assert.equal(w.trades.find(t=>t.name==='mixed fixture').timeEff,null);
 assert.equal(w.trades.find(t=>t.name==='0dte fixture').timeEff,null);
 w.renderPerf();let plotted=w.CX.perfScatter.data.datasets.flatMap(ds=>ds.data);
 assert(plotted.some(p=>p.label==='timed fixture'&&p.x===25&&p.y===92));assert(plotted.some(p=>p.sym==='IMPORT'&&p.x===100));
 assert(!plotted.some(p=>p.label==='mixed fixture'||p.label==='0dte fixture'));
 assert(d.getElementById('te-coverage').textContent.startsWith(plotted.length+' of '+w.trades.length+' closed trades shown.'));
 const oldScatter=w.CX.perfScatter;w.trades=w.trades.filter(t=>t.name==='mixed fixture');w.renderPerf();
 assert(oldScatter.destroyed);assert(!w.CX.perfScatter);assert(d.getElementById('te-coverage').textContent.startsWith('0 of 1'));
 assert(d.getElementById('perfScatter').parentElement.hidden);w.JournalApp.render();
 // Every Performance graph opens a drawer on the same page. Multi-dataset
 // hits retain both dataset and point indices instead of opening the wrong row.
 w.renderAll=()=>{if(w.trades.length){w.renderOV();w.renderPerf()}};w.JournalApp.render();w.sw('perf');
 const perfClick=(id,index,datasetIndex=0)=>{
  const chart=Object.values(w.CX).find(c=>c.canvas.id===id);
  chart.options.onClick?.({native:{target:chart.canvas}},[{index,datasetIndex}]);
  chart.canvas.dispatchEvent(new w.MouseEvent('click',{clientX:index+1,clientY:0,detail:datasetIndex,bubbles:true}));
  assert.equal(d.body.dataset.page,'perf');assert(dialog().classList.contains('journal-drawer'));
 };
 const periodKeys=()=>[...new Set(w.trades.map(t=>w.performancePeriodKey(t,w.perfPeriod)))].sort();
 for(const id of ['perfPnl','perfWR','perfCount']){
  const key=periodKeys()[0],expected=w.trades.filter(t=>w.performancePeriodKey(t,'monthly')===key);
  perfClick(id,0);assert.equal(dialog().querySelectorAll('.journal-trade-link').length,expected.length);
  assert(dialog().textContent.includes('Win rate'));assert(dialog().textContent.includes('Average net P&L'));click('Close',dialog());
 }
 w.setPeriod('weekly');const week=periodKeys()[0];perfClick('perfCount',0);
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,w.trades.filter(t=>w.performancePeriodKey(t,'weekly')===week).length);click('Close',dialog());w.setPeriod('monthly');
 const scatterDI=w.CX.perfScatter.data.datasets.findIndex((ds,i)=>i>0&&ds.data.length);
 assert(scatterDI>0);const scatterPoint=w.CX.perfScatter.data.datasets[scatterDI].data[0];
 perfClick('perfScatter',0,scatterDI);assert.equal(dialog().querySelector('h2').textContent,scatterPoint.label);
 click('Edit trade');set('Trade notes','Edited from Performance');submit();await settled();
 assert.equal(dialog().querySelector('h2').textContent,scatterPoint.label);assert.equal(d.body.dataset.page,'perf');click('← Back to Performance');assert(!dialog());
 const timeStrategy=w.CX.perfScatter.data.datasets[0].label;
 click(timeStrategy,d.getElementById('te-legend'));
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,w.trades.filter(t=>t.strategy===timeStrategy&&Number.isFinite(t.timeEff)).length);click('Close',dialog());
 const mixDI=w.CX.stratMix.data.datasets.findIndex(ds=>ds.label==='Volatility Play');
 const mixIndex=w.CX.stratMix.data.datasets[mixDI].data.findIndex(n=>n>0),mixKey=periodKeys()[mixIndex];
 perfClick('stratMix',mixIndex,mixDI);
 const mixExpected=()=>w.trades.filter(t=>w.performancePeriodKey(t,'monthly')===mixKey&&w.performanceStrategy(t)==='Volatility Play');
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,mixExpected().length);
 click('Edit',dialog());click('Technical Setup',control('Strategy'));submit();await settled();click('← Back to results');
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,mixExpected().length);assert.equal(d.body.dataset.page,'perf');click('Close',dialog());
 for(const id of ['dteWR','dtePnl']){
  perfClick(id,0);assert.equal(dialog().querySelectorAll('.journal-trade-link').length,w.trades.filter(t=>w.tradeDte(t)!==null&&w.tradeDte(t)>=0&&w.tradeDte(t)<=7).length);click('Close',dialog());
 }
 const mainFilter=d.getElementById('journal-account');mainFilter.value=accountId;mainFilter.dispatchEvent(new w.Event('change',{bubbles:true}));
 perfClick('perfPnl',0);assert(!dialog().textContent.includes('Other account'));click('Close',dialog());mainFilter.value='';mainFilter.dispatchEvent(new w.Event('change',{bubbles:true}));
 d.getElementById('perfScatter').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));d.getElementById('perfScatter').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(dialog().querySelector('h2').textContent,w.CX.perfScatter.data.datasets[0].data[0].label);click('Close',dialog());
 // A stacked chart's period tick opens the full period, not a guessed segment.
 d.getElementById('stratMix').dispatchEvent(new w.MouseEvent('click',{clientX:100,clientY:240,bubbles:true}));
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,w.trades.filter(t=>w.performancePeriodKey(t,'monthly')===periodKeys()[0]).length);click('Close',dialog());w.sw('overview');
 // Heatmap aliases share one canonical column; each cell and its drawer use
 // the same emotion/type intersection, with no duplicate emotion counting.
 w.renderAll=()=>{if(w.trades.length){w.renderOV();w.renderPerf();w.buildHM()}};
 w.JournalApp.detail([...saved('TJ_Trades').values()].find(t=>t.title==='One Call').id);click('Edit trade');
 assert(!control('Entry emotions').selectedValues().includes('Confidence'));click('Confidence',control('Entry emotions'));await save();
 const heatSources=[
  {'Full name':'Legacy heatmap','Symbol':'HEAT','trade type':'Buy Call','Net P&L':'40','Entry Date':'01/06/2026','Exit Date':'02/06/2026','Expiry':'20/06/2026','Emotion (Entry)':'Confidence, Confidence, Curiosity'},
  {'Full name':'Custom heatmap','Symbol':'HEAT','trade type':'Custom <spread>','Net P&L':'-10','Entry Date':'01/06/2026','Exit Date':'02/06/2026','Expiry':'20/06/2026','Emotion (Entry)':'Focus <calm>'},
  {'Full name':'Neutral heatmap','Symbol':'HEAT','trade type':'Sell Put','Net P&L':'0','Entry Date':'01/06/2026','Exit Date':'02/06/2026','Expiry':'20/06/2026','Emotion (Entry)':'Confidence'}
 ];
 w.JournalApp.setLegacy(heatSources,'heatmap-test');w.sw('emotions');
 const heatCell=(emotion,type)=>[...d.querySelectorAll('#heatmap .hm-open')].find(b=>b.dataset.emotion===emotion&&b.dataset.tradeType===type);
 for(const [oldName,newName]of [['Buy Call','Long Call'],['Sell Call','Short Call'],['Buy Put','Long Put'],['Sell Put','Short Put']])assert.equal(w.heatmapTradeType(oldName),newName);
 const columns=[...d.querySelectorAll('#heatmap thead th')].map(th=>th.textContent);assert(columns.includes('Long Call'));assert(!columns.includes('Buy Call'));
 assert.equal(heatCell('Confidence','Long Call').querySelector('.cn').textContent,'n=2');assert.equal(heatCell('Confidence','Long Call').querySelector('.ca').textContent,'+$69');
 heatCell('Confidence','Long Call').click();assert.equal(dialog().querySelectorAll('.journal-trade-link').length,2);assert(dialog().textContent.includes('$69.00'));assert.equal(d.body.dataset.page,'emotions');
 [...dialog().querySelectorAll('.journal-trade-link')].find(b=>b.textContent==='One Call').click();click('Edit trade');click('Confidence',control('Entry emotions'));submit();await settled();click('← Back to results');
 assert.equal(dialog().querySelectorAll('.journal-trade-link').length,1);assert(dialog().textContent.includes('Legacy heatmap'));assert(!dialog().textContent.includes('One Call'));assert.equal(d.body.dataset.page,'emotions');click('Close',dialog());
 assert.equal(heatCell('Confidence','Long Call').querySelector('.cn').textContent,'n=1');assert.equal(heatCell('Confidence','Long Call').querySelector('.ca').textContent,'+$40');
 assert(heatCell('Focus <calm>','Custom <spread>'));assert(!d.querySelector('#heatmap spread, #heatmap calm'));
 heatCell('Focus <calm>','Custom <spread>').click();assert(dialog().textContent.includes('Custom heatmap'));assert.equal(dialog().querySelectorAll('.journal-trade-link').length,1);click('Close',dialog());
 const neutral=heatCell('Confidence','Short Put');assert.equal(neutral.querySelector('.ca').textContent,'+$0');assert(!neutral.closest('td').classList.contains('emp'));
 neutral.click();assert.equal(dialog().querySelectorAll('.journal-trade-link').length,1);click('Neutral heatmap',dialog());assert(buttons('← Back to results',dialog()).length);click('Close',dialog());
 const hf=d.getElementById('journal-account');hf.value=otherAccount;hf.dispatchEvent(new w.Event('change',{bubbles:true}));assert(!heatCell('Focus <calm>','Custom <spread>'));assert(!heatCell('Confidence','Long Call'));
 hf.value=accountId;hf.dispatchEvent(new w.Event('change',{bubbles:true}));assert(heatCell('Focus <calm>','Custom <spread>'));hf.value='';hf.dispatchEvent(new w.Event('change',{bubbles:true}));w.sw('overview');
 // Repeated rerenders replace handlers; disconnected charts cannot reopen data.
 let opens=0;const openAnalytics=w.JournalApp.openAnalytics;w.JournalApp.openAnalytics=s=>{opens++;return openAnalytics(s)};
 w.JournalApp.render();w.JournalApp.render();chartClick('cumulChart',pointIndex('One Call'));assert.equal(opens,1);click('Close',dialog());
 assert.equal(errors.length,0);w.JournalApp.clear();assert(!d.body.textContent.includes('One Call'));chartClick('cumulChart',0);assert(!dialog());assert.equal(opens,1);
 console.log('PASS: DOM integration — journal forms, accounting, revisions and imports; Overview and Performance chart drawers; Heatmap old/new type aliases, deduplicated emotion counts, average/member agreement, custom text labels, zero-P&L cells, edit/back flow and account isolation; readable labels, short dates, handler and disconnect cleanup. Charts and Sheets mocked; visual/browser QA not covered.');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
