import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomInt } from 'node:crypto';
import { defaults, seedPersona, DEFAULT_VOICE, type Persona, type Settings } from './domain.js';
export class Store {
  settings:Settings;
  constructor(public root:string) {
    fs.mkdirSync(path.join(root,'personas'),{recursive:true}); fs.mkdirSync(path.join(root,'logs'),{recursive:true});
    this.settings=this.read('settings.json',defaults);
    if(!fs.existsSync(this.path('personas/yui/persona.json'))) this.savePersona({...seedPersona,seed:randomInt(0,2147483647)});
    for(const p of this.list()){
      let changed=false;
      if(!Number.isInteger(p.seed)||p.seed<0||p.seed>2147483647){p.seed=randomInt(0,2147483647);changed=true;}
      if(!p.voiceDescription?.trim()){p.voiceDescription=p.style==='anime'?DEFAULT_VOICE:'Original adult female voice, warm clear soft timbre, natural pronunciation, friendly calm delivery.';changed=true;}
      if(changed)this.savePersona(p);
    }
  }
  path(rel:string):string { const p=path.resolve(this.root,rel); if(!p.startsWith(path.resolve(this.root)+path.sep)) throw new Error('Invalid data path'); return p; }
  read<T>(rel:string,fallback:T):T { try {return JSON.parse(fs.readFileSync(this.path(rel),'utf8')) as T;} catch{return structuredClone(fallback);} }
  write(rel:string,value:unknown):void { const f=this.path(rel);fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,f); }
  list():Persona[] {return fs.readdirSync(this.path('personas')).filter(x=>!x.startsWith('_')).map(id=>this.read<Persona|null>(`personas/${id}/persona.json`,null)).filter((p):p is Persona=>!!p);}
  persona(id=this.settings.personaId):Persona { const p=this.list().find(p=>p.id===id);if(!p)throw new Error('Persona not found');return p; }
  savePersona(p:Persona):void {if(!/^[a-z0-9-]{1,64}$/.test(p.id))throw new Error('Invalid persona ID');this.write(`personas/${p.id}/persona.json`,p);}
  saveSettings(s:Settings):void { this.write('settings.json',s);this.settings=s; }
  log(event:string,data:Record<string,unknown>={}):void {fs.appendFileSync(this.path(`logs/${new Date().toISOString().slice(0,10)}.jsonl`),JSON.stringify({time:new Date().toISOString(),event,...data})+'\n');}
  media(rel:string):string { return '/media/'+rel; }
  dataUri(url:string):string { if(!url.startsWith('/media/'))throw new Error('Only generated local assets may be references'); const file=this.path(url.slice(7));const ext=path.extname(file);const mime=ext==='.mp3'?'audio/mpeg':ext==='.webp'?'image/webp':ext==='.jpg'?'image/jpeg':'image/png';return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; }
}
