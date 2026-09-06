import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { Engine } from './engine.js';
import { directorRoute } from './director.js';

const localConfig=fs.existsSync('.env')?dotenv.parse(fs.readFileSync('.env','utf8')):{};
if(localConfig.FAL_KEY)process.env.FAL_KEY=localConfig.FAL_KEY.trim();
const port=Number(process.env.PORT||8790);
const store=new Store(path.resolve(process.env.DATA_DIR||'./data'));
const engine=new Engine(store);
const publicRoot=path.resolve('public');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav'};
const json=(res:http.ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function file(req:http.IncomingMessage,res:http.ServerResponse,target:string){
  if(!fs.existsSync(target)||!fs.statSync(target).isFile())return json(res,{error:'Not found'},404);
  const size=fs.statSync(target).size;const headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
  const range=req.headers.range;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return json(res,{error:'Invalid range'},416);
    const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));const end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
    if(start>end||start>=size||!Number.isSafeInteger(start)){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(target,{start,end}).pipe(res);
  }else{res.writeHead(200,{...headers,'Content-Length':size});fs.createReadStream(target).pipe(res);}
}
async function body(req:http.IncomingMessage){let data='';for await(const chunk of req){data+=chunk;if(data.length>40000)throw new Error('Request too large');}const value=JSON.parse(data||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected JSON object');return value as Record<string,unknown>;}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
  if(!allowedHosts.includes(req.headers.host||''))return json(res,{error:'Invalid host'},403);
  const origin=`http://${req.headers.host}`;
  if(req.headers.origin&&req.headers.origin!==origin)return json(res,{error:'Origin not allowed'},403);
  try{
    const url=new URL(req.url||'/',origin);const route=url.pathname;
    if(route.startsWith('/api/director/')||route==='/api/fal/proxy'){if(req.headers.origin!==origin&&req.headers['sec-fetch-site']!=='same-origin')return json(res,{error:'Same-origin only'},403);await directorRoute(req,res,route,store);return;}
    if(req.method==='GET'){
      if(route==='/api/state')return json(res,engine.state());
      if(route==='/health')return json(res,{ok:true,project:'ai-oshibloom'});
      if(route==='/api/metrics'){
        const files=fs.readdirSync(store.path('logs')).filter(x=>x.endsWith('.jsonl'));res.writeHead(200,{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="ai-oshibloom-metrics.jsonl"'});for(const name of files)res.write(fs.readFileSync(store.path('logs/'+name)));return res.end();
      }
      if(route.startsWith('/media/')){
        const rel=decodeURIComponent(route.slice(7));if(!/\.(png|jpg|webp|mp3|wav|mp4|webm)$/.test(rel))return json(res,{error:'Not found'},404);return file(req,res,store.path(rel));
      }
      const rel=route==='/'?'index.html':route==='/overlay'?'overlay.html':decodeURIComponent(route.slice(1));
      const target=path.resolve(publicRoot,rel);if(!target.startsWith(publicRoot+path.sep))return json(res,{error:'Not found'},404);return file(req,res,target);
    }
    if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'JSON content type required'},415);
    const b=await body(req);
    if(route==='/api/settings')return json(res,engine.update(b));
    if(route==='/api/control'){engine.control(String(b.action));return json(res,{ok:true});}
    if(route==='/api/comment')return json(res,engine.receive({text:String(b.text||''),author:String(b.author||'Clover'),authorId:'manual:'+String(b.author||'Clover'),receivedAt:Date.now()}));
    if(route==='/api/approve'){engine.approve(String(b.id),b.accept===true);return json(res,{ok:true});}
    if(route==='/api/rate'){engine.rate(String(b.id),Number(b.score));return json(res,{ok:true});}
    if(route==='/api/persona/save')return json(res,engine.savePersona(b));
    if(route==='/api/persona/create')return json(res,engine.savePersona(b,true));
    if(route==='/api/persona/select'){engine.select(String(b.id));return json(res,{ok:true});}
    if(route==='/api/create/cancel'){engine.cancelIdle();return json(res,{ok:true});}
    if(route.startsWith('/api/create/'))return json(res,await engine.createAssets(route.slice('/api/create/'.length),b));
    return json(res,{error:'Not found'},404);
  }catch(error){json(res,{error:(error as Error).message},400);}
});
const wss=new WebSocketServer({server,path:'/ws',verifyClient:(info:{origin:string;req:http.IncomingMessage})=>[`127.0.0.1:${port}`,`localhost:${port}`].includes(info.req.headers.host||'')&&(!info.origin||info.origin===`http://${info.req.headers.host}`)});
wss.on('connection',ws=>{
  ws.send(JSON.stringify({type:'state',state:engine.state()}));
  const current=engine.jobs.find(j=>j.status==='playing');if(current)ws.send(JSON.stringify({type:'play',job:current}));
  ws.on('message',raw=>{try{const m=JSON.parse(String(raw));if(m.type==='ended')engine.ended(String(m.id));if(m.type==='started')engine.started(String(m.id));}catch{/* Ignore malformed spectator packets. */}});
});
const broadcast=(message:unknown)=>{for(const ws of wss.clients)if(ws.readyState===1)ws.send(JSON.stringify(message));};
engine.on('state',state=>broadcast({type:'state',state}));engine.on('visual',broadcast);
server.listen(port,'127.0.0.1',()=>console.log(`AI OshiBloom\nStudio: http://127.0.0.1:${port}\nOBS: http://127.0.0.1:${port}/overlay\nFree demo mode by default.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{engine.close();wss.close();server.close();process.exit(0);});
