# Isolated JavaScript commands

Commands page -> choose connected bot -> new code command -> preview -> save -> explicit activation.
Works with the installed Diskoko public bot or a customer bot registered to the account for this guild.

Source files are private database-backed versioned documents, keyed by owner/guild/bot/command UUID.
They are not placed in the shared bot's executable files or public web directory. Upload/download `.js` is supported.
Saved edits do not alter the active revision. Restore a previous source into the editor, preview, save and activate to roll back.

## Runtime contract

Synchronous JavaScript `function handle(ctx)`, supporting ordinary JavaScript computation. No npm packages,
Node globals, network, filesystem, environment variables, timers, or bot tokens. Async functions are not supported.

Input:

```js
ctx = {
  user: { id, name }, guild: { id, name },
  event: { type: 'command' | 'button' | 'select' | 'modal', action, values: [], fields: {} },
  state: {} // private to command and Discord user
}
```

Return `message` or `modal`, optionally `state`. Example:

```js
function handle(ctx) {
  if (ctx.event.action === 'choose') {
    return { message: { content: 'Selected: ' + ctx.event.values[0] } };
  }
  return { message: {
    content: 'Hello ' + ctx.user.name,
    embeds: [{ title: 'My panel', description: 'Welcome', color: 0x8b70ef }],
    controls: [{ type: 'select', action: 'choose', options: [
      { label: 'Support', value: 'support' }, { label: 'Rules', value: 'rules' }
    ] }]
  }};
}
```

Controls: button `{type:'button',label,action,style:1|2|3|4}`, link `{type:'link',label,url:'https://...'}`,
select `{type:'select',action,placeholder,options:[{label,value,description}]}`.

Modal `{modal:{title,action,fields:[{id,label,placeholder,paragraph:true,required:true}]}}`.
Next event contains `fields[id]`. Components expire in 15 minutes and belong to the user who opened them.
Each interaction replies separately; changing existing messages is not supported.

## Boundaries

- New QuickJS WebAssembly runtime inside a disposable child process for every execution. No host functions or module loaders exposed.
- Child environment is empty. 16 MiB QuickJS heap, 256 KiB stack, 700ms interrupt deadline, 2s outer process kill deadline, 64 MiB Node heap limit.
- Two concurrent processes maximum per service process, one execution per account/guild/bot within that service.
- PostgreSQL locks prevent simultaneous execution/state updates for the same command and Discord user across replicas.
- Source <=24 KB, result <=32 KB, user state <=8 KB, 10 code drafts per guild/bot, 50 versions per command.
- Message output is explicitly reconstructed. Mentions are disabled; arbitrary Discord payload fields and effects are not forwarded.
- Components verified against session, guild, bot, user, action type and active version. Disabled commands cannot execute.
- Three consecutive failed runtime executions for the active revision disable that command automatically; the owner can inspect logs, fix and explicitly reactivate it.
- Discord permission checks still apply. The runtime only replies and opens models; role/channel administration and outside integrations are not implemented.
- This is layered isolation, not a guarantee that every engine/OS can never contain a vulnerability. Keep runtime packages patched.
- Source versions and state persist in PostgreSQL. Last 100 execution logs retained. Expired sessions cleaned incrementally.

## AI

AI returns source and explanation into an editable proposal; it never activates code.
Local AI worker polls code generation jobs with the existing worker credential. Separate daily allowance is
20/100/300 requests for starter/growth/business. One pending request per account. Ten-minute stale requests can be retried.
Existing local workers need the updated script, or run `scripts/start-code-ai.ps1` for the dedicated code queue worker.

## Validation

Tests cover real Wasm execution, missing host globals, constructor escape attempts, infinite loops,
memory exhaustion, fresh heaps, component ownership, draft isolation, stale versions, and UI preview/save/activation.
The local Qwen3 model generated a draft that passed the real Wasm command and button previews.
Real Discord guild acceptance remains a separate operational check.
