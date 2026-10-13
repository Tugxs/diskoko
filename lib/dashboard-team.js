import {problem} from './workspace-domain.js';
export const TEAM_TOOLS=['builder','templates','panels','commands','schedules','analytics','settings'];
export function normalizeTeamMembers(members,seats){
 if(!Array.isArray(members) || members.length>Math.max(0,seats-1))throw problem('عدد أعضاء الفريق يتجاوز مقاعد باقتك.');
 const seen=new Set();return members.map(m=>{const id=String(m.discordId || '');if(!/^\d{17,20}$/.test(id) || seen.has(id) || !Array.isArray(m.tools) || m.tools.some(t=>!TEAM_TOOLS.includes(t)))throw problem('راجع معرّفات أعضاء الفريق والأدوات المسموحة.');seen.add(id);return {discordId:id,tools:[...new Set(m.tools)]};});
}
export function teamTool(path){
 if(/tools\/(settings|team|structure\/versions)|bot-settings|bot-connect|disconnect|\/preferences/.test(path))return 'settings';
 if(/analytics/.test(path))return 'analytics';if(/schedules/.test(path))return 'schedules';if(/ready-templates|server-templates|tools\/drafts/.test(path))return 'templates';if(/code-commands|\/commands/.test(path))return 'commands';if(/change-sets|tools\/(delete|structure\/review)/.test(path))return 'builder';if(/panel|standalone|interactive/.test(path))return 'panels';return 'settings';
}
export async function enforceTeamWrite(req,pool,authorizedGuild){
 const path=req.originalUrl.split('?')[0];
 let guild=/^\/api\/(?:workspace|guilds)\/(\d{17,20})/.exec(path)?.[1] || String(req.params.guildId || req.body?.guildId || req.body?.guild_id || req.query?.guildId || '');
 if(/^\/api\/change-sets\/\d+/.test(path))guild=(await pool.query('SELECT guild_id FROM change_sets WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id])).rows[0]?.guild_id || '';
 if(/^\/api\/ai\/requests\/[0-9a-f-]{36}/i.test(path))guild=(await pool.query('SELECT guild_id FROM ai_requests WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id])).rows[0]?.guild_id || '';
 if(!/^\d{17,20}$/.test(guild))return;
 const policy=(await pool.query('SELECT owner_discord_id,members FROM workspace_team_policies WHERE guild_id=$1',[guild])).rows[0];if(!policy || policy.owner_discord_id===String(req.user.discord_id))return;
 if(authorizedGuild && (await authorizedGuild(req.user,guild))?.owner)return;
 const member=(policy.members || []).find(m=>m.discordId===String(req.user.discord_id));
 if(!member?.tools.includes(teamTool(path)))throw problem('مالك السيرفر لم يمنح حسابك تنفيذ التغييرات في هذه الأداة. يمكنك مراجعة البيانات وطلب الصلاحية منه.',403);
}
export async function migrateTeams(pool){await pool.query(`CREATE TABLE IF NOT EXISTS workspace_team_policies(guild_id TEXT PRIMARY KEY,owner_discord_id TEXT NOT NULL,members JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);}
export function mountTeams(app,{pool,requireUser,requireWriteAccess,authorizedGuild,discordBotFetch:discord,entitlementsFor,audit}){
 const path='/api/workspace/:guildId/tools/team';
 const guard=fn=>async(req,res,next)=>{try{const guild=await authorizedGuild(req.user,req.params.guildId);if(!guild)throw problem('السيرفر غير متاح.',403);const server=await discord(`/guilds/${guild.id}`);if(!server.ok || server.data.owner_id!==String(req.user.discord_id))throw problem('إدارة صلاحيات الفريق متاحة لمالك السيرفر فقط.',403);await fn(req,res,guild);}catch(e){next(e);}};
 app.get(path,requireUser,guard(async(req,res,g)=>{const policy=(await pool.query('SELECT members,updated_at FROM workspace_team_policies WHERE guild_id=$1',[g.id])).rows[0];res.json({enabled:Boolean(policy),members:policy?.members || [],seats:entitlementsFor(req.user).teamSeats,tools:TEAM_TOOLS});}));
 app.put(path,requireUser,requireWriteAccess,guard(async(req,res,g)=>{
  if(req.body.confirmed!==true)throw problem('راجع صلاحيات الفريق وأكد حفظها.');const members=normalizeTeamMembers(req.body.members,entitlementsFor(req.user).teamSeats);
  if(members.some(m=>m.discordId===String(req.user.discord_id)))throw problem('مالك السيرفر يملك كل الأدوات؛ لا تضفه ضمن الفريق.');
  for(const m of members){const member=await discord(`/guilds/${g.id}/members/${m.discordId}`);if(!member.ok)throw problem('أحد أعضاء الفريق غير موجود في السيرفر.');}
  if(req.body.enabled===false)await pool.query('DELETE FROM workspace_team_policies WHERE guild_id=$1',[g.id]);
  else await pool.query('INSERT INTO workspace_team_policies(guild_id,owner_discord_id,members) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET owner_discord_id=$2,members=$3,updated_at=NOW()',[g.id,String(req.user.discord_id),JSON.stringify(members)]);
  await audit(req.user.id,'team.permissions','guild',g.id,{enabled:req.body.enabled!==false,count:members.length});res.json({ok:true});
 }));
}
