const assert = require('node:assert/strict');
const engine = require('../journal-engine');
const {plan,readCSV,isCSV} = require('../ibkr-import');
const header = 'AssetClass,Symbol,Conid,UnderlyingSymbol,Multiplier,Strike,Expiry,Put/Call,Buy/Sell,CurrencyPrimary,TradeID,DateTime,Quantity,TradePrice,IBCommission,IBCommissionCurrency,Open/CloseIndicator,IBOrderID,IBExecID,Notes/Codes';
const row = (id,day,quantity,price,code='',contract=41,order=id) =>
 ['OPT','Example, Inc. option',contract,'TEST',100,50,'20/03/2026','C',quantity>0?'BUY':'SELL',
  'USD',id,day+'/02/2026;10:00:00',quantity,price,price===0?0:-1,'USD',quantity>0?'O':'C',order,'',code]
  .map(value => '"'+value+'"').join(',');
const parse = (...lines) => readCSV('\uFEFF'+[header,...lines].join('\r\n'));
assert(isCSV('\uFEFF"AssetClass","TradeID"\r\nOPT,1'));
assert(!isCSV('Symbol,Quantity\nAAPL,1'));
const opening = row(1,'01',2,3), partial = row(2,'02',-1,4), expired = row(3,'20',-1,0,'Ep');
const first = plan(parse(opening,partial,expired),{engine,accountId:'test'});
const trade = first.mutations.find(m=>m.table==='trades').data;
const actions = first.mutations.filter(m=>m.table==='actions').map(m=>m.data);
assert.equal(first.newTrades,1);
assert.equal(actions.length,3);
assert.equal(actions[2].kind,'expire');
assert.equal(engine.summarize(trade,[],actions).realized,-202);
const replay = plan(parse(opening,partial,expired),{engine,accountId:'test',trades:[trade],actions});
assert.equal(replay.mutations.length,0);
assert(replay.results.every(r=>r.status==='duplicate'));
const incremental = plan(parse(opening,partial,expired),{engine,accountId:'test',trades:[trade],actions:actions.slice(0,1)});
assert.equal(incremental.updatedTrades,1);
assert.equal(incremental.mutations.length,2);
const exceptional = plan(parse(opening,row(4,'20',-2,0,'A'),row(5,'10',-1,1,'',42)),{engine,accountId:'test'});
assert.equal(exceptional.mutations.length,0);
assert(exceptional.results.every(r=>r.status==='review'));
const multi = plan(parse(opening,row(6,'01',1,3,'',42,1)),{engine,accountId:'test'});
assert.equal(multi.mutations.length,0);
assert(multi.results.every(r=>r.status==='review'));
const manual = plan(parse(opening,partial,expired),{
 engine,accountId:'test',legacy:[{symbol:'TEST',start:'2026-02-01',end:'2026-02-20'}]
});
assert.equal(manual.mutations.length,0);
assert(manual.results.every(r=>r.status==='review'));
assert.throws(()=>readCSV('Symbol,Quantity\nTEST,1'),/Activity Flex/);
console.log('PASS: IBKR CSV, fees and expiry, incremental closes, deduplication, review-only exceptions and historical overlap.');

// Confirmed historical replacement preserves annotation provenance and suppresses one source.
const historical = {
 key:'sheet:row:1',title:'Original option trade',symbol:'TEST',
 start:'2026-02-01',end:'2026-02-20',pnl:-202,
 data:{notes:'Original journal note',strategy:'Breakout',entryEmotions:['Patience']}
};
const newId = trade.id;
const blocked = plan(parse(opening,partial,expired),{
 engine,accountId:'test',legacy:[historical]
});
assert.equal(blocked.mutations.length,0);
assert.equal(blocked.matches.length,1);
assert.equal(blocked.matches[0].candidates[0].id,'legacy:sheet:row:1');
const linked = plan(parse(opening,partial,expired),{
 engine,accountId:'test',legacy:[historical],links:{[newId]:'legacy:sheet:row:1'}
});
assert.equal(linked.mutations.length,4);
const replacement = linked.mutations.find(m=>m.table==='trades').data;
assert.equal(replacement.legacyKey,historical.key);
assert.equal(replacement.notes,historical.data.notes);
assert.equal(replacement.strategy,'Breakout');
assert.equal(replacement.legacyOriginal.pnl,-202);
assert(!replacement.legacySummary);
const migratedActions = linked.mutations.filter(m=>m.table==='actions').map(m=>m.data);
assert.equal(engine.summarize(replacement,[],migratedActions).realized,-202);
const repeated = plan(parse(opening,partial,expired),{
 engine,accountId:'test',trades:[replacement],actions:migratedActions,legacy:[historical]
});
assert.equal(repeated.mutations.length,0);
const adopted = {...trade,id:'adopted',ibkrConid:undefined,legacyKey:historical.key,legacySummary:{pnl:-202,exitDate:'2026-02-20'},notes:'Managed note'};
const managed = plan(parse(opening,partial,expired),{
 engine,accountId:'test',trades:[adopted],legacy:[historical],links:{[newId]:'trade:adopted'}
});
const converted = managed.mutations.find(m=>m.table==='trades').data;
assert.equal(converted.id,'adopted');
assert.equal(converted.notes,'Managed note');
assert.equal(converted.legacyKey,historical.key);
assert(!converted.legacySummary);
assert(managed.mutations.filter(m=>m.table==='actions').every(m=>m.data.tradeId==='adopted'));
const separate = plan(parse(opening,partial,expired),{
 engine,accountId:'test',legacy:[historical],links:{[newId]:'separate'}
});
assert(!separate.mutations.find(m=>m.table==='trades').data.legacyKey);
const duplicateMatch = plan(parse(opening,row(2,'02',-2,4),row(3,'10',1,3),row(4,'20',-1,4)),{
 engine,accountId:'test',legacy:[historical],
 links:{[newId]:'legacy:sheet:row:1','ibkr:test:3:trade':'legacy:sheet:row:1'}
});
assert.equal(duplicateMatch.mutations.length,0);
assert(duplicateMatch.results.every(r=>r.status==='review'));
console.log('PASS: explicit historical matches, preserved notes/tags, managed-summary conversion, separate trades, one-to-one mapping and replay.');
