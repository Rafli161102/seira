import assert from 'node:assert';
import test from 'node:test';
import {
  CompilerDriver,
  CompilerStage,
  fromSource,
  HIRValidator,
} from '../../../compiler/index.ts';
import type { HIRProgram } from '../../../compiler/index.ts';

test('HIR Validator: validates well-formed lowered HIR program successfully', () => {
  const driver = new CompilerDriver();
  const source = `
    fn add(a: Int, b: Int) -> Int { a + b }
    fn main() {
      let r = add(1, 2);
    }
  `;

  const res = driver.compile(source, 'valid.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const validator = new HIRValidator();
  const valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);
});

test('HIR Validator: catches missing or invalid semantic IDs', () => {
  const malformedProgram: any = {
    kind: 'HIRProgram',
    id: 1,
    version: '0.0.4-s',
    modules: [],
    source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
    topLevelItems: [
      {
        kind: 'HIRFunction',
        id: 2,
        functionId: 'invalid-id-without-prefix',
        symbolId: 'invalid-symbol-without-prefix',
        name: 'bad_fn',
        params: [],
        returnType: { id: 'type:Unit', kind: 'Primitive', name: 'Unit' },
        isEffectful: false,
        effects: [],
        genericParams: [],
        body: {
          kind: 'HIRBlock',
          id: 3,
          statements: [],
          source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
        },
        isPublic: false,
        source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
      },
    ],
  };

  const validator = new HIRValidator();
  const valRes = validator.validate(malformedProgram);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e) => e.includes('invalid FunctionId')));
  assert.ok(valRes.errors.some((e) => e.includes('invalid SymbolId')));
});

test('HIR Validator: catches missing type attachment', () => {
  const missingTypeProgram: any = {
    kind: 'HIRProgram',
    id: 1,
    version: '0.0.4-s',
    modules: [],
    source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
    topLevelItems: [
      {
        kind: 'HIRFunction',
        id: 2,
        functionId: 'fn:bad',
        symbolId: 'sym:bad',
        name: 'bad',
        params: [],
        returnType: { id: 'type:Unit', kind: 'Primitive', name: 'Unit' },
        isEffectful: false,
        effects: [],
        genericParams: [],
        body: {
          kind: 'HIRBlock',
          id: 3,
          statements: [],
          resultExpr: {
            kind: 'HIRLiteralExpr',
            id: 4,
            literalKind: 'int',
            value: 42,
            raw: '42',
            source: fromSource({ start: 0, end: 2, line: 1, column: 1 }),
            // type is intentionally missing
          },
          source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
        },
        isPublic: false,
        source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
      },
    ],
  };

  const validator = new HIRValidator();
  const valRes = validator.validate(missingTypeProgram);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e) => e.includes('lacks an attached HIRType')));
});
