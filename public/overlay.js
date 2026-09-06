const $=id=>document.getElementById(id),q=new URLSearchParams(location.search),ja=q.get('lang')==='ja',preview=q.has('preview');
if(preview)document.body.classList.add('preview');document.documentElement.lang=ja?'ja':'en';$('badge').textContent=ja?'AI生成':'AI generated';$('demo').textContent=ja?'デモ · 静止画（生成動画ではありません）':'Demo · still image, not generated motion';
const idle=[$('idleA'),$('idleB')];let pool=[],poolKey='',idleIndex=0,activeIdle=0,epoch=0,idleBusy=false,idleTimer,current=null,timer,ws,cleanup;
let soundOn=q.get('audio')==='1';
function soundLabel(){$('sound').textContent=soundOn?(ja?'🔊 音声オン':'🔊 Sound on'):(ja?'🔇 音声をオン':'🔇 Enable sound');$('video').muted=!soundOn;}
$('sound').onclick=()=>{soundOn=!soundOn;soundLabel();if(current&&$('video').src)void $('video').play().catch(()=>{soundOn=false;soundLabel();});};soundLabel();
const send=m=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
function ready(video){return new Promise((resolve,reject)=>{if(video.readyState>=3)return resolve();const timeout=setTimeout(()=>done(new Error('Media load timeout')),15000);const ok=()=>done();const bad=()=>done(new Error('Media failed'));function done(e){clearTimeout(timeout);video.removeEventListener('canplay',ok);video.removeEventListener('error',bad);e?reject(e):resolve();}video.addEventListener('canplay',ok,{once:true});video.addEventListener('error',bad,{once:true});});}
function setPool(p){
  const next=(p.idle||[]).filter(c=>c.kind==='video');const key=JSON.stringify(next.map(c=>c.url));
  $('fallback').src=p.refs?.[2]||'/assets/yui-demo.png';$('demo').hidden=!p.demo;
  if(key===poolKey)return;poolKey=key;pool=next;epoch++;clearTimeout(idleTimer);idleBusy=false;
  idle.forEach(v=>{v.pause();v.classList.remove('visible');v.removeAttribute('src');v.load();});$('fallback').style.opacity='1';idleIndex=0;activeIdle=0;
  if(pool.length)void playNextIdle(epoch);
}
async function playNextIdle(token){
  if(token!==epoch||!pool.length||idleBusy)return;idleBusy=true;
  const index=activeIdle,video=idle[index],old=idle[1-index],clip=pool[idleIndex%pool.length];idleIndex++;
  try{
    video.src=clip.url;video.load();await ready(video);if(token!==epoch)return;
    await video.play();if(token!==epoch){video.pause();return;}video.classList.add('visible');old.classList.remove('visible');
    setTimeout(()=>{if(token===epoch)old.pause();},310);activeIdle=1-index;
    const seconds=Number.isFinite(video.duration)?video.duration:clip.duration;
    idleTimer=setTimeout(()=>{idleBusy=false;void playNextIdle(token);},Math.max(300,(seconds-.3)*1000));
  }catch{if(token===epoch){idleBusy=false;idleTimer=setTimeout(()=>void playNextIdle(token),1000);}}
}
async function play(job){
  if(current?.id===job.id)return;
  clearTimeout(timer);clearTimeout(cleanup);current=job;const id=job.id;
  $('line').textContent=job.reply||job.text;$('author').textContent=ja?`${job.author}のコメント`:`${job.author}'s comment`;
  $('demo').hidden=!job.clip.demo;
  try{
    if(job.clip.kind==='video'){
      $('still').style.display='none';$('video').style.display='block';$('video').style.objectFit='cover';$('video').src=job.clip.url;$('video').load();await ready($('video'));if(current?.id!==id)return;try{await $('video').play();}catch(e){if(e.name!=='NotAllowedError')throw e;soundOn=false;soundLabel();await $('video').play();}
      $('video').onended=()=>ended(id);$('video').onerror=()=>ended(id);
    }else{
      $('video').pause();$('video').style.display='none';$('still').style.display='block';$('still').src=job.clip.url;await $('still').decode();
    }
    if(current?.id!==id)return;$('reaction').classList.add('visible');$('caption').classList.add('visible');send({type:'started',id});
    timer=setTimeout(()=>ended(id),job.clip.duration*1000+ (job.clip.kind==='video'?1000:0));
  }catch{ended(id);}
}
function ended(id){if(current?.id!==id)return;hide();send({type:'ended',id});}
function hide(){current=null;clearTimeout(timer);$('reaction').classList.remove('visible');$('caption').classList.remove('visible');cleanup=setTimeout(()=>{if(!current){$('video').pause();$('video').removeAttribute('src');$('video').load();}},310);}
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'){setPool(m.state.persona);if(!m.state.running)hide();}if(m.type==='play')void play(m.job);if(m.type==='idle')hide();};ws.onclose=()=>setTimeout(connect,1500);}
connect();
