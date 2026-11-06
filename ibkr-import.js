(function(root){
 'use strict';

 const required = ['AssetClass','Conid','UnderlyingSymbol','Multiplier','Strike','Expiry',
  'Put/Call','Buy/Sell','CurrencyPrimary','TradeID','DateTime','Quantity','TradePrice',
  'IBCommission','IBCommissionCurrency','Open/CloseIndicator','IBOrderID','Notes/Codes'];

 function readCSV(text){
  const rows = [];
  let row = [], value = '', quoted = false, ended = false;
  text = text.replace(/^\uFEFF/, '');
  for(let i = 0; i < text.length; i++){
   const ch = text[i];
   if(quoted){
    if(ch !== '"') value += ch;
    else if(text[i + 1] === '"'){ value += '"'; i++; }
    else { quoted = false; ended = true; }
   }else if(ch === ',' || ch === '\n' || ch === '\r'){
    row.push(value.trim());
    value = '';
    ended = false;
    if(ch !== ','){
     if(row.some(Boolean)) rows.push(row);
     row = [];
     if(ch === '\r' && text[i + 1] === '\n') i++;
    }
   }else if(ch === '"' && !value && !ended) quoted = true;
   else if(ch === '"' || ended) throw new Error('Invalid CSV quoting.');
   else value += ch;
  }
  if(quoted) throw new Error('An IBKR CSV field is missing its closing quote.');
  row.push(value.trim());
  if(row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  if(new Set(headers).size !== headers.length || required.some(key => !headers.includes(key))){
   throw new Error('Choose an IBKR Activity Flex CSV with Trades and Notes/Codes.');
  }
  if(rows.some(row => row.length !== headers.length)) throw new Error('The IBKR CSV has rows with unexpected columns.');
  return rows.map((row, i) => ({...Object.fromEntries(headers.map((key,j) => [key,row[j]])),line:i + 2}));
 }

 function date(value){
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = parts ? [parts[3],parts[2],parts[1]].join('-') : value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const parsed = new Date(iso + 'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== iso){
   throw new Error('Invalid execution or expiry date.');
  }
  return iso;
 }

 function normalize(row){
  if(!/^\d+$/.test(row.TradeID) || !/^\d+$/.test(row.Conid) || !row.UnderlyingSymbol){
   throw new Error('Missing trade ID, contract ID or underlying symbol.');
  }
  if(row.CurrencyPrimary !== 'USD' || row.IBCommissionCurrency !== 'USD'){
   throw new Error('Only USD option executions with USD commissions are supported.');
  }
  const opening = row['Open/CloseIndicator'] === 'O';
  if(!opening && row['Open/CloseIndicator'] !== 'C') throw new Error('Ambiguous opening or closing indicator.');
  const buy = row['Buy/Sell'] === 'BUY';
  const quantity = Number(row.Quantity);
  if((!buy && row['Buy/Sell'] !== 'SELL') || !Number.isSafeInteger(quantity) || !quantity || (quantity > 0) !== buy){
   throw new Error('Invalid execution side or quantity.');
  }
  const putCall = row['Put/Call'];
  if(!['P','C'].includes(putCall)) throw new Error('Missing option type.');
  const stamp = row.DateTime.match(/^(.+?)[;T ](\d{2}):?(\d{2}):?(\d{2})$/);
  if(!stamp || +stamp[2] > 23 || +stamp[3] > 59 || +stamp[4] > 59) throw new Error('Invalid execution time.');
  const timestamp = date(stamp[1]) + 'T' + stamp.slice(2).join(':');
  const price = Number(row.TradePrice), commission = Number(row.IBCommission);
  const strike = Number(row.Strike), multiplier = Number(row.Multiplier);
  if(!row.TradePrice || !row.IBCommission || !row.Strike ||
     ![price,commission,strike,multiplier].every(Number.isFinite) ||
     price < 0 || commission > 0 || strike < 0 || multiplier < 1){
   throw new Error('Invalid price, fee or contract terms.');
  }
  return {
   opening, timestamp, date:timestamp.slice(0,10), order:Date.parse(timestamp + 'Z'),
   conid:row.Conid, side:buy === opening ? 'long' : 'short',
   symbol:row.UnderlyingSymbol.toUpperCase(), strike, expiry:date(row.Expiry), multiplier,
   option:putCall === 'C' ? 'Call' : 'Put', quantity:Math.abs(quantity), price, fee:-commission
  };
 }

 function plan(rows,{accountId,trades=[],actions=[],legs=[],legacy=[],engine}){
  const options = rows.filter(row => row.AssetClass === 'OPT');
  const ignored = rows.length - options.length;
  const results = [], mutations = [], existingTrades = trades.filter(t => t.accountId === accountId && !t._deleted);
  const known = new Map(actions.map(a => [a.id,a]));
  const groups = new Map(), orderContracts = new Map(), badContracts = new Set();
  const seen = new Map();
  const newTrades = new Set(), updatedTrades = new Set();
  const addResult = (row,status,reason) => results.push({
   line:row.line, symbol:row.Symbol || row.UnderlyingSymbol, date:row.DateTime, status, reason
  });

  for(const row of options){
   if(!row.IBOrderID || /^0+$/.test(row.IBOrderID)) continue;
   if(!orderContracts.has(row.IBOrderID)) orderContracts.set(row.IBOrderID,new Set());
   orderContracts.get(row.IBOrderID).add(row.Conid);
  }
  for(const row of options){
   const id = 'ibkr:' + accountId + ':' + row.TradeID;
   const signature = JSON.stringify(required.map(key => row[key]));
   const stored = known.get(id);
   if(stored || seen.has(id)){
    const previous = stored ? stored.ibkrSignature : seen.get(id).signature;
    const same = previous === signature;
    addResult(row,same?'duplicate':'review',same?'Execution already recorded or repeated in this file.':'Trade ID has conflicting execution details.');
    if(!same){
     badContracts.add(row.Conid);
     if(seen.has(id)) badContracts.add(seen.get(id).conid);
    }
    continue;
   }
   seen.set(id,{signature,conid:row.Conid});
   try{
    const execution = normalize(row);
    const key = execution.conid + ':' + execution.side;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({row,id,signature,...execution});
   }catch(error){
    badContracts.add(row.Conid);
    addResult(row,'review',error.message);
   }
  }

  const actionsFor = id => actions.filter(a => a.tradeId === id && !a._deleted);
  const summaries = new Map();
  function summary(t){
   if(!summaries.has(t.id)) summaries.set(t.id,engine.summarize(t,legs.filter(l => l.tradeId === t.id),actionsFor(t.id)));
   return summaries.get(t.id);
  }
  const overlaps = (symbol,start,end) => {
   if(legacy.some(t => t.symbol === symbol && (!t.start || t.start <= end) && (!t.end || t.end >= start))) return true;
   return existingTrades.some(t => {
    if(t.ibkrConid || String(t.symbol).toUpperCase() !== symbol || t.entryDate > end) return false;
    try{ return !summary(t).closedDate || summary(t).closedDate >= start; }
    catch(_){ return true; }
   });
  };

  for(const group of groups.values()){
   group.sort((a,b) => a.order - b.order || a.line - b.line);
   const first = group[0];
   let problem = '';
   if(badContracts.has(first.conid)) problem = 'Another execution for this contract has invalid or conflicting details.';
   const unsupported = group.find(x => {
    const codes = x.row['Notes/Codes'].split(';').filter(Boolean);
    return codes.some(code => !['O','C','P','Ep'].includes(code)) ||
     (x.price === 0 && (x.opening || !codes.includes('Ep'))) ||
     (codes.includes('Ep') && (x.opening || x.price !== 0));
   });
   if(unsupported) problem = 'Exercise, assignment or unsupported execution code (' + (unsupported.row['Notes/Codes'] || 'zero price') + '). Related executions need review.';
   if(group.some(x => orderContracts.get(x.row.IBOrderID)?.size > 1)){
    problem = 'Order spans multiple contracts. Review the strategy grouping.';
   }
   const candidates = existingTrades.filter(t => t.ibkrConid === first.conid && t.side === first.side);
   let current = null, remaining = 0;
   const cycles = [];
   try{
    if(problem) throw new Error(problem);
    if(group.some(x => ['symbol','multiplier','strike','expiry','option'].some(key => x[key] !== first[key]))){
     throw new Error('Inconsistent terms for the same IBKR contract.');
    }
    if(candidates.some(t => actionsFor(t.id).some(a => a.date > first.date ||
       (a.date === first.date && a.order >= first.order)))){
     throw new Error('Earlier or same-time execution overlaps recorded history. Review the order of fills.');
    }
    for(const trade of candidates){
     const state = summary(trade);
     if(state.status !== 'open') continue;
     if(current) throw new Error('Multiple open journal positions match this contract.');
     if(trade.mode !== 'package' || trade.multiplier !== first.multiplier || trade.strike !== first.strike ||
        trade.expiry !== first.expiry || trade.structure !== (first.side === 'long' ? 'Long ' : 'Short ') + first.option){
      throw new Error('The existing journal position has different contract terms.');
     }
     remaining = state.positions[0].quantity;
     current = {trade,entries:[],existing:true};
     cycles.push(current);
    }
    for(const x of group){
     if(x.opening && !remaining){
      const trade = {
       id:x.id + ':trade',accountId,title:x.row.Symbol || x.symbol,symbol:x.symbol,entryDate:x.date,
       mode:'package',side:x.side,structure:(x.side === 'long'?'Long ':'Short ') + x.option,
       multiplier:x.multiplier,contractsPerPackage:1,strike:x.strike,expiry:x.expiry,ibkrConid:x.conid
      };
      current = {trade,entries:[],existing:false};
      cycles.push(current);
     }
     if(!x.opening && x.quantity > remaining){
      if(remaining) throw new Error('Closing quantity exceeds recorded openings. Related executions need review.');
      addResult(x.row,'review','No matching opening quantity. Import the earlier statement first.');
      continue;
     }
     const kind = x.opening ? (remaining ? 'increase' : 'open') :
      (x.row['Notes/Codes'].split(';').includes('Ep') ? 'expire' : 'close');
     const action = {
      id:x.id,tradeId:current.trade.id,date:x.date,order:x.order + x.line / (rows.length + 2),
      kind,feeMode:'actual',fee:x.fee,ibkrSignature:x.signature,
      fills:[{unitId:'package',quantity:x.quantity,price:x.price}]
     };
     current.entries.push({row:x.row,action});
     remaining += x.opening ? x.quantity : -x.quantity;
     if(!remaining) current = null;
    }
    for(const cycle of cycles){
     if(!cycle.entries.length) continue;
     const {trade,entries,existing} = cycle;
     const state = engine.summarize(trade,[],[...actionsFor(trade.id),...entries.map(x => x.action)]);
     if(overlaps(trade.symbol,trade.entryDate,state.closedDate || '9999-12-31')){
      cycle.problem = 'Possible overlap with a manual or historical journal trade.';
     }
    }
   }catch(error){
    const reported = new Set(results.map(result => result.line));
    for(const x of group) if(!reported.has(x.row.line)) addResult(x.row,'review',error.message);
    continue;
   }
   for(const {trade,entries,existing,problem} of cycles){
    if(!entries.length) continue;
    if(!problem){
     if(!existing) mutations.push({table:'trades',data:trade});
     (existing ? updatedTrades : newTrades).add(trade.id);
    }
    for(const {row,action} of entries){
     addResult(row,problem?'review':'ready',problem || (existing?'Update existing trade':'Import new trade'));
     if(!problem) mutations.push({table:'actions',data:action});
    }
   }
  }
  return {ignored,results:results.sort((a,b) => a.line-b.line),mutations,newTrades:newTrades.size,updatedTrades:updatedTrades.size};
 }

 const api = {readCSV,plan};
 if(typeof module !== 'undefined' && module.exports) module.exports = api;
 else root.IBKRImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
