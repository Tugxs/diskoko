import fs from 'node:fs';
import path from 'node:path';
import { knowledgeCorpus, corpusHash, defaultIndexPath } from './ai-semantic-knowledge.mjs';
const endpoint=process.env.AI_EMBEDDING_URL || 'http://127.0.0.1:11437';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(endpoint).hostname))throw Error('Embedding must remain local');
const vectors=[];
for(const item of knowledgeCorpus){
  const response=await fetch(`${endpoint}/v1/embeddings`,{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify({input:item.text,model:'Qwen3-Embedding-0.6B-Q8_0.gguf'})});
  if(!response.ok)throw Error(`Embedding failed: ${response.status}`);
  const vector=(await response.json()).data?.[0]?.embedding;
  if(!Array.isArray(vector)||!vector.length||!vector.every(Number.isFinite))throw Error('Invalid embedding');
  vectors.push(vector);
  if(vectors.length%20===0)console.log(`Indexed ${vectors.length}/${knowledgeCorpus.length} public knowledge records`);
}
fs.mkdirSync(path.dirname(defaultIndexPath),{recursive:true});
fs.writeFileSync(defaultIndexPath,JSON.stringify({corpusHash,vectors}));
console.log(`Public capability index ready: ${vectors.length} records; no customer data stored.`);
