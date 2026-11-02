import {Rest} from 'shoukaku';
// Some providers return JSON without Lavalink's status/message fields. Preserve
// HTTP status independently; never retain voice tokens, response bodies or URLs.
export class GuardedLavalinkRest extends Rest {
 async fetch({endpoint,options={}}){
  const url=new URL(this.url+endpoint);
  if(options.params)url.search=new URLSearchParams(options.params).toString();
  const method=(options.method || 'GET').toUpperCase();
  const response=await fetch(url,{method,headers:{Authorization:this.auth,'User-Agent':this.node.manager.options.userAgent,...options.headers},signal:AbortSignal.timeout(this.node.manager.options.restTimeout*1000),...(!['GET','HEAD'].includes(method)&&options.body?{body:JSON.stringify(options.body)}:{})});
  if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   throw Object.assign(new Error(`Audio service HTTP ${response.status}`),{name:'LavalinkHttpError',status:response.status});
  }
  return response.json().catch(()=>undefined);
 }
}
