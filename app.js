import {createPanZoom} from './viewer/pan-zoom.mjs';
import {createHeatmaps} from './viewer/heatmaps.mjs';
import {paintROI,drawROIPoints} from './viewer/roi.mjs';
import {createFrameSeeker,frameAtTime} from './viewer/frame-seeker.mjs';
import {createPlot} from './viewer/plot.mjs';
import {playbackCommand} from './viewer/keyboard.mjs';
const $=id=>document.getElementById(id);
const video=$('video'),image=$('frame-image'),crop=$('crop'),cc=crop.getContext('2d');
const plot=createPlot($('overlay'),{tooltip:$('plot-tooltip'),onSeek:n=>seek(n)});
const colors={raw:'#f16c68',fit:'#b58aff',extra:'#ffe16b',roi:'#34d399'};
let times=[],renderedFrame=0,loadAbort=null,playing=false,playVersion=0,playCallback=null,playAnimation=null;
let manifest,history,selected,result=null,frame=0,loadToken=0,ready=false;
const layers={raw:true,fit:true,extra:true,roi:false};
const heatmaps=createHeatmaps();
let heatmapVisible=true;
let roiGeometryCurrent=null,heatmapValue=null,heatmapFrame=-1,heatRequest=0,heatmapErrorShown=false;
const mainView=createPanZoom($('stage'),{targets:()=>[image,$('overlay')],dimensions:()=>({width:selected?.width||1,height:selected?.height||1}),onChange:()=>drawMainPlot(),onDoubleClick:()=>mainView.reset()});
const roiView=createPanZoom($('roi-stage'),{targets:()=>[crop,$('roi-vectors')],dimensions:()=>({width:roiGeometryCurrent?.cw||1,height:roiGeometryCurrent?.ch||1}),onChange:()=>drawROIDetails(),onDoubleClick:()=>toggleROISize(),ignore:'button',ignorePlot:false,anchor:()=>roiGeometryCurrent?{x:roiGeometryCurrent.x-roiGeometryCurrent.left,y:roiGeometryCurrent.y-roiGeometryCurrent.top,fitWidth:roiGeometryCurrent.rw/.9,fitHeight:roiGeometryCurrent.rh/.9}:null});
const url=p=>p.split('/').map(encodeURIComponent).join('/');
const mediaURL=(v,p=v.src)=>url(p)+(v.revision?`?v=${v.revision}`:'');
function notice(message=''){$('notice').textContent=message;$('notice').hidden=!message;}
async function json(p,signal){const r=await fetch(url(p),{signal,cache:'no-store'});if(!r.ok)throw new Error(`Could not load ${p} (${r.status})`);return r.json();}
function badgeFor(v){return history.tags[v.name]||'unlabeled';}
let videoHoverPreview=null,videoFilter='all';
function hideVideoPreview(){
 if(!videoHoverPreview)return;
 const preview=videoHoverPreview;videoHoverPreview=null;preview.classList.remove('is-visible');
 setTimeout(()=>preview.remove(),180);
}
function showVideoPreview(thumbnail){
 hideVideoPreview();if(thumbnail.hidden||!thumbnail.complete||!thumbnail.naturalWidth)return;
 const rect=thumbnail.getBoundingClientRect(),size=Math.min(3,(innerWidth-16)/rect.width,(innerHeight-16)/rect.height),width=rect.width*size,height=rect.height*size;
 const preview=document.createElement('img');preview.className='video-hover-preview';preview.src=thumbnail.src;preview.alt='';preview.setAttribute('aria-hidden','true');
 Object.assign(preview.style,{width:`${width}px`,height:`${height}px`,left:`${Math.max(8,Math.min(innerWidth-width-8,rect.left-(width-rect.width)/2))}px`,top:`${Math.max(8,Math.min(innerHeight-height-8,rect.top-(height-rect.height)/2))}px`});
 document.body.append(preview);videoHoverPreview=preview;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(videoHoverPreview===preview)preview.classList.add('is-visible');}));
}
window.addEventListener('resize',hideVideoPreview);
window.addEventListener('blur',hideVideoPreview);
document.addEventListener('scroll',hideVideoPreview,true);
function videos(){
 hideVideoPreview();const filter=videoFilter;
 const available=manifest.videos;
 const filtered=available.filter(v=>filter==='all'||badgeFor(v)===filter);
 $('video-count').textContent=`${filtered.length} / ${available.length}`;
 $('videos').replaceChildren(...filtered.map(v=>{
  const b=document.createElement('button');b.className='video-item';b.setAttribute('aria-current',String(selected?.id===v.id));b.title=v.name;
  const img=document.createElement('img');img.src=mediaURL(v,v.thumbnail);img.alt='';img.loading='lazy';img.width=62;img.height=66;
  const info=document.createElement('div'),name=document.createElement('strong'),tag=document.createElement('small');
  name.textContent=v.name;tag.className=`tag-dot ${badgeFor(v)}`;tag.textContent=`● ${badgeFor(v)}`;info.append(name,tag);b.append(img,info);
  b.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showVideoPreview(img);});
  b.addEventListener('pointerleave',hideVideoPreview);b.addEventListener('pointercancel',hideVideoPreview);
  b.onclick=()=>select(v);return b;
 }));
 if(!filtered.length){const p=document.createElement('p');p.className='empty-list';p.textContent='No matching videos';$('videos').append(p);}
}
function histories(){
 $('histories').replaceChildren(...manifest.histories.map(h=>{
  const b=document.createElement('button');b.className='history-item';b.setAttribute('aria-current',String(h===history));
  const name=document.createElement('span'),detail=document.createElement('small');name.textContent=h.name;detail.textContent=`${Object.keys(h.results).length} saved results`;b.append(name,detail);b.onclick=()=>setHistory(h);return b;
 }));
}
async function setHistory(h){
 history=h;histories();const target=manifest.videos.find(v=>v.id===selected?.id)||manifest.videos.find(v=>h.results[v.id])||manifest.videos[0];
 if(target)await select(target);else{++loadToken;loadAbort?.abort();pausePlayback();seeker.reset();heatmaps.clear();heatRequest++;roiGeometryCurrent=null;crop.width=crop.height=0;$('roi-vectors').replaceChildren();ready=false;result=null;selected=null;video.removeAttribute('src');video.load();plot.clear();image.width=image.height=0;setControls(false);$('frame').value=0;$('frame-label').textContent='0 / 0';$('loading').hidden=true;$('roi-empty').hidden=false;notice('No videos in data/videos.');videos();}
}
function setControls(enabled){for(const id of ['first','prev','play','next','last','frame'])$(id).disabled=!enabled;updateImpact();}
function updateImpact(){const impact=result?.impact_id,marker=$('impact');marker.hidden=!ready||!Number.isInteger(impact)||impact<0||impact>=selected.frames;marker.disabled=marker.hidden;if(!marker.hidden){const ratio=impact/Math.max(1,selected.frames-1);marker.style.left=`calc(${ratio*100}% + ${8-16*ratio}px)`;marker.querySelector('span').style.transform=`translateX(${ratio<.08?'0%':ratio>.92?'-100%':'-50%'})`;marker.setAttribute('aria-label',`Jump to impact, frame ${impact}`);}}
function requestedFrame(n){frame=n;$('frame').value=n;$('frame-label').textContent=`${n} / ${selected.frames-1}`;}
const seeker=createFrameSeeker(video,{
 getTimes:()=>times,
 onRequest:requestedFrame,
 onSettled:n=>{if(ready)present(n);}
});
async function select(v){
 const token=++loadToken;loadAbort?.abort();loadAbort=new AbortController();const {signal}=loadAbort;
 pausePlayback();seeker.reset();ready=false;heatmaps.clear();heatmapValue=null;heatmapFrame=-1;heatRequest++;heatmapErrorShown=false;roiGeometryCurrent=null;mainView.reset();roiView.reset();plot.clear();image.width=image.height=0;cc.clearRect(0,0,256,256);frame=0;renderedFrame=0;result=null;setControls(false);notice();closeColorPicker();$('loading').hidden=false;$('loading').textContent='Loading video…';selected=v;videos();video.setAttribute('aria-label',v.name);
 const sameSource=video.getAttribute('src')===mediaURL(v);
 try{
  const hasResult=Boolean(history.results[v.id]);
  const dataPromise=hasResult?json(`${history.results[v.id]}/output.json`,signal):Promise.resolve({detection:[],fit:[],extrapolation:[],impact_id:null});
  const mediaPromise=new Promise((resolve,reject)=>{
   if(sameSource&&video.readyState>=2){resolve();return;}
   const cleanup=()=>{video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',error);signal.removeEventListener('abort',abort);};
   const loaded=()=>{cleanup();resolve();},error=()=>{cleanup();reject(new Error('Video could not be decoded.'));},abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
   video.addEventListener('loadeddata',loaded);video.addEventListener('error',error);signal.addEventListener('abort',abort,{once:true});video.src=mediaURL(v);video.load();
  });
  const [data]=await Promise.all([dataPromise,mediaPromise]);if(token!==loadToken)return;
  result=data;if(hasResult)heatmaps.load(url(`${history.results[v.id]}/heatmaps.zip`),signal);times=Array.from({length:v.frames},(_,i)=>i/v.fps);ready=true;$('frame').max=v.frames-1;setControls(true);
  if(!hasResult)notice('No saved trajectory for this video in this history.');
  seek(Math.max(0,Math.round((data.impact_id??0)-v.fps)));showControls();
 }catch(e){if(token!==loadToken||e.name==='AbortError')return;$('loading').hidden=true;notice(e.message);}
}
function seek(n){if(!ready)return;pausePlayback();seeker.request(Math.max(0,Math.min(selected.frames-1,Math.round(Number(n)||0))));showControls();}
function present(n){
 if(!ready||video.readyState<2)return;
 renderedFrame=n;if(image.width!==video.videoWidth)image.width=video.videoWidth;if(image.height!==video.videoHeight)image.height=video.videoHeight;image.getContext('2d').drawImage(video,0,0);image.dataset.frame=String(n);$('loading').hidden=true;draw();
}
function drawMainPlot(){
 if(!ready||!image.width)return;
 $('plot-tooltip').hidden=true;
 const scale=mainView.scale;if(scale<=0)return;
 plot.render({result,frame:renderedFrame,width:selected.width,height:selected.height,layers,colors,scale});
}
function drawROIDetails(){
 if(!roiGeometryCurrent||!ready)return;
 $('plot-tooltip').hidden=true;
 drawROIPoints($('roi-vectors'),result.detection[renderedFrame],roiGeometryCurrent,roiView.scale,$('plot-tooltip'));
}
function paintROICurrent(){
 if(!ready)return;
 const row=result.detection[renderedFrame];
 roiGeometryCurrent=paintROI(crop,image,row,selected.width,selected.height,heatmapVisible&&heatmapFrame===renderedFrame?heatmapValue:null);
 $('roi-empty').hidden=Boolean(roiGeometryCurrent);$('roi-vectors').hidden=!roiGeometryCurrent;
 if(roiGeometryCurrent)roiView.apply();else $('roi-vectors').replaceChildren();
 crop.dataset.frame=String(renderedFrame);$('roi-card').dataset.renderedFrame=String(renderedFrame);
}
function draw(){
 if(!ready||!image.width)return;
 mainView.apply();paintROICurrent();
 if(heatmapVisible&&heatmapFrame!==renderedFrame&&roiGeometryCurrent){
  const target=renderedFrame,token=loadToken,request=++heatRequest;
  heatmaps.frame(target).then(value=>{
   if(request!==heatRequest||token!==loadToken||target!==renderedFrame)return;
   heatmapFrame=target;heatmapValue=value;paintROICurrent();
  }).catch(()=>{if(token===loadToken&&!heatmapErrorShown){heatmapErrorShown=true;notice('The heatmap is unavailable for this video.');}});
 }
}
$('heatmap-toggle').addEventListener('click',event=>{
 event.stopPropagation();heatmapVisible=!heatmapVisible;
 $('heatmap-toggle').setAttribute('aria-pressed',String(heatmapVisible));
 $('heatmap-toggle').title=heatmapVisible?'Hide heatmap':'Show heatmap';draw();
});
$('heatmap-toggle').addEventListener('keydown',event=>event.stopPropagation());
const roiCard=$('roi-card');let roiClickTimer=null;
function selectROI(selected){layers.roi=selected;roiCard.classList.toggle('is-selected',selected);roiCard.setAttribute('aria-pressed',String(selected));if(!selected)roiCard.classList.remove('is-enlarged');drawMainPlot();}
function toggleROISize(){clearTimeout(roiClickTimer);const enlarge=!roiCard.classList.contains('is-enlarged');selectROI(true);roiCard.classList.toggle('is-enlarged',enlarge);roiView.apply();}
roiCard.addEventListener('click',e=>{if(e.target.closest('button'))return;if(e.detail>1){clearTimeout(roiClickTimer);return;}clearTimeout(roiClickTimer);roiClickTimer=setTimeout(()=>{if(!roiCard.classList.contains('is-enlarged'))selectROI(!layers.roi);},220);});
roiCard.addEventListener('dblclick',e=>{if(e.target.closest('#roi-stage'))return;e.preventDefault();e.stopPropagation();toggleROISize();});
roiCard.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();selectROI(!layers.roi);}});
roiCard.addEventListener('transitionend',e=>{if(e.propertyName==='transform')drawROIDetails();});
function playbackIcon(key){
 const paths={play:'m8 5 11 7-11 7Z',stop:'M6 6h12v12H6Z'};
 $('play').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]}"/></svg>`;
 $('play').setAttribute('aria-label',key==='play'?'Play':'Stop');$('play').title=key==='play'?'Play (Space)':'Stop (Space)';
}
function pausePlayback(){
 playing=false;playVersion++;video.pause();if(playCallback!==null)video.cancelVideoFrameCallback?.(playCallback);if(playAnimation!==null)cancelAnimationFrame(playAnimation);playCallback=playAnimation=null;playbackIcon('play');
}
async function toggle(){
 if(!ready)return;if(playing){pausePlayback();return;}
 const version=++playVersion;playing=true;playbackIcon('stop');
 try{
  if(frame>=selected.frames-1)seeker.request(0);
  await seeker.whenIdle();if(version!==playVersion)return;
  const tick=(now,metadata)=>{
   if(version!==playVersion||!playing)return;
   const n=frameAtTime(times,metadata?.mediaTime??video.currentTime);requestedFrame(n);present(n);
   if(n>=selected.frames-1||video.ended){pausePlayback();return;}schedule();
  };
  const schedule=()=>{if(video.requestVideoFrameCallback)playCallback=video.requestVideoFrameCallback(tick);else playAnimation=requestAnimationFrame(tick);};
  schedule();await video.play();if(version!==playVersion)video.pause();
 }catch(e){if(version===playVersion){pausePlayback();notice(e.message);}}
 showControls();
}
video.addEventListener('ended',pausePlayback);
$('first').onclick=()=>seek(0);$('prev').onclick=()=>seek(frame-1);$('next').onclick=()=>seek(frame+1);$('last').onclick=()=>seek(selected.frames-1);$('play').onclick=toggle;$('impact').onclick=()=>{seek(result.impact_id);$('stage').focus({preventScroll:true});};
$('frame').oninput=e=>seek(e.target.value);
const filterOptions=[...$('filter-menu').querySelectorAll('[data-filter]')];
function closeFilter(restoreFocus=false){$('filter-menu').hidden=true;$('filter').setAttribute('aria-expanded','false');if(restoreFocus)$('filter').focus();}
function openFilter(){hideVideoPreview();$('filter-menu').hidden=false;$('filter').setAttribute('aria-expanded','true');filterOptions.find(option=>option.dataset.filter===videoFilter).focus();}
$('filter').onclick=()=>{$('filter-menu').hidden?openFilter():closeFilter();};
filterOptions.forEach(option=>option.onclick=()=>{
 videoFilter=option.dataset.filter;
 filterOptions.forEach(item=>item.setAttribute('aria-checked',String(item===option)));
 const label=option.firstChild.textContent;$('filter-label').textContent=label;$('filter').setAttribute('aria-label',`Filter by tag: ${label}`);
 closeFilter(true);videos();
});
$('tag-filter').addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();closeFilter(true);return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 e.preventDefault();
 if($('filter-menu').hidden){openFilter();return;}
 const index=filterOptions.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?filterOptions.length-1:(index+(e.key==='ArrowDown'?1:-1)+filterOptions.length)%filterOptions.length;
 filterOptions[next].focus();
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#tag-filter'))closeFilter();});
$('tag-filter').addEventListener('focusout',e=>{if(!e.currentTarget.contains(e.relatedTarget))closeFilter();});
document.querySelectorAll('[data-layer]').forEach(el=>el.onclick=()=>{layers[el.dataset.layer]=!layers[el.dataset.layer];el.setAttribute('aria-pressed',String(layers[el.dataset.layer]));draw();});
let controlsTimer;
function showControls(){const stage=$('stage');stage.classList.add('controls-visible');clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>stage.classList.remove('controls-visible'),1800);}
$('stage').addEventListener('pointermove',showControls);$('stage').addEventListener('pointerdown',showControls);$('stage').addEventListener('pointerleave',()=>{clearTimeout(controlsTimer);$('stage').classList.remove('controls-visible');});
$('help').onclick=()=>{pausePlayback();closeColorPicker();shortcutKeys.clear();$('shortcuts').showModal();};
new ResizeObserver(draw).observe($('stage'));
const shortcutKeys=new Set();
document.addEventListener('keydown',e=>{
 if(e.target.closest('#tag-filter')||e.defaultPrevented||document.querySelector('dialog[open],.trajectory-color-picker')||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
 const editable=e.target.closest('textarea,[contenteditable=true],input:not([type=range]):not([type=checkbox])');if(editable)return;
 if(e.key==='?'&&!e.repeat){e.preventDefault();$('help').click();return;}
 if(!ready)return;
 const command=playbackCommand(e);if(!command)return;
 e.preventDefault();e.stopImmediatePropagation();shortcutKeys.add(e.code||e.key);getSelection()?.removeAllRanges();
 if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
 if(e.repeat&&!['next','previous'].includes(command))return;
 if(command==='next-video'||command==='previous-video'){
  const list=manifest.videos,index=list.findIndex(v=>v.id===selected.id),v=list[index+(command==='next-video'?1:-1)];if(v){select(v);document.querySelector('.video-item[aria-current=true]')?.scrollIntoView({block:'nearest'});}return;
 }
 ({toggle,first:()=>seek(0),last:()=>seek(selected.frames-1),next:()=>seek(frame+1),previous:()=>seek(frame-1),landmark:()=>seek(Number.isInteger(result.impact_id)&&result.impact_id<frame?result.impact_id:0),impact:()=>Number.isInteger(result.impact_id)&&seek(result.impact_id)})[command]?.();
},{capture:true});
document.addEventListener('keyup',e=>{if(shortcutKeys.delete(e.code||e.key)){e.preventDefault();e.stopImmediatePropagation();getSelection()?.removeAllRanges();}},{capture:true});
window.addEventListener('blur',()=>{shortcutKeys.clear();pausePlayback();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});
let colorPicker=null;
function closeColorPicker(){if(colorPicker){colorPicker.trigger.setAttribute('aria-expanded','false');colorPicker.panel.remove();colorPicker=null;}}
for(const trigger of document.querySelectorAll('[data-color]')){
 const key=trigger.dataset.color;
 trigger.onclick=e=>{
  e.preventDefault();const same=colorPicker?.trigger===trigger;closeColorPicker();if(same)return;pausePlayback();
  const panel=document.createElement('section');panel.className='trajectory-color-picker';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',trigger.getAttribute('aria-label'));
  const heading=document.createElement('strong');heading.textContent=trigger.getAttribute('aria-label');panel.append(heading);
  const swatches=document.createElement('div');swatches.className='color-presets';panel.append(swatches);
  const label=document.createElement('label');label.textContent='Hex color';const input=document.createElement('input');input.type='text';input.value=colors[key];input.maxLength=7;input.spellcheck=false;input.setAttribute('aria-label','Hex color');label.append(input);panel.append(label);
  function apply(value){if(!/^#[0-9a-f]{6}$/i.test(value)){input.setAttribute('aria-invalid','true');return;}input.removeAttribute('aria-invalid');colors[key]=value.toLowerCase();input.value=value;trigger.style.backgroundColor=value;for(const b of swatches.children)b.setAttribute('aria-pressed',String(b.dataset.color===colors[key]));draw();}
  for(const color of ['#f16c68','#b58aff','#ffe16b','#34d399','#60a5fa','#fb923c','#f472b6','#22d3ee','#ffffff','#a3e635','#e879f9','#94a3b8']){const b=document.createElement('button');b.type='button';b.dataset.color=color;b.style.backgroundColor=color;b.setAttribute('aria-label',`Use ${color}`);b.setAttribute('aria-pressed',String(colors[key]===color));b.onclick=()=>apply(color);swatches.append(b);}
  input.oninput=()=>apply(input.value.trim());const done=document.createElement('button');done.className='color-picker-done';done.textContent='Done';done.onclick=()=>{closeColorPicker();trigger.focus();};panel.append(done);
  panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeColorPicker();trigger.focus();}};
  document.body.append(panel);colorPicker={panel,trigger};trigger.setAttribute('aria-expanded','true');const r=trigger.getBoundingClientRect(),p=panel.getBoundingClientRect();panel.style.left=`${Math.max(8,Math.min(innerWidth-p.width-8,r.right-p.width))}px`;panel.style.top=`${Math.max(8,Math.min(innerHeight-p.height-8,r.bottom+8))}px`;input.focus();
 };
}
document.addEventListener('pointerdown',e=>{if(colorPicker&&!colorPicker.panel.contains(e.target)&&!colorPicker.trigger.contains(e.target))closeColorPicker();});
playbackIcon('play');

// Match the template's embedded drawer: release its workspace width on collapse.
const sidebarMedia=matchMedia('(max-width:760px)');
function setSidebar(open){
 const panel=$('history-panel'),toggle=$('sidebar-toggle');
 if(!open&&panel.contains(document.activeElement))toggle.focus();
 panel.inert=!open;
 panel.setAttribute('aria-hidden',String(!open));
 panel.classList.toggle('is-collapsed',!open);
 document.body.classList.toggle('history-collapsed',!open);
 toggle.setAttribute('aria-expanded',String(open));
 toggle.setAttribute('aria-label',open?'Hide history panel':'Show history panel');
}
$('sidebar-toggle').onclick=()=>setSidebar($('sidebar-toggle').getAttribute('aria-expanded')!=='true');
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]'))setSidebar(false);
});
sidebarMedia.addEventListener('change',event=>setSidebar(!event.matches));
setSidebar(!sidebarMedia.matches);

setControls(false);
let catalogSignature='',catalogRefresh=null,refreshAgain=false;
async function refreshCatalog(force=false){
 if(catalogRefresh){refreshAgain ||= force;return catalogRefresh;}
 catalogRefresh=(async()=>{
  try{
   const next=await json('data/manifest.json'),signature=JSON.stringify(next);
   if(!force&&signature===catalogSignature)return;
   const previousVideo=selected?.id,previousFrame=frame;
   manifest=next;
   if(!manifest.histories.length)manifest.histories=[{name:'Videos only',tags:{},results:{}}];
   const nextHistory=manifest.histories.find(h=>h.name===history?.name)||manifest.histories[0];
   await setHistory(nextHistory);
   if(ready&&selected?.id===previousVideo)seek(previousFrame);
   catalogSignature=signature;
  }catch(e){notice(`Could not refresh data: ${e.message}`);if(!ready)$('loading').hidden=true;}
 })();
 try{await catalogRefresh;}finally{catalogRefresh=null;if(refreshAgain){refreshAgain=false;void refreshCatalog(true);}}
}
await refreshCatalog();
// Published pages pick up a newly deployed catalog without requiring a reload.
const catalogTimer=setInterval(()=>{if(!document.hidden)void refreshCatalog();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCatalog();});
// Local data edits trigger a refresh even when only result/heatmap contents changed.
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 const updates=new EventSource('./__dev/events');
 updates.onmessage=()=>void refreshCatalog(true);
 window.addEventListener('pagehide',()=>updates.close());
}
window.addEventListener('pagehide',()=>clearInterval(catalogTimer));
