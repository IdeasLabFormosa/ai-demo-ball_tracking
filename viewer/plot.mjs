import {roiPoints,detailColors} from './roi.mjs';
const NS='http://www.w3.org/2000/svg';
import {valid,brighter} from './geometry.mjs';
export {valid,brighter} from './geometry.mjs';
const node=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
export function createPlot(svg,{tooltip,onSeek}){
 let selection=null,last=null,state=null,hover=null;
 function ring(x,y,color){const scale=last.scale,g=node('g');g.append(node('circle',{cx:x,cy:y,r:12/scale,stroke:brighter(color),'stroke-width':4/scale,fill:'none'}),node('circle',{cx:x,cy:y,r:6/scale,fill:brighter(color)}));return g;}
 function resetHover(){
  if(!state)return;
  for(const [key,group]of state.groups){group.el.setAttribute('opacity','.4');for(const el of group.el.querySelectorAll('[data-series]')){el.style.stroke='';el.style.fill='';}}
  for(const el of state.details.querySelectorAll('[data-series]'))el.style.stroke='';
  hover?.remove();hover=null;tooltip.hidden=true;
 }
 function interactive(el,key,label,point=null,index=null){
  el.classList.add('plot-object');el.dataset.series=key;el.setAttribute('aria-label',label);
  el.addEventListener('pointerenter',()=>{
   resetHover();const color=last.colors[key]||detailColors[key];el.style.stroke=brighter(color);
   for(const [other,group]of state.groups)if(last.colors[other]===color){group.el.setAttribute('opacity','.75');for(const item of group.el.querySelectorAll('[data-series]')){item.style.stroke=brighter(color);if(item.tagName==='circle')item.style.fill=brighter(color);}}
   if(point){hover=ring(point[0],point[1],color);state.focus.append(hover);}
  });
  el.addEventListener('pointermove',e=>{tooltip.textContent=label;tooltip.hidden=false;tooltip.style.left=`${Math.max(8,Math.min(innerWidth-240,e.clientX+12))}px`;tooltip.style.top=`${Math.max(8,Math.min(innerHeight-50,e.clientY+12))}px`;});
  el.addEventListener('pointerleave',resetHover);
  if(point){el.dataset.frame=index;el.style.cursor='pointer';el.addEventListener('click',e=>{e.stopPropagation();selection=index;render(last);});el.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();onSeek(index);});}
  return el;
 }
 function render(options){
  const {result,frame,width,height,layers,colors,scale}=options;
  const signature=JSON.stringify([width,height,layers,colors]);
  const rebuild=!state||last?.result!==result||state.signature!==signature;
  last=options;
  if(rebuild){
   tooltip.hidden=true;hover=null;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren();
   const defs=node('defs'),clip=node('clipPath',{id:'plot-clip'});clip.append(node('rect',{width,height}));defs.append(clip);svg.append(defs);
   const root=node('g',{'clip-path':'url(#plot-clip)'}),focus=node('g',{'pointer-events':'none'}),details=node('g');svg.append(root);root.append(details,focus);state={signature,root,focus,details,groups:new Map()};
  }
  state.focus.replaceChildren();hover=null;
  const series=[['raw',result.detection.slice(0,frame+1).map(r=>r.output_xy),0,'Raw output'],['fit',(result.fit||[]).slice(0,frame+1),0,'Fitting curve'],['extra',(result.extrapolation||[]).slice(0,Math.max(0,frame-(result.fit?.length||result.detection.length)+1)),result.fit?.length||result.detection.length,'Extrapolation']];
  for(const [key,points,offset,label]of series){
   if(!layers[key])continue;
   const color=colors[key];let group=state.groups.get(key);
   if(!group){const el=node('g',{'data-trajectory':key,opacity:'.4'}),path=interactive(node('path',{stroke:color,'stroke-width':5/scale,fill:'none','stroke-linejoin':'round'}),key,label);el.append(path);state.root.insertBefore(el,state.details);group={el,path,dots:new Map()};state.groups.set(key,group);}
   let d='',connected=false;const visible=new Set();
   for(let i=0;i<points.length;i++){
    const p=points[i];if(!valid(p)){connected=false;continue;}
    d+=`${connected?'L':'M'}${p[0]} ${p[1]} `;connected=true;
    const index=i+offset,current=index===frame;visible.add(index);let dot=group.dots.get(index);
    if(!dot){dot=interactive(node('circle',{cx:p[0],cy:p[1],fill:color,stroke:color,'stroke-width':0}),key,`${label} · Frame ${index}: (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`,p,index);group.el.append(dot);group.dots.set(index,dot);}
    dot.setAttribute('r',(current?11:8)/scale);dot.setAttribute('opacity',index===selection&&key!=='extra'?'0':'1');
    if(current)state.focus.append(node('circle',{cx:p[0],cy:p[1],r:11/scale,fill:'none',stroke:color,'stroke-width':3/scale}));
    if(index===selection&&key!=='extra')state.focus.append(ring(p[0],p[1],color));
   }
   group.path.setAttribute('d',d);group.path.setAttribute('stroke-width',5/scale);
   for(const [index,dot]of group.dots)if(!visible.has(index)){dot.remove();group.dots.delete(index);}
  }
  state.details.replaceChildren();const row=result.detection[frame];
  if(layers.roi&&row?.roi?.length===4){
   const [x,y,w,h]=row.roi;
   state.details.append(interactive(node('rect',{x:x-w/2,y:y-h/2,width:w,height:h,stroke:colors.roi,'stroke-width':2/scale,opacity:'.85',fill:'none'}),'roi','Actual ROI'));
   for(const item of roiPoints(row))state.details.append(interactive(node('circle',{cx:item.xy[0],cy:item.xy[1],r:item.radius/scale,stroke:detailColors[item.key],'stroke-width':2/scale,opacity:'.85',fill:'none'}),item.key,`${item.name}: (${item.xy.map(n=>n.toFixed(1)).join(', ')})`));
  }
 }
 svg.addEventListener('click',e=>{if(e.target===svg&&selection!==null){selection=null;if(last)render(last);}});
 return {render,clear(){last=null;selection=null;state=null;tooltip.hidden=true;svg.replaceChildren();}};
}
