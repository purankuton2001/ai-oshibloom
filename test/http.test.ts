import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

test('HTTP and WebSocket: isolated full mock creation and broadcast loop', {timeout:30000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-oshibloom-http-'));const port=18791;const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{env:{...process.env,PORT:String(port),DATA_DIR:root,FAL_KEY:'',OPENAI_API_KEY:'',YOUTUBE_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let socket:WebSocket|undefined;
  try{
    await new Promise<void>((resolve,reject)=>{child.stdout.on('data',()=>resolve());child.stderr.on('data',d=>reject(new Error(String(d))));child.on('error',reject);child.on('exit',code=>{if(code)reject(new Error('Server failed'));});});
    const post=async(route:string,body:unknown)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json() as any;assert.equal(r.status,200,JSON.stringify(data));return data;};
    assert.equal((await fetch(base+'/health')).status,200);
    const page=await fetch(base+'/');assert.equal(page.headers.get('content-security-policy'),"frame-ancestors 'self'");assert.equal(page.headers.get('x-frame-options'),'SAMEORIGIN');
    assert.match(await page.text(),/Community chat/);
    assert.equal((await fetch(base+'/overlay?audio=1')).status,200);
    const image=await fetch(base+'/assets/yui-demo.png',{headers:{Range:'bytes=0-20'}});assert.equal(image.status,206);assert.equal((await image.arrayBuffer()).byteLength,21);
    assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{Origin:'https://outside.example','Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(base+'/api/control',{method:'POST',body:'{}'})).status,415);
    await post('/api/settings',{interval:0,cooldown:0,approval:true});
    await post('/api/create/faces',{});let state=await (await fetch(base+'/api/state')).json() as any;assert.equal(state.candidates.length,4);
    await post('/api/create/adopt',{id:state.candidates[0].id});await post('/api/create/confirm',{adult:true});await post('/api/create/idle',{count:2});
    state=await (await fetch(base+'/api/state')).json() as any;assert.equal(state.persona.refs.length,3);assert.equal(state.persona.idle.length,2);assert.equal(state.spent,0);
    const events:any[]=[];socket=new WebSocket(base.replace('http','ws')+'/ws');socket.on('message',raw=>events.push(JSON.parse(String(raw))));await new Promise<void>(resolve=>socket!.once('open',resolve));
    await post('/api/control',{action:'start'});const denied=await post('/api/comment',{author:'test',text:'BTS 춤'});assert.equal(denied.accepted,false);
    const accepted=await post('/api/comment',{author:'Clover',text:'¡Hola!'});assert.equal(accepted.accepted,true);
    await post('/api/approve',{id:accepted.id,accept:true});
    for(let i=0;i<100&&!events.some(e=>e.type==='play');i++)await delay(30);
    const play=events.find(e=>e.type==='play');assert.ok(play);assert.equal(play.job.clip.demo,true);assert.equal(play.job.reply,'¡Vamos a intentarlo!');
    socket.send(JSON.stringify({type:'started',id:play.job.id}));socket.send(JSON.stringify({type:'ended',id:play.job.id}));await delay(50);
    state=await (await fetch(base+'/api/state')).json() as any;assert.equal(state.stats.played,1);assert.equal(state.stats.filtered,1);
    await post('/api/rate',{id:play.job.id,score:4});assert.match(await (await fetch(base+'/api/metrics')).text(),/consistency_rating/);
    await post('/api/control',{action:'stop'});
  }finally{socket?.close();child.kill('SIGTERM');await new Promise<void>(resolve=>child.once('exit',()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
