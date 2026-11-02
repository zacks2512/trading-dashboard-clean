(function(root){
  'use strict';
  const EPS=1e-8;
  const TYPES=['open','increase','close','expire','exercise','assignment'];
  function fail(message){throw new Error(message);}
  function number(v,label,min=0){const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<min)fail(label+' is invalid.');return n;}
  function qty(v){const n=number(v,'Quantity',1);if(!Number.isInteger(n))fail('Contract quantity must be a whole number.');return n;}
  function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail('Enter a valid date.');return v;}
  function money(n){return Math.round((n+Number.EPSILON)*1e8)/1e8;}
  function optional(v,label){return v===''||v==null?null:number(v,label,0);}
  function cleanTrade(t){
    if(!String(t.title||'').trim()||!String(t.symbol||'').trim()||!t.accountId)fail('Account, title and symbol are required.');
    if(!['package','legs'].includes(t.mode))fail('Select a price mode.');
    if(!['long','short'].includes(t.side))fail('Select debit/long or credit/short.');
    date(t.entryDate);number(t.multiplier,'Contract multiplier',1);qty(t.contractsPerPackage||1);
    if(t.mode==='package'&&!t.legacySummary){
      if(['Long Call','Long Put','Short Call','Short Put'].includes(t.structure)){number(t.strike,'Strike',0);date(t.expiry);}
      if(t.structure==='Credit Vertical')number(t.width,'Strike width',0.000001);
      if(['Long Call','Long Put','Debit Vertical'].includes(t.structure)&&t.side!=='long')fail('This structure requires a debit/long package.');
      if(['Short Call','Short Put','Credit Vertical'].includes(t.structure)&&t.side!=='short')fail('This structure requires a credit/short package.');
    }
    const confidence=optional(t.confidence,'Confidence');if(confidence!==null&&(!Number.isInteger(confidence)||confidence>5))fail('Confidence must be 0–5.');
    for(const k of ['capitalBasis','riskBasis','targetProfit','lossLimit'])if(t[k]!==''&&t[k]!=null)number(t[k],k,0);
    return t;
  }
  function cleanLeg(leg){
    if(!['Call','Put'].includes(leg.kind)||!['long','short'].includes(leg.side))fail('Each leg needs Call/Put and long/short.');
    number(leg.strike,'Strike',0);date(leg.expiry);qty(leg.ratio);number(leg.multiplier||100,'Leg multiplier',1);return leg;
  }
  function actionUnits(trade,legs){
    if(trade.mode==='package')return[{id:'package',side:trade.side,multiplier:Number(trade.multiplier),ratio:1,label:'Whole strategy',feeContracts:legs.length?legs.reduce((s,l)=>s+qty(l.ratio),0):(Number(trade.contractsPerPackage)||1)}];
    if(!legs.length)fail('Detailed price mode requires at least one leg.');
    return legs.map(l=>({...cleanLeg(l),multiplier:Number(l.multiplier||100),feeContracts:1,label:l.side+' '+l.kind+' '+l.strike+' / '+l.expiry}));
  }
  function feeOf(action,trade,legs,rate){
    if(action.feeMode==='actual')return number(action.fee,'Actual fee');
    if(action.feeRecorded!=null)return number(action.feeRecorded,'Recorded estimated fee');
    const units=actionUnits(trade,legs);
    return money(action.fills.reduce((s,f)=>{const u=units.find(u=>u.id===f.unitId);if(!u)fail('Unknown leg in action.');return s+qty(f.quantity)*u.feeContracts;},0)*number(action.feeRate??rate??0,'Fee per contract'));
  }
  function summarize(trade,legs,actions,quotes=[],settings={}){
    cleanTrade(trade);
    if(trade.legacySummary){const s=trade.legacySummary;return{status:'closed',positions:[],realized:Number(s.pnl)||0,gross:Number(s.pnl)||0,fees:0,unrealized:null,combined:Number(s.pnl)||0,closedDate:s.exitDate,firstDate:trade.entryDate,timeline:[{date:s.exitDate||trade.entryDate,net:Number(s.pnl)||0,tradeId:trade.id}],initialRisk:null,riskReview:false,premiumReturn:Number.isFinite(s.pct)?s.pct:null,capitalReturn:trade.capitalBasis>0?(Number(s.pnl)||0)/trade.capitalBasis*100:null,riskReturn:null,actionCount:0,markComplete:false,feeLegacy:true};}
    const units=actionUnits(trade,legs),unitMap=new Map(units.map(u=>[u.id,u]));
    const book=new Map(units.map(u=>[u.id,{...u,quantity:0,average:0,entryFees:0}]));
    const ordered=actions.filter(a=>!a.deleted).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.order||0)-(b.order||0)||String(a.id).localeCompare(String(b.id)));
    let realized=0,gross=0,fees=0,cash=0,openingDebit=0,openingCredit=0,firstOpening=null,firstFee=0,riskReview=false;
    const timeline=[];
    for(let i=0;i<ordered.length;i++){
      const a=ordered[i];date(a.date);if(a.date<trade.entryDate)fail('Action date cannot precede the trade entry date.');
      if(!TYPES.includes(a.kind)||!Array.isArray(a.fills)||!a.fills.length)fail('Action needs at least one fill.');
      const opening=a.kind==='open'||a.kind==='increase';
      if(i===0&&!opening)fail('The first action must open a position.');
      const fee=feeOf(a,trade,legs,settings.feeRate),weight=a.fills.reduce((s,f)=>s+qty(f.quantity)*(unitMap.get(f.unitId)?.feeContracts||1),0);
      fees+=fee;let realizedThis=0;const seen=new Set();
      for(const f of a.fills){
        if(seen.has(f.unitId))fail('Use one fill per leg in each action.');seen.add(f.unitId);
        const p=book.get(f.unitId);if(!p)fail('An action refers to a missing leg.');
        const q=qty(f.quantity),price=number(f.price,'Price'),allocatedFee=fee*q*p.feeContracts/weight,sign=p.side==='long'?1:-1;
        if(a.kind==='expire'&&price!==0)fail('A worthless expiry must have a zero settlement price.');
        if(opening){
          if(i>0)riskReview=true;
          const cost=price*q*p.multiplier;
          p.average=(p.average*p.quantity+price*q)/(p.quantity+q);p.quantity+=q;p.entryFees+=allocatedFee;
          cash-=sign*cost;
          if(sign===1)openingDebit+=cost;else openingCredit+=cost;
        }else{
          if(q>p.quantity+EPS)fail('Cannot close more contracts than remain open.');
          const entryFee=p.quantity>0?p.entryFees*q/p.quantity:0;
          const result=(price-p.average)*q*p.multiplier*sign;
          gross+=result;realizedThis+=result-entryFee-allocatedFee;
          cash+=sign*price*q*p.multiplier;
          p.entryFees-=entryFee;p.quantity-=q;
          if(p.quantity<EPS){p.quantity=0;p.average=0;p.entryFees=0;}
        }
      }
      if(!firstOpening&&opening){firstOpening=a;firstFee=fee;}
      if(!opening){realized+=realizedThis;timeline.push({date:a.date,net:money(realizedThis),tradeId:trade.id,actionId:a.id});}
      if(trade.mode==='legs'){
        const remaining=[...book.values()];
        if(remaining.some(p=>p.quantity>EPS)&&new Set(remaining.map(p=>money(p.quantity/Number(p.ratio)))).size>1)riskReview=true;
      }
    }
    const positions=[...book.values()].filter(p=>p.quantity>EPS);
    const status=ordered.length?(positions.length?'open':'closed'):'draft';
    if(status==='closed'&&Math.abs(realized-(cash-fees))>0.00001)fail('Accounting mismatch. Check action history.');
    let unrealized=0,markComplete=positions.length>0;
    for(const p of positions){
      const quote=quotes.filter(q=>q.unitId===p.id&&!q.deleted).sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
      if(!quote||!Number.isFinite(Number(quote.price))||Number(quote.price)<0){p.mark=null;p.unrealized=null;markComplete=false;continue;}
      p.mark=Number(quote.price);p.markAt=quote.at;
      p.unrealized=money((p.mark-p.average)*p.quantity*p.multiplier*(p.side==='long'?1:-1)-p.entryFees);unrealized+=p.unrealized;
    }
    const autoRisk=initialRisk(trade,legs,firstOpening,firstFee);
    const manualRisk=optional(trade.riskBasis,'Risk basis');
    const riskBasis=manualRisk>0?manualRisk:(!riskReview?autoRisk:null);
    // Premium return describes net cash paid/received in opening fills. It is not return on collateral.
    const netOpening=openingDebit-openingCredit;
    const premiumBase=Math.abs(netOpening);
    const total=status==='closed'?realized:markComplete?realized+unrealized:null;
    return{status,positions,realized:money(realized),gross:money(gross),fees:money(fees),unrealized:markComplete?money(unrealized):null,combined:total===null?null:money(total),timeline,actionCount:ordered.length,firstDate:ordered[0]?.date||trade.entryDate,closedDate:status==='closed'?ordered[ordered.length-1].date:null,initialRisk:autoRisk,riskBasis,riskReview,markComplete,premiumBase,premiumReturn:total===null||premiumBase<EPS?null:total/premiumBase*100,capitalReturn:total===null||!(trade.capitalBasis>0)?null:total/Number(trade.capitalBasis)*100,riskReturn:total===null||!(riskBasis>0)?null:total/riskBasis*100};
  }
  function initialRisk(trade,legs,action,fee=0){
    if(!action)return null;
    const fills=action.fills;
    if(trade.mode==='package'){
      const f=fills[0];if(!f||fills.length!==1)return null;
      const premium=Number(f.price)*Number(f.quantity)*Number(trade.multiplier);
      if(['Long Call','Long Put','Debit Vertical'].includes(trade.structure)&&trade.side==='long')return money(premium+fee);
      if(trade.structure==='Short Put'&&trade.side==='short'&&Number(trade.strike)>0)return Math.max(0,money(Number(trade.strike)*Number(f.quantity)*Number(trade.multiplier)-premium+fee));
      if(trade.structure==='Credit Vertical'&&trade.side==='short'&&Number(trade.width)>0)return Math.max(0,money(Number(trade.width)*Number(f.quantity)*Number(trade.multiplier)-premium+fee));
      return null;
    }
    const active=legs.filter(l=>fills.some(f=>f.unitId===l.id));
    if(active.length!==legs.length||!active.length||new Set(active.map(l=>l.expiry)).size!==1)return null;
    let cash=0,upSlope=0;
    for(const l of active){const f=fills.find(f=>f.unitId===l.id),sign=l.side==='long'?1:-1,m=Number(l.multiplier||100);cash-=sign*Number(f.price)*Number(f.quantity)*m;if(l.kind==='Call')upSlope+=sign*Number(f.quantity)*m;}
    if(upSlope<-EPS)return null;
    const points=[0,...active.map(l=>Number(l.strike))];
    const worst=Math.min(...points.map(spot=>cash+active.reduce((s,l)=>{const f=fills.find(f=>f.unitId===l.id),intrinsic=l.kind==='Call'?Math.max(0,spot-Number(l.strike)):Math.max(0,Number(l.strike)-spot);return s+intrinsic*Number(f.quantity)*Number(l.multiplier||100)*(l.side==='long'?1:-1);},0)));
    return money(Math.max(0,-worst+fee));
  }
  function chain(id,trades,summaries){
    const byId=new Map(trades.map(t=>[t.id,t]));let first=byId.get(id);const visited=new Set();
    while(first?.rollFromId&&byId.has(first.rollFromId)&&!visited.has(first.id)){visited.add(first.id);first=byId.get(first.rollFromId);}
    if(!first)return[];
    const found=[];const add=t=>{if(found.some(x=>x.trade.id===t.id))return;found.push({trade:t,summary:summaries.get(t.id)});for(const child of trades.filter(x=>x.rollFromId===t.id))add(child);};add(first);return found;
  }
  const api={number,qty,date,money,cleanTrade,cleanLeg,actionUnits,feeOf,summarize,initialRisk,chain,TYPES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JournalEngine=api;
})(typeof window!=='undefined'?window:globalThis);
