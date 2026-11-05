const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d'),crop=$('crop'),cc=crop.getContext('2d');
let manifest,history,selected,result=null,frame=0,loadToken=0,ready=false;
const layers={raw:true,fit:true,extra:true,roi:true};
const url=p=>p.split('/').map(encodeURIComponent).join('/');
const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
function notice(message=''){$('notice').textContent=message;$('notice').hidden=!message;}
async function json(p){const r=await fetch(url(p));if(!r.ok)throw new Error(`Could not load ${p} (${r.status})`);return r.json();}
function badgeFor(v){return history.tags[v.name]||'unlabeled';}
function videos(){
 const query=$('search').value.toLowerCase(),filter=$('filter').value;
 const available=manifest.videos;
 const filtered=available.filter(v=>v.name.toLowerCase().includes(query)&&(filter==='all'||badgeFor(v)===filter));
 $('video-count').textContent=`${filtered.length} / ${available.length}`;
 $('videos').replaceChildren(...filtered.map(v=>{
  const b=document.createElement('button');b.className='video-item';b.setAttribute('aria-current',String(selected?.id===v.id));b.title=v.name;
  const img=document.createElement('img');img.src=url(v.thumbnail);img.alt='';img.loading='lazy';img.width=62;img.height=66;
  const info=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small'),tag=document.createElement('small');
  name.textContent=v.name;meta.textContent=`${v.duration.toFixed(1)}s · ${v.frames} frames · ${(v.bytes/1048576).toFixed(1)} MB`;
  tag.className=`tag-dot ${badgeFor(v)}`;tag.textContent=`● ${badgeFor(v)}`;info.append(name,meta,tag);b.append(img,info);b.onclick=()=>select(v);return b;
 }));
 if(!filtered.length){const p=document.createElement('p');p.className='empty-list';p.textContent='No matching videos';$('videos').append(p);}
}
function histories(){
 $('histories').replaceChildren(...manifest.histories.map(h=>{
  const b=document.createElement('button');b.className='history-item';b.setAttribute('aria-current',String(h===history));
  const name=document.createElement('span'),detail=document.createElement('small');name.textContent=h.name;detail.textContent=`${Object.keys(h.results).length} saved results`;b.append(name,detail);b.onclick=()=>setHistory(h);return b;
 }));
 $('history-name').textContent=history.name;
}
async function setHistory(h){history=h;histories();const target=manifest.videos.find(v=>v.id===selected?.id)||manifest.videos.find(v=>h.results[v.id])||manifest.videos[0];if(target)await select(target);else{ready=false;result=null;selected=null;video.pause();video.removeAttribute('src');video.load();setControls(false);$('loading').hidden=true;$('video-name').textContent='No videos';$('video-meta').textContent='Add clips to data/videos to get started.';$('roi-empty').hidden=false;notice('No videos in data/videos.');videos();}}
function setControls(enabled){for(const id of ['first','prev','play','next','last','frame','jump','speed'])$(id).disabled=!enabled;$('impact').disabled=!enabled||!Number.isInteger(result?.impact_id);}
async function select(v){
 const token=++loadToken;video.pause();ready=false;result=null;frame=0;setControls(false);notice();$('loading').hidden=false;$('loading').textContent='Loading video…';selected=v;videos();$('video-name').textContent=v.name;$('tag').textContent=badgeFor(v);$('tag').className=`badge ${badgeFor(v)}`;
 $('video-meta').textContent=`${v.width} × ${v.height} · ${v.fps.toFixed(2)} fps · ${(v.bytes/1048576).toFixed(2)} MB`;
 const sameSource=video.getAttribute('src')===url(v.src);
 try{
  const hasResult=Boolean(history.results[v.id]);
  const dataPromise=hasResult?json(`${history.results[v.id]}/output.json`):Promise.resolve({detection:[],fit:[],extrapolation:[],impact_id:null});
  const mediaPromise=new Promise((resolve,reject)=>{
   if(sameSource&&video.readyState>=2){resolve();return;}
   const loaded=()=>{cleanup();resolve();},error=()=>{cleanup();reject(new Error('Video could not be decoded. Try a browser with H.264 playback support.'));};
   const cleanup=()=>{video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',error);};
   video.addEventListener('loadeddata',loaded);video.addEventListener('error',error);video.src=url(v.src);video.load();
  });
  const [data]=await Promise.all([dataPromise,mediaPromise]);if(token!==loadToken)return;
  result=data;ready=true;setControls(true);$('frame').max=$('jump').max=v.frames-1;$('impact').textContent=Number.isInteger(data.impact_id)?`Impact · ${data.impact_id}`:'No impact';
  $('loading').hidden=true;if(!hasResult)notice('No saved trajectory for this video in this history.');seek(Math.max(0,Math.round((data.impact_id??0)-v.fps)));
 }catch(e){if(token!==loadToken)return;$('loading').hidden=true;notice(e.message);}
}
function seek(n){if(!ready)return;video.pause();frame=Math.max(0,Math.min(selected.frames-1,Math.round(Number(n)||0)));video.currentTime=Math.min(video.duration-.00001,(frame+.1)/selected.fps);draw();}
function draw(){
 if(!ready)return;
 const v=selected,dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const scale=Math.min(w/v.width,h/v.height),ox=(w-v.width*scale)/2,oy=(h-v.height*scale)/2;
 ctx.save();ctx.beginPath();ctx.rect(ox,oy,v.width*scale,v.height*scale);ctx.clip();ctx.translate(ox,oy);ctx.scale(scale,scale);
 function line(points,color,dots=false){ctx.strokeStyle=ctx.fillStyle=color;ctx.lineWidth=1.8/scale;ctx.beginPath();let active=false;for(const p of points){if(!valid(p)){active=false;continue;}if(active)ctx.lineTo(...p.slice(0,2));else ctx.moveTo(...p.slice(0,2));active=true;}ctx.stroke();if(dots)for(const p of points)if(valid(p)){ctx.beginPath();ctx.arc(p[0],p[1],2.2/scale,0,Math.PI*2);ctx.fill();}}
 if(layers.extra)line((result.extrapolation||[]).slice(0,Math.max(0,frame-(result.fit?.length||result.detection.length)+1)),'#ffe16b');
 if(layers.fit)line((result.fit||[]).slice(0,frame+1),'#b58aff');
 if(layers.raw)line(result.detection.slice(0,frame+1).map(r=>r.output_xy),'#f16c68',true);
 const row=result.detection[frame],roi=row?.roi;
 if(roi?.length===4&&roi.every(Number.isFinite)){
  const [x,y,rw,rh]=roi;
  if(layers.roi){ctx.strokeStyle='#71cbb2';ctx.lineWidth=1.3/scale;ctx.strokeRect(x-rw/2,y-rh/2,rw,rh);}
  const [ww,wh]=row.window||[rw,rh],cw=Math.max(1,ww),ch=Math.max(1,wh);
  cc.fillStyle='#070d16';cc.fillRect(0,0,256,256);
  const sx=video.videoWidth/v.width,sy=video.videoHeight/v.height;
  // Preserve the full model window, with black padding at image boundaries.
  const factor=256/Math.max(cw,ch),dx=(256-cw*factor)/2,dy=(256-ch*factor)/2;
  const left=x-cw/2,top=y-ch/2,l=Math.max(0,left),t=Math.max(0,top),right=Math.min(v.width,x+cw/2),bottom=Math.min(v.height,y+ch/2);
  if(right>l&&bottom>t)cc.drawImage(video,l*sx,t*sy,(right-l)*sx,(bottom-t)*sy,dx+(l-left)*factor,dy+(t-top)*factor,(right-l)*factor,(bottom-t)*factor);
  cc.strokeStyle='#71cbb2';cc.lineWidth=1;cc.strokeRect(dx+(cw-rw)/2*factor,dy+(ch-rh)/2*factor,rw*factor,rh*factor);
  const xy=row.detect_xy;if(valid(xy)){cc.strokeStyle='#f16c68';const px=dx+(xy[0]-left)*factor,py=dy+(xy[1]-top)*factor;cc.beginPath();cc.arc(px,py,4,0,Math.PI*2);cc.stroke();}
  $('roi-empty').hidden=true;$('roi-size').textContent=`${Math.round(rw)} × ${Math.round(rh)}`;$('coordinates').textContent=valid(xy)?`${xy[0].toFixed(1)}, ${xy[1].toFixed(1)}`:'— , —';
 }else{cc.clearRect(0,0,256,256);$('roi-empty').hidden=false;$('roi-size').textContent='—';$('coordinates').textContent='— , —';}
 ctx.restore();$('frame').value=$('jump').value=frame;$('frame-label').textContent=`${frame} / ${v.frames-1}`;$('play').textContent=video.paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',video.paused?'Play':'Pause');
}
function toggle(){if(!ready)return;if(video.paused){if(frame>=selected.frames-1)video.currentTime=0;video.play().catch(e=>notice(e.message));}else video.pause();draw();}
function tick(time,metadata){if(ready&&!video.paused){frame=Math.min(selected.frames-1,Math.max(0,Math.round((metadata?.mediaTime??video.currentTime)*selected.fps)));draw();}if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(tick);else requestAnimationFrame(tick);}
if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(tick);else requestAnimationFrame(tick);
video.addEventListener('seeked',draw);video.addEventListener('pause',draw);video.addEventListener('play',draw);video.addEventListener('ended',()=>{frame=selected.frames-1;draw();});
$('first').onclick=()=>seek(0);$('prev').onclick=()=>seek(frame-1);$('next').onclick=()=>seek(frame+1);$('last').onclick=()=>seek(selected.frames-1);$('play').onclick=toggle;$('impact').onclick=()=>seek(result.impact_id);
$('frame').oninput=e=>seek(e.target.value);$('jump').onchange=e=>seek(e.target.value);$('speed').onchange=e=>video.playbackRate=Number(e.target.value);
$('search').oninput=videos;$('filter').onchange=videos;
document.querySelectorAll('[data-layer]').forEach(el=>el.onchange=()=>{layers[el.dataset.layer]=el.checked;draw();});
$('help').onclick=()=>$('shortcuts').showModal();
new ResizeObserver(draw).observe($('stage'));
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,select,textarea')||$('shortcuts').open)return;
 if(e.key==='?'){$('shortcuts').showModal();return;}
 if(!ready)return;
 if(e.shiftKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const list=manifest.videos,i=list.findIndex(v=>v.id===selected.id),v=list[i+(e.key==='ArrowDown'?1:-1)];if(v)select(v);return;}
 const action={' ':toggle,ArrowLeft:()=>seek(frame-1),ArrowRight:()=>seek(frame+1),Home:()=>seek(0),End:()=>seek(selected.frames-1),i:()=>Number.isInteger(result.impact_id)&&seek(result.impact_id)}[e.key];if(action){e.preventDefault();action();}
});
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
try{manifest=await json('data/manifest.json');if(!manifest.histories.length)manifest.histories=[{name:'Videos only',tags:{},results:{}}];await setHistory(manifest.histories[0]);}catch(e){notice(e.message);$('video-name').textContent='Library unavailable';$('loading').hidden=true;}

// This development-only connection is never opened on GitHub Pages.
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 const updates=new EventSource('./__dev/events');
 updates.onmessage=()=>location.reload();
 window.addEventListener('pagehide',()=>updates.close());
}
