export function constrainedView({zoom=1,x=0,y=0},width,height,viewportWidth,viewportHeight,{padding=0,anchorX=width/2,anchorY=height/2,fitWidth=2*Math.max(anchorX,width-anchorX),fitHeight=2*Math.max(anchorY,height-anchorY)}={}){
 const availableWidth=Math.max(1,viewportWidth-2*padding),availableHeight=Math.max(1,viewportHeight-2*padding);
 // Fit all context around the ROI center, including asymmetric frame-edge crops.
 const fit=Math.min(availableWidth/fitWidth,availableHeight/fitHeight),z=Math.max(1,Math.min(32,zoom));
 function axis(size,available,anchor,pan){
  const ideal=(size/2-anchor)*fit*z,extent=size*fit*z;
  if(extent<=available){const spare=(available-extent)/2;return {base:Math.max(-spare,Math.min(spare,ideal)),pan:0};}
  const limit=(extent-available)/2;return {base:ideal,pan:Math.max(-limit,Math.min(limit,ideal+pan))-ideal};
 }
 const horizontal=axis(width,availableWidth,anchorX,x),vertical=axis(height,availableHeight,anchorY,y);
 return {zoom:z,x:horizontal.pan,y:vertical.pan,baseX:horizontal.base,baseY:vertical.base,fit};
}
export function createPanZoom(stage,{targets,dimensions,onChange=()=>{},onDoubleClick=()=>{},ignore='.legend,.video-controls',ignorePlot=true,padding=0,anchor=()=>null}){
 const options=()=>{const point=anchor();return {padding,...(point?{anchorX:point.x,anchorY:point.y,...(point.fitWidth?{fitWidth:point.fitWidth,fitHeight:point.fitHeight}:{})}:{})};};
 let view={zoom:1,x:0,y:0},pointers=new Map(),pinch=null,dragged=false,suppressClick=false;
 function apply(){
  const {width,height}=dimensions();if(!(width>0&&height>0&&stage.clientWidth>0&&stage.clientHeight>0))return;
  view=constrainedView(view,width,height,stage.clientWidth,stage.clientHeight,options());
  for(const el of targets()){el.style.width=`${width*view.fit}px`;el.style.height=`${height*view.fit}px`;el.style.transform=`translate(-50%,-50%) translate(${view.baseX+view.x}px,${view.baseY+view.y}px) scale(${view.zoom})`;}
  stage.classList.toggle('is-zoomed',view.zoom>1);stage.dataset.zoom=String(view.zoom);stage.dataset.panX=String(view.x);stage.dataset.panY=String(view.y);
  onChange(view.fit*view.zoom*(stage.getBoundingClientRect().width/stage.clientWidth));
 }
 function reset(){view={zoom:1,x:0,y:0};apply();}
 function zoomAt(zoom,cx,cy){
  const r=stage.getBoundingClientRect(),outer=r.width/stage.clientWidth,x=((cx??r.left+r.width/2)-r.left-r.width/2)/outer,y=((cy??r.top+r.height/2)-r.top-r.height/2)/outer,next=Math.max(1,Math.min(32,zoom)),ratio=next/view.zoom,d=dimensions();
  const nextView=constrainedView({...view,zoom:next},d.width,d.height,stage.clientWidth,stage.clientHeight,options());
  view.x=x-(x-((view.baseX||0)+view.x))*ratio-nextView.baseX;view.y=y-(y-((view.baseY||0)+view.y))*ratio-nextView.baseY;view.zoom=next;apply();
 }
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
 return {apply,reset,zoomAt,get scale(){return (view.fit||1)*view.zoom*(stage.getBoundingClientRect().width/stage.clientWidth);},get view(){return {...view};}};
}
