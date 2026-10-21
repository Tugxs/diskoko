// Bounded service loops: one invocation at a time, observable progress, and an awaitable stop.
const loops = new Map();
export function safeOperationError(error) {
  return {code: /^[A-Z0-9_]{1,40}$/.test(error?.code || '') ? error.code : 'OPERATION_FAILED'};
}
export function serviceLoopStatus() {
  return Object.fromEntries([...loops].map(([name, item]) => [name, {...item}]));
}
export function managedLoop(name, work, {intervalMs, immediate = false, log = console.error} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 10) throw Error('Invalid loop interval');
  let stopped = false, active, timer;
  const state = {running: false, intervalMs, createdAt:new Date().toISOString(), startedAt: null, completedAt: null, failedAt: null, failures: 0};
  loops.set(name, state);
  function tick() {
    if (stopped || active) return active;
    state.running = true; state.startedAt = new Date().toISOString();
    active = Promise.resolve().then(work).then(() => {
      state.completedAt = new Date().toISOString(); state.failures = 0;
    }, error => {
      state.failedAt = new Date().toISOString(); state.failures++;
      log('Service loop failed', {loop: name, ...safeOperationError(error)});
    }).finally(() => { state.running = false; active = null; });
    return active;
  }
  timer = setInterval(() => void tick(), intervalMs); timer.unref();
  if (immediate) void tick();
  const stop = async () => { stopped = true; clearInterval(timer); await active; if(loops.get(name)===state)loops.delete(name); };
  stop.tick = tick;
  stop.state = () => ({...state});
  return stop;
}

export function queueConsumer({claim,execute,concurrency=3,intervalMs=800,log=console.error}) {
  if(!Number.isInteger(concurrency) || concurrency<1 || concurrency>10)throw Error('Invalid consumer concurrency');
  const active=new Set();let stopping=false;
  const poll=managedLoop('queue-poll',async()=>{
    while(!stopping && active.size<concurrency){
      const job=await claim();if(!job)break;
      // A claim already committed before SIGTERM must be executed/drained, never lost or requeued.
      const task=Promise.resolve().then(()=>execute(job)).catch(error=>log('Queue task failed',safeOperationError(error))).finally(()=>active.delete(task));
      active.add(task);
    }
  },{intervalMs,immediate:true,log});
  return {get size(){return active.size;},async stop(){stopping=true;await poll();await Promise.allSettled([...active]);}};
}
