import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { aiCapabilities } from '../lib/ai-capabilities.js';
import { designIdeas } from './ai-design-library.mjs';

export const knowledgeCorpus = [
  ...aiCapabilities.map((item,index)=>({id:`capability-${index}`,text:`${item.title}: ${item.description}`,availability:item.availability,route:item.id})),
  ...designIdeas.map(item=>({id:item.id,text:`${item.titleAr} / ${item.titleEn}; ${item.category}`,availability:item.availability,route:item.route})),
];
export const corpusHash=crypto.createHash('sha256').update(JSON.stringify(knowledgeCorpus)).digest('hex');
export const defaultIndexPath=fileURLToPath(new URL('../outputs/ai-expansion/knowledge-index.json',import.meta.url));
export function cosineSimilarity(left,right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length!==right.length) return -1;
  let dot=0,a=0,b=0;
  for(let i=0;i<left.length;i++){if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))return -1;dot+=left[i]*right[i];a+=left[i]**2;b+=right[i]**2;}
  return a && b ? dot/Math.sqrt(a*b) : -1;
}
export async function semanticCapabilityKnowledge(prompt,{endpoint=process.env.AI_EMBEDDING_URL,indexPath=defaultIndexPath,fetchImpl=fetch}={}) {
  if (!endpoint || !prompt) return '';
  try {
    const url=new URL(endpoint);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return '';
    const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
    if(index.corpusHash!==corpusHash || !Array.isArray(index.vectors) || index.vectors.length!==knowledgeCorpus.length)return '';
    const response=await fetchImpl(`${endpoint.replace(/\/$/,'')}/v1/embeddings`,{method:'POST',signal:AbortSignal.timeout(4000),headers:{'Content-Type':'application/json'},body:JSON.stringify({input:`Instruct: Find relevant Discord service and design capabilities.\nQuery: ${String(prompt).slice(0,1500)}`,model:'Qwen3-Embedding-0.6B-Q8_0.gguf'})});
    if(!response.ok)return '';
    const query=(await response.json()).data?.[0]?.embedding;
    const selected=index.vectors.map((vector,index)=>({item:knowledgeCorpus[index],score:cosineSimilarity(query,vector)})).filter(entry=>entry.score>0.25).sort((a,b)=>b.score-a.score).slice(0,4);
    return selected.length?'Relevant knowledge, not additional execution tools: '+selected.map(({item})=>`${item.text} [route=${item.route}; availability=${item.availability}]`).join('\n'):'';
  } catch {return '';}
}
