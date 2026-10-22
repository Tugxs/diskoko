// Synthetic discord.js caches only. Never logs in or connects to Discord.
import {Client,GatewayIntentBits} from 'discord.js';
import fs from 'node:fs/promises';
const clients=[],samples=[],base=process.memoryUsage().rss;
try{
 for(let i=0;i<25;i++){
  const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages]});clients.push(client);
  // Library internals are used only to seed a disposable benchmark fixture.
  const guild=client.guilds._add({id:String(100000000000000000n+BigInt(i)),name:'Synthetic capacity guild',roles:[],channels:[],emojis:[],features:[],member_count:1000,unavailable:false});
  for(let j=0;j<1000;j++)guild.members._add({user:{id:String(200000000000000000n+BigInt(j)),username:'Fixture '+j,discriminator:'0',avatar:null},roles:[],joined_at:'2026-01-01T00:00:00Z',deaf:false,mute:false});
  if([0,4,9,24].includes(i)){global.gc?.();samples.push({bots:i+1,membersPerBot:1000,heapMiB:Math.round(process.memoryUsage().heapUsed/1048576),rssMiB:Math.round(process.memoryUsage().rss/1048576),rssDeltaMiB:Math.round((process.memoryUsage().rss-base)/1048576)});}
 }
 await fs.writeFile('step9-cache-local.json',JSON.stringify({node:process.version,platform:process.platform,scope:'Synthetic idle discord.js caches, no WebSocket/REST/events. Lower bound only, not connected bot capacity.',samples},null,2));console.log(samples);
}finally{await Promise.all(clients.map(c=>c.destroy()));}
