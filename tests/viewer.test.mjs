import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameSeeker,frameAtTime} from '../viewer/frame-seeker.mjs';
import {playbackCommand} from '../viewer/keyboard.mjs';
class FakeVideo extends EventTarget{
 seeking=false;time=0;callbacks=new Map();id=0;requests=[];
 get currentTime(){return this.time;}
 set currentTime(t){this.time=t;this.seeking=true;this.requests.push(t);}
 requestVideoFrameCallback(fn){this.callbacks.set(++this.id,fn);return this.id;}
 cancelVideoFrameCallback(id){this.callbacks.delete(id);}
 finishSeek(){this.seeking=false;this.dispatchEvent(new Event('seeked'));}
 present(time){const [id,fn]=this.callbacks.entries().next().value;this.callbacks.delete(id);fn(0,{mediaTime:time});}
}
test('seeking coalesces held-key requests and presents only decoded matching frames',async()=>{
 const v=new FakeVideo(),shown=[],requested=[],times=Array.from({length:8},(_,i)=>i/30);
 const seeker=createFrameSeeker(v,{getTimes:()=>times,onRequest:n=>requested.push(n),onSettled:n=>shown.push(n)});
 seeker.request(1);seeker.request(2);seeker.request(3);const idle=seeker.whenIdle();
 assert.equal(v.requests.length,1);assert.deepEqual(requested,[1,2,3]);
 v.finishSeek();v.present(0);assert.deepEqual(shown,[],'stale decoder callback must not advance overlays');
 v.present(times[1]);assert.deepEqual(shown,[1]);assert.equal(v.requests.length,2,'newest pending seek should start next');
 v.finishSeek();v.present(times[3]);await idle;assert.deepEqual(shown,[1,3]);assert.equal(v.callbacks.size,0);seeker.reset();
});
test('reset cancels pending seeks and frame lookup uses presentation timestamps',async()=>{
 const v=new FakeVideo(),shown=[];const seeker=createFrameSeeker(v,{getTimes:()=>[0,.04,.1],onRequest:()=>{},onSettled:n=>shown.push(n)});
 seeker.request(2);const idle=seeker.whenIdle();seeker.reset();await idle;assert.equal(v.callbacks.size,0);assert.deepEqual(shown,[]);
 assert.equal(frameAtTime([0,.04,.1],.099),1);assert.equal(frameAtTime([0,.04,.1],.1),2);
});
test('playback keys map landmarks, frame steps and video navigation without stealing modifier shortcuts',()=>{
 for(const [key,command]of [[' ','toggle'],[',','previous'],['.','next'],['ArrowLeft','previous'],['ArrowRight','next'],['Home','first'],['End','last'],['i','impact']])assert.equal(playbackCommand({key}),command);
 assert.equal(playbackCommand({key:'ArrowLeft',shiftKey:true}),'landmark');assert.equal(playbackCommand({key:'>',shiftKey:true}),'last');assert.equal(playbackCommand({key:'ArrowDown',shiftKey:true}),'next-video');assert.equal(playbackCommand({key:'ArrowUp',shiftKey:true}),'previous-video');
 for(const flag of ['metaKey','ctrlKey','altKey','isComposing'])assert.equal(playbackCommand({key:'ArrowRight',[flag]:true}),null);
 assert.equal(playbackCommand({key:'g'}),null);
});
