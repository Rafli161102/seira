import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Control Flow: canonicalizes if and else-if into nested HIRIfExpr', () => {
  const driver = new CompilerDriver();
  const source = `
    fn check_val(x: Int) -> Int {
      if x > 0 {
        1
      } else if x < 0 {
        -1
      } else {
        0
      }
    }
  `;

  const res = driver.compile(source, 'if.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as HIRFunction;
  const stmt = fnItem.body.statements[0] as any;
  const ifExpr = stmt.expr ?? stmt;
  assert.ok(ifExpr);
  assert.strictEqual(ifExpr.kind, 'HIRIfExpr');
  assert.strictEqual(ifExpr.condition.kind, 'HIRBinaryExpr');
  assert.ok(ifExpr.elseBranch);
});

test('HIR Control Flow: canonicalizes loops (while, for, infinite) and break/continue', () => {
  const driver = new CompilerDriver();
  const source = `
    fn loops() {
      let mut i = 0;
      while i < 10 {
        if i == 5 {
          break;
        }
        i = i + 1;
        continue;
      }

      loop {
        break;
      }
    }
  `;

  const res = driver.compile(source, 'loops.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as HIRFunction;
  const stmts = fnItem.body.statements as any[];

  const whileLoop = stmts[1];
  assert.strictEqual(whileLoop.kind, 'HIRLoopStmt');
  assert.strictEqual(whileLoop.loopKind, 'Condition');
  assert.ok(whileLoop.condition);

  const loopBody = whileLoop.body.statements;
  assert.strictEqual(loopBody[2].kind, 'HIRContinueStmt');

  const infLoop = stmts[2];
  assert.strictEqual(infLoop.kind, 'HIRLoopStmt');
  assert.strictEqual(infLoop.loopKind, 'Infinite');
});

test('HIR Control Flow: canonicalizes match with patterns and preserve arm ordering', () => {
  const driver = new CompilerDriver();
  const source = `
    fn match_num(x: Int) -> String {
      match x {
        1 => "one",
        2 => "two",
        _ => "other"
      }
    }
  `;

  const res = driver.compile(source, 'match.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as HIRFunction;
  const stmt = fnItem.body.statements[0] as any;
  const matchExpr = stmt.expr ?? stmt;

  assert.strictEqual(matchExpr.kind, 'HIRMatchExpr');
  assert.strictEqual(matchExpr.arms.length, 3);
  assert.strictEqual(matchExpr.arms[0].pattern.kind, 'HIRLiteralPattern');
  assert.strictEqual(matchExpr.arms[1].pattern.kind, 'HIRLiteralPattern');
  assert.strictEqual(matchExpr.arms[2].pattern.kind, 'HIRWildcardPattern');
});
