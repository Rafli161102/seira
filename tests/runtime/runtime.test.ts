import assert from 'node:assert';
import test from 'node:test';
import {
  DefaultHostAdapter,
  EffectContext,
  makeBool,
  makeErr,
  makeFloat,
  makeInt,
  makeOk,
  makeSome,
  makeString,
  NoneValue,
  panic,
  ResourceScope,
  RuntimeContext,
  ServiceRegistry,
  setPanicHook,
  UnitValue,
  ValueTag,
} from '../../runtime/index.ts';

test('Runtime Value: constructs tagged values correctly', () => {
  const intVal = makeInt(42);
  assert.strictEqual(intVal.tag, ValueTag.Int);
  assert.strictEqual((intVal as any).value, 42);

  const floatVal = makeFloat(3.14);
  assert.strictEqual(floatVal.tag, ValueTag.Float);

  const boolVal = makeBool(true);
  assert.strictEqual(boolVal.tag, ValueTag.Bool);

  const strVal = makeString('Seira');
  assert.strictEqual(strVal.tag, ValueTag.String);

  const someVal = makeSome(intVal);
  assert.strictEqual(someVal.tag, ValueTag.Option);
  assert.strictEqual((someVal as any).isSome, true);

  assert.strictEqual(NoneValue.tag, ValueTag.Option);
  assert.strictEqual((NoneValue as any).isSome, false);

  const okVal = makeOk(strVal);
  assert.strictEqual(okVal.tag, ValueTag.Result);
  assert.strictEqual((okVal as any).isOk, true);

  const errVal = makeErr(makeString('Disk full'));
  assert.strictEqual(errVal.tag, ValueTag.Result);
  assert.strictEqual((errVal as any).isOk, false);

  assert.strictEqual(UnitValue.tag, ValueTag.Unit);
});

test('Runtime Memory: enforces deterministic LIFO resource cleanup', () => {
  const events: string[] = [];

  const scope = new ResourceScope();
  scope.register({
    dispose: () => events.push('first_cleanup'),
  });
  scope.register({
    dispose: () => events.push('second_cleanup'),
  });

  scope.dispose();

  assert.deepStrictEqual(events, ['second_cleanup', 'first_cleanup']);
});

test('Runtime Memory: runWith helper disposes scope automatically', () => {
  let cleaned = false;
  const result = new ResourceScope().runWith((scope) => {
    scope.register({
      dispose: () => {
        cleaned = true;
      },
    });
    return 'computation_complete';
  });

  assert.strictEqual(result, 'computation_complete');
  assert.strictEqual(cleaned, true);
});

test('Runtime Effects: dispatches effects to registered handlers', async () => {
  const context = new EffectContext();
  context.pushHandler({
    canHandle: (eff) => eff.name === 'log',
    handle: (eff) => makeString(`Logged: ${eff.payload}`),
  });

  const res = await context.perform({ name: 'log', payload: 'Kernel initialized' });
  assert.strictEqual(res.tag, ValueTag.String);
  assert.strictEqual((res as any).value, 'Logged: Kernel initialized');
});

test('Runtime Context: initializes scope and effect environment', () => {
  const ctx = new RuntimeContext({ maxStackDepth: 1024 });
  assert.ok(ctx.getRootScope());
  assert.ok(ctx.getEffectContext());
  assert.strictEqual(ctx.getConfig().maxStackDepth, 1024);
});

test('Runtime Panic: invokes panic hook and throws descriptive error', () => {
  let capturedMessage = '';
  setPanicHook((p) => {
    capturedMessage = p.message;
  });

  assert.throws(
    () => {
      panic({ message: 'Kernel out of memory', file: 'kernel.sra', line: 10, column: 1 });
    },
    /Seira Panic at kernel\.sra:10:1: Kernel out of memory/
  );

  assert.strictEqual(capturedMessage, 'Kernel out of memory');
});

test('Runtime Services: manages service registry and shutdown', async () => {
  const registry = new ServiceRegistry();
  let shutdownCalled = false;

  registry.register({
    serviceName: 'test-service',
    initialize: () => {},
    shutdown: () => {
      shutdownCalled = true;
    },
  });

  assert.ok(registry.get('test-service'));
  await registry.shutdownAll();
  assert.strictEqual(shutdownCalled, true);
  assert.strictEqual(registry.get('test-service'), undefined);
});

test('Runtime Host Adapter: returns valid monotonic nanoseconds', () => {
  const adapter = new DefaultHostAdapter();
  const nanos = adapter.nowNanoseconds();
  assert.ok(typeof nanos === 'bigint');
  assert.ok(nanos > 0n);
});
