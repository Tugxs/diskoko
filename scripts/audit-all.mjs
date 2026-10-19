import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const node = process.execPath;
for (const [name, args] of [
  ['syntax', ['--check', 'server.js']],
  ['workspace syntax', ['--check', 'workspace.js']],
  ['account syntax', ['--check', 'account.js']],
  ['checkout syntax', ['--check', 'checkout.js']],
  ['local AI syntax', ['--check', 'scripts/local-ai-worker.mjs']],
  ['admin panel API syntax',['--check','lib/admin-panel-api.js']],
  ['admin assistant worker syntax',['--check','scripts/admin-ai-worker.mjs']],
  ['admin reply syntax',['--check','lib/admin-reply.js']],
  ['admin panel editor syntax',['--check','admin-panel-editor.js']],
  ['admin panel template syntax',['--check','admin-panel-template.js']],
  ['control center runtime syntax',['--check','lib/control-center-runtime.js']],
  ['control center engine syntax',['--check','lib/control-center-engine.js']],
  ['control center store syntax',['--check','lib/control-center-store.js']],
  ['control center oracle syntax',['--check','lib/control-center-oracle.js']],
  ['control center operations syntax',['--check','lib/control-center-operations.js']],
  ['dhikr content syntax',['--check','lib/control-center-dhikr-content.js']],
  ['control center assets syntax',['--check','lib/control-center-assets.js']],
  ['bot worker syntax',['--check','bot-worker.js']],
  ['code editor syntax', ['--check', 'code-command-editor.js']],
  ['code API syntax', ['--check', 'lib/code-commands.js']],
  ['code sandbox syntax', ['--check', 'lib/code-command-sandbox.js']],
  ['code worker syntax', ['--check', 'lib/code-command-worker.js']],
  ['project API syntax', ['--check', 'lib/code-project-api.js']],
  ['project scheduler syntax', ['--check', 'lib/code-project-scheduler.js']],
  ['project schema syntax', ['--check', 'lib/code-project.js']],
  ['code AI syntax', ['--check', 'scripts/code-ai-worker.mjs']],
  ['admin syntax', ['--check', 'admin-console.20260921.js']],
  ['bot syntax', ['--check', 'discord-bot.js']],
  ['API syntax', ['--check', 'lib/workspace-api.js']],
  ['tests', ['--test', ...readdirSync('tests').filter(name => name.endsWith('.test.js')).map(name => `tests/${name}`)]],
  ['static links', ['scripts/check-static.mjs']],
  ['asset versions', ['scripts/sync-assets.mjs', '--check']],
  ['secret scan', ['scripts/check-secrets.mjs']],
]) {
  process.stdout.write(`\n[${name}]\n`);
  const result = spawnSync(node, args, { stdio: 'inherit', cwd: process.cwd() });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nLocal audit passed. Run npm audit --omit=dev --audit-level=high in CI for current dependency advisories.');
