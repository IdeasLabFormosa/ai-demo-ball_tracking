export function zipEntries(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=new TextDecoder();let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}
 if(end<0)throw new Error('Invalid heatmap ZIP');
 const entries=new Map(),count=view.getUint16(end+10,true);let p=view.getUint32(end+16,true);
 for(let i=0;i<count;i++){
  if(view.getUint32(p,true)!==0x02014b50)throw new Error('Invalid heatmap directory');
  const method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),offset=view.getUint32(p+42,true),name=text.decode(bytes.subarray(p+46,p+46+nameLength));
  if(view.getUint32(offset,true)!==0x04034b50)throw new Error('Invalid heatmap entry');
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+size>bytes.length)throw new Error('Truncated heatmap');
  entries.set(name,{method,payload:bytes.subarray(start,start+size)});p+=46+nameLength+extra+comment;
 }
 return entries;
}
async function inflate(payload,format){return new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());}
export async function decodeHeatmap(entry){
 if(!entry)return null;let payload=entry.payload;if(entry.method===8)payload=await inflate(payload,'deflate-raw');else if(entry.method!==0)throw new Error('Unsupported ZIP encoding');
 const values=await inflate(payload,'deflate'),size=Math.sqrt(values.length);if(!Number.isInteger(size)||size<1||values.length>16777216)throw new Error('Invalid heatmap dimensions');
 return {values,width:size,height:size};
}
export function heatmapRGBA(values){
 const pixels=new Uint8ClampedArray(values.length*4),channel=v=>Math.round(255*Math.max(0,Math.min(1,v)));
 for(let i=0;i<values.length;i++){const t=values[i]/255;pixels[i*4]=channel(1.5-Math.abs(4*t-3));pixels[i*4+1]=channel(1.5-Math.abs(4*t-2));pixels[i*4+2]=channel(1.5-Math.abs(4*t-1));pixels[i*4+3]=t>=.05?89:0;}
 return pixels;
}
export function createHeatmaps(){
 let archive=null,cache=new Map();
 return {
  load(url,signal){cache.clear();archive=fetch(url,{signal}).then(r=>{if(!r.ok)throw new Error('Heatmap archive unavailable');return r.arrayBuffer();}).then(b=>zipEntries(new Uint8Array(b)));archive.catch(()=>{});},
  async frame(index){if(!archive)return null;const source=archive;const entries=await source;if(source!==archive)return null;const name=`${index}/moving.u8.zlib`;if(!entries.has(name))return null;
   if(!cache.has(name)){const promise=decodeHeatmap(entries.get(name)).catch(error=>{cache.delete(name);throw error;});cache.set(name,promise);while(cache.size>96)cache.delete(cache.keys().next().value);}
   return cache.get(name);
  },
  clear(){archive=null;cache.clear();}
 };
}
