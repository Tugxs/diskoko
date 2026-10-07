import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesignScene, applyDesignEdits } from '../ai-design-scene.js';
import { normalizeAiProposal, mountLocalAi } from '../lib/local-ai.js';
import { cosineSimilarity, semanticCapabilityKnowledge } from '../scripts/ai-semantic-knowledge.mjs';

test('design data drops code and remote images, bounds resources and retains Arabic text',()=>{
  const source={width:999999,height:999999,background:'#112233',script:'run()',layers:Array.from({length:100},()=>({type:'image',url:'https://evil.test/image',x:-5,y:800,width:200,height:0,opacity:5,shape:'square',onclick:'execute()'}))};
  const scene=normalizeDesignScene(source);
  assert.equal(scene.width,1200);assert.equal(scene.height,480);assert.equal(scene.layers.length,12);
  assert.equal(scene.layers[0].url,undefined);assert.equal(scene.layers[0].onclick,undefined);
  assert.equal(scene.layers[0].x,0);assert.equal(scene.layers[0].y,99);assert.equal(scene.layers[0].opacity,1);
  const text=normalizeDesignScene({layers:[{type:'text',text:'مرحبًا Welcome',fontSize:10000}]}).layers[0];
  assert.equal(text.text,'مرحبًا Welcome');assert.equal(text.fontSize,96);
});

test('flexible design remains inside a functional ticket proposal',()=>{
  const plan=normalizeAiProposal({interactive:{kind:'tickets',channel:'help',title:'Support',description:'Ask us',designScene:{background:'#112233',layers:[{type:'box',shape:'rounded',color:'#334455'}]}}}).interactive;
  assert.equal(plan.kind,'tickets');assert.equal(plan.designScene.layers[0].shape,'rounded');
});

test('bounded layer edits change one field and never accept executable properties',()=>{
  const previous={background:'#112233',layers:[{type:'text',text:'Welcome',fontSize:36,color:'#ffffff',x:10},{type:'image',shape:'circle',x:60,width:30}]};
  const result=applyDesignEdits(previous,[{op:'set',layer:0,field:'fontSize',value:64},{op:'set',layer:0,field:'code',value:'run()'},{op:'set',layer:1,field:'url',value:'https://external.test'}]);
  assert.equal(result.layers[0].fontSize,64);assert.equal(result.layers[0].text,'Welcome');
  assert.equal(result.layers[1].shape,'circle');assert.equal(result.layers[1].x,60);
  assert.equal(result.layers[0].code,undefined);assert.equal(result.layers[1].url,undefined);
});

test('semantic search stays local and safely falls back on unavailable or stale indexes',async()=>{
  assert.equal(cosineSimilarity([1,0],[1,0]),1);
  assert.equal(cosineSimilarity([NaN],[1]),-1);
  let calls=0;
  assert.equal(await semanticCapabilityKnowledge('support',{endpoint:'https://external.test',fetchImpl:async()=>{calls++;}}),'');
  assert.equal(await semanticCapabilityKnowledge('support',{endpoint:'http://127.0.0.1:11437',indexPath:'missing-index.json',fetchImpl:async()=>{calls++;}}),'');
  assert.equal(calls,0);
});

test('saving a scene preserves tenant, bot and revision boundaries without Discord calls',async()=>{
  for(const scenario of ['allowed','wrong_owner','wrong_bot','stale','published']){
    let save,status,answer,writes=0;
    const item={guild_id:'guild-a',design_bot_id:'bot-a',status:'completed',publication_state:scenario==='published'?'completed':null,proposal:{interactive:{kind:'tickets',title:'Help',description:'Keep me',designRevision:2}}};
    const client={query:async(sql,args)=>{if(sql.startsWith('SELECT guild_id'))return {rows:scenario==='wrong_owner'?[]:[structuredClone(item)]};if(sql.startsWith('UPDATE')){writes++;assert.equal(args[0].interactive.description,'Keep me');}return {rows:[]};},release(){}};
    mountLocalAi({get(){},delete(){},post(path,...handlers){if(path.endsWith('/save-design'))save=handlers.at(-1);}},{pool:{connect:async()=>client},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,designBotForGuild:async()=>scenario==='wrong_bot'?'bot-b':'bot-a'});
    await save({params:{id:'request'},user:{id:'user-a'},body:{revision:scenario==='stale'?1:2,designScene:{layers:[{type:'text',text:'New image'}]}}},{status(code){status=code;return this;},json(value){answer=value;}},error=>{throw error;});
    if(scenario==='allowed'){assert.equal(answer.revision,3);assert.equal(writes,1);}else{assert.ok([404,409].includes(status));assert.equal(writes,0);}
  }
});
