import assert from 'node:assert';
import test from 'node:test';
import {
  EffectContext,
  makeBool,
  makeErr,
  makeFloat,
  makeInt,
  makeOk,
  makeSome,
  makeString,
  NoneValue,
  ResourceScope,
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
