import { randomUUID, randomInt } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { defaults, fallback, settingsFrom, type Clip, type Comment, type Job, type Persona } from './domain.js';
import { assertSafe, guard } from './guard.js';
import { capability, prices, Providers, videoCost } from './providers.js';
import { Store } from './store.js';
import { YouTubeChat } from './youtube.js';

export class Engine extends EventEmitter {
  running=false; paused=false; busy=''; spent=0; chatStatus='Disconnected';
  jobs:Job[]=[]; candidates:{id:string;url:string;personaId:string;style:string;demo:boolean}[]=[];
  stats={received:0,filtered:0,generated:0,failed:0,played:0};
  private lastAccepted=-Infinity; private users=new Map<string,number>(); private controller?:AbortController;
  private playbackTimer?:ReturnType<typeof setTimeout>;private youtubeAbort?:AbortController;
  private generation=false; private idleCancel=false;
  youtube:YouTubeChat;
  constructor(public store:Store,public providers=new Providers(store)) {
    super();this.spent=store.read('budget.json',{spent:0}).spent;
    this.youtube=new YouTubeChat(c=>{this.receive(c);},status=>{this.chatStatus=status;this.changed();});
  }
  state(){return {settings:this.store.settings,persona:this.store.persona(),personas:this.store.list().map(p=>({id:p.id,name:p.name})),running:this.running,paused:this.paused,busy:this.busy,spent:this.spent,jobs:this.jobs.slice(-60),stats:this.stats,chatStatus:this.chatStatus,capabilities:capability(),youtube:{polls:this.youtube.polls,units:this.youtube.units,interval:this.youtube.interval},candidates:this.candidates.filter(c=>c.personaId===this.store.settings.personaId)};}
  changed(){this.emit('state',this.state());}
  log(event:string,data:Record<string,unknown>={}){this.store.log(event,data);}
  private charge(amount:number){
    if(this.spent+amount>this.store.settings.budget+1e-8)throw new Error('Session budget reached. Idle playback continues.');
    // Reserve before calling the provider. On ambiguous failure keep the estimate charged.
    this.spent=Math.round((this.spent+amount)*1e6)/1e6;this.store.write('budget.json',{spent:this.spent});this.changed();
  }
  private ensureEditable(){if(this.busy||this.generation||this.jobs.some(j=>['approval','queued','ready','playing'].includes(j.status)))throw new Error('Finish or stop the current session before changing the persona or providers');}
  update(input:Record<string,unknown>){
    this.ensureEditable();const next=settingsFrom(input,this.store.settings);
    if((next.backend==='fal'||next.replyProvider==='fal')&&!capability().fal)throw new Error('Set FAL_KEY in .env first');
    if(next.backend==='local'&&!capability().local)throw new Error('Create local/workflow.json first');
    if(next.replyProvider==='openai'&&!capability().openai)throw new Error('Set OPENAI_API_KEY in .env first');
    if(this.running&&(next.platform!==this.store.settings.platform||next.videoId!==this.store.settings.videoId))throw new Error('Stop the session before changing the chat connection');
    this.store.saveSettings(next);this.changed();return next;
  }
  control(action:string){
    if(action==='start'){
      if(this.running)return;
      if(this.busy)throw new Error('Wait for creation to finish');
      if(this.store.settings.platform==='youtube'&&!capability().youtube)throw new Error('Set YOUTUBE_API_KEY in .env first');
      this.running=true;this.paused=false;
      if(this.store.settings.platform==='youtube'){
        this.youtubeAbort=new AbortController();this.chatStatus='Connecting';
        void this.youtube.run(this.store.settings.videoId,this.youtubeAbort.signal).catch(e=>{if(!this.youtubeAbort?.signal.aborted){this.chatStatus=String(e.message);this.log('chat_error',{error:this.chatStatus});this.changed();}});
      }else this.chatStatus='Manual chat';
      this.log('session_started');void this.pump();
    }else if(action==='stop'){
      this.running=false;this.paused=false;this.controller?.abort();this.youtubeAbort?.abort();this.chatStatus='Disconnected';
      clearTimeout(this.playbackTimer);
      for(const j of this.jobs)if(['approval','queued','generating','ready','playing'].includes(j.status))j.status='rejected';
      this.emit('visual',{type:'idle'});this.log('session_stopped');
    }else if(action==='pause')this.paused=true;
    else if(action==='resume'){this.paused=false;void this.pump();}
    else if(action==='reset-budget'){if(this.running||this.busy||this.generation)throw new Error('Stop all generation before resetting the budget');this.spent=0;this.store.write('budget.json',{spent:0});this.log('budget_reset');}
    else throw new Error('Unknown action');
    this.changed();
  }
  receive(c:Comment):{accepted:boolean;reason?:string;id?:string}{
    const s=this.store.settings;this.stats.received++;
    const reject=(reason:string)=>{this.stats.filtered++;this.log('comment_filtered',{reason,authorId:c.authorId});this.changed();return {accepted:false,reason};};
    if(!this.running||this.paused)return reject('paused');
    if(c.text.trim().startsWith('!ok')){
      if(c.moderator){const id=c.text.trim().split(/\s+/)[1];const j=this.jobs.find(j=>j.status==='approval'&&(!id||j.id===id));if(j)this.approve(j.id,true);}
      return {accepted:false,reason:'moderation_command'};
    }
    let text=c.text.trim();if(s.prefix){if(!text.startsWith(s.prefix))return reject('prefix');text=text.slice(s.prefix.length).trim();}
    if([...text].length>120)return reject('too_long');
    const reason=guard(text,s.blockedWords);if(reason)return reject(reason);
    if(this.busy)return reject('creation_in_progress');
    if(this.jobs.filter(j=>['approval','queued','generating','ready','playing'].includes(j.status)).length>=s.maxQueue)return reject('queue_full');
    const now=Date.now();if(now-this.lastAccepted<s.interval*1000)return reject('rate_limit');
    if(now-(this.users.get(c.authorId)??-Infinity)<s.cooldown*1000)return reject('user_cooldown');
    if(this.spent+videoCost(s,this.store.persona())>s.budget)return reject('budget');
    this.lastAccepted=now;this.users.set(c.authorId,now);
    if(this.users.size>5000)for(const [id,time]of this.users)if(now-time>86400000)this.users.delete(id);
    const job:Job={...c,text,author:c.author.slice(0,50),id:randomUUID(),personaId:s.personaId,status:s.approval?'approval':'queued',cost:0};
    this.jobs.push(job);if(this.jobs.length>200)this.jobs=this.jobs.slice(-200);
    this.log('comment_selected',{id:job.id,text,author:job.author});this.changed();void this.pump();return {accepted:true,id:job.id};
  }
  approve(id:string,accept:boolean){const j=this.jobs.find(j=>j.id===id&&['approval','queued'].includes(j.status));if(!j)throw new Error('Pending comment not found');if(accept){const reason=guard(j.text,this.store.settings.blockedWords);if(reason)throw new Error('Comment blocked by updated rules');}j.status=accept?'queued':'rejected';this.changed();void this.pump();}
  private async pump(){
    this.playReady();
    if(this.generation||!this.running||this.paused||this.busy||this.jobs.some(j=>j.status==='ready'))return;
    const job=this.jobs.find(j=>j.status==='queued');if(!job)return;
    this.generation=true;job.status='generating';this.controller=new AbortController();const signal=this.controller.signal;
    const s={...this.store.settings};const p=this.store.persona(job.personaId);
    try{
      assertSafe(job.text,s.blockedWords,'comment');assertSafe([p.appearance,p.world,p.tone,p.systemPrompt,p.forbidden].join('\n'),s.blockedWords);
      if(s.reply){
        const replyStart=Date.now();if(s.replyProvider==='fal'){job.cost=prices.reply;this.charge(prices.reply);}
        job.reply=await this.providers.reply(p,job.text,s,signal);
        this.log('reply_ready',{id:job.id,provider:s.replyProvider,text:job.reply,latencyMs:Date.now()-replyStart});this.changed();
      }
      assertSafe(job.reply||' ',s.blockedWords);
      const clipCost=videoCost(s,p);job.cost+=clipCost;this.charge(clipCost);this.changed();
      const clip=await this.providers.video(p,job.text,job.reply||'',s,false,signal);
      if(signal.aborted||!this.running)throw new Error('Cancelled');
      job.clip=clip;job.status='ready';job.latency=Date.now()-job.receivedAt;this.stats.generated++;
      this.log('clip_ready',{id:job.id,backend:s.backend,latencyMs:job.latency,costEstimateUsd:job.cost,demo:clip.demo});
      this.playReady();
    }catch(e){if(!signal.aborted){job.status='failed';job.error=(e as Error).message;this.stats.failed++;this.log('generation_failed',{id:job.id,error:job.error});}if(!this.jobs.some(j=>j.status==='playing'))this.emit('visual',{type:'idle'});}
    finally{this.generation=false;this.changed();void this.pump();}
  }
  private playReady(){
    if(!this.running||this.paused||this.jobs.some(j=>j.status==='playing'))return;
    const job=this.jobs.find(j=>j.status==='ready');if(!job?.clip)return;
    job.status='playing';this.emit('visual',{type:'play',job});
    this.playbackTimer=setTimeout(()=>this.ended(job.id),job.clip.duration*1000+15000);
  }
  started(id:string){const j=this.jobs.find(j=>j.id===id&&j.status==='playing');if(j&&!j.playbackStartedAt){j.playbackStartedAt=Date.now();this.log('play_started',{id,latencyMs:j.playbackStartedAt-j.receivedAt});this.changed();}}
  ended(id:string){const j=this.jobs.find(j=>j.id===id&&j.status==='playing');if(!j)return;clearTimeout(this.playbackTimer);j.status='done';this.stats.played++;this.log('play_ended',{id});this.emit('visual',{type:'idle'});this.changed();void this.pump();}
  rate(id:string,score:number){const j=this.jobs.find(j=>j.id===id&&j.clip);if(!j||!Number.isInteger(score)||score<1||score>5)throw new Error('Choose a clip and score from 1 to 5');j.rating=score;this.log('consistency_rating',{id,score,demo:j.clip!.demo});this.changed();}
  savePersona(input:Record<string,unknown>,create=false){
    this.ensureEditable();const p:Persona=create?{...structuredClone(this.store.persona()),id:randomUUID().slice(0,8),seed:randomInt(0,2147483647),refs:[],idle:[],voice:undefined,voiceId:undefined,confirmed:false,demo:true}:this.store.persona();
    const previousVoiceDescription=p.voiceDescription,previousStyle=p.style;
    for(const key of ['name','fanName','appearance','world','tone','forbidden','systemPrompt','voiceDescription'] as const)if(key in input){const value=String(input[key]).trim().slice(0,2000);if(value)assertSafe(value,this.store.settings.blockedWords,key==='forbidden'?'generation':'comment');p[key]=value;}
    if('seed' in input){const n=Number(input.seed);if(input.seed===null||String(input.seed).trim()===''||!Number.isInteger(n)||n<0||n>2147483647)throw new Error('Seed must be an integer from 0 to 2147483647');p.seed=n;}
    if(!p.voiceDescription.trim())throw new Error('Voice description is required');
    if(!p.name)throw new Error('A name is required');
    if('style' in input){if(!['anime','photoreal'].includes(String(input.style)))throw new Error('Invalid style');if(p.style!==input.style){p.confirmed=false;p.idle=[];}p.style=input.style as Persona['style'];}
    if(p.voiceDescription!==previousVoiceDescription||p.style!==previousStyle){p.voice=undefined;p.voiceId=undefined;}
    p.adult=true;this.store.savePersona(p);if(create)this.store.saveSettings({...this.store.settings,personaId:p.id});this.changed();return p;
  }
  select(id:string){this.ensureEditable();this.store.persona(id);this.store.saveSettings({...this.store.settings,personaId:id});this.changed();}
  async createAssets(action:string,input:Record<string,unknown>){
    this.ensureEditable();this.busy=action;this.idleCancel=false;const p=this.store.persona();const s=this.store.settings;
    try{
      assertSafe([p.appearance,p.world,p.name,p.tone].join('\n'),s.blockedWords);this.changed();
      if(action==='faces'){
        const description=String(input.description||p.appearance);assertSafe(description,s.blockedWords,'comment');
        const count=Number(input.count??4);if(!Number.isInteger(count)||count<1||count>4)throw new Error('Choose 1 to 4 faces');
        this.candidates=this.candidates.filter(c=>c.personaId!==p.id);
        for(let i=0;i<count;i++){this.charge(s.backend==='fal'?prices.image:0);const url=await this.providers.face(p,description,s);this.candidates.push({id:randomUUID(),url,personaId:p.id,style:p.style,demo:s.backend!=='fal'});this.changed();}
      }else if(action==='adopt'){
        const c=this.candidates.find(c=>c.id===input.id&&c.personaId===p.id&&c.style===p.style);if(!c)throw new Error('Draw new candidates for the selected style');
        if(c.demo && s.backend==='fal')throw new Error('Draw real faces before switching to fal');
        this.charge(s.backend==='fal'?prices.edit*2:0);p.refs=await this.providers.derive(p,c.url,s);p.demo=c.demo;p.confirmed=false;p.idle=[];p.voice=undefined;p.voiceId=undefined;this.store.savePersona(p);
      }else if(action==='confirm'){
        if(p.refs.length!==3||input.adult!==true)throw new Error('Confirm all three images depict the same original adult');p.confirmed=true;this.store.savePersona(p);
      }else if(action==='voice'){
        const text=String(input.text||"Hi, I'm Yui. Welcome, Clovers. It is lovely to see you today.");assertSafe(text,s.blockedWords,'comment');
        if(s.backend!=='fal')throw new Error('Voice generation requires fal. Demo mode has no synthetic voice.');
        this.charge(prices.voice);p.voice=await this.providers.voice(p,text,s);this.store.savePersona(p);
      }else if(action==='idle'){
        if(!p.confirmed)throw new Error('Confirm the reference set first');
        const count=Number(input.count??12);if(!Number.isInteger(count)||count<1||count>24)throw new Error('Choose 1 to 24 clips');
        if(this.spent+count*videoCost(s,p)>s.budget)throw new Error('Idle pool would exceed the remaining session budget');
        const next:Clip[]=[];const actions=['Smile softly toward the camera.','Take a quiet sip of tea.','Adjust the clover hair pin.','Give a small friendly wave.'];
        for(let i=0;i<count&&!this.idleCancel;i++){
          this.busy=`idle ${i+1}/${count}`;this.charge(videoCost(s,p));next.push(await this.providers.video(p,actions[i%4],'',s,true));this.log('idle_clip',{index:i,costEstimateUsd:videoCost(s,p),demo:s.backend==='mock'});this.changed();
        }
        if(next.length){p.idle=next;this.store.savePersona(p);} // Keep the old pool if all generation fails.
      }else throw new Error('Unknown creation action');
      return this.state();
    }finally{this.busy='';this.changed();}
  }
  cancelIdle(){this.idleCancel=true;}
  close(){this.control('stop');}
}
