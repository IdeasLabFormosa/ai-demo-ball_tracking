import {valid,brighter} from './geometry.mjs';
import {heatmapRGBA} from './heatmaps.mjs';
export const detailColors={center:'#44c7ef',detected:'#ffb41e',output:'#65e3a1'};
export function roiGeometry(row,width,height){
 if(!row?.roi||row.roi.length!==4||!row.roi.every(Number.isFinite))return null;
 const [x,y,rw,rh]=row.roi,[cw,ch]=row.window||[rw,rh];if(![cw,ch].every(Number.isFinite)||Math.min(rw,rh,cw,ch)<=0)return null;
 const left=x-cw/2,top=y-ch/2,l=Math.max(0,left,x-rw/2),t=Math.max(0,top,y-rh/2),r=Math.min(width,left+cw,x+rw/2),b=Math.min(height,top+ch,y+rh/2);
 return {x,y,rw,rh,cw,ch,left,top,l,t,r,b};
}
export function roiPoints(row){return [{name:'Center',key:'center',xy:row.roi.slice(0,2),radius:6},{name:'Detected',key:'detected',xy:row.detect_xy,radius:9},{name:'Output',key:'output',xy:row.output_xy,radius:12}].filter(p=>valid(p.xy));}
export function paintROI(canvas,image,row,width,height,heatmap){
 const g=roiGeometry(row,width,height);if(!g){canvas.width=canvas.height=0;return null;}
 const {cw,ch,left,top,l,t,r,b}=g;
 canvas.width=Math.max(1,Math.round(512*cw/Math.max(cw,ch)));canvas.height=Math.max(1,Math.round(512*ch/Math.max(cw,ch)));
 const ctx=canvas.getContext('2d');ctx.scale(canvas.width/cw,canvas.height/ch);ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
 if(r>l&&b>t){
  ctx.save();ctx.beginPath();ctx.rect(l-left,t-top,r-l,b-t);ctx.clip();
  ctx.drawImage(image,l*image.width/width,t*image.height/height,(r-l)*image.width/width,(b-t)*image.height/height,l-left,t-top,r-l,b-t);
  if(heatmap){const raster=document.createElement('canvas');raster.width=heatmap.width;raster.height=heatmap.height;raster.getContext('2d').putImageData(new ImageData(heatmapRGBA(heatmap.values),heatmap.width,heatmap.height),0,0);ctx.drawImage(raster,0,0,cw,ch);}
  ctx.restore();
 }
 canvas.dataset.heatmap=String(Boolean(heatmap));return g;
}
const NS='http://www.w3.org/2000/svg';
export function drawROIPoints(svg,row,g,scale,tooltip){
 svg.setAttribute('viewBox',`0 0 ${g.cw} ${g.ch}`);svg.replaceChildren();
 const defs=document.createElementNS(NS,'defs'),clip=document.createElementNS(NS,'clipPath'),bounds=document.createElementNS(NS,'rect'),markers=document.createElementNS(NS,'g');clip.id='roi-points-clip';
 for(const [key,value]of Object.entries({x:g.l-g.left,y:g.t-g.top,width:Math.max(0,g.r-g.l),height:Math.max(0,g.b-g.t)}))bounds.setAttribute(key,value);
 clip.append(bounds);defs.append(clip);markers.setAttribute('clip-path','url(#roi-points-clip)');svg.append(defs,markers);
 for(const item of roiPoints(row)){
  const color=detailColors[item.key],circle=document.createElementNS(NS,'circle');
  for(const [key,value]of Object.entries({cx:item.xy[0]-g.left,cy:item.xy[1]-g.top,r:item.radius/scale,stroke:color,'stroke-width':2.5/scale,fill:'none','data-point':item.key,'aria-label':`${item.name}: (${item.xy.map(n=>n.toFixed(1)).join(', ')})`}))circle.setAttribute(key,value);
  circle.classList.add('plot-object');circle.addEventListener('pointerenter',()=>circle.setAttribute('stroke',brighter(color)));circle.addEventListener('pointerleave',()=>{circle.setAttribute('stroke',color);tooltip.hidden=true;});circle.addEventListener('pointermove',e=>{tooltip.textContent=circle.getAttribute('aria-label');tooltip.hidden=false;tooltip.style.left=`${Math.max(8,Math.min(innerWidth-240,e.clientX+12))}px`;tooltip.style.top=`${Math.max(8,Math.min(innerHeight-50,e.clientY+12))}px`;});markers.append(circle);
 }
}
