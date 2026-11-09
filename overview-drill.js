(function(root){
 'use strict';
 function install(chart,{title,open,axis=null,items=null,categoryOpen=null}){
  const canvas=chart.canvas;
  let selected=0;
  const previous={tabindex:canvas.getAttribute('tabindex'),role:canvas.getAttribute('role'),label:canvas.getAttribute('aria-label')};
  const choices=items||(chart.data.labels||[]).map((label,index)=>({index,datasetIndex:0,label}));
  const count=choices.length;
  const label=()=>canvas.setAttribute('aria-label',title+'. '+(choices[selected]?.label||'')+'. Use arrow keys to select; Enter to open trade details.');
  canvas.tabIndex=0;canvas.setAttribute('role','button');label();
  // Handle the native canvas event so category tick labels and zero-value bars
  // are usable too. Chart.js's onClick only covers the chart plotting area.
  if(chart.options.plugins?.legend)chart.options.plugins.legend.onClick=()=>{};
  chart.options.onClick=()=>{}; // Replace older chart handlers that navigated to Analytics log.
  function indexAt(event){
   const point=chart.getElementsAtEventForMode(event,'nearest',{intersect:true},true)[0];
   if(point)return {index:point.index,datasetIndex:point.datasetIndex};
   const pos=root.Chart.helpers.getRelativePosition(event,chart),area=chart.chartArea;
   if(chart.legend?.legendHitBoxes){
    const i=chart.legend.legendHitBoxes.findIndex(b=>pos.x>=b.left&&pos.x<=b.left+b.width&&pos.y>=b.top&&pos.y<=b.top+b.height);
    if(i>=0)return {index:chart.legend.legendItems[i].index,datasetIndex:0};
   }
   if(!axis||!area)return null;
   const scale=chart.scales[axis];
   if(!scale)return null;
   const inside=axis==='y' ? pos.y>=area.top&&pos.y<=area.bottom&&pos.x>=scale.left&&pos.x<=area.right :
    pos.x>=area.left&&pos.x<=area.right&&pos.y>=area.top&&pos.y<=Math.max(area.bottom,scale.bottom);
   if(!inside)return null;
   const i=Math.round(scale.getValueForPixel(axis==='y'?pos.y:pos.x));
   return i>=0&&i<(chart.data.labels||[]).length?{index:i,datasetIndex:categoryOpen?-1:0}:null;
  }
  function activate(choice){
   if(!choice)return;
   const {index,datasetIndex}=choice;
   if(datasetIndex===-1&&categoryOpen){categoryOpen(index);return;}
   const flat=choices.findIndex(c=>c.index===index&&c.datasetIndex===datasetIndex);
   if(flat>=0){selected=flat;label();open(index,datasetIndex)}
  }
  const click=e=>activate(indexAt(e));
  const hover=e=>{canvas.style.cursor=indexAt(e)!==null?'pointer':'default'};
  const keys=e=>{
   if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();selected=e.key==='Home'?0:e.key==='End'?count-1:
     Math.max(0,Math.min(count-1,selected+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)));label();
   }else if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(choices[selected])}
  };
  canvas.addEventListener('click',click);canvas.addEventListener('mousemove',hover);canvas.addEventListener('keydown',keys);
  chart.$journalDrillCleanup=()=>{
   canvas.removeEventListener('click',click);canvas.removeEventListener('mousemove',hover);canvas.removeEventListener('keydown',keys);
   canvas.style.cursor='';
   for(const [name,value]of [['tabindex',previous.tabindex],['role',previous.role],['aria-label',previous.label]]){
    if(value===null)canvas.removeAttribute(name);else canvas.setAttribute(name,value);
   }
  };
 }
 root.OverviewDrill={install};
})(typeof window!=='undefined'?window:globalThis);
