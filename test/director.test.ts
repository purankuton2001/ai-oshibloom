import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function client(failPath=''){
  const elements=new Map<string,any>();
  const element=(id:string)=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:'',children:[],append(x:any){this.children.push(x);},play:async()=>{},srcObject:null});return elements.get(id);};
  const requests:string[]=[],sent:any[]=[];let closed=0,callbacks:any;
  const liveSession={send:(m:any)=>sent.push(m),close:async()=>{closed++;},ready:Promise.resolve()};
  const context=vm.createContext({document:{getElementById:element,createElement:()=>({})},window:{addEventListener(){}},createFalClient:()=>({realtime:{open:(_model:any,handlers:any)=>{callbacks=handlers;return liveSession;}}}),wma:(x:any)=>x,Blob,AbortSignal,setTimeout,clearTimeout,fetch:async(url:string,options:any)=>{
    requests.push(url);assert.ok(options.signal,'Every request has a timeout signal');
    if(url===failPath)throw Error('offline');
    if(url==='/api/state')return Response.json({persona:{name:'Nova'}});
    if(url==='/api/director/config')return Response.json({name:'Nova',identity:'Original adult idol Nova.',seed:42,image_url:'https://example.test/ref.png'});
    return Response.json({file:'recording.webm',ok:true});
  }});
  const source=fs.readFileSync(new URL('../client/director.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');vm.runInContext(source,context);
  return {element,context,requests,sent,get closed(){return closed;},get callbacks(){return callbacks;}};
}
function recording(c:ReturnType<typeof client>){vm.runInContext("parts=[new Blob(['test'])];recorder={state:'recording',stop(){this.onstop();}}",c.context);}
for(const failed of ['/api/director/recording','/api/director/log']){
  test(`Director closes and permits restart after ${failed} fails`,async()=>{
    const c=client(failed);await c.element('start').onclick();recording(c);
    const obsolete=c.callbacks;await c.element('stop').onclick();
    assert.equal(c.closed,1);assert.equal(c.element('start').disabled,false);assert.equal(c.element('stop').disabled,true);assert.match(c.element('status').textContent,/失敗/);
    obsolete.onState('connected');obsolete.onData(JSON.stringify({type:'configured'}));assert.equal(c.element('send').disabled,true);assert.match(c.element('status').textContent,/失敗/);
    await c.element('start').onclick();assert.equal(c.sent.filter(m=>m.type==='configure').length,2);await c.element('stop').onclick();assert.equal(c.closed,2);
  });
}
test('Director greeting, questions and visible identity use selected persona',async()=>{
  const c=client();await c.element('start').onclick();
  const prompt=c.sent.find(m=>m.type==='configure').prompt;
  assert.ok(prompt.includes('こんにちは、Novaだよ。'));assert.ok(!prompt.includes('ユイ'));
  assert.equal(c.element('personaTitle').textContent,'Novaと、途切れない会話。');
  assert.equal(c.element('question').placeholder,'Novaに質問する');
  c.element('questions').children[0].onclick();assert.equal(c.element('question').value,'Nova、自己紹介してくれる？');
  await c.element('stop').onclick();assert.match(c.element('status').textContent,/録画なし/);
});
test('Director stop invalidates configuration still loading',async()=>{
  const c=client();let resolve:any;
  c.context.fetch=async(url:string)=>url==='/api/director/config'?new Promise(r=>{resolve=r;}):Response.json({ok:true});
  const starting=c.element('start').onclick();await c.element('stop').onclick();resolve(Response.json({name:'Late',identity:'Late',seed:1,image_url:'https://example.test/ref.png'}));await starting;
  assert.equal(c.sent.length,0);assert.equal(c.element('start').disabled,false);
});
