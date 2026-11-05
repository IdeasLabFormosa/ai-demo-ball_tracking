import http from 'node:http';
import {createReadStream,watch} from 'node:fs';
import {spawn} from 'node:child_process';
import {prepare} from './prepare.mjs';
import {build} from './build.mjs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.argv.find(arg=>arg.startsWith('--port='))?.slice(7)||8000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Use --port=<1-65535>');
await prepare();
await build();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.mp4':'video/mp4','.jpg':'image/jpeg','.zip':'application/zip'};
const clients=new Set();
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/__dev/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname),relative=path.relative(root,file);
  if(relative.startsWith('..')||relative.split(path.sep).some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  const info=await stat(file);if(!info.isFile())throw new Error('Not found');
  const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
   if(!match[1])start=Math.max(0,info.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else{const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(`Could not start port ${port}: ${error.message}`);watcher.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Trajectory: http://localhost:${port}`));

// Refresh in a child process so FFmpeg never blocks HTTP video playback.
let timer,worker,dirty=false;
function refresh(){
 if(worker){dirty=true;return;}
 worker=spawn(process.execPath,[path.join(root,'scripts/prepare.mjs'),'--build'],{cwd:root,stdio:'inherit'});
 worker.on('exit',code=>{
  worker=null;
  if(code===0){console.log('Data updated. Generated assets are ready to commit and push.');for(const client of clients)client.write('data: updated\n\n');}
  else console.error('Data refresh failed. Fix the reported input; another data edit will retry.');
  if(dirty){dirty=false;refresh();}
 });
}
const watcher=watch(path.join(root,'data'),{recursive:true},(_,filename)=>{
 const name=String(filename||'').replaceAll('\\','/');
 if(!/^(videos|results)(\/|$)/.test(name)||name.split('/').some(p=>p.startsWith('.')))return;
 clearTimeout(timer);timer=setTimeout(refresh,750);
});
watcher.on('error',error=>console.error('Data watcher:',error.message));
function close(){clearTimeout(timer);watcher.close();worker?.kill();for(const client of clients)client.end();server.close(()=>process.exit());}
process.on('SIGINT',close);process.on('SIGTERM',close);
