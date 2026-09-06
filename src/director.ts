import fs from 'node:fs';
import path from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createFalClient} from '@fal-ai/client';
import {handleRequest} from '@fal-ai/server-proxy';
import type {Store} from './store.js';
import {assertSafe} from './guard.js';
const json=(res:ServerResponse,x:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
async function raw(req:IncomingMessage,max=100000){const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>max)throw Error('Too large');chunks.push(Buffer.from(c));}return Buffer.concat(chunks);}
export async function directorRoute(req:IncomingMessage,res:ServerResponse,route:string,store:Store){
 if(route==='/api/fal/proxy'){
  return handleRequest({id:'local-director',method:req.method!,getRequestBody:async()=>String(await raw(req)),getHeaders:()=>req.headers,getHeader:n=>req.headers[n],sendHeader:(n,v)=>res.setHeader(n,v),respondWith:(status,data)=>json(res,data,status),sendResponse:async r=>{res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json'});res.end(Buffer.from(await r.arrayBuffer()));}}, {allowedEndpoints:['minimax/h3-max/director','minimax/h3-max/director/**'],resolveFalAuth:async()=>`Key ${process.env.FAL_KEY}`,allowUnauthorizedRequests:true});
 }
 if(route==='/api/director/config'&&req.method==='GET'){
  const p=store.persona();if(!p.confirmed||p.demo)throw Error('Confirm character first');
  const cached=store.read<{ref?:string,url?:string}>('director-reference.json',{});let url=cached.ref===p.refs[0]?cached.url:undefined;if(!url){url=await createFalClient({credentials:process.env.FAL_KEY}).storage.upload(new Blob([fs.readFileSync(store.path(p.refs[0].slice(7)))],{type:'image/png'}));store.write('director-reference.json',{ref:p.refs[0],url});}
  return json(res,{seed:p.seed,image_url:url,identity:`Original adult Japanese anime virtual idol ${p.name}. ${p.appearance} ${p.world} ${p.tone} Voice identity: ${p.voiceDescription} Keep the exact same female speaker, pitch, timbre, accent and speaking rhythm throughout this continuous session. No other speakers, narrator, music or sound effects. Japanese dialogue only. One continuous shot, no subtitles. ${p.forbidden}`});
 }
 if(route==='/api/director/validate'&&req.method==='POST'){const b=JSON.parse(String(await raw(req)));const question=String(b.question||'').trim();if(!question||question.length>250)throw Error('Invalid question');assertSafe(question,store.settings.blockedWords,'comment');return json(res,{question});}
 if(route==='/api/director/recording'&&req.method==='POST'){const bytes=await raw(req,100*1024*1024);const name=`director-${Date.now()}.webm`;fs.writeFileSync(path.resolve('..',name),bytes);return json(res,{file:name});}
 if(route==='/api/director/log'&&req.method==='POST'){const b=JSON.parse(String(await raw(req,2000000)));fs.writeFileSync(path.resolve('..','director-test-events.json'),JSON.stringify(b,null,2));return json(res,{ok:true});}
 return json(res,{error:'Not found'},404);
}
