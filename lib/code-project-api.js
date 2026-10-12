import https from 'node:https';
import crypto from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {PermissionFlagsBits} from 'discord.js';
import {normalizeCodeOutput,} from './code-command-sandbox.js';
import {openProjectSecret} from './code-project-secrets.js';
import {projectLedger} from './code-project-ledger.js';
import {projectDiscord} from './code-project-discord.js';

const key=value=>{
  if(typeof value!=='string' || ['__proto__','constructor','prototype'].includes(value) || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(value))throw new Error('Storage key must contain 1–80 safe characters.');
  return value;
};
export function publicIpv4(ip) {
  const octets=ip.split('.').map(Number);
  if(octets.length!==4 || octets.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b,c]=octets;
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===2))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
}
export async function projectHttp(url,options,origins,signal,credential) {
  const u=new URL(url);
  if(u.protocol!=='https:' || u.username || u.password || u.hash || (u.port && u.port!=='443') || !origins.includes(u.origin))throw new Error('HTTP origin is not explicitly approved for this project.');
  if(!/^[a-zA-Z0-9.-]+$/.test(u.hostname) || u.hostname.length>253)throw new Error('Use a public HTTPS domain.');
  const addresses=await Promise.race([lookup(u.hostname,{family:4,all:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('DNS lookup timed out.')),4000);timer.unref();})]);
  signal?.throwIfAborted();
  if(!addresses.length || addresses.some(item=>!publicIpv4(item.address)))throw new Error('Private and reserved network addresses are blocked.');
  const method=options?.method || 'GET';if(!['GET','POST'].includes(method))throw new Error('HTTP supports GET and POST.');
  const body=options?.json===undefined?null:JSON.stringify(options.json);
  if(body && Buffer.byteLength(body)>8000)throw new Error('HTTP request body exceeds 8 KB.');
  // Pin the verified DNS address; never follow redirects or inherit proxy/host headers.
  return new Promise((resolve,reject)=>{
    const request=https.request(u,{method,family:4,signal,lookup:(_name,_options,callback)=>callback(null,addresses[0].address,4),headers:{Accept:'application/json',...(credential?{Authorization:'Bearer '+credential}:{}),...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},response=>{
      if(response.statusCode>=300 && response.statusCode<400){response.resume();reject(new Error('HTTP redirects are blocked.'));return;}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>16000){response.destroy();reject(new Error('HTTP response exceeds 16 KB.'));}else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{let text=Buffer.concat(chunks).toString('utf8');if(credential)text=text.split(credential).join('[redacted]');let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:response.statusCode,data});});
    });
    request.setTimeout(4000,()=>request.destroy(new Error('HTTP request timed out.')));request.on('error',reject);if(body)request.write(body);request.end();
  });
}

export function createProjectApi({project,client,pool,command,interaction,transport,preview=false,snapshot={}}) {
  const memory=structuredClone(snapshot),effects=[];const ledger=pool?projectLedger(pool):null;
  if(JSON.stringify(memory).length>256000 || Object.keys(memory).length>256)throw new Error('Preview storage is too large.');
  let externalCalls=0;
  async function external(method,fn,signal){
    signal?.throwIfAborted();
    if(++externalCalls>5)throw new Error('Only five external operations are allowed per execution.');
    if(!pool || !interaction.id)throw new Error('An execution identity is required.');
    const effectKey=interaction.id+':'+externalCalls;
    const inserted=await ledger.query("INSERT INTO code_project_effects(command_id,event_key,method,status) VALUES($1,$2,$3,'started') ON CONFLICT DO NOTHING RETURNING event_key",[command.id,effectKey,method]);
    if(!inserted.rows.length)throw new Error('This operation was already attempted; automatic retries are blocked. Check the execution log.');
    try{signal?.throwIfAborted();const result=await fn();await ledger.query("UPDATE code_project_effects SET status='completed',result=$3 WHERE command_id=$1 AND event_key=$2",[command.id,effectKey,JSON.stringify(result)]);return result;}
    catch(error){await ledger.query("UPDATE code_project_effects SET status='failed',error=$3 WHERE command_id=$1 AND event_key=$2",[command.id,effectKey,String(error.message).slice(0,400)]).catch(()=>{});throw error;}
  }
  const permitted=cap=>{if(!project.permissions.includes(cap))throw new Error('Permission is not declared in the project: '+cap);};
  const manager=permission=>{
    if(preview)return;
    if(!interaction?.memberPermissions?.has(permission))throw new Error('The invoking member lacks permission for this operation.');
  };
  const guild=interaction?.guild;
  const rest=()=>transport || projectDiscord(guild?.client);
  const id=value=>{if(typeof value!=='string' || !/^\d{17,20}$/.test(value))throw new Error('Invalid Discord identifier.');return value;};
  async function channel(value){const target=await guild.channels.fetch(id(value));if(!target || target.guildId!==command.guild_id)throw new Error('Channel is outside this project guild.');return target;}
  async function channelPermission(target,permission){const actor=await guild.members.fetch(interaction.user.id);if(!target.permissionsFor(actor)?.has(PermissionFlagsBits.ViewChannel | permission))throw new Error('The invoking member lacks access or permission in this channel.');}
  return {effects,memory,async call(method,args,signal){
    signal?.throwIfAborted();
    if(!args || typeof args!=='object' || Array.isArray(args))throw new Error('Invalid SDK arguments.');
    if(method==='random'){if(!Number.isInteger(args.max) || args.max<1 || args.max>1000000000)throw new Error('Random upper bound must be 1–1000000000.');return crypto.randomInt(args.max);}
    if(method==='hash'){if(typeof args.value!=='string' || args.value.length>8000)throw new Error('Hash input exceeds 8 KB.');return crypto.createHash('sha256').update(args.value).digest('hex');}
    if(['discord.read.channels','discord.read.roles'].includes(method)){
      permitted('discord.read');manager(PermissionFlagsBits.ManageGuild);
      if(preview){effects.push({method});return project.preview?.[method.endsWith('channels')?'channels':'roles'] || [];}
      const values=method.endsWith('channels')?await guild.channels.fetch():await guild.roles.fetch();
      const actor=method.endsWith('channels')?await guild.members.fetch(interaction.user.id):null;
      return [...values.values()].filter(item=>item && (!actor || item.permissionsFor(actor)?.has(PermissionFlagsBits.ViewChannel))).slice(0,200).map(item=>({id:item.id,name:item.name,...(method.endsWith('channels')?{type:item.type,parentId:item.parentId}:{position:item.position,color:item.color})}));
    }
    if(method.startsWith('storage.')){
      permitted('storage');const name=key(args.key);
      if(preview){
        if(method==='storage.get')return memory[name] ?? null;
        if(method==='storage.delete'){delete memory[name];return true;}
        if(method==='storage.set'){if(args.value===undefined || JSON.stringify(args.value).length>8000)throw new Error('Storage value exceeds 8 KB.');const next={...memory,[name]:args.value};if(JSON.stringify(next).length>256000 || Object.keys(next).length>256)throw new Error('Project storage exceeds 256 KB or 256 keys.');memory[name]=args.value;return true;}
      }else{
        if(method==='storage.get')return (await client.query('SELECT value FROM code_project_data WHERE command_id=$1 AND key=$2',[command.id,name])).rows[0]?.value ?? null;
        if(method==='storage.delete'){await client.query('DELETE FROM code_project_data WHERE command_id=$1 AND key=$2',[command.id,name]);return true;}
        if(method==='storage.set'){
          if(args.value===undefined || JSON.stringify(args.value).length>8000)throw new Error('Storage value exceeds 8 KB.');
          const all=(await client.query('SELECT key,value FROM code_project_data WHERE command_id=$1',[command.id])).rows;
          const next=Object.fromEntries(all.map(item=>[item.key,item.value]));next[name]=args.value;
          if(Object.keys(next).length>256 || JSON.stringify(next).length>256000)throw new Error('Project storage exceeds 256 KB or 256 keys.');
          signal?.throwIfAborted();await client.query('INSERT INTO code_project_data(command_id,key,value) VALUES($1,$2,$3) ON CONFLICT(command_id,key) DO UPDATE SET value=EXCLUDED.value',[command.id,name,JSON.stringify(args.value)]);return true;
        }
      }
      throw new Error('Unknown storage operation.');
    }
    if(method==='http'){
      permitted('http');const u=new URL(args.url);if(u.protocol!=='https:' || !project.origins.includes(u.origin))throw new Error('HTTP origin is not approved.');
      if(preview){effects.push({method,url:args.url});return project.preview?.http || {status:200,data:{preview:true}};}
      let credential;
      if(args.options?.credential){const name=key(args.options.credential);const secret=(await client.query('SELECT origin,encrypted FROM code_project_secrets WHERE command_id=$1 AND name=$2',[command.id,name])).rows[0];if(!secret || secret.origin!==u.origin)throw new Error('Credential is missing or belongs to another origin.');credential=openProjectSecret(secret.encrypted);}
      return external(method,()=>projectHttp(args.url,args.options,project.origins,signal,credential),signal);
    }
    if(method==='schedule'){
      permitted('schedule');manager(PermissionFlagsBits.ManageGuild);id(args.channelId);
      if(!Number.isInteger(args.seconds) || args.seconds<10 || args.seconds>604800 || !/^[a-zA-Z0-9_-]{1,32}$/.test(args.action) || args.data===undefined || JSON.stringify(args.data).length>4000)throw new Error('Schedule supports 10 seconds–7 days, a safe action id and up to 4 KB data.');
      if(preview){effects.push({method,...args});return {id:'preview-job'};}
      const target=await channel(args.channelId);if(!target.isTextBased())throw new Error('Scheduled output requires a text channel.');
      await channelPermission(target,target.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages);
      const count=(await client.query("SELECT COUNT(*)::int AS total FROM code_project_jobs WHERE command_id=$1 AND status='pending'",[command.id])).rows[0]?.total || 0;
      if(count>=20)throw new Error('This project has 20 pending jobs.');
      const daily=(await client.query("SELECT COUNT(*)::int AS total FROM code_project_jobs WHERE command_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[command.id])).rows[0]?.total || 0;if(daily>=100)throw new Error('Daily limit is 100 scheduled jobs per project.');
      signal?.throwIfAborted();const job=crypto.randomUUID();await client.query("INSERT INTO code_project_jobs(id,command_id,revision,user_id,channel_id,event,run_at) VALUES($1,$2,$3,$4,$5,$6,NOW()+make_interval(secs=>$7))",[job,command.id,command.active_revision,interaction.user.id,args.channelId,JSON.stringify({type:'schedule',action:args.action,data:args.data}),args.seconds]);return {id:job};
    }
    if(method==='discord.send'){
      permitted('discord.send');manager(PermissionFlagsBits.ManageGuild);id(args.channelId);
      const message=normalizeCodeOutput({message:args.message}).message;
      if(message.controls.length)throw new Error('SDK channel messages currently support content and embeds; return interactive controls from handle.');
      if(preview){effects.push({method,channelId:args.channelId,message});return {id:'preview-message'};}
      const target=await channel(args.channelId);if(!target.isTextBased() || typeof target.send!=='function')throw new Error('Choose a message channel.');
      await channelPermission(target,target.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages);
      return external(method,async()=>{const nonce=crypto.createHash('sha256').update(interaction.id+':'+externalCalls).digest('hex').slice(0,24);const sent=await rest().post('/channels/'+target.id+'/messages',{signal,body:{content:message.content,embeds:message.embeds,allowed_mentions:{parse:[]},nonce,enforce_nonce:true}});return {id:sent.id};},signal);
    }
    if(['discord.roles.add','discord.roles.remove'].includes(method)){
      permitted('discord.roles');manager(PermissionFlagsBits.ManageRoles);id(args.userId);id(args.roleId);
      if(preview){effects.push({method,...args});return true;}
      const role=await guild.roles.fetch(args.roleId),actor=await guild.members.fetch(interaction.user.id),member=await guild.members.fetch(args.userId);
      if(!role || role.guild.id!==command.guild_id || role.managed || role.id===guild.id || role.permissions.has(PermissionFlagsBits.Administrator) || (role.permissions.bitfield & ~actor.permissions.bitfield)!==0n || (interaction.user.id!==guild.ownerId && (role.position>=actor.roles.highest.position || (member.id!==actor.id && member.roles.highest.position>=actor.roles.highest.position))))throw new Error('Role is managed, privileged or above the invoking member.');
      return external(method,async()=>{await rest()[method.endsWith('.add')?'put':'delete']('/guilds/'+guild.id+'/members/'+member.id+'/roles/'+role.id,{signal,reason:'Diskoko developer project'});return true;},signal);
    }
    if(['discord.channels.create','discord.channels.update'].includes(method)){
      permitted('discord.channels');manager(PermissionFlagsBits.ManageChannels);
      const options=args.options;if(!options || typeof options.name!=='string' || !options.name.trim() || options.name.length>100)throw new Error('Channel name is required and limited to 100 characters.');
      if(Object.keys(options).some(k=>!['name','type','topic','parentId'].includes(k)))throw new Error('Unsupported channel option. Access overwrites must be configured through the server settings; they are not silently ignored.');
      const clean={name:options.name,...(options.topic===undefined?{}:{topic:String(options.topic).slice(0,1024)})};
      if(method.endsWith('.create')){if(![0,2,4].includes(options.type))throw new Error('Channel type must be 0, 2 or 4.');clean.type=options.type;}
      if(options.parentId!==undefined){if(options.parentId!==null){id(options.parentId);if(!preview){const parent=await channel(options.parentId);if(parent.type!==4)throw new Error('Parent must be a category in this guild.');await channelPermission(parent,PermissionFlagsBits.ManageChannels);}}clean.parent=options.parentId;}
      if(preview){effects.push({method,...args});return {id:'preview-channel',name:clean.name};}
      if(method.endsWith('.create')){
        const channels=await guild.channels.fetch();const existing=channels.find(c=>c && c.name===clean.name && c.type===clean.type && (c.parentId || null)===(clean.parent || null));
        if(existing)return {id:existing.id,name:existing.name,existing:true};
      }
      return external(method,async()=>{
        if(method.endsWith('.create')){
          const signature=crypto.createHash('sha256').update(JSON.stringify([clean.name,clean.type,clean.parent || null])).digest('hex');
          const claimed=(await ledger.query("INSERT INTO code_project_channel_claims(guild_id,signature,command_id,status) VALUES($1,$2,$3,'started') ON CONFLICT DO NOTHING RETURNING signature",[command.guild_id,signature,command.id])).rows;
          if(!claimed.length)throw new Error('This channel creation was already attempted. Review its result before trying again.');
          const {parent,...definition}=clean;signal?.throwIfAborted();
          let created;
          try{created=await rest().post('/guilds/'+guild.id+'/channels',{signal,body:{...definition,...(parent===undefined?{}:{parent_id:parent})},reason:'Diskoko developer project'});}
          catch(error){if((error.status>=400 && error.status<500 && error.status!==408) || error.name==='RateLimitError')await ledger.query('DELETE FROM code_project_channel_claims WHERE guild_id=$1 AND signature=$2 AND command_id=$3',[command.guild_id,signature,command.id]);throw error;}
          await ledger.query("UPDATE code_project_channel_claims SET status='completed',channel_id=$3 WHERE guild_id=$1 AND signature=$2",[command.guild_id,signature,created.id]);
          return {id:created.id,name:created.name};
        }
        const target=await channel(args.channelId),{parent,...definition}=clean;await channelPermission(target,PermissionFlagsBits.ManageChannels);signal?.throwIfAborted();const result=await rest().patch('/channels/'+target.id,{signal,body:{...definition,...(parent===undefined?{}:{parent_id:parent})},reason:'Diskoko developer project'});return {id:result.id,name:result.name};
      },signal);
    }
    throw new Error('Unsupported SDK operation.');
  }};
}
