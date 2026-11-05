import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {constrainedView} from '../viewer/pan-zoom.mjs';
import {roiGeometry} from '../viewer/roi.mjs';
import {zipEntries,decodeHeatmap,heatmapRGBA} from '../viewer/heatmaps.mjs';

test('zoom clamps to 1–32 and panning never exposes space beyond fitted image bounds',()=>{
 let view=constrainedView({zoom:.1,x:999,y:-999},1080,1920,600,400);assert.equal(view.zoom,1);assert.equal(Math.abs(view.x),0);assert.equal(Math.abs(view.y),0);
 view=constrainedView({zoom:2,x:999,y:-999},1080,1920,600,400);assert.equal(view.x,0);assert.equal(view.y,-200);
 view=constrainedView({zoom:100,x:-99999,y:99999},1080,1920,600,400);assert.equal(view.zoom,32);assert.equal(view.x,-3300);assert.equal(view.y,6200);
});
test('ROI crop intersects actual ROI and source frame, leaving model-window padding blank',()=>{
 const g=roiGeometry({roi:[1,2,4,8],window:[10,12]},100,100);
 assert.deepEqual([g.left,g.top,g.l,g.t,g.r,g.b],[-4,-4,0,0,3,6]);
 assert.equal(roiGeometry({roi:[0,0,0,1],window:[2,2]},100,100),null);
 const padded=roiGeometry({roi:[50,50,32,64],window:[128,128]},100,100);assert.equal(padded.r-padded.l,32);assert.equal(padded.b-padded.t,64);
});
function singleEntryZip(name,payload){
 const encoded=new TextEncoder().encode(name),localSize=30+encoded.length+payload.length,centralSize=46+encoded.length,bytes=new Uint8Array(localSize+centralSize+22),v=new DataView(bytes.buffer);
 v.setUint32(0,0x04034b50,true);v.setUint32(18,payload.length,true);v.setUint32(22,payload.length,true);v.setUint16(26,encoded.length,true);bytes.set(encoded,30);bytes.set(payload,30+encoded.length);
 v.setUint32(localSize,0x02014b50,true);v.setUint32(localSize+20,payload.length,true);v.setUint16(localSize+28,encoded.length,true);bytes.set(encoded,localSize+46);
 const end=localSize+centralSize;v.setUint32(end,0x06054b50,true);v.setUint16(end+10,1,true);v.setUint32(end+12,centralSize,true);v.setUint32(end+16,localSize,true);return bytes;
}
test('saved uint8-zlib heatmaps decode in-browser and match template alpha and JET colors',async()=>{
 const values=new Uint8Array(1024);values.set([0,12,13,128,255]);
 const entries=zipEntries(singleEntryZip('10/moving.u8.zlib',deflateSync(values))),heat=await decodeHeatmap(entries.get('10/moving.u8.zlib'));
 assert.equal(heat.width,32);assert.equal(heat.height,32);assert.deepEqual(heat.values,values);
 const pixels=heatmapRGBA(values);assert.equal(pixels[3],0);assert.equal(pixels[7],0);assert.equal(pixels[11],89);assert.equal(pixels[19],89);assert.deepEqual([...pixels.slice(16,19)],[128,0,0]);
 await assert.rejects(decodeHeatmap({method:0,payload:deflateSync(new Uint8Array(10))}),/dimensions/);
});
