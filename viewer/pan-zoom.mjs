export function constrainedView({zoom=1,x=0,y=0},width,height,viewportWidth,viewportHeight){
 const fit=Math.min(viewportWidth/width,viewportHeight/height),z=Math.max(1,Math.min(32,zoom));
 const limitX=Math.max(0,(width*fit*z-viewportWidth)/2),limitY=Math.max(0,(height*fit*z-viewportHeight)/2);
 return {zoom:z,x:Math.max(-limitX,Math.min(limitX,x)),y:Math.max(-limitY,Math.min(limitY,y)),fit};
}
export function createPanZoom(stage,{targets,dimensions,onChange=()=>{},onDoubleClick=()=>{},ignore='.legend,.video-controls',ignorePlot=true}){
 let view={zoom:1,x:0,y:0},pointers=new Map(),pinch=null,dragged=false,suppressClick=false;
 function apply(){
  const {width,height}=dimensions();if(!(width>0&&height>0&&stage.clientWidth>0&&stage.clientHeight>0))return;
  view=constrainedView(view,width,height,stage.clientWidth,stage.clientHeight);
  for(const el of targets()){el.style.width=`${width*view.fit}px`;el.style.height=`${height*view.fit}px`;el.style.transform=`translate(-50%,-50%) translate(${view.x}px,${view.y}px) scale(${view.zoom})`;}
  stage.classList.toggle('is-zoomed',view.zoom>1);stage.dataset.zoom=String(view.zoom);stage.dataset.panX=String(view.x);stage.dataset.panY=String(view.y);
  onChange(view.fit*view.zoom*(stage.getBoundingClientRect().width/stage.clientWidth));
 }
 function reset(){view={zoom:1,x:0,y:0};apply();}
 function zoomAt(zoom,cx,cy){const r=stage.getBoundingClientRect(),outer=r.width/stage.clientWidth,x=((cx??r.left+r.width/2)-r.left-r.width/2)/outer,y=((cy??r.top+r.height/2)-r.top-r.height/2)/outer,next=Math.max(1,Math.min(32,zoom)),ratio=next/view.zoom;view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.zoom=next;apply();}
 function blocked(event){return ignore&&event.target.closest(ignore);}
 stage.addEventListener('wheel',e=>{if(blocked(e))return;e.preventDefault();stage.focus({preventScroll:true});zoomAt(view.zoom*Math.exp(-e.deltaY*.002),e.clientX,e.clientY);},{passive:false});
 stage.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||!['+','=','-','0'].includes(e.key)||blocked(e))return;e.preventDefault();e.stopPropagation();if(e.key==='0')reset();else zoomAt(view.zoom*(e.key==='-'?.8:1.25));});
 const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
 stage.addEventListener('pointerdown',e=>{
  if(e.button!==0||blocked(e)||(ignorePlot&&e.target.closest('.plot-object')))return;
  e.preventDefault();stage.focus({preventScroll:true});dragged=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});stage.setPointerCapture(e.pointerId);if(pointers.size===2)pinch=pinchState();stage.classList.add('is-dragging');
 });
 stage.addEventListener('pointermove',e=>{
  const previous=pointers.get(e.pointerId);if(!previous)return;
  if(Math.hypot(e.clientX-previous.startX,e.clientY-previous.startY)>4)dragged=true;
  pointers.set(e.pointerId,{...previous,x:e.clientX,y:e.clientY});
  if(pointers.size===2){const next=pinchState();dragged=true;if(pinch?.distance>0){zoomAt(view.zoom*next.distance/pinch.distance,pinch.x,pinch.y);const outer=stage.getBoundingClientRect().width/stage.clientWidth;view.x+=(next.x-pinch.x)/outer;view.y+=(next.y-pinch.y)/outer;}pinch=next;}
  else{const outer=stage.getBoundingClientRect().width/stage.clientWidth;view.x+=(e.clientX-previous.x)/outer;view.y+=(e.clientY-previous.y)/outer;}
  apply();
 });
 function release(e){if(pointers.has(e.pointerId)&&dragged)suppressClick=true;pointers.delete(e.pointerId);pinch=null;if(!pointers.size)stage.classList.remove('is-dragging');}
 for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,release);
 stage.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 stage.addEventListener('dblclick',e=>{if(blocked(e)||(ignorePlot&&e.target.closest('.plot-object')))return;e.preventDefault();e.stopPropagation();onDoubleClick();});
 new ResizeObserver(apply).observe(stage);
 return {apply,reset,zoomAt,get scale(){const d=dimensions();return Math.min(stage.clientWidth/d.width,stage.clientHeight/d.height)*view.zoom*(stage.getBoundingClientRect().width/stage.clientWidth);},get view(){return {...view};}};
}
