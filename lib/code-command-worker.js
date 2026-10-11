// Untrusted source executes only inside a fresh WebAssembly QuickJS heap.
// No host callbacks, module loader, environment, network or filesystem are exposed.
import { getQuickJS } from 'quickjs-emscripten';

process.once('message', async ({ source, context }) => {
  let runtime, vm;
  try {
    const engine = await getQuickJS();
    runtime = engine.newRuntime();
    runtime.setMemoryLimit(16 * 1024 * 1024);
    runtime.setMaxStackSize(256 * 1024);
    const deadline = Date.now() + 700;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    vm = runtime.newContext();
    const input = vm.newString(JSON.stringify(context));
    vm.setProp(vm.global, '__input', input);
    input.dispose();
    const result = vm.evalCode(`"use strict";\n${source}\n;JSON.stringify(handle(JSON.parse(__input)))`, 'command.js');
    if (result.error) {
      const detail = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`${detail.name || 'Error'}: ${detail.message || 'Execution failed'}`);
    }
    const output = vm.getString(result.value);
    result.value.dispose();
    if (output.length > 32_000) throw new Error('Output exceeds 32 KB');
    process.send({ output: JSON.parse(output) });
  } catch (error) { process.send({ error: String(error.message).slice(0, 500) }); }
  finally {
    try { vm?.dispose(); runtime?.dispose(); } catch { /* process is discarded */ }
    process.disconnect();
  }
});
