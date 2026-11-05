import {valid,brighter} from './geometry.mjs';
import {heatmapRGBA} from './heatmaps.mjs';
export const detailColors={detected:'#ffb41e'};
export function roiGeometry(row,width,height){
 if(!row?.roi||row.roi.length!==4||!row.roi.every(Number.isFinite))return null;
 const [x,y,rw,rh]=row.roi,[modelWidth,modelHeight]=row.window||[rw,rh];
 if(![modelWidth,modelHeight].every(Number.isFinite)||Math.min(rw,rh,modelWidth,modelHeight)<=0)return null;
 const l=Math.max(0,x-modelWidth/2),t=Math.max(0,y-modelHeight/2),r=Math.min(width,x+modelWidth/2),b=Math.min(height,y+modelHeight/2);
 if(r<=l||b<=t)return null;
 return {x,y,rw,rh,cw:width,ch:height,left:0,top:0,l:0,t:0,r:width,b:height,modelWidth,modelHeight,modelLeft:x-modelWidth/2,modelTop:y-modelHeight/2};
}
export function heatmapPlacement(g){return {x:g.modelLeft-g.left,y:g.modelTop-g.top,width:g.modelWidth,height:g.modelHeight};}
export function roiPoints(row){return valid(row?.detect_xy)?[{name:'Detected',key:'detected',xy:row.detect_xy,radius:4}]:[];}
export function paintROI(canvas,image,row,width,height,heatmap){
 const g=roiGeometry(row,width,height);if(!g){canvas.width=canvas.height=0;return null;}
 const {cw,ch,left,top,l,t,r,b}=g;
 canvas.width=image.width;canvas.height=image.height;
 const ctx=canvas.getContext('2d');ctx.scale(canvas.width/cw,canvas.height/ch);
 if(r>l&&b>t){
  ctx.save();ctx.beginPath();ctx.rect(l-left,t-top,r-l,b-t);ctx.clip();
  ctx.drawImage(image,l*image.width/width,t*image.height/height,(r-l)*image.width/width,(b-t)*image.height/height,l-left,t-top,r-l,b-t);
  if(heatmap){const raster=document.createElement('canvas');raster.width=heatmap.width;raster.height=heatmap.height;raster.getContext('2d').putImageData(new ImageData(heatmapRGBA(heatmap.values),heatmap.width,heatmap.height),0,0);const region=heatmapPlacement(g);ctx.drawImage(raster,region.x,region.y,region.width,region.height);}
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
 const box=document.createElementNS(NS,'rect');
 for(const [key,value]of Object.entries({x:g.x-g.rw/2-g.left,y:g.y-g.rh/2-g.top,width:g.rw,height:g.rh,stroke:'#34d399','stroke-width':2/scale,fill:'none','data-roi-bounds':''}))box.setAttribute(key,value);
 markers.append(box);
 for(const item of roiPoints(row)){
  const color=detailColors[item.key],circle=document.createElementNS(NS,'circle');
  for(const [key,value]of Object.entries({cx:item.xy[0]-g.left,cy:item.xy[1]-g.top,r:item.radius/scale,stroke:color,'stroke-width':2/scale,fill:'none','data-point':item.key,'aria-label':`${item.name}: (${item.xy.map(n=>n.toFixed(1)).join(', ')})`}))circle.setAttribute(key,value);
  circle.classList.add('plot-object');circle.addEventListener('pointerenter',()=>circle.setAttribute('stroke',brighter(color)));circle.addEventListener('pointerleave',()=>{circle.setAttribute('stroke',color);tooltip.hidden=true;});circle.addEventListener('pointermove',e=>{tooltip.textContent=circle.getAttribute('aria-label');tooltip.hidden=false;tooltip.style.left=`${Math.max(8,Math.min(innerWidth-240,e.clientX+12))}px`;tooltip.style.top=`${Math.max(8,Math.min(innerHeight-50,e.clientY+12))}px`;});markers.append(circle);
 }
}
