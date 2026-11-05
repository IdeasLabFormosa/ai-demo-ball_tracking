import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {constrainedView} from '../viewer/pan-zoom.mjs';
import {roiGeometry,heatmapPlacement,roiPoints} from '../viewer/roi.mjs';
import {zipEntries,decodeHeatmap,heatmapRGBA} from '../viewer/heatmaps.mjs';

test('zoom clamps to 1–32 and panning never exposes space beyond fitted image bounds',()=>{
 let view=constrainedView({zoom:.1,x:999,y:-999},1080,1920,600,400);assert.equal(view.zoom,1);assert.equal(Math.abs(view.x),0);assert.equal(Math.abs(view.y),0);
 view=constrainedView({zoom:2,x:999,y:-999},1080,1920,600,400);assert.equal(view.x,0);assert.equal(view.y,-200);
 view=constrainedView({zoom:100,x:-99999,y:99999},1080,1920,600,400);assert.equal(view.zoom,32);assert.equal(view.x,-3300);assert.equal(view.y,6200);
});
test('ROI background extends beyond the model window while the heatmap retains its saved bounds',()=>{
 const g=roiGeometry({roi:[1,2,4,8],window:[10,12]},100,100);
 assert.deepEqual([g.left,g.top,g.l,g.t,g.r,g.b],[0,0,0,0,100,100]);
 assert.equal(roiGeometry({roi:[0,0,0,1],window:[2,2]},100,100),null);
 const padded=roiGeometry({roi:[100,100,32,64],window:[128,128]},200,200);assert.equal(padded.r-padded.l,200);assert.equal(padded.b-padded.t,200);assert.equal(padded.cw,200);assert.equal(padded.ch,200);
 assert.deepEqual(heatmapPlacement(padded),{x:36,y:36,width:128,height:128});
 assert.deepEqual(roiPoints({roi:[50,50,32,64],detect_xy:[51,49],output_xy:[52,48]}),[{name:'Detected',key:'detected',xy:[51,49],radius:4}]);
 assert.deepEqual(roiPoints({detect_xy:null}),[]);
 assert.deepEqual(heatmapPlacement(g),{x:-4,y:-4,width:10,height:12});
});
function singleEntryZip(name,payload){
 const encoded=new TextEncoder().encode(name),localSize=30+encoded.length+payload.length,centralSize=46+encoded.length,bytes=new Uint8Array(localSize+centralSize+22),v=new DataView(bytes.buffer);
 v.setUint32(0,0x04034b50,true);v.setUint32(18,payload.length,true);v.setUint32(22,payload.length,true);v.setUint16(26,encoded.length,true);bytes.set(encoded,30);bytes.set(payload,30+encoded.length);
 v.setUint32(localSize,0x02014b50,true);v.setUint32(localSize+20,payload.length,true);v.setUint16(localSize+28,encoded.length,true);bytes.set(encoded,localSize+46);
 const end=localSize+centralSize;v.setUint32(end,0x06054b50,true);v.setUint16(end+10,1,true);v.setUint32(end+12,centralSize,true);v.setUint32(end+16,localSize,true);return bytes;
}
test('saved uint8-zlib heatmaps decode in-browser and retain JET colors and use a clearer 70-percent overlay',async()=>{
 const values=new Uint8Array(1024);values.set([0,12,13,128,255]);
 const entries=zipEntries(singleEntryZip('10/moving.u8.zlib',deflateSync(values))),heat=await decodeHeatmap(entries.get('10/moving.u8.zlib'));
 assert.equal(heat.width,32);assert.equal(heat.height,32);assert.deepEqual(heat.values,values);
 const pixels=heatmapRGBA(values);assert.equal(pixels[3],0);assert.equal(pixels[7],0);assert.equal(pixels[11],178);assert.equal(pixels[19],178);assert.deepEqual([...pixels.slice(16,19)],[128,0,0]);
 await assert.rejects(decodeHeatmap({method:0,payload:deflateSync(new Uint8Array(10))}),/dimensions/);
});

test('ROI view has border clearance and centers the actual ROI within the available viewport',()=>{
 const view=constrainedView({zoom:1,x:0,y:0},96,96,230,200,{padding:10});
 assert.equal(view.fit,180/96);assert.equal(96*view.fit,180);
 const edge=constrainedView({zoom:1,x:0,y:0},80,100,230,200,{padding:10,anchorX:20,anchorY:30});
 const screenX=230/2+edge.baseX+edge.x+(20-80/2)*edge.fit;
 const screenY=200/2+edge.baseY+edge.y+(30-100/2)*edge.fit;
 assert.ok(Math.abs(screenX-115)<1e-8);assert.ok(Math.abs(screenY-100)<1e-8);
 assert.ok(230/2+edge.baseX-40*edge.fit>=10-1e-8);
 assert.ok(200/2+edge.baseY+50*edge.fit<=190+1e-8);
});

test('default framing sizes the actual ROI to 90 percent of the drawable area',()=>{
 const view=constrainedView({zoom:1,x:0,y:0},200,200,230,200,{anchorX:100,anchorY:100,fitWidth:32/.9,fitHeight:64/.9});
 assert.equal(64*view.fit,180);assert.equal(32*view.fit,90);
 assert.equal(view.baseX+view.x,0);assert.equal(view.baseY+view.y,0);
});
