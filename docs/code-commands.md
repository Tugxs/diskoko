# Developer commands

Commands -> connected public/private bot -> write source or choose a multi-file project -> preview -> save -> explicitly activate.
Every version, secret, storage key, session and operation belongs to one account/guild/bot/command. Source is stored privately in PostgreSQL, with .js/.json upload/download; customer code is never installed in shared bot files.

## Source and modules

Single files export no module: function handle(ctx) or async function handle(ctx).
Projects are JSON documents:

```json
{
  "format": "diskoko-project@1",
  "entry": "index.js",
  "permissions": ["storage"],
  "origins": [],
  "files": {
    "index.js": "import {storage} from 'diskoko'; import {title} from './design.js'; export async function handle(ctx){const count=(await storage.get('count') || 0)+1; await storage.set('count',count); return {message:{embeds:[{title,description:String(count),color:9138415}]}}}",
    "design.js": "export const title='My project';"
  }
}
```

Up to20 .js/.json files and128KB total. Imports resolve only declared relative files or the built-in diskoko SDK. JSON files must contain valid JSON. Compatible ES-module dependencies can be vendored; automatic npm installation, Node/native modules, Python and arbitrary host access are unsupported.
Optional `options` defines up to10slash inputs: `{name,description,type,required}`. Types3/4/5/6/7/8/10 mean string/integer/boolean/user/channel/role/number. Read `ctx.event.options`.

`ctx` contains user{id,name},guild{id,name},event{type,action,values,fields,options,data},state. Types: command/button/select/modal/schedule. ctx.preview distinguishes simulation. Optional project.preview={channels:[],roles:[],http:{status,data}} supplies mocked SDK reads.
Return one message or modal and optional per-user state. Message supports content2000,3rich embeds/6000text total (fields,author,footer,timestamp,HTTPSimages/links) and5buttons/selects/HTTPSlinks. Modals support5fields. Sessions are user-bound and expire after15minutes. Each user interaction replies separately.

## SDK

Import named exports from diskoko. Methods return promises unless documented synchronous.

| API | Permission | Behavior |
| --- | --- | --- |
| storage.get/set/delete | storage | Command-wide data shared across users;256keys/256KBtotal/8KBvalue |
| discord.listChannels/listRoles | discord.read | Up to200 guild metadata records; requires invoking member Manage Server |
| discord.send(channelId,message) | discord.send | Current guild text channel; Manage Server; mentions disabled; no returned controls |
| discord.addRole/removeRole | discord.roles | Manage Roles; no managed/everyone/Administrator roles or grants beyond actor permissions/hierarchy |
| discord.createChannel/updateChannel | discord.channels | Manage Channels; current guild; safe name/topic/parent/type fields only |
| http.request(url,{method,json,credential}) | http | GET/POST to declared exact HTTPS origins; optional encrypted Bearer alias bound to that origin |
| schedule.after(seconds,channelId,action,data) | schedule | Manage Server;10seconds–7days;20pending/100dailyjobs per command |
| utils.randomInt(max),sha256(text) | none | Cryptographic random integer or SHA256 |
| utils.unique/clamp/pick | none | Synchronous JavaScript helpers; pick uses ordinary Math.random |

The bot must also have Discord permissions. Tokens are never exposed to code. HTTP forbids private/reserved IPv4 destinations and redirects, pins verified DNS, accepts no arbitrary headers, supports8KBbodies/16KBresponses and4secondrequest timeouts. IPv6-only destinations are not supported.
Secrets are AES-GCM encrypted using the configured server key; owner-scoped APIs reveal only alias/origin. Secret values do not enter source or ctx. Bearer tokens are injected only into their saved origin.

Scheduled handlers receive type schedule and action/data. They must return messages/embeds without controls/modals. Execution rechecks the actor's membership/Manage Server, current version and bot/guild. Changes or disabling cancel pending jobs. Busy jobs may retry before execution; jobs with uncertain effects never automatically replay.

## Isolation, review and failures

Every execution gets a fresh QuickJS/Wasm context in a disposable process. No Node globals, filesystem, env, native modules or bot credentials. The hosted surface accepts only bounded JSON SDK RPC and rechecks declared capabilities. Constructor attempts remain inside QuickJS.
16MiBWasm heap/256KiBstack/700mscompute deadline excluding SDK wait,2secondplain or20secondSDK outer deadline,64MiBNodeheap. Two active processes maximum per service, one per account/guild/bot.16SDKcalls/5external operations per execution.
Shared command locks serialize state/storage across users and replicas. Durable effect records use a separate max2connection ledger pool to avoid main-pool exhaustion deadlocks. Channel creation claims prevent racing projects from creating the same name/type/parent twice. Uncertain creation requires review; uncertain claims survive source-project deletion and existing Discord channels are checked first. Definite rejected4xxrequests release their claim.

Project Discord writes use a separate REST client with zero automatic retries,5secondtimeout,rate-limit rejection and abort signals. Channel messages carry enforced nonce deduplication. External Discord/HTTP effects are not atomic with database writes and cannot all be rolled back. Read effect status after failures before issuing a new invocation. Disabling a project blocks new executions but cannot undo an external request already sent.
Saving never changes active code. Activation revalidates source and exact command ownership, updates only this command's slash options, and refuses foreign name collisions. Failed definition updates attempt to restore the previous definition. Controls from a different bot/guild/user/version never execute. Three consecutive runtime failures disable a command; busy/cooldown rejections do not count.
Logs capture bounded console output and error file/line hints. Latest100interaction logs are retained. Source has50versions. Delayed jobs and operation records are separately visible. SDK secrets/storage cannot be read by another project's API. Keep runtime packages patched; layered isolation is not an absolute vulnerability guarantee.

## AI and acceptance

AI returns source or a typed project object with an explanation, validated in simulation before delivery. It never saves or activates a draft. Dedicated local worker needs the updated script and a running model. Generation can still fail or require programmer edits; review and actual Discord acceptance remain separate from tests.

Tests cover Wasm modules/async, shared storage isolation, traversal/host-module denial, infinite async loops, HTTP private-network checks, encrypted credentials, member/channel permissions, durable duplicate suppression, scheduled output and editor save/preview gates.
