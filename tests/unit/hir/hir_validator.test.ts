import assert from 'node:assert';
import test from 'node:test';
import {
  CompilerDriver,
  CompilerStage,
  fromSource,
  HIRValidator,
  HIR_UNKNOWN_TYPE,
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

test('HIR Validator: complete production HIR must not contain Unknown types', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_valid() -> Int { 42 }
  `;
  const res = driver.compile(source, 'prod.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  // Validate complete production HIR passes
  const prodValidator = new HIRValidator({ mode: 'production' });
  const initialRes = prodValidator.validate(res.hir);
  assert.strictEqual(initialRes.success, true);
  assert.strictEqual(initialRes.errors.length, 0);

  // Introduce HIR_UNKNOWN_TYPE on return type
  const fnItem = res.hir.topLevelItems[0] as any;
  fnItem.returnType = HIR_UNKNOWN_TYPE;

  const rejectedRes = prodValidator.validate(res.hir);
  assert.strictEqual(rejectedRes.success, false);
  assert.ok(
    rejectedRes.errors.some((e: string) =>
      e.includes("forbidden Unknown returnType")
    )
  );
});

test('HIR Validator: partial/tooling mode permits Unknown types for IDE/recovery', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_tooling() -> Int { 42 }
  `;
  const res = driver.compile(source, 'tooling.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  // Introduce HIR_UNKNOWN_TYPE on the expression inside statement
  const fnItem = res.hir.topLevelItems[0] as any;
  const exprStmt = fnItem.body.statements[0] as any;
  exprStmt.expr.type = HIR_UNKNOWN_TYPE;

  // Tooling mode validator permits Unknown
  const toolingValidator = new HIRValidator({ mode: 'tooling' });
  const toolingRes = toolingValidator.validate(res.hir);
  assert.strictEqual(toolingRes.success, true);
  assert.strictEqual(toolingRes.errors.length, 0);

  // But default production validator rejects it
  const defaultValidator = new HIRValidator();
  const defaultRes = defaultValidator.validate(res.hir);
  assert.strictEqual(defaultRes.success, false);
  assert.ok(
    defaultRes.errors.some((e: string) =>
      e.includes("forbidden Unknown type")
    )
  );
});

test('HIR Validator: missing type information cannot silently pass production validation', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_missing(x: Int) -> Int {
      let y = x + 1;
      y
    }
  `;
  const res = driver.compile(source, 'missing.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as any;
  const letStmt = fnItem.body.statements[0] as any;

  // Case 1: type is completely missing (undefined)
  const originalType = letStmt.type;
  delete letStmt.type;

  const validator = new HIRValidator();
  let valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e: string) => e.includes('lacks a valid attached HIRType')));

  // Case 2: type is silently set to Unknown
  letStmt.type = HIR_UNKNOWN_TYPE;
  valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, false);
  assert.ok(
    valRes.errors.some((e: string) =>
      e.includes("forbidden Unknown type")
    )
  );

  // Restore and verify it passes again
  letStmt.type = originalType;
  valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);
});

