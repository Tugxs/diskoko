import {REST} from 'discord.js';
const clients=new WeakMap();
export function projectDiscord(client){
  if(!client?.token)throw new Error('The selected Discord bot is unavailable.');
  if(!clients.has(client))clients.set(client,new REST({version:'10',retries:0,timeout:5000,rejectOnRateLimit:()=>true}).setToken(client.token));
  return clients.get(client);
}
