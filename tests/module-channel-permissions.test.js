import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits as P} from 'discord.js';
import {moduleCanPost,moduleChannelPermissions} from '../lib/module-channel-permissions.js';
const base=P.ViewChannel|P.SendMessages|P.EmbedLinks|P.ReadMessageHistory;
const row=(id,type,allow=0n,deny=0n)=>({id,type,allow:String(allow),deny:String(deny)});
test('module posting respects channel denies and role/member precedence',()=>{
  const channel={permission_overwrites:[row('g',0,0n,P.SendMessages)]};
  assert.equal(moduleCanPost(base,'g','bot',['r'],channel),false);
  channel.permission_overwrites.push(row('r',0,P.SendMessages));
  assert.equal(moduleCanPost(base,'g','bot',['r'],channel),true);
  channel.permission_overwrites.push(row('bot',1,0n,P.ViewChannel));
  assert.equal(moduleCanPost(base,'g','bot',['r'],channel),false);
  assert.equal(moduleCanPost(base|P.Administrator,'g','bot',['r'],channel),true);
});
test('role allows aggregate after denies and unrelated members never grant access',()=>{
  const channel={permission_overwrites:[row('r1',0,0n,P.SendMessages),row('r2',0,P.SendMessages),row('other',1,P.Administrator)]};
  assert.equal(moduleCanPost(base,'g','bot',['r1','r2'],channel),true);
  assert.equal(moduleChannelPermissions(base,'g','bot',['r1'],channel)&P.Administrator,0n);
  assert.equal(moduleCanPost(base,'g','bot',['r1'],channel),false);
});
