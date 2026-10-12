import crypto from 'node:crypto';
import { codeSource, runCode, normalizeCodeOutput } from './code-command-sandbox.js';
import { mountCodeAssistant } from './code-command-ai.js';
import {parseCodeProject,exampleProject,previewOptions} from './code-project.js';
import {createProjectApi} from './code-project-api.js';
import {sealProjectSecret} from './code-project-secrets.js';

export const exampleCode = `function handle(ctx) {
  if (ctx.event.action === "feedback") {
    return { modal: { title: "رأيك يهمنا", action: "submit", fields: [{ id: "opinion", label: "اكتب رأيك", paragraph: true }] } };
  }
  if (ctx.event.type === "modal") {
    return { message: { content: "شكرًا لك " + ctx.user.name + "! وصل رأيك: " + ctx.event.fields.opinion } };
  }
  const visits = Number(ctx.state.visits || 0) + 1;
  return {
    state: { visits },
    message: {
      embeds: [{ title: "مرحبًا " + ctx.user.name, description: "هذه زيارتك رقم " + visits, color: 9138415 }],
      controls: [{ type: "button", label: "أرسل رأيك", action: "feedback", style: 1 }]
    }
  };
}`;
export const codeContract = `You are Diskoko programming assistant, exclusively for this command editor. Follow the requested assistant mode. For non-programming requests or unavailable Node/native/Python execution, return current source unchanged with a clear Arabic explanation of the limitation; do not pretend support. For giveaways with multiple prizes and one choice per member, persist one prize choice per user and reject attempts to register for another prize. Explain the change and permissions. For a single file return JSON {source:string,explanation:string}; for a project return JSON {project:object,explanation:string}. Do not encode project JSON inside a source string. Project files are JavaScript source strings., proposing editable code only, never activating it. Single file: function handle(ctx) or async function handle(ctx). Multi-file: project is the object {format:"diskoko-project@1",entry:"index.js",permissions:[],origins:[],files:{"index.js":"export async function handle(ctx){...}","design.js":"..."}}. Use ES modules with relative imports and import {storage,discord,http,schedule,utils} from "diskoko". No Node, filesystem, raw sockets, tokens or automatic npm installation. Compatible dependencies must be vendored as project files. Maximum20files/128KB. Optional project.options contains up to10slashoptions {name,description,type:3|string,4|integer,5|boolean,6|user,7|channel,8|role,10|number,required:boolean}; use numeric type values and access inputs in ctx.event.options[name]. ctx.preview is true for simulated previews. Optional project.preview={channels:[],roles:[],http:{status,data}} supplies mocked API results. ctx={user:{id,name},guild:{id,name},event:{type:'command'|'button'|'select'|'modal'|'schedule',action,values,fields,data,options},state:{}}. Initial command has no action. Return exactly message or modal, optionally state. Message={content:string,embeds:[{title,description,color:number,image:httpsURL,thumbnail:httpsURL}],controls:[{type:'button',label,action,style:1|2|3|4}|{type:'link',label,url:httpsURL}|{type:'select',action,placeholder,options:[{label,value,description}]}]}. Modal={title,action,fields:[{id,label,placeholder,paragraph,required}]}. IDs1–32ASCIIletters/digits/_/-. Max5controls/3embeds/5fields/25options. Per-user state8KB; components15min and private to opener. SDK methods are async: storage.get(key),set(key,value),delete(key), permission storage, shared only within this command256keys/256KBtotal/8KBvalue. discord.listChannels(),listRoles() need discord.read; discord.send(channelId,message) needs discord.send; discord.addRole(userId,roleId),removeRole(userId,roleId) need discord.roles; discord.createChannel({name,type:0|2|4,parentId}),updateChannel(channelId,{name,topic,parentId}) need discord.channels. Discord mutations require current member/bot permissions and role hierarchy; no Administrator grants. http.request(url,{method:'GET'|'POST',json:optional,credential:optionalStoredAlias}) returns {status,data}, requires http and exact HTTPS origins declared in origins. Credentials are separately stored encrypted and bound to an origin; never embed tokens. Private networks/redirects blocked. schedule.after(seconds,channelId,action,data) requires schedule and Manage Server;10seconds–7days,20pending/100dailyjobs. Scheduled handler receives event.type schedule and must return message/embeds without controls/modal. utils.randomInt(max) is cryptographic;utils.sha256(text) hashes;utils.unique/clamp/pick are synchronous. console.log is captured. Max16SDKcalls/5externaleffects per execution. Preview simulates Discord/HTTP/schedule, never actually executes them; HTTP preview returns {status:200,data:{preview:true}}. Explain missing permissions, unsupported capabilities or uncertain external effects. Model output must include complete source without markdown fences. A standalone example: function handle(ctx){return {message:{content:"Hello "+ctx.user.name}}}.` + "\nComplete working two-file SDK reference project object (wrap under project in your response):\n" + exampleProject;

export async function migrateCodeCommands(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS code_commands (
    id UUID PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id TEXT NOT NULL,bot_user_id TEXT NOT NULL,name TEXT NOT NULL,
    description TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,active_revision INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,ephemeral BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(guild_id,bot_user_id,name),
    FOREIGN KEY(guild_id,bot_user_id) REFERENCES customer_bot_registry(guild_id,bot_user_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS code_command_versions (
      command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,revision INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(octet_length(source)<=128000),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(command_id,revision));
    CREATE TABLE IF NOT EXISTS code_command_state (
      command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,discord_user_id TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(command_id,discord_user_id));
    CREATE TABLE IF NOT EXISTS code_command_sessions (
      id UUID PRIMARY KEY,command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,discord_user_id TEXT NOT NULL,actions JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS code_sessions_expiry ON code_command_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS code_command_runs (
      id BIGSERIAL PRIMARY KEY,command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,success BOOLEAN NOT NULL,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS code_command_ai (
      id UUID PRIMARY KEY,owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,guild_id TEXT NOT NULL,
      bot_user_id TEXT NOT NULL,prompt TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
      result JSONB,error TEXT,claimed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE code_command_versions DROP CONSTRAINT IF EXISTS code_command_versions_source_check;
    ALTER TABLE code_command_versions ADD CONSTRAINT code_command_versions_source_check CHECK(octet_length(source)<=128000);
    ALTER TABLE code_command_runs ADD COLUMN IF NOT EXISTS runtime_failure BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE code_command_runs ADD COLUMN IF NOT EXISTS logs JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS code_project_data(command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,key TEXT NOT NULL,value JSONB NOT NULL,PRIMARY KEY(command_id,key));
    CREATE TABLE IF NOT EXISTS code_project_effects(command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,event_key TEXT NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL,result JSONB,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(command_id,event_key));
    CREATE TABLE IF NOT EXISTS code_project_channel_claims(guild_id TEXT NOT NULL,signature TEXT NOT NULL,command_id UUID REFERENCES code_commands(id) ON DELETE SET NULL,status TEXT NOT NULL,channel_id TEXT,PRIMARY KEY(guild_id,signature));
    CREATE TABLE IF NOT EXISTS code_project_secrets(command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,name TEXT NOT NULL,origin TEXT NOT NULL,encrypted TEXT NOT NULL,PRIMARY KEY(command_id,name));
    CREATE TABLE IF NOT EXISTS code_project_jobs(id UUID PRIMARY KEY,command_id UUID REFERENCES code_commands(id) ON DELETE CASCADE,revision INTEGER NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,event JSONB NOT NULL,run_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'pending',error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),claimed_at TIMESTAMPTZ);
    ALTER TABLE code_project_jobs ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS code_jobs_due ON code_project_jobs(run_at) WHERE status='pending';`);
}
const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { if(!error.code && !error.status)Object.assign(error,{status:400,expose:true});next(error); } };
const idPattern = /^[0-9a-f-]{36}$/;
export function codeContext(user, guild, event = { type: 'command' }, state = {}) {
  return { user: { id: String(user.id), name: String(user.username || user.name || 'عضو').slice(0,80) }, guild: { id: String(guild.id), name: String(guild.name || '').slice(0,100) }, event, state };
}
export function mountCodeCommands(app, { pool, requireUser, requireWriteAccess, authorizedGuild, connectedBot, discord, ensurePublicPanelBotRegistry, audit }) {
  async function scope(req) {
    const guild = await authorizedGuild(req.user, String(req.body?.guildId || req.query?.guildId || ''));
    if (!guild) throw bad('لا تملك صلاحية إدارة هذا السيرفر.', 403);
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) throw bad('هذا البوت غير مربوط بالسيرفر.', 404);
    // Public identity must actually be installed; a configured token alone is insufficient.
    const member = await discord(bot.token, `/guilds/${guild.id}`);
    if (!member.ok) throw bad('البوت غير متصل بالسيرفر أو لا يمكن التحقق منه الآن.', 409);
    if (bot.public) await ensurePublicPanelBotRegistry(pool, guild.id, req.user.id);
    const registry = (await pool.query('SELECT owner_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, bot.id])).rows[0];
    if (String(registry?.owner_id) !== String(req.user.id)) throw bad('مساحة الكود خاصة بالحساب الذي ربط البوت بهذا السيرفر.', 403);
    return { guild, bot };
  }
  const base = '/api/ai/bots/:botId/code-commands';
  mountCodeAssistant(app,{pool,requireUser,requireWriteAccess,scope,base,contract:codeContract});
  app.get(base, requireUser, route(async (req, res) => {
    const { guild, bot } = await scope(req);
    const { rows } = await pool.query(`SELECT c.*,v.source FROM code_commands c JOIN code_command_versions v ON v.command_id=c.id AND v.revision=c.revision WHERE owner_id=$1 AND guild_id=$2 AND bot_user_id=$3 ORDER BY c.created_at`, [req.user.id,guild.id,bot.id]);
    res.json({ commands: rows, example: exampleCode, projectExample:exampleProject });
  }));
  app.post(`${base}/test`, requireUser, requireWriteAccess, route(async (req,res) => {
    const { guild, bot } = await scope(req);
    const event = req.body.event || { type:'command' };
    if (JSON.stringify(event).length > 6000 || !['command','button','select','modal','schedule'].includes(event.type)) throw bad('بيانات حدث التجربة غير صالحة.');
    const source=codeSource(req.body.source),project=parseCodeProject(source);event.options ??= previewOptions(project);let logs=[];const sdk=project?createProjectApi({project,preview:true,snapshot:req.body.projectState || {}}):null;
    const output = normalizeCodeOutput(await runCode(source, {...codeContext({ id:'100000000000000001',name:'عضو تجريبي' },guild,event,req.body.state || {}),preview:true}, `${req.user.id}:${guild.id}:${bot.id}`,{...(sdk?{bridge:sdk.call}:{}),onLogs:value=>logs=value}));
    res.json({ output, logs, projectState:sdk?.memory, effects:sdk?.effects || [], permissions:project?.permissions || [], hash: crypto.createHash('sha256').update(source).digest('hex'), discordChanged: false });
  }));
  app.post(base, requireUser, requireWriteAccess, route(async (req,res) => {
    const { guild, bot } = await scope(req), name = String(req.body.name || '').toLowerCase(), description = String(req.body.description || '').trim(), source = codeSource(req.body.source);
    if (!/^[-_\p{L}\p{N}]{1,32}$/u.test(name) || name === 'diskoko' || !description || description.length >100) throw bad('اسم الأمر أو وصفه غير صالح.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`code:${guild.id}:${bot.id}`]);
      const count = (await client.query('SELECT COUNT(*)::int AS total FROM code_commands WHERE guild_id=$1 AND bot_user_id=$2',[guild.id,bot.id])).rows[0]?.total || 0;
      if (count >=10) throw bad('يمكن حفظ حتى 10 أوامر بالكود لكل بوت في السيرفر.');
      const id = crypto.randomUUID();
      await client.query('INSERT INTO code_commands(id,owner_id,guild_id,bot_user_id,name,description,ephemeral) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,req.user.id,guild.id,bot.id,name,description,req.body.ephemeral !== false]);
      await client.query('INSERT INTO code_command_versions(command_id,revision,source) VALUES($1,1,$2)',[id,source]);
      await client.query('COMMIT'); res.status(201).json({id,revision:1});
    } catch(error) { await client.query('ROLLBACK'); if(error.code==='23505')throw bad('يوجد أمر بالكود بهذا الاسم.',409);throw error; } finally {client.release();}
  }));
  app.patch(`${base}/:id`, requireUser, requireWriteAccess, route(async(req,res)=>{
    const {guild,bot}=await scope(req); if(!idPattern.test(req.params.id))throw bad('معرّف غير صالح.');
    const client=await pool.connect();let createdPath=null,updatedPath=null,previousDefinition=null,committed=false;
    try {
      await client.query('BEGIN');
      const c=(await client.query('SELECT * FROM code_commands WHERE id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_user_id=$4 FOR UPDATE',[req.params.id,req.user.id,guild.id,bot.id])).rows[0];
      if(!c)throw bad('الأمر غير موجود في مساحتك.',404);
      if(req.body.revision !== c.revision)throw bad('تغيرت النسخة. حدّث القائمة قبل الحفظ.',409);
      if(req.body.action==='save'){
        const source=codeSource(req.body.source); if(c.revision>=50)throw bad('وصل الأمر إلى 50 نسخة. صدّر نسخه قبل إنشاء أمر جديد.');
        await client.query('INSERT INTO code_command_versions(command_id,revision,source) VALUES($1,$2,$3)',[c.id,c.revision+1,source]);
        await client.query('UPDATE code_commands SET revision=revision+1 WHERE id=$1',[c.id]);
      } else if(req.body.action==='disable') {
        await client.query('UPDATE code_commands SET enabled=FALSE WHERE id=$1',[c.id]);
      } else if(req.body.action==='activate') {
        if(req.body.confirmed!==true)throw bad('راجع الأمر والبوت ثم أكد التفعيل.');
        const version=Number(req.body.version || c.revision);
        const v=(await client.query('SELECT source FROM code_command_versions WHERE command_id=$1 AND revision=$2',[c.id,version])).rows[0];
        if(!v)throw bad('النسخة غير موجودة.');
        const project=parseCodeProject(v.source);const sdk=project?createProjectApi({project,preview:true}):null;
        normalizeCodeOutput(await runCode(v.source,{...codeContext({id:'100000000000000001',name:'عضو تجريبي'},guild,{type:'command',options:previewOptions(project)}),preview:true},`${req.user.id}:${guild.id}:${bot.id}`,sdk?{bridge:sdk.call}:{}));
        const existing=(await client.query('SELECT * FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3',[guild.id,bot.id,c.name])).rows[0];
        if(existing && (existing.response_kind!=='code' || existing.panel_config?.codeId!==c.id))throw bad('هذا الاسم مرتبط بأمر آخر. لن نستبدله.',409);
        const path=`/applications/${bot.id}/guilds/${guild.id}/commands`;
        const remote=await discord(bot.token,path);
        if(!remote.ok || !Array.isArray(remote.data))throw bad('تعذر فحص أوامر Discord.',502);
        const remoteName=remote.data.find(item=>item.name===c.name);
        if(remoteName && (!existing || remoteName.id!==existing.discord_command_id))throw bad('الاسم مستخدم في Discord. لن نستبدل أمرًا موجودًا.',409);
        if(!remoteName){
          const count=(await client.query('SELECT COUNT(*)::int AS total FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2',[guild.id,bot.id])).rows[0]?.total || 0;
          if(!existing && count>=10)throw bad('وصل البوت إلى حد 10 أوامر في هذا السيرفر.');
          const result=await discord(bot.token,path,{method:'POST',body:JSON.stringify({name:c.name,description:c.description,type:1,...(project?.options?.length?{options:project.options}:{})})});
          if(!result.ok || !result.data?.id)throw bad('تعذر تسجيل الأمر. راجع صلاحيات البوت.',502);
          createdPath=`${path}/${result.data.id}`;
          if(existing)await client.query('UPDATE customer_bot_commands SET discord_command_id=$4 WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3',[guild.id,bot.id,c.name,result.data.id]);
          else await client.query("INSERT INTO customer_bot_commands(guild_id,bot_user_id,name,description,response,discord_command_id,ephemeral,response_kind,panel_config) VALUES($1,$2,$3,$4,'code',$5,$6,'code',$7)",[guild.id,bot.id,c.name,c.description,result.data.id,c.ephemeral,JSON.stringify({codeId:c.id,options:project?.options || []})]);
        }
        if(remoteName){
          previousDefinition={name:remoteName.name,description:remoteName.description,options:remoteName.options || []};updatedPath=path+'/'+remoteName.id;
          const edited=await discord(bot.token,updatedPath,{method:'PATCH',body:JSON.stringify({name:c.name,description:c.description,options:project?.options || []})});if(!edited.ok)throw bad('Could not update this command definition in Discord.',502);
        }
        await client.query("UPDATE customer_bot_commands SET panel_config=$4 WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='code'",[guild.id,bot.id,c.name,JSON.stringify({codeId:c.id,options:project?.options || []})]);
        await client.query('UPDATE code_commands SET enabled=TRUE,active_revision=$2 WHERE id=$1',[c.id,version]);
      } else throw bad('عملية غير صالحة.');
      await client.query('COMMIT');committed=true; await audit(req.user.id,`code.command.${req.body.action}`,'guild',guild.id,{botId:bot.id,name:c.name}).catch(error=>console.error('Code command audit failed',error.message));res.json({ok:true});
    } catch(error){await client.query('ROLLBACK').catch(()=>{});if(updatedPath && previousDefinition && !committed)await discord(bot.token,updatedPath,{method:'PATCH',body:JSON.stringify(previousDefinition)}).catch(()=>{});if(createdPath && !committed)await discord(bot.token,createdPath,{method:'DELETE'}).catch(()=>{});throw error;}finally{client.release();}
  }));
  app.get(`${base}/:id/history`,requireUser,route(async(req,res)=>{
    const {guild,bot}=await scope(req);if(!idPattern.test(req.params.id))throw bad('معرّف غير صالح.');
    const c=(await pool.query('SELECT id FROM code_commands WHERE id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_user_id=$4',[req.params.id,req.user.id,guild.id,bot.id])).rows[0];if(!c)throw bad('الأمر غير موجود.',404);
    const versions=(await pool.query('SELECT revision,source,created_at FROM code_command_versions WHERE command_id=$1 ORDER BY revision DESC',[c.id])).rows;
    const runs=(await pool.query('SELECT revision,success,error,logs,created_at FROM code_command_runs WHERE command_id=$1 ORDER BY id DESC LIMIT 20',[c.id])).rows;
    const secrets=(await pool.query('SELECT name,origin FROM code_project_secrets WHERE command_id=$1',[c.id])).rows;
    const jobs=(await pool.query('SELECT id,status,run_at,error FROM code_project_jobs WHERE command_id=$1 ORDER BY created_at DESC LIMIT 20',[c.id])).rows;
    const effects=(await pool.query('SELECT method,status,error,created_at FROM code_project_effects WHERE command_id=$1 ORDER BY created_at DESC LIMIT 20',[c.id])).rows;res.json({versions,runs,secrets,jobs,effects});
  }));
  app.post(`${base}/:id/secrets`,requireUser,requireWriteAccess,route(async(req,res)=>{
    const {guild,bot}=await scope(req);if(!idPattern.test(req.params.id))throw bad('Invalid command identifier.');
    const owned=(await pool.query('SELECT id FROM code_commands WHERE id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_user_id=$4',[req.params.id,req.user.id,guild.id,bot.id])).rows[0];if(!owned)throw bad('Project not found.',404);
    const name=String(req.body.name || '');if(!/^[a-zA-Z0-9_-]{1,40}$/.test(name))throw bad('Use a safe credential name.');
    if(req.body.remove===true){await pool.query('DELETE FROM code_project_secrets WHERE command_id=$1 AND name=$2',[owned.id,name]);return res.json({ok:true});}
    const origin=new URL(req.body.origin);if(origin.protocol!=='https:' || origin.origin!==req.body.origin || typeof req.body.value!=='string' || !req.body.value || req.body.value.length>2000 || /[\r\n]/.test(req.body.value))throw bad('Use an exact HTTPS origin and a token up to 2000 characters.');
    const count=(await pool.query('SELECT COUNT(*)::int AS total FROM code_project_secrets WHERE command_id=$1 AND name<>$2',[owned.id,name])).rows[0]?.total || 0;if(count>=10)throw bad('Up to 10 credentials per project.');
    await pool.query('INSERT INTO code_project_secrets(command_id,name,origin,encrypted) VALUES($1,$2,$3,$4) ON CONFLICT(command_id,name) DO UPDATE SET origin=EXCLUDED.origin,encrypted=EXCLUDED.encrypted',[owned.id,name,origin.origin,sealProjectSecret(req.body.value)]);res.json({ok:true});
  }));
  app.delete(`${base}/:id`,requireUser,requireWriteAccess,route(async(req,res)=>{
    const {guild,bot}=await scope(req);if(req.body.confirmed!==true || !idPattern.test(req.params.id))throw bad('أكد حذف الأمر.');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const c=(await client.query('SELECT * FROM code_commands WHERE id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_user_id=$4 FOR UPDATE',[req.params.id,req.user.id,guild.id,bot.id])).rows[0];if(!c)throw bad('الأمر غير موجود.',404);
      const remote=(await client.query("SELECT discord_command_id FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='code'",[guild.id,bot.id,c.name])).rows[0];
      if(remote){const result=await discord(bot.token,`/applications/${bot.id}/guilds/${guild.id}/commands/${remote.discord_command_id}`,{method:'DELETE'});if(!result.ok && result.status!==404)throw bad('تعذر حذف الأمر من Discord.',502);await client.query("DELETE FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='code'",[guild.id,bot.id,c.name]);}
      await client.query('DELETE FROM code_commands WHERE id=$1',[c.id]);await client.query('COMMIT');res.json({ok:true});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }));
}

export function discordCodePayload(output,sessionId) {
  const customId=action=>`diskoko-code:${sessionId}:${action}`;
  if(output.modal)return {title:output.modal.title,custom_id:customId(output.modal.action),components:output.modal.fields.map(f=>({type:1,components:[{type:4,custom_id:f.id,label:f.label,style:f.paragraph?2:1,required:f.required,...(f.placeholder?{placeholder:f.placeholder}:{})}]}))};
  const m=output.message,components=[];let buttons=[];
  const flush=()=>{if(buttons.length){components.push({type:1,components:buttons});buttons=[];}};
  for(const c of m.controls){if(c.type==='select'){flush();components.push({type:1,components:[{type:3,custom_id:customId(c.action),options:c.options,...(c.placeholder?{placeholder:c.placeholder}:{})}]});}else buttons.push({type:2,style:c.type==='link'?5:c.style,label:c.label,...(c.type==='link'?{url:c.url}:{custom_id:customId(c.action)})});}flush();
  return {content:m.content,embeds:m.embeds,components,allowedMentions:{parse:[]}};
}

export async function handleCodeInteraction(interaction,pool,botId) {
  const component=interaction.customId?.startsWith('diskoko-code:');
  if(!component && !interaction.isChatInputCommand())return false;
  let command,session;
  if(component){
    const [,sessionId,action]=interaction.customId.split(':');if(!idPattern.test(sessionId))return false;
    session=(await pool.query('SELECT s.actions,s.revision AS session_revision,c.* FROM code_command_sessions s JOIN code_commands c ON c.id=s.command_id WHERE s.id=$1 AND c.guild_id=$2 AND c.bot_user_id=$3 AND s.discord_user_id=$4 AND s.expires_at>NOW()',[sessionId,interaction.guildId,botId,interaction.user.id])).rows[0];
    if(!session || !session.actions.some(a=>a.action===action && a.type===(interaction.isModalSubmit()?'modal':interaction.isStringSelectMenu()?'select':'button')) || session.session_revision!==session.active_revision){await interaction.reply({content:'انتهت هذه الواجهة أو أنها تخص مستخدمًا آخر. شغّل الأمر مجددًا.',ephemeral:true});return true;}
    command=session;
  }else command=(await pool.query('SELECT * FROM code_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3',[interaction.guildId,botId,interaction.commandName])).rows[0];
  if(!command)return false;
  if(!command.enabled){await interaction.reply({content:'هذا الأمر متوقف من صاحبه.',ephemeral:true});return true;}
  const client=await pool.connect();let output,runtimeAttempted=false,logs=[],deferTimer,deferPromise;
  try{
    await client.query('BEGIN');
    const current=(await client.query('SELECT enabled,active_revision FROM code_commands WHERE id=$1 FOR SHARE',[command.id])).rows[0];
    if(!current?.enabled || current.active_revision!==command.active_revision)throw new Error('تغيرت النسخة أو توقف الأمر. شغّله مجددًا.');
    const lock=(await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[`code-run:${command.id}`])).rows[0];
    if(!lock?.locked)throw new Error('هناك تنفيذ جارٍ لهذا الأمر. انتظر قليلًا.');
    const saved=(await client.query('SELECT state,updated_at FROM code_command_state WHERE command_id=$1 AND discord_user_id=$2',[command.id,interaction.user.id])).rows[0];
    if(saved && Date.now()-new Date(saved.updated_at).getTime()<2000)throw new Error('انتظر ثانيتين بين عمليتين.');
    const source=(await client.query('SELECT source FROM code_command_versions WHERE command_id=$1 AND revision=$2',[command.id,command.active_revision])).rows[0]?.source;
    const action=component?interaction.customId.split(':')[2]:undefined;
    const event={type:interaction.isChatInputCommand()?'command':interaction.isModalSubmit()?'modal':interaction.isStringSelectMenu()?'select':'button',action,values:interaction.values || [],fields:interaction.isModalSubmit()?Object.fromEntries([...interaction.fields.fields].map(([id,f])=>[id,f.value])):{},options:interaction.isChatInputCommand()?Object.fromEntries((interaction.options?.data || []).map(o=>[o.name,o.value])):{}};
    runtimeAttempted=true;
    const project=parseCodeProject(source);const sdk=project?createProjectApi({project,client,pool,command,interaction}):null;
    if(project)deferTimer=setTimeout(()=>{deferPromise=interaction.deferReply({ephemeral:command.ephemeral}).catch(()=>{});},1400);
    output=normalizeCodeOutput(await runCode(source,{...codeContext(interaction.user,interaction.guild,event,saved?.state || {}),preview:false},`${command.owner_id}:${command.guild_id}:${botId}`,{...(sdk?{bridge:sdk.call}:{}),onLogs:value=>logs=value}));
    clearTimeout(deferTimer);if(deferPromise)await deferPromise;
    const sessionId=crypto.randomUUID(),actions=output.modal?[{action:output.modal.action,type:'modal'}]:output.message.controls.filter(c=>c.action).map(c=>({action:c.action,type:c.type}));
    await client.query('INSERT INTO code_command_sessions(id,command_id,revision,discord_user_id,actions,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL \'15 minutes\')',[sessionId,command.id,command.active_revision,interaction.user.id,JSON.stringify(actions)]);
    if(output.modal){if(interaction.deferred)throw new Error('Project commands must open forms through a returned button, using a simple handler; modal after deferred execution is unsupported.');await interaction.showModal(discordCodePayload(output,sessionId));}
    else if(interaction.deferred)await interaction.editReply(discordCodePayload(output,sessionId));
    else await interaction.reply({...discordCodePayload(output,sessionId),ephemeral:command.ephemeral});
    await client.query('INSERT INTO code_command_state(command_id,discord_user_id,state) VALUES($1,$2,$3) ON CONFLICT(command_id,discord_user_id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[command.id,interaction.user.id,JSON.stringify(output.state ?? saved?.state ?? {})]);
    await client.query('INSERT INTO code_command_runs(command_id,revision,success,logs) VALUES($1,$2,TRUE,$3)',[command.id,command.active_revision,JSON.stringify(logs)]);
    await client.query('COMMIT');
  }catch(error){
    clearTimeout(deferTimer);if(deferPromise)await deferPromise;
    await client.query('ROLLBACK');
    await pool.query('INSERT INTO code_command_runs(command_id,revision,success,error,runtime_failure) VALUES($1,$2,FALSE,$3,$4)',[command.id,command.active_revision,String(error.message).slice(0,500),runtimeAttempted && error.code!=='CODE_BUSY']).catch(()=>{});
    if(runtimeAttempted && error.code!=='CODE_BUSY')await pool.query(`WITH recent AS (SELECT success FROM code_command_runs WHERE command_id=$1 AND revision=$2 AND (success OR runtime_failure) ORDER BY id DESC LIMIT 3)
      UPDATE code_commands SET enabled=FALSE WHERE id=$1 AND active_revision=$2 AND (SELECT COUNT(*) FROM recent)=3 AND NOT EXISTS(SELECT 1 FROM recent WHERE success)`,[command.id,command.active_revision]).catch(()=>{});
    if(interaction.deferred)await interaction.editReply({content:'تعذر تنفيذ المشروع. راجع سجل التنفيذ قبل إعادة المحاولة.',embeds:[],components:[]}).catch(()=>{});
    else if(!interaction.replied)await interaction.reply({content:'تعذر تنفيذ هذا الأمر. سُجل السبب لصاحب الأمر في سجل التجارب.',ephemeral:true}).catch(()=>{});
  }finally{clearTimeout(deferTimer);client.release();}
  // Keep bounded operational data; source versions are retained separately.
  await pool.query('DELETE FROM code_command_sessions WHERE id IN (SELECT id FROM code_command_sessions WHERE expires_at<NOW() LIMIT 100)').catch(()=>{});
  await pool.query('DELETE FROM code_command_runs WHERE command_id=$1 AND id NOT IN (SELECT id FROM code_command_runs WHERE command_id=$1 ORDER BY id DESC LIMIT 100)',[command.id]).catch(()=>{});
  return true;
}
