export function playbackCommand(event){
 if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return null;
 const forward=['ArrowRight','.','>'].includes(event.key)||event.code==='Period';
 const backward=['ArrowLeft',',','<'].includes(event.key)||event.code==='Comma';
 if(event.shiftKey){if(forward)return 'last';if(backward)return 'landmark';if(event.key==='ArrowUp')return 'previous-video';if(event.key==='ArrowDown')return 'next-video';}
 if(event.key===' '||event.code==='Space')return 'toggle';
 if(forward)return 'next';if(backward)return 'previous';
 return {Home:'first',End:'last',i:'impact',I:'impact'}[event.key]||null;
}
