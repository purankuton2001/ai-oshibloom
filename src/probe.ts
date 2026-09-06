import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';
import { Providers, videoCost } from './providers.js';
import { assertSafe } from './guard.js';

const args=process.argv.slice(2);const at=(flag:string,fallback:string)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const n=Number(at('--n','20'));if(!Number.isInteger(n)||n<1||n>100)throw new Error('--n must be 1–100');
const store=new Store(path.resolve(process.env.DATA_DIR||'./data'));const p=store.persona(),s=store.settings,providers=new Providers(store);
const unit=videoCost(s,p);let spent=store.read('budget.json',{spent:0}).spent;
if(spent+n*unit>s.budget)throw new Error('Probe exceeds the remaining session budget');
const actions=['Give a small wave.','Sip tea.','Smile softly.','Stretch gently.'];
const probeId=Date.now();const rows=[];
for(let i=0;i<n;i++){
  const action=actions[i%actions.length];assertSafe(action,s.blockedWords);spent+=unit;store.write('budget.json',{spent});const start=Date.now();
  try{const clip=await providers.video(p,action,'',s);const row={index:i+1,clip,ms:Date.now()-start,cost:unit};rows.push(row);store.log('probe_clip',{probeId,...row});console.log(`${i+1}/${n}: ${row.ms}ms, ${clip.demo?'DEMO STILL':'video'}`);}catch(e){store.log('probe_failed',{probeId,index:i+1,error:(e as Error).message});console.error(`${i+1}/${n}: ${(e as Error).message}`);}
}
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const file=store.path(`logs/probe-${probeId}.html`);
fs.writeFileSync(file,`<!doctype html><meta charset="utf-8"><title>ai-oshibloom probe</title><style>body{font:15px system-ui;background:#f5f7f1;color:#344c38;padding:30px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}video,img{width:100%}article{background:white;padding:12px;border-radius:8px}</style><h1>${esc(p.name)} · ${rows.length}/${n} clips</h1><p>${s.backend==='mock'?'DEMO ONLY: still images do not measure motion, latency or face consistency.':'Rate consistency 1–5 per clip. Target: mean ≥ 4. Save your ratings with Print → PDF.'}</p><main>${rows.map(r=>{const local=r.clip.url.startsWith('/media/')?'../'+r.clip.url.slice(7):'../../public'+r.clip.url;return `<article>${r.clip.kind==='video'?`<video src="${esc(local)}" controls></video>`:`<img src="${esc(local)}">`}<p>#${r.index} · ${r.ms} ms · $${r.cost.toFixed(2)}</p><label>Consistency <select><option>Not rated</option>${[1,2,3,4,5].map(i=>`<option>${i}</option>`).join('')}</select></label></article>`;}).join('')}</main>`);
console.log(`Report: ${file}`);
