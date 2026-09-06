import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { guard } from '../src/guard.js';
import { defaults, fallback, language, seedPersona, settingsFrom, videoPrompt } from '../src/domain.js';
import { Store } from '../src/store.js';
import { Engine } from '../src/engine.js';
import { Providers } from '../src/providers.js';

const context=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-oshibloom-test-'));const store=new Store(root);store.saveSettings({...defaults,interval:0,cooldown:0});return {root,store};};
const comment=(text='Give us a little wave!',author='clover')=>({text,author,authorId:author,receivedAt:Date.now()});
async function until(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await delay(20);}assert.fail('Timed out waiting for engine state');}
class FastProviders extends Providers {
  fail=false;override async video(p:any,_action:any,_line:any,s:any){if(this.fail)throw new Error('Provider offline');await delay(10);return {id:'clip',url:'/assets/yui-demo.png',kind:'image' as const,duration:s.duration,prompt:'test',demo:true};}
}

test('English, Korean and Japanese IP aliases cannot be bypassed by generation or allow-name paths',()=>{
  for(const text of ['BTS dancing','ＢＴＳ dancing','B\u200bTS dancing','방탄소년단 춤','BLACKPINK','初音ミクにして','피카츄','Naruto please','Taylor Swift','One-Piece']){
    assert.equal(guard(text), 'protected_name',text);assert.equal(guard(text,[],'generation'),'protected_name',text);
  }
  for(const text of ['Give us a wave','a live studio','creative original character','손 흔들어 줘요','手を振って','¡Hola!'])assert.equal(guard(text),null,text);
});
test('custom blocklist, imitation and unsafe requests',()=>{
  assert.equal(guard('hello forbidden-name',['forbidden-name']),'blocked_word');
  for(const text of ['make her look like a singer','誰かに似せて','do the choreography of a song'])assert.equal(guard(text),'imitation');
  for(const text of ['NSFW please','nude portrait','未成年の女の子'])assert.equal(guard(text),'unsafe_content');
  assert.equal(guard('   '),'empty');
});
test('reply language and prompt voice instructions follow the text',()=>{
  for(const [text,expected] of [['Hello','English'],['手を振って','Japanese'],['춤춰 줘요','Korean'],['¡Hola!','Spanish']] as const){
    assert.equal(language(text),expected);const line=fallback(text);assert.equal(language(line),expected);
    const p=videoPrompt({...seedPersona,voice:'/media/voice.mp3'},text,line);assert.ok(p.includes(`in ${expected}`));assert.ok(p.includes('Audio 1'));assert.ok(p.includes('fictional adult'));
  }
  assert.match(videoPrompt({...seedPersona,style:'photoreal'},'wave'),/Photorealistic/);
  assert.match(videoPrompt({...seedPersona,style:'anime'},'wave'),/anime illustration/);
});
test('settings reject invalid values and ignore unrecognized input',()=>{
  for(const input of [{budget:-1},{budget:'NaN'},{duration:200},{approval:'false'},{backend:'fake'}])assert.throws(()=>settingsFrom(input));
  assert.deepEqual(settingsFrom({FAL_KEY:'secret'}),defaults);
});
test('persona folders persist independently and cannot escape data root',()=>{
  const {root,store}=context();try{assert.throws(()=>store.path('../../secret'));assert.throws(()=>store.savePersona({...seedPersona,id:'../oops'}));store.savePersona({...seedPersona,id:'nova',name:'Nova'});assert.equal(new Store(root).persona('nova').name,'Nova');assert.equal(store.persona('yui').name,'Yui');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('approval → generation → playing → done, silent rejection and rating',async()=>{
  const {root,store}=context();const e=new Engine(store,new FastProviders(store));try{
    store.saveSettings({...store.settings,approval:true});let visual=0;e.on('visual',()=>visual++);e.control('start');
    assert.equal(e.receive(comment('BTS dance')).accepted,false);assert.equal(e.jobs.length,0);assert.equal(visual,0);
    e.receive(comment());assert.equal(e.jobs[0].status,'approval');await delay(40);assert.equal(e.stats.generated,0);
    e.approve(e.jobs[0].id,true);await until(()=>e.jobs[0].status==='playing');assert.equal(e.jobs[0].reply,fallback('hello'));e.ended(e.jobs[0].id);assert.equal(e.jobs[0].status,'done');assert.equal(e.stats.played,1);e.rate(e.jobs[0].id,4);assert.equal(e.jobs[0].rating,4);
  }finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('stop during generation cancels the output; restart never resurrects it',async()=>{
  const {root,store}=context();const e=new Engine(store,new Providers(store));try{e.control('start');e.receive(comment());e.control('stop');await until(()=>e.jobs[0].status==='rejected');await delay(30);assert.equal(e.stats.generated,0);e.control('start');await delay(30);assert.equal(e.jobs[0].status,'rejected');}finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('rate limit, per-user cooldown and pending queue limit',()=>{
  const {root,store}=context();const e=new Engine(store,new FastProviders(store));try{
    store.saveSettings({...store.settings,approval:true,interval:30,cooldown:120,maxQueue:2});e.control('start');assert.equal(e.receive(comment()).accepted,true);assert.equal(e.receive(comment('wave','next')).reason,'rate_limit');
    store.saveSettings({...store.settings,interval:0});assert.equal(e.receive(comment()).reason,'user_cooldown');assert.equal(e.receive(comment('wave','next')).accepted,true);assert.equal(e.receive(comment('wave','third')).reason,'queue_full');
  }finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('paid failures retain reservation and budget blocks subsequent calls across restarts',async()=>{
  const {root,store}=context();store.saveSettings({...store.settings,backend:'fal',budget:.5});const provider=new FastProviders(store);provider.fail=true;const e=new Engine(store,provider);
  try{e.control('start');e.receive(comment());await until(()=>e.jobs[0].status==='failed');assert.equal(e.spent,.4);assert.equal(e.receive(comment('hello again','other')).reason,'budget');assert.equal(new Engine(new Store(root),provider).spent,.4);}finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('creation guards apply before any image or voice provider call',async()=>{
  const {root,store}=context();const e=new Engine(store,new FastProviders(store));try{assert.throws(()=>e.savePersona({name:'Jungkook'}));await assert.rejects(e.createAssets('faces',{description:'Naruto'}));await assert.rejects(e.createAssets('voice',{text:'Taylor Swift'}));assert.equal(e.spent,0);assert.equal(e.busy,'');}finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('prefetch preserves playback order and stop discards the ready buffer',async()=>{
  const {root,store}=context();const e=new Engine(store,new FastProviders(store));const played:string[]=[];
  e.on('visual',m=>{if(m.type==='play')played.push(m.job.id);});
  try{
    e.control('start');e.receive(comment());await until(()=>e.jobs[0].status==='playing');
    e.receive(comment('Smile','two'));e.receive(comment('Wave','three'));
    await until(()=>e.jobs[1].status==='ready');assert.equal(e.jobs[0].status,'playing');assert.equal(e.jobs[2].status,'queued');assert.equal(played.length,1);
    e.ended(e.jobs[0].id);await until(()=>e.jobs[2].status==='ready');assert.deepEqual(played,[e.jobs[0].id,e.jobs[1].id]);
    e.control('stop');assert.equal(e.jobs[2].status,'rejected');e.control('start');await delay(30);assert.equal(played.length,2);
  }finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('failure in prefetched generation does not interrupt the playing clip',async()=>{
  const {root,store}=context();const provider=new FastProviders(store);const e=new Engine(store,provider);let idle=0;e.on('visual',m=>{if(m.type==='idle')idle++;});
  try{e.control('start');e.receive(comment());await until(()=>e.jobs[0].status==='playing');provider.fail=true;e.receive(comment('Smile','two'));await until(()=>e.jobs[1].status==='failed');assert.equal(e.jobs[0].status,'playing');assert.equal(idle,0);}finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('legacy persona gains persistent seed and voice description; new personas remain independent',()=>{
  const {root,store}=context();
  try{
    const legacy:any=store.persona();delete legacy.seed;delete legacy.voiceDescription;store.write('personas/yui/persona.json',legacy);
    const migrated=new Store(root);const original=migrated.persona();assert.ok(Number.isInteger(original.seed));assert.ok(original.voiceDescription);
    assert.equal(new Store(root).persona().seed,original.seed);
    const e=new Engine(migrated,new FastProviders(migrated));
    const other=e.savePersona({name:'Nova'},true);assert.notEqual(other.seed,original.seed);
    e.savePersona({seed:0,voiceDescription:'A warm clear adult voice.'});assert.equal(new Store(root).persona(other.id).seed,0);assert.equal(migrated.persona('yui').seed,original.seed);assert.equal(migrated.persona('yui').voiceDescription,original.voiceDescription);
    for(const seed of [-1,1.5,2147483648,'',null,'abc'])assert.throws(()=>e.savePersona({seed}));
    assert.throws(()=>e.savePersona({voiceDescription:'Taylor Swift'}));e.close();
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('fal requests preserve persona seed and exact voice text across comments and modes',async()=>{
  const {root,store}=context();const previousFetch=globalThis.fetch,previousKey=process.env.FAL_KEY;const inputs:any[]=[];
  try{
    process.env.FAL_KEY='test-only';fs.writeFileSync(store.path('ref.png'),Buffer.from('fixture'));
    const p={...store.persona(),seed:18734,voiceDescription:'Soft adult voice. Bright clear timbre.',refs:['/media/ref.png','/media/ref.png','/media/ref.png'],confirmed:true,demo:false};
    globalThis.fetch=async(url:any,init?:RequestInit)=>{
      if(init?.method==='POST'){inputs.push(JSON.parse(String(init.body)));return Response.json({status_url:'https://queue.fal.run/test/status',response_url:'https://queue.fal.run/test/result'});}
      if(String(url).endsWith('/status'))return Response.json({status:'COMPLETED'});
      if(String(url).endsWith('/result'))return Response.json({video:{url:'https://media.example.test/video.mp4'}});
      return new Response(new Uint8Array([1,2,3]));
    };
    const provider=new Providers(store);
    for(const [mode,action,line] of [['turbo','wave','Hello!'],['turbo','smile','やってみるね！'],['reference','wink','Hi!']] as const)await provider.video(p,action,line,{...store.settings,backend:'fal',videoMode:mode});
    assert.equal(inputs.length,3);for(const input of inputs){assert.equal(input.seed,p.seed);assert.ok(input.prompt.includes(`Voice identity: ${p.voiceDescription}`));}
    assert.match(inputs[0].prompt,/audible English speech/);assert.match(inputs[1].prompt,/audible Japanese speech/);
  }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=previousKey;fs.rmSync(root,{recursive:true,force:true});}
});

test('fal reply sends the actual question and rejects provider errors',async()=>{
  const {root,store}=context();const oldFetch=globalThis.fetch,oldKey=process.env.FAL_KEY;const sent:any[]=[];let output:any={output:'紅茶が好きだよ！'};
  try{
    process.env.FAL_KEY='test-only';globalThis.fetch=async(url:any,init?:RequestInit)=>{
      if(init?.method==='POST'){sent.push(JSON.parse(String(init.body)));return Response.json({status_url:'https://queue.fal.run/test/status',response_url:'https://queue.fal.run/test/result'});}
      return Response.json(String(url).endsWith('/status')?{status:'COMPLETED'}:output);
    };
    const provider=new Providers(store);const s={...store.settings,replyProvider:'fal' as const};
    const line=await provider.reply(store.persona(),'好きな飲み物は何？',s);assert.equal(line,'紅茶が好きだよ！');assert.equal(sent[0].prompt,'好きな飲み物は何？');assert.match(sent[0].system_prompt,/Yui/);assert.equal(sent[0].enable_web_search,false);
    output={output:'',error:'upstream failed'};await assert.rejects(provider.reply(store.persona(),'こんにちは',s));
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=oldKey;fs.rmSync(root,{recursive:true,force:true});}
});
test('generated reply reaches video; reply failure never substitutes a preset',async()=>{
  const {root,store}=context();class ReplyProvider extends FastProviders{failReply=false;calls=0;override async reply():Promise<string>{if(this.failReply)throw new Error('Reply service unavailable');return '紅茶が好きだよ！';}override async video(p:any,a:any,line:any,s:any){this.calls++;assert.equal(line,'紅茶が好きだよ！');return super.video(p,a,line,s);}}
  const provider=new ReplyProvider(store);const e=new Engine(store,provider);try{e.control('start');e.receive(comment('好きな飲み物は何？'));await until(()=>e.jobs[0].status==='playing');assert.equal(e.jobs[0].reply,'紅茶が好きだよ！');e.ended(e.jobs[0].id);provider.failReply=true;e.receive(comment('元気？','other'));await until(()=>e.jobs[1].status==='failed');assert.equal(provider.calls,1);assert.equal(e.jobs[1].reply,undefined);assert.match(e.jobs[1].error!,/Reply service unavailable/);}finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('reply visibility waits for a real playback acknowledgement, which is idempotent',async()=>{
 const {root,store}=context();const e=new Engine(store,new FastProviders(store));try{
  e.control('start');e.receive(comment());await until(()=>e.jobs[0].status==='playing');const j=e.jobs[0];assert.ok(j.reply);assert.equal(j.playbackStartedAt,undefined);
  e.started('unrelated');assert.equal(j.playbackStartedAt,undefined);e.started(j.id);assert.ok(j.playbackStartedAt);const first=j.playbackStartedAt;e.started(j.id);assert.equal(j.playbackStartedAt,first);
 }finally{e.close();fs.rmSync(root,{recursive:true,force:true});}
});
