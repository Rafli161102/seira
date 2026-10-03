import assert from 'node:assert';
import test from 'node:test';
import {
  createFieldId,
  createFunctionId,
  createGenericParamId,
  createImplId,
  createModuleId,
  createNodeId,
  createSymbolId,
  createTraitId,
  createTypeId,
  fromSource,
  fromSynthetic,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  isSynthetic,
  typeToHIRType,
} from '../../../compiler/index.ts';

test('HIR Model: semantic IDs format deterministically', () => {
  assert.strictEqual(createNodeId(42), 42);
  assert.strictEqual(createSymbolId('local', 'x'), 'sym:local:x');
  assert.strictEqual(createSymbolId('local', 'x', 2), 'sym:local:x#2');
  assert.strictEqual(createModuleId('std::io'), 'mod:std::io');
  assert.strictEqual(createFunctionId('Math', 'add'), 'fn:Math::add');
  assert.strictEqual(createFunctionId('', 'main'), 'fn:main');
  assert.strictEqual(createFieldId('Point', 'x'), 'field:Point.x');
  assert.strictEqual(createTypeId('Int'), 'type:Int');
  assert.strictEqual(createTraitId('Reader'), 'trait:Reader');
  assert.strictEqual(createImplId('File', 'Reader'), 'impl:File:Reader');
  assert.strictEqual(createGenericParamId('Container', 'T'), 'gen:Container:T');
});

test('HIR Model: SourceOrigin distinguishes source vs synthetic with reason', () => {
  const span = { start: 10, end: 25, line: 1, column: 11 };
  const sourceOrigin = fromSource(span, 'main.sr');
  assert.strictEqual(sourceOrigin.kind, 'Source');
  assert.strictEqual(sourceOrigin.file, 'main.sr');
  assert.strictEqual(isSynthetic(sourceOrigin), false);

  const synthOrigin = fromSynthetic(span, 'desugared_pipeline', 'main.sr');
  assert.strictEqual(synthOrigin.kind, 'Synthetic');
  assert.strictEqual(synthOrigin.reason, 'desugared_pipeline');
  assert.strictEqual(synthOrigin.parentSpan, span);
  assert.strictEqual(isSynthetic(synthOrigin), true);
});

test('HIR Model: HIRType representations are canonical and ID-bearing', () => {
  assert.strictEqual(HIR_INT_TYPE.kind, 'Primitive');
  assert.strictEqual(HIR_INT_TYPE.id, 'type:Int');
  assert.strictEqual(HIR_STRING_TYPE.id, 'type:String');
  assert.strictEqual(HIR_BOOL_TYPE.id, 'type:Bool');

  const optionType = typeToHIRType({
    kind: 'Option',
    inner: { kind: 'Primitive', name: 'Int' },
  } as any);

  assert.strictEqual(optionType.kind, 'Option');
  assert.strictEqual(optionType.name, 'Option');
  assert.strictEqual(optionType.typeArguments?.length, 1);
  assert.strictEqual(optionType.typeArguments[0].id, 'type:Int');
  assert.strictEqual(optionType.id, 'type:Option<Int>');

  const resultType = typeToHIRType({
    kind: 'Result',
    ok: { kind: 'Primitive', name: 'String' },
    err: { kind: 'Primitive', name: 'Error' },
  } as any);

  assert.strictEqual(resultType.kind, 'Result');
  assert.strictEqual(resultType.typeArguments?.length, 2);
  assert.strictEqual(resultType.typeArguments[0].id, 'type:String');
});
