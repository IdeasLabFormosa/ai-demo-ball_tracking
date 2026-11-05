// Keep requested frame indices independent of asynchronous decoder events.
export function createFrameSeeker(video, { getTimes, onRequest, onSettled }) {
  let pending = null, inFlight = null, presented = false, seekFinished = false, callback, presentationFallback;
  const waiters = new Set();
  function idle() {
    if (pending !== null || inFlight !== null || video.seeking) return;
    for (const resolve of waiters) resolve();
    waiters.clear();
  }
  function settle() {
    if (inFlight === null) { pump(); return; }
    if (!seekFinished || !presented) return;
    clearTimeout(presentationFallback);
    if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
    callback = undefined;
    const completed = inFlight;
    inFlight = null;
    // Present completed intermediate frames during a held key or long scrub.
    if (completed !== null) onSettled(completed);
    if (pending !== null) pump();
    else {
      idle();
    }
  }
  function pump() {
    if (video.seeking || inFlight !== null || pending === null) return;
    const times = getTimes();
    const target = pending;
    pending = null;
    inFlight = target;
    presented = !video.requestVideoFrameCallback;
    seekFinished = false;
    const start = times[target];
    const interval = (times[target + 1] ?? (start + 1 / 30)) - start;
    const time = start + Math.min(interval / 2, 0.01);
    if (Math.abs(video.currentTime - time) < 0.000001) {
      presented = true; seekFinished = true; settle();
    } else {
      // Register before the seek so a fast decoder cannot publish the frame
      // before the callback is attached. seeked alone may expose a stale texture.
      if (video.requestVideoFrameCallback) {
        const observe = () => { callback = video.requestVideoFrameCallback((now, metadata) => {
          callback = undefined;
          // Ignore an old frame that was already queued before the seek.
          if (metadata.mediaTime < start - 0.00001 || metadata.mediaTime >= start + interval - 0.00001) {
            observe(); return;
          }
          presented = true;
          settle();
        }); };
        observe();
      }
      video.currentTime = time;
    }
  }
  video.addEventListener('seeked', () => {
    seekFinished = true;
    // Mobile compositors may withhold callbacks for a paused decoder surface.
    // Prefer the exact callback, but never leave the frame controls locked forever.
    if (inFlight !== null && !presented) {
      clearTimeout(presentationFallback);
      presentationFallback = setTimeout(() => { presented = true; settle(); }, 250);
    }
    settle();
  });
  return {
    request(index) {
      const target = Math.max(0, Math.min(getTimes().length - 1, index));
      pending = target;
      onRequest(target);
      pump();
    },
    whenIdle() {
      if (pending === null && inFlight === null && !video.seeking) return Promise.resolve();
      return new Promise(resolve => waiters.add(resolve));
    },
    reset() {
      clearTimeout(presentationFallback);
      if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
      callback = undefined; presented = false; seekFinished = false;
      pending = null; inFlight = null;
      for (const resolve of waiters) resolve();
      waiters.clear();
    }
  };
}

// Keep at most one operation running and one pending; newer requests replace pending work.
export function createLatestTask(run) {
  let active=false,pending=null;
  async function pump(){
    if(active)return;
    active=true;
    try{
      while(pending!==null){const task=pending;pending=null;try{await run(task);}catch{/* A failed request must not block later frames. */}}
    }finally{active=false;}
  }
  return {request(task){pending=task;void pump();},clear(){pending=null;}};
}

// Find the actual displayed source frame, including variable-duration frames.
export function frameAtTime(times, time){
  let low=0,high=times.length;
  while(low<high){const mid=(low+high)>>>1;if(times[mid]<=time+1e-7)low=mid+1;else high=mid;}
  return Math.max(0,low-1);
}
