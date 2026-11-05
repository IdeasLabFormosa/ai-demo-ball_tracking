import {cp,mkdir,rm,readFile,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function build({root=projectRoot}={}){
 const at=p=>path.join(root,p),manifest=JSON.parse(await readFile(at('data/manifest.json'),'utf8'));
 const assets=new Set(manifest.videos.flatMap(v=>[v.src,v.thumbnail]));
 for(const h of manifest.histories)for(const location of Object.values(h.results)){
  assets.add(`${location}/output.json`);
  try{await stat(at(`${location}/heatmaps.zip`));assets.add(`${location}/heatmaps.zip`);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 for(const asset of assets){if(!asset.startsWith('data/')||path.relative(at('data'),at(asset)).startsWith('..'))throw new Error(`Unsafe catalog asset: ${asset}`);await stat(at(asset));}
 const staging=at('dist-staging');await rm(staging,{recursive:true,force:true});await mkdir(path.join(staging,'data'),{recursive:true});
 try{
  for(const file of ['index.html','styles.css','app.js'])await cp(at(file),path.join(staging,file));
  await cp(at('data/manifest.json'),path.join(staging,'data/manifest.json'));
  for(const asset of assets){await mkdir(path.dirname(path.join(staging,asset)),{recursive:true});await cp(at(asset),path.join(staging,asset));}
  for(const h of manifest.histories){const target=path.join(staging,'data/results',h.name);await mkdir(target,{recursive:true});await writeFile(path.join(target,'tag.json'),JSON.stringify(h.tags,null,2)+'\n');}
  await rm(at('dist'),{recursive:true,force:true});const {rename}=await import('node:fs/promises');await rename(staging,at('dist'));
 }finally{await rm(staging,{recursive:true,force:true});}
 console.log('Static site ready in dist/');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await build();
