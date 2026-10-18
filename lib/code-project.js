export const PROJECT_LIMIT = 128_000;
const permissions = new Set(['storage', 'discord.read', 'discord.send', 'discord.roles', 'discord.channels', 'http', 'schedule', 'admin']);
export function parseCodeProject(source) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > PROJECT_LIMIT) throw new Error('Project source exceeds 128 KB.');
  if (!source.trimStart().startsWith('{')) return null;
  let project;
  try { project = JSON.parse(source); } catch { throw new Error('Invalid project JSON.'); }
  if (project.format !== 'diskoko-project@1') throw new Error('Unsupported project format.');
  if (!project.files || Array.isArray(project.files) || typeof project.files !== 'object') throw new Error('Project files are required.');
  const names = Object.keys(project.files);
  if (!names.length || names.length > 20) throw new Error('A project supports 1–20 files.');
  for (const name of names) {
    if(name==='__entry.js')throw new Error('Reserved project filename.');
    if(name.endsWith('.json'))JSON.parse(project.files[name]);
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(js|json)$/.test(name) || typeof project.files[name] !== 'string') throw new Error('Use relative .js or .json project filenames without traversal.');
  }
  if (!names.includes(project.entry) || !project.entry.endsWith('.js')) throw new Error('Choose an existing .js entry file.');
  const grants = project.permissions || [];
  if (!Array.isArray(grants) || grants.length > 8 || grants.some(p => !permissions.has(p)) || new Set(grants).size !== grants.length) throw new Error('Unsupported or duplicate project permissions.');
  const origins = project.origins || [];
  if (!Array.isArray(origins) || origins.length > 5) throw new Error('Up to five HTTPS origins are supported.');
  for (const origin of origins) {
    const u = new URL(origin);
    if (u.protocol !== 'https:' || u.origin !== origin || u.username || u.password) throw new Error('Declare exact HTTPS origins without paths.');
  }
  const inputOptions=project.options || [];
  if(!Array.isArray(inputOptions) || inputOptions.length>10)throw new Error('A command supports up to ten slash options.');
  const used=new Set();
  const options=inputOptions.map(o=>{
    if(!o || !/^[-_\p{L}\p{N}]{1,32}$/u.test(o.name) || o.name!==o.name.toLowerCase() || used.has(o.name) || typeof o.description!=='string' || !o.description.trim() || o.description.length>100 || ![3,4,5,6,7,8,10].includes(o.type))throw new Error('Invalid slash option name, description or type.');
    used.add(o.name);
    return {name:o.name,description:o.description,type:o.type,required:o.required===true};
  });
  // Discord requires required options before optional options.
  options.sort((a,b)=>Number(b.required)-Number(a.required));
  const preview=project.preview || {};
  if(typeof preview!=='object' || Array.isArray(preview) || JSON.stringify(preview).length>8000)throw new Error('Preview fixtures must be an object up to 8 KB.');
  return {format:project.format, entry:project.entry, files:project.files, permissions:grants, origins,options,preview};
}
export const previewOptions=project=>Object.fromEntries((project?.options || []).map(o=>[o.name,o.type===3?'Test':o.type===5?true:[4,10].includes(o.type)?1:'100000000000000001']));

// These helpers run inside QuickJS. Only the narrow JSON RPC function is hosted.
export const projectSdk = `
const rpc = (method, args) => globalThis.__diskokoCall(method, JSON.stringify(args));
export const storage = Object.freeze({
  get: key => rpc('storage.get', {key}),
  set: (key, value) => rpc('storage.set', {key, value}),
  delete: key => rpc('storage.delete', {key})
});
export const discord = Object.freeze({
  listChannels: () => rpc('discord.read.channels', {}),
  listRoles: () => rpc('discord.read.roles', {}),
  send: (channelId, message) => rpc('discord.send', {channelId, message}),
  addRole: (userId, roleId) => rpc('discord.roles.add', {userId, roleId}),
  removeRole: (userId, roleId) => rpc('discord.roles.remove', {userId, roleId}),
  createChannel: options => rpc('discord.channels.create', {options}),
  updateChannel: (channelId, options) => rpc('discord.channels.update', {channelId, options})
});
export const admin = Object.freeze({
 center:args=>rpc('admin.center',args),authority:()=>rpc('admin.authority',{}),overview:()=>rpc('admin.overview',{}),resources:(kind,page=0)=>rpc('admin.resources',{kind,page}),logs:()=>rpc('admin.logs',{}),review:operation=>rpc('admin.review',{operation}),apply:reviewId=>rpc('admin.apply',{reviewId}),publish:(channelId,design)=>rpc('admin.publish',{channelId,design}),startReply:(minutes,channelId)=>rpc('admin.reply.start',{minutes,channelId}),stopReply:()=>rpc('admin.reply.stop',{})
});
export const http = Object.freeze({request: (url, options = {}) => rpc('http', {url, options})});
export const schedule = Object.freeze({after: (seconds, channelId, action, data = {}) => rpc('schedule', {seconds, channelId, action, data})});
export const utils = Object.freeze({
  randomInt: max => rpc('random', {max}),
  sha256: value => rpc('hash', {value}),
  unique: values => [...new Set(values)],
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  pick: values => values.length ? values[Math.floor(Math.random() * values.length)] : null
});
`;

export const exampleProject = JSON.stringify({
  format:'diskoko-project@1', entry:'index.js', permissions:['storage'], origins:[], files:{
    'index.js':`import { storage } from 'diskoko';
import { card } from './design.js';
export async function handle(ctx) {
  const participants = await storage.get('participants') || [];
  if (ctx.event.action === 'join' && !participants.includes(ctx.user.id)) {
    participants.push(ctx.user.id);
    await storage.set('participants', participants);
  }
  console.log('Participants:', participants.length);
  return { message: card(ctx, participants) };
}`,
    'design.js':`export function card(ctx, participants) {
  return {
    embeds: [{ title: '🎁 Giveaway', description: 'Participants: ' + participants.length, color: 9138415 }],
    controls: [{ type: 'button', label: participants.includes(ctx.user.id) ? 'Registered' : 'Join', action: 'join', style: 1 }]
  };
}`
  }
}, null, 2);
