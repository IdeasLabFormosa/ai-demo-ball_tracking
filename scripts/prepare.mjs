import {readdir,readFile,writeFile,mkdir,stat,rename,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const ENCODER_VERSION=1;
const ratio=s=>s.split('/').reduce((a,b)=>a/b);
const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_streams','-show_format','-of','json',p],{encoding:'utf8'}));
async function hash(file){const sum=createHash('sha256');for await(const chunk of createReadStream(file))sum.update(chunk);return sum.digest('hex');}
async function exists(file){try{await stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function readJSON(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function writeChanged(file,value){const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';try{if(await readFile(file,'utf8')===text)return;}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);}
async function matches(file,expected){return Boolean(expected)&&await exists(file)&&await hash(file)===expected;}
function report(manifest){
 const original=manifest.videos.reduce((n,v)=>n+v.originalBytes,0),optimized=manifest.videos.reduce((n,v)=>n+v.bytes,0);
 return ['# Video size report','',`${manifest.videos.length} videos, ${manifest.histories.length} result histories. Sizes are MiB (1,048,576 bytes).`,'',`Original total: **${(original/1048576).toFixed(2)} MiB**. Optimized total: **${(optimized/1048576).toFixed(2)} MiB** (${original?(100*(1-optimized/original)).toFixed(1):0}% smaller).`,'','| Video | Original | Web MP4 | Decoded frames |','|---|---:|---:|---:|',...manifest.videos.map(v=>`| ${v.name} | ${(v.originalBytes/1048576).toFixed(2)} | ${(v.bytes/1048576).toFixed(2)} | ${v.frames} |`),'','Generated automatically by the local preparation command. Optimized videos use H.264, no audio, a 960 px maximum edge, and fast-start metadata. Decoded frame counts are verified after encoding. Source hashes detect replacements, even if filenames and sizes stay the same.','', 'Only the selected video loads; other videos use lazy JPEG thumbnails. Originals stay local and are ignored by Git. Browser seeking uses normalized frame timestamps; actual loading speed depends on connection and hosting cache. Resolution reduction and lossy encoding trade image detail for smaller downloads.',''].join('\n');
}

export async function prepare({root=projectRoot,rebuild=false}={}){
 const at=p=>path.join(root,p),old=await readJSON(at('data/manifest.json'),{videos:[],histories:[]});
 // A clean clone may contain only the committed, prepared assets. An existing but
 // empty source folder, however, means the user deliberately removed all videos.
 const hasSources=await exists(at('data/videos'));
 if(!hasSources){
  if(!await exists(at('data/manifest.json')))throw new Error('Add source clips to data/videos before preparing the site.');
  console.log('No data/videos directory; using committed playback videos and refreshing saved results.');
 }
 const names=(hasSources?await readdir(at('data/videos'),{withFileTypes:true}):[]).filter(e=>e.isFile()&&/\.(mp4|mov|m4v|webm|mkv)$/i.test(e.name)).map(e=>e.name).sort();
 const ids=new Set();for(const name of names){const id=path.parse(name).name;if(ids.has(id))throw new Error(`Duplicate video stem "${id}". Rename one source so result folders are unambiguous.`);ids.add(id);}
 const cache=await readJSON(at('.cache/preparation.json'),{videos:{}}),nextCache={videos:{}},videos=hasSources?[]:old.videos;
 await mkdir(at('data/web'),{recursive:true});let encoded=0,reused=hasSources?0:videos.length;
 for(const video of videos){await stat(at(video.src));await stat(at(video.thumbnail));}
 for(const name of names){
  const source=at(`data/videos/${name}`),sourceHash=await hash(source),id=path.parse(name).name;
  const target=`data/web/${id}.mp4`,thumb=`data/web/${id}.jpg`,previous=cache.videos[name];
  let record;
  if(!rebuild&&previous?.version===ENCODER_VERSION&&previous.sourceHash===sourceHash&&await matches(at(target),previous.videoHash)){
   record=previous.video;reused++;
  }else{
   console.log(`Preparing ${name}`);
   const p=probe(source),s=p.streams[0];if(!s)throw new Error(`No video stream in ${name}`);
   const fps=ratio(s.avg_frame_rate);if(!Number.isFinite(fps)||fps<=0)throw new Error(`No usable frame rate in ${name}`);
   const frames=Number(s.nb_read_frames)||Number(s.nb_frames);if(!frames)throw new Error(`No decodable frames in ${name}`);
   const temporary=at(`data/web/${id}.tmp.mp4`);
   try{
    execFileSync('ffmpeg',['-v','error','-noautorotate','-i',source,'-map','0:v:0','-an','-vf',`scale=w=960:h=960:force_original_aspect_ratio=decrease:force_divisible_by=2,setpts=N/(${fps}*TB)`,'-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-r',String(fps),'-fps_mode','cfr','-movflags','+faststart','-metadata:s:v:0','rotate=0','-y',temporary],{stdio:'inherit'});
    const output=probe(temporary);if(Number(output.streams[0].nb_read_frames)!==frames)throw new Error(`Frame count changed while encoding ${name}`);
    await rename(temporary,at(target));
    record={id,name,src:target,thumbnail:thumb,width:s.width,height:s.height,fps,frames,duration:frames/fps,originalBytes:(await stat(source)).size,bytes:(await stat(at(target))).size,codec:s.codec_name};
   }finally{await rm(temporary,{force:true});}
   encoded++;
  }
  if(record!==previous?.video||rebuild||!await matches(at(thumb),previous?.thumbnailHash)){
   const temporary=at(`data/web/${id}.tmp.jpg`);
   try{execFileSync('ffmpeg',['-v','error','-noautorotate','-i',at(target),'-frames:v','1','-vf','scale=160:-2','-y',temporary]);await rename(temporary,at(thumb));}finally{await rm(temporary,{force:true});}
  }
  videos.push(record);nextCache.videos[name]={version:ENCODER_VERSION,sourceHash,videoHash:await hash(at(target)),thumbnailHash:await hash(at(thumb)),video:record};
 }
 const histories=[],discoveredAt=Date.now();
 if(await exists(at('data/results')))for(const folder of (await readdir(at('data/results'),{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).sort((a,b)=>b.name.localeCompare(a.name))){
  const name=folder.name,base=`data/results/${name}`,tags=await readJSON(at(`${base}/tag.json`),{}),results={};
  for(const video of videos){const location=`${base}/results/${video.id}`;if(await exists(at(`${location}/output.json`))){const data=await readJSON(at(`${location}/output.json`));if(!Array.isArray(data.detection))throw new Error(`Missing detection array in ${location}/output.json`);results[video.id]=location;}}
  const previous=old.histories.find(h=>h.name===name);
  const folderInfo=await stat(at(base));
  // Persist discovery time so later tag/result edits and Git clones do not
  // reorder histories. Existing catalogs initialize from folder creation time.
  const addedAt=previous?.addedAt??(previous?(folderInfo.birthtimeMs||folderInfo.mtimeMs):discoveredAt);
  histories.push({name,addedAt,tags,results});
 }
 histories.sort((a,b)=>b.addedAt-a.addedAt||b.name.localeCompare(a.name));
 const manifest={videos,histories};
 await writeChanged(at('data/manifest.json'),manifest);
 // Delete only derivatives recorded in the old catalog; never delete source
 // footage, result archives, or unrelated files from the user's data directory.
 const keep=new Set(videos.flatMap(v=>[v.src,v.thumbnail]));
 for(const v of old.videos)for(const asset of [v.src,v.thumbnail])if(typeof asset==='string'&&asset.startsWith('data/web/')&&path.dirname(asset)==='data/web'&&!keep.has(asset))await rm(at(asset),{force:true});
 await writeChanged(at('.cache/preparation.json'),nextCache);
 await writeChanged(at('VIDEO_REPORT.md'),report(manifest));
 console.log(`Data ready: ${videos.length} videos, ${encoded} encoded, ${reused} reused, ${(videos.reduce((n,v)=>n+v.bytes,0)/1048576).toFixed(2)} MiB.`);
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 await prepare({rebuild:process.argv.includes('--rebuild')});
 if(process.argv.includes('--build')){const {build}=await import('./build.mjs');await build();}
}
