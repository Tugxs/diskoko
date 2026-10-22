// Read-only acceptance probes. Never authenticates or sends a Discord mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isPublicStaticPath} from '../lib/public-files.js';

export async function launchCheck({base='https://diskoko.com', fetcher=fetch, pause=()=>new Promise(resolve=>setTimeout(resolve,150))}={}) {
  const origin=new URL(base);
  if(origin.protocol!=='https:' && !(['localhost','127.0.0.1','[::1]'].includes(origin.hostname) && origin.protocol==='http:')) throw Error('HTTPS or a loopback test server is required');
  if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/') throw Error('Use an origin without credentials or a path');
  const checks=[];
  async function probe(route,verify) {
    const started=Date.now();
    try {
      const response=await fetcher(new URL(route,origin),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'*/*'}});
      const body=await response.text();
      const reason=verify(response,body);
      checks.push({route,status:response.status,ok:reason===true,reason:reason===true?undefined:String(reason),elapsedMs:Date.now()-started});
    } catch {checks.push({route,ok:false,reason:'Request failed or timed out',elapsedMs:Date.now()-started});}
    await pause();
  }
  const root=fileURLToPath(new URL('../',import.meta.url));
  for(const name of (await fs.readdir(root)).sort()) {
    if(!/\.(?:html|js|css)$/.test(name) || !isPublicStaticPath('/'+name))continue;
    await probe('/'+name,(r,body)=>{
      if(r.status!==200)return 'Public resource is not available';
      const mime=r.headers.get('content-type') || '';
      const expected=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'javascript';
      if(!mime.includes(expected))return 'Wrong resource type';
      if(!body.trim())return 'Empty resource';
      if(name.endsWith('.html') && (!r.headers.get('content-security-policy') || r.headers.get('x-content-type-options')!=='nosniff'))return 'Security headers missing';
      return true;
    });
  }
  for(const route of ['/api/account/overview','/api/workspace/111111111111111111','/api/projects','/api/reports','/api/ai/bots?guildId=111111111111111111','/api/admin/stats','/api/admin/operations','/api/admin/resource-pressure']) {
    await probe(route,r=>r.status===401 && /no-store/.test(r.headers.get('cache-control')||'') || 'Unauthenticated API must reject access and disable caching');
  }
  for(const route of ['/server.js','/bot-worker.js','/lib/database.js','/.env','/package.json','/docs/launch-work-plan.md','/tests/fixtures.js']) {
    await probe(route,r=>r.status===404 || 'Internal file must not be exposed');
  }
  await probe('/admin',r=>r.status===302 && r.headers.get('location')==='/admin-login' || 'Admin must require authentication');
  await probe('/studio',r=>r.status===302 && r.headers.get('location')==='/account.html#servers' || 'Missing server must lead to server selection');
  for(const route of ['/api/health','/api/operations/health'])await probe(route,(r,body)=>{
    if(r.status!==200)return 'Health probe is not ready';
    try {const value=JSON.parse(body);return value.ok===true && (route!=='/api/health' || value.database==='ready' && value.bot?.online===true) || 'Service, database or public bot is not ready';}catch{return 'Invalid health response';}
  });
  return {checkedAt:new Date().toISOString(),base:origin.origin,scope:'Public GET probes only; no authenticated browser, Discord execution, private-bot or inbox acceptance',ok:checks.every(x=>x.ok),checks};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=await launchCheck({base:process.env.SMOKE_BASE_URL || 'https://diskoko.com'});
  const output=process.argv.find(x=>x.startsWith('--output='))?.slice(9);
  if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`${report.checks.filter(x=>x.ok).length}/${report.checks.length} public launch checks passed`);
  for(const item of report.checks.filter(x=>!x.ok))console.log(`${item.route}: ${item.reason} (${item.status ?? 'network'})`);
  if(!report.ok)process.exitCode=1;
}
