import { setTimeout as delay } from 'node:timers/promises';
import type { Comment } from './domain.js';

export class YouTubeChat {
  polls=0; units=0; interval=0;
  constructor(private receive:(c:Comment)=>void,private status:(s:string)=>void){}
  async run(videoId:string,signal:AbortSignal):Promise<void> {
    const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error('Set YOUTUBE_API_KEY in .env');
    const get=async(route:string,params:Record<string,string>)=>{
      const res=await fetch('https://www.googleapis.com/youtube/v3/'+route+'?'+new URLSearchParams({...params,key}),{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
      if(!res.ok)throw new Error(`YouTube API error (${res.status})`);return res.json() as Promise<any>;
    };
    const video=await get('videos',{part:'liveStreamingDetails',id:videoId});this.units++;
    const chatId=video.items?.[0]?.liveStreamingDetails?.activeLiveChatId;if(!chatId)throw new Error('This video has no active live chat');
    let page='';let first=true;const seen=new Set<string>();
    while(!signal.aborted){
      // Conservative local estimate; excludes usage by other clients/projects.
      if(this.units+5>10000)throw new Error('Local daily YouTube quota estimate reached');
      const data=await get('liveChat/messages',{part:'snippet,authorDetails',liveChatId:chatId,maxResults:'200',...(page?{pageToken:page}:{})});
      this.polls++;this.units+=5;this.interval=Math.max(1000,Number(data.pollingIntervalMillis)||5000);
      for(const item of data.items??[]){
        if(seen.has(item.id))continue;seen.add(item.id);
        if(!first && item.snippet?.type==='textMessageEvent')this.receive({text:item.snippet.displayMessage,author:item.authorDetails.displayName,authorId:item.authorDetails.channelId,receivedAt:Date.now(),moderator:item.authorDetails.isChatModerator||item.authorDetails.isChatOwner});
      }
      if(seen.size>3000){const tail=[...seen].slice(-1000);seen.clear();tail.forEach(x=>seen.add(x));}
      first=false;page=data.nextPageToken;this.status('Connected');await delay(this.interval,undefined,{signal});
    }
  }
}
