import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRImpl, HIRStruct, HIRTrait } from '../../../compiler/index.ts';

test('HIR Generics & Traits: preserves generic parameters, traits, and impl declarations', () => {
  const driver = new CompilerDriver();
  const source = `
    struct Box<T> {
      value: T
    }

    trait Printable {
      fn to_string() -> String;
    }

    impl Box<Int>: Printable {
      fn to_string() -> String { "Box" }
    }
  `;

  const res = driver.compile(source, 'gen.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  // Struct with generic params
  const structItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRStruct') as HIRStruct;
  assert.ok(structItem);
  assert.strictEqual(structItem.name, 'Box');
  assert.strictEqual(structItem.genericParams.length, 1);
  assert.strictEqual(structItem.genericParams[0].name, 'T');

  // Trait declaration
  const traitItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRTrait') as HIRTrait;
  assert.ok(traitItem);
  assert.strictEqual(traitItem.name, 'Printable');
  assert.strictEqual(traitItem.methods.length, 1);
  assert.strictEqual(traitItem.methods[0].name, 'to_string');

  // Impl declaration
  const implItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRImpl') as HIRImpl;
  assert.ok(implItem);
  assert.strictEqual(implItem.traitId, 'trait:Printable');
  assert.strictEqual(implItem.methods.length, 1);
});
