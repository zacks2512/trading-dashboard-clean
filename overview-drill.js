(function(root){
 'use strict';
 function install(chart,{title,open,axis=null}){
  const canvas=chart.canvas;
  let selected=0;
  const previous={tabindex:canvas.getAttribute('tabindex'),role:canvas.getAttribute('role'),label:canvas.getAttribute('aria-label')};
  const count=chart.data.labels.length;
  const label=()=>canvas.setAttribute('aria-label',title+'. '+(chart.data.labels[selected]||'')+'. Use arrow keys to select; Enter to open trade details.');
  canvas.tabIndex=0;canvas.setAttribute('role','button');label();
  // Handle the native canvas event so category tick labels and zero-value bars
  // are usable too. Chart.js's onClick only covers the chart plotting area.
  if(chart.options.plugins?.legend)chart.options.plugins.legend.onClick=()=>{};
  function indexAt(event){
   const point=chart.getElementsAtEventForMode(event,'nearest',{intersect:true},true)[0];
   if(point)return point.index;
   const pos=root.Chart.helpers.getRelativePosition(event,chart),area=chart.chartArea;
   if(chart.legend?.legendHitBoxes){
    const i=chart.legend.legendHitBoxes.findIndex(b=>pos.x>=b.left&&pos.x<=b.left+b.width&&pos.y>=b.top&&pos.y<=b.top+b.height);
    if(i>=0)return chart.legend.legendItems[i].index;
   }
   if(!axis||!area)return null;
   const scale=chart.scales[axis];
   if(!scale)return null;
   const inside=axis==='y' ? pos.y>=area.top&&pos.y<=area.bottom&&pos.x>=scale.left&&pos.x<=area.right :
    pos.x>=area.left&&pos.x<=area.right&&pos.y>=area.top&&pos.y<=Math.max(area.bottom,scale.bottom);
   if(!inside)return null;
   const i=Math.round(scale.getValueForPixel(axis==='y'?pos.y:pos.x));
   return i>=0&&i<count?i:null;
  }
  function activate(index){if(Number.isInteger(index)&&index>=0&&index<count){selected=index;label();open(index)}}
  const click=e=>activate(indexAt(e));
  const hover=e=>{canvas.style.cursor=indexAt(e)!==null?'pointer':'default'};
  const keys=e=>{
   if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();selected=e.key==='Home'?0:e.key==='End'?count-1:
     Math.max(0,Math.min(count-1,selected+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)));label();
   }else if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(selected)}
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
