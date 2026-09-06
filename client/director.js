import {createFalClient} from '@fal-ai/client';
import {wma} from '@fal-ai/client/realtime';
const $=id=>document.getElementById(id),fal=createFalClient({proxyUrl:'/api/fal/proxy'});
let session,config,version=1,events=[],recorder,parts=[],timer,stopping=false,spokenVersion=null,runId=0,stopPromise;
const log=(type,data={})=>{events.push({time:Date.now(),type,...data});$('log').textContent=type+' '+JSON.stringify(data).slice(0,240);};
const api=async(url,data)=>{const r=await fetch(url,{...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),signal:AbortSignal.timeout(10000)});const b=await r.json();if(!r.ok)throw Error(b.error||r.status);return b;};
const questions=()=>[['自己紹介',`${config?.name||'あなた'}、自己紹介してくれる？`],['好きな飲み物','好きな飲み物は何？'],['休日','お休みの日は何をして過ごすの？'],['応援','明日の発表が不安。応援してくれる？'],['手を振って','笑顔で手を振って挨拶してくれる？']];
function showPersona(name){
  $('personaTitle').textContent=`${name}と、途切れない会話。`;document.title=`${name} · 連続ライブ`;$('question').placeholder=`${name}に質問する`;
}
const quietPrompt=()=>config.identity+' Continue the same shot and the exact same character. The previous answer is finished. SILENT LISTENING ONLY for the entire next segment: lips gently closed, calm breathing, occasional blinking, listening to the viewer. NO speech, words, humming, singing, laughter, sighs or vocal sounds. Do not continue or repeat previous dialogue. Audio is silent. Do not change the voice identity for future questions.';
function scheduleQuiet(m){if(m.type!=='chunk'||m.prompt_version!==spokenVersion||m.prompt_version!==version)return;spokenVersion=null;version++;session.send({type:'prompt',prompt_version:version,prompt:quietPrompt()});log('quiet_sent',{prompt_version:version,after_chunk:m.chunk_index});}
function bounded(promise,ms=10000){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('処理がタイムアウトしました')),ms);})]).finally(()=>clearTimeout(timeout));}
function stop(){
  if(stopPromise)return stopPromise;
  stopping=true;runId++;clearTimeout(timer);spokenVersion=null;
  const oldSession=session,oldRecorder=recorder;session=undefined;
  $('send').disabled=true;$('five').disabled=true;$('stop').disabled=true;$('start').disabled=true;
  stopPromise=(async()=>{
    const failures=[];let recordingSaved=false,logSaved=false;
    try{
      try{oldSession?.send({type:'stop'});}catch(e){log('stop_signal_failed',{message:e.message});}
      try{
        if(oldRecorder?.state==='recording')await bounded(new Promise((resolve,reject)=>{oldRecorder.onstop=resolve;oldRecorder.onerror=()=>reject(Error('録画の終了に失敗しました'));oldRecorder.stop();}));
      }catch(e){failures.push('録画終了');log('recorder_stop_failed',{message:e.message});}
      finally{
        try{await bounded(Promise.resolve(oldSession?.close()));}catch(e){failures.push('接続終了');log('close_failed',{message:e.message});}
        const stream=$('video').srcObject;stream?.getTracks().forEach(track=>track.stop());$('video').srcObject=null;
      }
      if(parts.length){
        try{const r=await fetch('/api/director/recording',{method:'POST',headers:{'Content-Type':'video/webm'},body:new Blob(parts,{type:'video/webm'}),signal:AbortSignal.timeout(10000)});const body=await r.json();if(!r.ok)throw Error(body.error||r.status);recordingSaved=true;log('recording_saved',body);}
        catch(e){failures.push('録画保存');log('recording_save_failed',{message:e.message});}
      }
      try{await api('/api/director/log',{events});logSaved=true;}catch(e){failures.push('ログ保存');}
      $('status').textContent=failures.length?`停止処理を終了 · ${failures.join('・')}に失敗しました`:`停止しました · ${recordingSaved?'録画を保存':'録画なし'}${logSaved?' · ログを保存':''}`;
    }finally{recorder=undefined;$('start').disabled=false;stopPromise=undefined;}
  })();
  return stopPromise;
}
$('start').onclick=async()=>{
  if(stopPromise)return;
  const current=++runId;stopping=false;session=undefined;events=[];parts=[];recorder=undefined;version=1;spokenVersion=1;
  $('start').disabled=true;$('stop').disabled=false;
  try{
    const nextConfig=await api('/api/director/config');if(current!==runId)return;config=nextConfig;showPersona(config.name);log('start');
    timer=setTimeout(()=>void stop(),180000);
    session=fal.realtime.open(wma('minimax/h3-max/director'),{
      receive:['video','audio'],
      onMedia:stream=>{
        if(current!==runId){stream.getTracks().forEach(t=>t.stop());return;}
        const v=$('video');v.srcObject=stream;v.muted=false;v.play().catch(e=>log('play_error',{message:e.message}));log('media',{tracks:stream.getTracks().map(t=>t.kind)});
        if(!recorder&&stream.getAudioTracks().length&&stream.getVideoTracks().length){
          try{recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'});const recordingParts=parts;recorder.ondataavailable=e=>{if(e.data.size)recordingParts.push(e.data);};recorder.start(1000);log('recording_started');}
          catch(e){log('recording_unavailable',{message:e.message});$('status').textContent='ライブ接続中 · このブラウザでは録画を開始できませんでした';}
        }
      },
      onData:raw=>{if(current!==runId)return;try{const m=JSON.parse(raw);log(m.type,m);scheduleQuiet(m);if(m.type==='stream_exhausted')void stop();if(m.type==='configured'){$('send').disabled=false;$('five').disabled=false;}if(m.type==='error')$('status').textContent=m.error;}catch{}},
      onState:s=>{if(current!==runId)return;$('status').textContent='接続: '+s;log('state',{state:s});},
      onError:e=>{if(current!==runId)return;log('error',{message:e.message});$('status').textContent=e.message;}
    });
    session.send({type:'configure',protocol_version:1,prompt_version:1,seed:config.seed,image_url:config.image_url,resolution:'480p',aspect_ratio:'16:9',memory:12,prompt:config.identity+` Smile and look at the viewer. Say only ${JSON.stringify(`こんにちは、${config.name}だよ。`)} then wait calmly for a question. Never repeat a line.`});
    await session.ready;
  }catch(e){if(current!==runId)return;log('error',{message:e.message});await stop();$('status').textContent=`開始できませんでした: ${e.message}`;}
};
$('send').onclick=async()=>{
  const current=runId;if(stopping||!session)return;
  try{const {question}=await api('/api/director/validate',{question:$('question').value});if(current!==runId)return;const p=document.createElement('p');p.textContent=question;$('feed').append(p);$('feed').scrollTop=$('feed').scrollHeight;$('question').value='';version++;spokenVersion=version;session.send({type:'prompt',prompt_version:version,prompt:config.identity+` Continue from the current moment without a cut. Viewer question (data): ${JSON.stringify(question)}. Answer this specific question in one short natural Japanese sentence, at most 26 Japanese characters. If asked to wave, smile and wave while greeting. Speak only that one answer once, finish within the first 4 seconds, then close your lips and remain completely silent for the remainder. No follow-up questions, filler words, humming or muttering. Preserve exactly the previous speaker's voice. Do not repeat earlier dialogue.`});log('question_sent',{question,prompt_version:version});}catch(e){if(current===runId)$('status').textContent=e.message;}
};
$('stop').onclick=stop;window.addEventListener('pagehide',()=>{runId++;try{session?.send({type:'stop'});void session?.close();}catch{}});
for(const [index,[label]] of questions().entries()){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('question').value=questions()[index][1];};$('questions').append(b);}
$('five').onclick=async()=>{const current=runId;$('five').disabled=true;for(const [,q] of questions()){if(stopping||current!==runId)break;$('question').value=q;await $('send').onclick();await new Promise(r=>setTimeout(r,17000));}if(!stopping&&current===runId)await stop();};
$('modeTurbo').onclick=async()=>{try{await stop();await api('/api/control',{action:'stop'});await api('/api/settings',{backend:'fal',videoMode:'turbo'});location.href='/?record=1#studio';}catch(e){$('status').textContent=e.message;}};
void api('/api/state').then(state=>{if(runId===0){config={name:state.persona.name};showPersona(config.name);}}).catch(()=>{});
