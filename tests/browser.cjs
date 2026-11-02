const {chromium}=require(process.env.JOURNAL_PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const fs=require('node:fs'),assert=require('node:assert/strict');
const sheets=new Map([['All Data',{id:623391435,rows:[['Full name','Symbol','Entry Date','Exit Date','Expiry','Net P&L','Net P&L (%)','strategy','Emotion (Entry)','Emotion (Exite)','comments','confidence level (1-5)'],['Legacy example <img src=x onerror="window.pwned=1">','XYZ','01/01/26','02/01/26','10/01/26','100','10','Technical Setup','Confidence','Patience','Original legacy notes','4']]}]]);
function records(name){return(sheets.get(name)?.rows||[]).slice(1).map(r=>({...JSON.parse(r[5]),_rev:Number(r[1]),_deleted:r[4]==='true'})).reduce((a,r)=>{a.set(r.id,r);return a},new Map())}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.JOURNAL_BROWSER_EXECUTABLE?{executablePath:process.env.JOURNAL_BROWSER_EXECUTABLE}:{}),args:JSON.parse(process.env.JOURNAL_BROWSER_ARGS||'[]')});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync((process.env.JOURNAL_CHART_JS||path.join(path.dirname(require.resolve('chart.js')),'chart.umd.js')),'utf8')}));
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(c){return{requestAccessToken(){c.callback({access_token:'TEST_TOKEN',expires_in:3600,scope:c.scope});}}},hasGrantedAllScopes(){return true;},revoke(t,c){c();}}}};`}));
 await page.route('https://apis.google.com/js/api.js',r=>r.fulfill({contentType:'text/javascript',body:`window.gapi={load(n,c){c.callback();}};google.picker={ViewId:{SPREADSHEETS:'s'},Action:{PICKED:'picked'},DocsView:class{setIncludeFolders(){return this;}},PickerBuilder:class{addView(){return this;}setOAuthToken(){return this;}setDeveloperKey(){return this;}setAppId(){return this;}setOrigin(){return this;}setCallback(c){this.cb=c;return this;}build(){return{setVisible:()=>this.cb({action:'picked',docs:[{id:'test-file',mimeType:'application/vnd.google-apps.spreadsheet'}]})};}}};`}));
 await page.route('https://sheets.googleapis.com/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/spreadsheets/test-file')[1];assert.equal(req.headers().authorization,'Bearer TEST_TOKEN');
  if(path===':batchUpdate'){
   const body=req.postDataJSON();for(const request of body.requests){
    if(request.addSheet){const p=request.addSheet.properties;sheets.set(p.title,{id:p.sheetId,rows:[]});}
    else if(request.updateCells||request.appendCells){const op=request.updateCells||request.appendCells,target=[...sheets.values()].find(s=>s.id===(op.sheetId??op.start.sheetId));const rows=op.rows.map(r=>r.values.map(c=>c.userEnteredValue.stringValue));if(request.updateCells)target.rows=rows;else target.rows.push(...rows);}
   }return route.fulfill({json:{replies:[]}});
  }
  if(path==='/values:batchGet')return route.fulfill({json:{valueRanges:url.searchParams.getAll('ranges').map(range=>({values:sheets.get(range.match(/^'([^']+)'/)[1]).rows}))}});
  if(path.startsWith('/values/')){const range=decodeURIComponent(path.slice(8)),name=range.match(/^'((?:''|[^'])+)'/)[1].replace(/''/g,"'");return route.fulfill({json:{values:range.includes('!A1:F1')?sheets.get(name).rows.slice(0,1):sheets.get(name).rows}})}
  return route.fulfill({json:{sheets:[...sheets].map(([title,s])=>({properties:{title,sheetId:s.id,gridProperties:{rowCount:1000,columnCount:20}}}))}});
 });
 await page.route('https://journal.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1)||'index.html';const file=path.join(root,name);return r.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});});
 await page.goto('https://journal.test/');
 await page.evaluate(()=>{document.getElementById('picker-api-key').value='AIza'+'a'.repeat(35);savePickerKey()});
 await page.click('#google-connect');await page.waitForFunction(()=>!document.getElementById('google-pick').disabled);await page.click('#google-pick');
 await page.waitForFunction(()=>document.getElementById('badge').textContent.includes('1 closed trades'));
 assert.equal(await page.evaluate(()=>window.pwned),undefined);
 await page.locator('.tab[data-page="open-trades"]').click();await page.getByRole('button',{name:'Set up journal tabs',exact:true}).click();
 await page.getByLabel('First account name').fill('IBKR Main');await page.getByLabel('Default commission per contract (USD)').fill('0.65');
 await page.getByRole('button',{name:'Create journal tabs',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(sheets.size,9);assert.equal(sheets.get('All Data').rows.length,2);
 const create=async(name,price='2',quantity='2')=>{
  await page.locator('#page-open-trades').getByRole('button',{name:'New trade',exact:true}).click();
  await page.getByLabel('Trade name',{exact:true}).fill(name);await page.getByLabel('Underlying symbol').fill('TEST');await page.getByLabel('Entry date',{exact:true}).fill('2026-11-02');await page.getByLabel('Strike (single option)',{exact:true}).fill('100');await page.getByLabel('Expiry (package)',{exact:true}).fill('2026-12-18');
  await page.getByRole('button',{name:'Prepare opening details',exact:true}).click();
  await page.getByLabel('Whole strategy — quantity (0 to skip)',{exact:true}).fill(quantity);await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).fill(price);
  await page.getByRole('button',{name:'Save trade',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 };
 await create('UI Call');assert.equal(records('TJ_Trades').size,1);assert.equal(records('TJ_Actions').size,1);
 await page.locator('#page-open-trades strong').filter({hasText:'UI Call'}).click();
 await page.getByRole('button',{name:'Add execution',exact:true}).click();await page.getByLabel('Date',{exact:true}).fill('2026-11-03');
 await page.getByLabel('Whole strategy — quantity (0 to skip)',{exact:true}).fill('1');await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).fill('3');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert((await page.locator('#page-open-trades').innerText()).includes('$98.70'));
 await page.locator('#page-open-trades strong').filter({hasText:'UI Call'}).click();await page.getByRole('button',{name:'Update prices',exact:true}).click();
 await page.getByLabel('Price observation time (your local time)').fill('2026-11-04T12:00');await page.getByLabel('Whole strategy — price per share / package').fill('4');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert((await page.locator('#page-open-trades').innerText()).includes('$199.35'));
 await page.screenshot({path:'/tmp/tj-open.png',fullPage:true});
 await page.locator('#page-open-trades strong').filter({hasText:'UI Call'}).click();await page.getByRole('button',{name:'Add execution',exact:true}).click();await page.getByLabel('Date',{exact:true}).fill('2026-11-05');await page.getByLabel('Whole strategy — quantity (0 to skip)',{exact:true}).fill('1');await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).fill('4');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 await page.locator('.tab[data-page="closed-trades"]').click();assert((await page.locator('#page-closed-trades').innerText()).includes('$297.40'));
 // A legacy row is adopted without doubling its analytics count or changing All Data.
 await page.getByRole('button',{name:'Manage summary',exact:true}).click();await page.getByRole('button',{name:'Create managed summary',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(sheets.get('All Data').rows.length,2);assert.equal(await page.evaluate(()=>trades.length),2);
 // A roll closes the old position and opens the new linked record in one write.
 await page.locator('.tab[data-page="open-trades"]').click();await create('Old roll','1','1');await page.locator('#page-open-trades strong').filter({hasText:'Old roll'}).click();await page.getByRole('button',{name:'Roll',exact:true}).click();await page.getByLabel('Date',{exact:true}).fill('2026-11-06');await page.getByLabel('Whole strategy — quantity (0 to skip)',{exact:true}).fill('1');await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).fill('0.5');await page.getByRole('button',{name:'Next: new linked trade',exact:true}).click();
 await page.getByLabel('Trade name',{exact:true}).fill('New roll');await page.getByLabel('Expiry (package)',{exact:true}).fill('2027-01-15');await page.getByRole('button',{name:'Prepare opening details',exact:true}).click();await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).fill('2');await page.getByRole('button',{name:'Save roll & linked opening',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 const rolled=[...records('TJ_Trades').values()].find(t=>t.title==='New roll');assert(rolled.rollFromId);assert.equal([...records('TJ_Trades').values()].find(t=>t.id===rolled.rollFromId).title,'Old roll');
 // Recycle bin preserves the position and restores it.
 await page.locator('#page-open-trades strong').filter({hasText:'New roll'}).click();await page.getByRole('button',{name:'Delete trade',exact:true}).click();await page.getByRole('button',{name:'Move to recycle bin',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert(records('TJ_Trades').get(rolled.id)._deleted);
 await page.locator('.tab[data-page="journal-settings"]').click();await page.getByRole('button',{name:'History & recycle bin',exact:true}).click();await page.getByRole('button',{name:'Restore deleted record',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert(!records('TJ_Trades').get(rolled.id)._deleted);
 await page.locator('.tab[data-page="realized"]').click();assert((await page.locator('#page-realized').innerText()).includes('2026-11'));

 // Detailed-leg accounting and closing just one leg.
 await page.locator('.tab[data-page="open-trades"]').click();
 await page.locator('#page-open-trades').getByRole('button',{name:'New trade',exact:true}).click();
 await page.getByLabel('Trade name',{exact:true}).fill('Detailed spread');await page.getByLabel('Underlying symbol').fill('ABC');await page.getByLabel('Entry date',{exact:true}).fill('2026-11-02');await page.getByLabel('Price accounting mode').selectOption('legs');await page.getByLabel('Structure',{exact:true}).selectOption('Debit Vertical');
 await page.getByRole('button',{name:'Add leg',exact:true}).click();await page.getByRole('button',{name:'Add leg',exact:true}).click();
 const legRows=page.locator('dialog .journal-leg');
 for(let i=0;i<2;i++){await legRows.nth(i).getByLabel('Strike',{exact:true}).fill(i?'105':'100');await legRows.nth(i).getByLabel('Expiry',{exact:true}).fill('2026-12-18');}
 await legRows.nth(1).getByLabel('Position',{exact:true}).selectOption('short');
 await page.getByRole('button',{name:'Prepare opening details',exact:true}).click();
 await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).nth(0).fill('3');await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).nth(1).fill('1');
 await page.getByRole('button',{name:'Save trade',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 await page.locator('#page-open-trades strong').filter({hasText:'Detailed spread'}).click();await page.getByRole('button',{name:'Add execution',exact:true}).click();await page.getByLabel('Date',{exact:true}).fill('2026-11-04');
 await page.getByLabel('long Call 100 / 2026-12-18 — quantity (0 to skip)',{exact:true}).fill('1');await page.getByLabel('Price per share / strategy unit (USD)',{exact:true}).nth(0).fill('4');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 const spread=[...records('TJ_Trades').values()].find(t=>t.title==='Detailed spread');assert.equal(spread.mode,'legs');assert.equal([...records('TJ_Actions').values()].filter(a=>a.tradeId===spread.id).length,2);
 // Multiple accounts, default account selection, and filtering.
 await page.locator('.tab[data-page="journal-settings"]').click();await page.getByRole('button',{name:'Add account',exact:true}).click();await page.getByLabel('Account name',{exact:true}).fill('Second account');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 const second=[...records('TJ_Accounts').values()].find(a=>a.name==='Second account');await page.getByLabel('Default account',{exact:true}).selectOption(second.id);await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.waitForFunction(()=>document.getElementById('loadStatus').textContent.includes('Saved'));
 await page.locator('.tab[data-page="open-trades"]').click();await create('Other account trade','1','1');
 assert.equal([...records('TJ_Trades').values()].find(t=>t.title==='Other account trade').accountId,second.id);
 await page.locator('#journal-account').selectOption(second.id);assert(!(await page.locator('#page-open-trades').innerText()).includes('Detailed spread'));assert((await page.locator('#page-open-trades').innerText()).includes('Other account trade'));await page.locator('#journal-account').selectOption('');
 await page.setViewportSize({width:390,height:844});await page.locator('.tab[data-page="open-trades"]').click();await page.screenshot({path:'/tmp/tj-mobile.png',fullPage:true});
 await page.click('#google-disconnect');assert.equal(await page.evaluate(()=>trades.length),0);assert(!await page.evaluate(()=>document.body.innerHTML.includes('UI Call')));assert(!await page.evaluate(()=>JSON.stringify({...localStorage}).includes('TEST_TOKEN')));
 assert.deepEqual(errors,[]);console.log('PASS: browser setup; real Chart.js rendering; package and individual-leg actions; multi-account/default/filter; partial close/mark/final close; legacy adoption; linked roll; soft delete/restore; realized period view; mobile; XSS; disconnect. Google APIs mocked.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
