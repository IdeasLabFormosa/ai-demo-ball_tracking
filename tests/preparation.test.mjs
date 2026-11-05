import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepare} from '../scripts/prepare.mjs';
import {build} from '../scripts/build.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const clip=(target,color)=>execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=64x64:r=10`,'-t','0.4','-c:v','libx264','-pix_fmt','yuv420p','-y',target]);
const json=async p=>JSON.parse(await readFile(p,'utf8'));

test('startup preparation handles changed, removed, missing and new assets without manual rebuilding',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ball-tracking-prepare-')),at=p=>path.join(root,p);
 try{
  await mkdir(at('data/videos'),{recursive:true});await mkdir(at('data/results/history/results/a'),{recursive:true});
  await writeFile(at('data/results/history/results/a/output.json'),JSON.stringify({detection:[],fit:[],extrapolation:[],impact_id:null}));
  for(const file of ['index.html','app.js','styles.css','viewer'])await cp(path.join(project,file),at(file),{recursive:true});
  clip(at('data/videos/a.mp4'),'black');clip(at('data/videos/b.MOV'),'blue');
  let m=await prepare({root});assert.equal(m.videos.length,2);assert.equal(m.videos[0].frames,4);assert.equal(Object.keys(m.histories[0].results).length,1);
  const first=await stat(at('data/web/a.mp4')),cache=(await json(at('.cache/preparation.json'))).videos['a.mp4'];
  await prepare({root});assert.equal((await stat(at('data/web/a.mp4'))).mtimeMs,first.mtimeMs,'unchanged media should be reused');
  await writeFile(at('data/results/history/tag.json'),'{"a.mp4":"good"}');
  m=await prepare({root});assert.equal(m.histories[0].tags['a.mp4'],'good');assert.equal((await stat(at('data/web/a.mp4'))).mtimeMs,first.mtimeMs,'tag changes should not re-encode');
  clip(at('data/videos/a.mp4'),'red');await prepare({root});assert.notEqual((await json(at('.cache/preparation.json'))).videos['a.mp4'].sourceHash,cache.sourceHash,'replacement must change cached signature');
  await rm(at('data/web/a.jpg'));await prepare({root});await stat(at('data/web/a.jpg'));
  await writeFile(at('data/web/a.mp4'),'broken media');await prepare({root});assert.ok((await stat(at('data/web/a.mp4'))).size>12,'damaged generated media should be repaired');
  await rm(at('data/videos/b.MOV'));m=await prepare({root});assert.equal(m.videos.length,1);await assert.rejects(stat(at('data/web/b.mp4')));await assert.rejects(stat(at('data/web/b.jpg')));
  await build({root});await stat(at('dist/data/results/history/results/a/output.json'));await assert.rejects(stat(at('dist/data/videos')));
  const {rename}=await import('node:fs/promises');await rename(at('data/videos'),at('originals'));await writeFile(at('data/results/history/tag.json'),'{"a.mp4":"problematic"}');m=await prepare({root});assert.equal(m.histories[0].tags['a.mp4'],'problematic');assert.equal(m.videos.length,1);await rename(at('originals'),at('data/videos'));
  await rm(at('data/results/history/results/a/output.json'));clip(at('data/videos/c.mp4'),'green');m=await prepare({root});assert.equal(m.videos.length,2);assert.deepEqual(m.histories[0].results,{});await build({root});await assert.rejects(stat(at('dist/data/results/history/results/a/output.json')));
  await cp(at('data/videos/c.mp4'),at('data/videos/c.MOV'));await assert.rejects(prepare({root}),/Duplicate video stem/);await rm(at('data/videos/c.MOV'));
  await rm(at('data/videos/a.mp4'));await rm(at('data/videos/c.mp4'));m=await prepare({root});assert.equal(m.videos.length,0);await build({root});assert.deepEqual((await json(at('dist/data/manifest.json'))).videos,[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('newly discovered history comes first and later edits preserve its position',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ball-tracking-history-')),at=p=>path.join(root,p);
 try{
  await mkdir(at('data/videos'),{recursive:true});
  await mkdir(at('data/results/z-old'),{recursive:true});
  await mkdir(at('data/results/a-new'),{recursive:true});
  await writeFile(at('data/manifest.json'),JSON.stringify({videos:[],histories:[{name:'z-old',addedAt:1,tags:{},results:{}}]}));
  let m=await prepare({root});assert.deepEqual(m.histories.map(h=>h.name),['a-new','z-old']);
  const addedAt=m.histories[0].addedAt;
  await writeFile(at('data/results/z-old/tag.json'),'{}');
  m=await prepare({root});assert.deepEqual(m.histories.map(h=>h.name),['a-new','z-old']);assert.equal(m.histories[0].addedAt,addedAt);
 }finally{await rm(root,{recursive:true,force:true});}
});
