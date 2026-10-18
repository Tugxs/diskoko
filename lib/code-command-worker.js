// Untrusted source executes only inside a fresh WebAssembly QuickJS heap.
// Only declared virtual modules and bounded JSON SDK RPC are exposed; no host objects, credentials or filesystem.
import { getQuickJS } from 'quickjs-emscripten';
import {parseCodeProject,projectSdk} from './code-project.js';

process.once('message', async ({ source, context }) => {
  let runtime, vm, pump; const pending=new Map(),deferreds=[]; let sequence=0;
  try {
    const engine = await getQuickJS();
    runtime = engine.newRuntime();
    runtime.setMemoryLimit(16 * 1024 * 1024);
    runtime.setMaxStackSize(256 * 1024);
    let deadline = Date.now() + 700;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    vm = runtime.newContext();
    async function settle(handle){
      let rejectPump;const failure=new Promise((_,reject)=>{rejectPump=reject;});
      pump=setInterval(()=>{
        if(Date.now()>deadline && !pending.size){rejectPump(new Error('Execution time limit exceeded.'));return;}
        if(runtime.hasPendingJob()){const jobs=runtime.executePendingJobs(100);if(jobs.error){const detail=vm.dump(jobs.error);jobs.error.dispose();rejectPump(new Error(detail.message || 'Pending job failed.'));}}
      },5);
      try{return await Promise.race([vm.resolvePromise(handle),failure]);}finally{clearInterval(pump);pump=null;}
    }
    const input = vm.newString(JSON.stringify(context));
    vm.setProp(vm.global, '__input', input);
    input.dispose();
    const project=parseCodeProject(source);
    let result;
    if(project){
      const call=vm.newFunction('__diskokoCall',(methodHandle,argsHandle)=>{
        const method=vm.getString(methodHandle),args=vm.getString(argsHandle);
        if(++sequence>16 || args.length>64000)throw new Error('Project exceeded its API call budget.');
        const deferred=vm.newPromise();deferreds.push(deferred);pending.set(sequence,{deferred,started:Date.now()});
        process.send({type:'rpc',id:sequence,method,args});return deferred.handle;
      });vm.setProp(vm.global,'__diskokoCall',call);call.dispose();
      process.on('message',message=>{
        if(message.type!=='rpc-result')return;
        const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
        deadline+=Date.now()-item.started;
        const handle=message.error?vm.newError(message.error):vm.unwrapResult(vm.evalCode(`JSON.parse(${JSON.stringify(JSON.stringify(message.value ?? null))})`));
        message.error?item.deferred.reject(handle):item.deferred.resolve(handle);handle.dispose();
      });
      runtime.setModuleLoader(name=>{
        if(name==='diskoko')return projectSdk;
        const content=project.files[name];if(content===undefined)return {error:new Error('External modules must be vendored; missing project module: '+name)};
        return name.endsWith('.json')?'export default '+content+';':content;
      },(base,name)=>{
        if(name==='diskoko')return name;
        if(!name.startsWith('./') && !name.startsWith('../'))return {error:new Error('External modules must be vendored into the project.')};
        const parts=base.split('/');parts.pop();
        for(const part of name.split('/')){if(part==='.' || !part)continue;if(part==='..'){if(!parts.length)return {error:new Error('Import escapes project.')};parts.pop();}else parts.push(part);}
        const path=parts.join('/');if(!Object.hasOwn(project.files,path))return {error:new Error('Missing project module: '+path)};return path;
      });
      vm.unwrapResult(vm.evalCode('globalThis.__logs=[];globalThis.console=Object.freeze({log:(...a)=>{if(__logs.length<40)__logs.push(a.map(x=>String(x)).join(" ").slice(0,300));},warn:(...a)=>console.log(...a),error:(...a)=>console.log(...a)});')).dispose();
      const entry=vm.evalCode(`import {handle} from './${project.entry}'; globalThis.__projectResult=Promise.resolve().then(()=>handle(JSON.parse(__input))).then(value=>JSON.stringify(value));`,'__entry.js',{type:'module'});
      if(entry.error)result=entry;else {
        entry.value.dispose();
        const promise=vm.getProp(vm.global,'__projectResult');
        result=await settle(promise);promise.dispose();
      }
    }else {
      const evaluated=vm.evalCode(`"use strict";\n${source}\n;Promise.resolve().then(()=>handle(JSON.parse(__input))).then(value=>JSON.stringify(value))`, 'command.js');
      if(evaluated.error)result=evaluated;else {
        result=await settle(evaluated.value);evaluated.value.dispose();
      }
    }
    if (result.error) {
      const detail = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`${detail.name || 'Error'}: ${detail.message || 'Execution failed'} ${String(detail.stack || '').slice(0,300)}`);
    }
    const output = vm.getString(result.value);
    result.value.dispose();
    if (output.length > 32_000) throw new Error('Output exceeds 32 KB');
    const logHandle=project?vm.getProp(vm.global,'__logs'):null;
    const rawLogs=logHandle?vm.dump(logHandle):[];const logs=Array.isArray(rawLogs)?rawLogs.slice(0,40).map(item=>String(item).slice(0,300)):[];logHandle?.dispose();
    process.send({ output: JSON.parse(output),logs });
  } catch (error) { process.send({ error: String(error.message).slice(0, 500) }); }
  finally {
    clearInterval(pump);for(const d of deferreds)try{d.dispose();}catch{}
    try { vm?.dispose(); runtime?.dispose(); } catch { /* process is discarded */ }
    process.disconnect();
  }
});
