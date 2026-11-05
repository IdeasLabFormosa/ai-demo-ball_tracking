import {readdir,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','quiet','-count_frames','-show_streams','-show_format','-of','json',p]));
const ratio=s=>s.split('/').reduce((a,b)=>a/b);
export async function prepare(){
 const videos=[];await mkdir(path.join(root,'data/web'),{recursive:true});
 for(const name of (await readdir(path.join(root,'data/videos'))).filter(n=>/\.(mp4|mov)$/i.test(n)).sort()){
  const source=path.join(root,'data/videos',name),p=probe(source),s=p.streams.find(s=>s.codec_type==='video');
  const id=path.parse(name).name,target=`data/web/${id}.mp4`,thumb=`data/web/${id}.jpg`;
  try{if(process.argv.includes('--rebuild'))throw new Error('Rebuild');await stat(path.join(root,target));}catch{
   console.log(`Preparing ${name}`);
   execFileSync('ffmpeg',['-v','error','-noautorotate','-i',source,'-map','0:v:0','-an','-vf',`scale=w=960:h=960:force_original_aspect_ratio=decrease:force_divisible_by=2,setpts=N/(${ratio(s.avg_frame_rate)}*TB)`,'-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-r',String(ratio(s.avg_frame_rate)),'-fps_mode','cfr','-movflags','+faststart','-metadata:s:v:0','rotate=0','-y',path.join(root,target)],{stdio:'inherit'});
  }
  try{if(process.argv.includes('--rebuild'))throw new Error('Rebuild');await stat(path.join(root,thumb));}catch{execFileSync('ffmpeg',['-v','error','-noautorotate','-i',path.join(root,target),'-frames:v','1','-vf','scale=160:-2','-y',path.join(root,thumb)]);}
  videos.push({id,name,src:target,thumbnail:thumb,width:s.width,height:s.height,fps:ratio(s.avg_frame_rate),frames:Number(s.nb_read_frames)||Number(s.nb_frames)||Math.round(Number(p.format.duration)*ratio(s.avg_frame_rate)),duration:Number(p.format.duration),originalBytes:(await stat(source)).size,bytes:(await stat(path.join(root,target))).size,codec:s.codec_name});
 }
 const histories=[];
 for(const name of (await readdir(path.join(root,'data/results'))).filter(n=>!n.startsWith('.')).sort().reverse()){
  const base=`data/results/${name}`;const tags=JSON.parse(await readFile(path.join(root,base,'tag.json'),'utf8'));
  const ids=await readdir(path.join(root,base,'results'));
  histories.push({name,tags,results:Object.fromEntries(ids.filter(id=>videos.some(v=>v.id===id)).map(id=>[id,`${base}/results/${id}`]))});
 }
 const manifest={videos,histories};await writeFile(path.join(root,'data/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Prepared ${videos.length} videos, ${(videos.reduce((a,v)=>a+v.bytes,0)/1048576).toFixed(1)} MiB (original ${(videos.reduce((a,v)=>a+v.originalBytes,0)/1048576).toFixed(1)} MiB)`);
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await prepare();
