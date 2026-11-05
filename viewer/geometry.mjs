export const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
export const brighter=color=>'#'+color.slice(1).match(/../g).map(c=>Math.round(parseInt(c,16)*.5+127.5).toString(16).padStart(2,'0')).join('');
