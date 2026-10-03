import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction, HIRWithStmt } from '../../../compiler/index.ts';

test('HIR Resource: with block lowers into canonical HIRWithStmt with cleanup contract', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_resource() {
      with res = open_resource("db_conn") {
        let x = 10;
      }
    }
  `;

  const res = driver.compile(source, 'res.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'test_resource'
  ) as HIRFunction;
  const withStmt = fnItem.body.statements[0] as HIRWithStmt;

  assert.strictEqual(withStmt.kind, 'HIRWithStmt');
  assert.strictEqual(withStmt.cleanupContract, 'close');
  assert.strictEqual(withStmt.aliasName, 'res');
  assert.ok(withStmt.body.statements.length >= 1);
});

test('HIR Resource: nested with blocks maintain strict hierarchical nesting', () => {
  const driver = new CompilerDriver();
  const source = `
    fn nested() {
      with r1 = open_resource("res1") {
        with r2 = open_resource("res2") {
          let done = true;
        }
      }
    }
  `;

  const res = driver.compile(source, 'nested.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'nested'
  ) as HIRFunction;
  const outerWith = fnItem.body.statements[0] as HIRWithStmt;
  assert.strictEqual(outerWith.kind, 'HIRWithStmt');

  const innerWith = outerWith.body.statements[0] as HIRWithStmt;
  assert.strictEqual(innerWith.kind, 'HIRWithStmt');
});
