import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection,ChannelType} from 'discord.js';
import {upsertCommunityPanels} from '../lib/community-panels.js';
import {upsertCommunityGames} from '../lib/community-games.js';
import {upsertAccountPanel} from '../lib/account-panel.js';
import {upsertControlPanel} from '../lib/control-account.js';
import {upsertCustomerLinkPanel} from '../lib/customer-link-panel.js';
import {customerRoleConfig} from '../lib/customer-roles.js';

test('all legacy panel initializers read pre-migrated tables with a DML-only production role',async()=>{
  const previous=process.env.DB_SCHEMA_MODE;process.env.DB_SCHEMA_MODE='external';
  try{
    const guildId=customerRoleConfig().guildId;
    const channel={guildId,isTextBased:()=>true,messages:{}};
    const channels=new Collection([
      ['category',{id:'category',type:ChannelType.GuildCategory,name:'المجتمع'}],
      ['games',{id:'games',parentId:'category',name:'games',type:ChannelType.GuildText}],
      ['voice',{id:'voice',parentId:'category',name:'🎮・game-room',type:ChannelType.GuildVoice}],
    ]);
    const client={channels:{fetch:async()=>channel},guilds:{fetch:async()=>({id:guildId,channels:{fetch:async()=>channels}})}};
    for(const initialize of [upsertCommunityPanels,upsertCommunityGames,upsertAccountPanel,upsertControlPanel,upsertCustomerLinkPanel]){
      let reads=0;
      const pool={query:async sql=>{assert.ok(!/^\s*(CREATE|ALTER|DROP)/i.test(sql),initialize.name+' attempted schema DDL');reads++;throw Error('fixture reached table read');}};
      await assert.rejects(initialize(client,pool),/fixture reached table read/);
      assert.equal(reads,1,initialize.name);
    }
  }finally{if(previous===undefined)delete process.env.DB_SCHEMA_MODE;else process.env.DB_SCHEMA_MODE=previous;}
});
