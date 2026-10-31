import assert from 'node:assert';
import test from 'node:test';
import {
  CompilerDriver,
  CompilerStage,
  HIRValidator,
  createCleanupContractId,
} from '../../../compiler/index.ts';
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

  // Validate that default 'close' contract is completely valid
  const validator = new HIRValidator();
  const valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);
});

test('HIR Resource: non-close cleanup contracts can be represented and validated', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_custom() {
      with res = open_resource("custom") {
        let y = 20;
      }
    }
  `;

  const res = driver.compile(source, 'custom.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'test_custom'
  ) as HIRFunction;
  const withStmt = fnItem.body.statements[0] as HIRWithStmt;

  // Test custom string cleanup contract (e.g. 'dispose')
  (withStmt as any).cleanupContract = 'dispose';
  const validator = new HIRValidator();
  let valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);

  // Test canonical semantic identity CleanupContractId (e.g. 'contract:Resource::release')
  const contractId = createCleanupContractId('Resource', 'release');
  assert.strictEqual(contractId, 'cleanup:Resource::release');
  (withStmt as any).cleanupContract = contractId;

  valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);
});

test('HIR Resource: invalid or missing cleanup metadata is rejected by validator', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_invalid() {
      with res = open_resource("res") {
        let z = 30;
      }
    }
  `;

  const res = driver.compile(source, 'inv.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'test_invalid'
  ) as HIRFunction;
  const withStmt = fnItem.body.statements[0] as HIRWithStmt;

  const validator = new HIRValidator();

  // Test empty cleanupContract
  (withStmt as any).cleanupContract = '';
  let valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e: string) => e.includes('missing or invalid cleanupContract metadata')));

  // Test whitespace-only cleanupContract
  (withStmt as any).cleanupContract = '   ';
  valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e: string) => e.includes('missing or invalid cleanupContract metadata')));

  // Test undefined cleanupContract
  (withStmt as any).cleanupContract = undefined;
  valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e: string) => e.includes('missing or invalid cleanupContract metadata')));
});

test('HIR Resource: nested with blocks maintain strict LIFO cleanup order without MIR CFG', () => {
  const driver = new CompilerDriver();
  const source = `
    fn nested() {
      with r1 = open_resource("res1") {
        with r2 = open_resource("res2") {
          with r3 = open_resource("res3") {
            let done = true;
          }
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
  assert.strictEqual(outerWith.aliasName, 'r1');

  const middleWith = outerWith.body.statements[0] as HIRWithStmt;
  assert.strictEqual(middleWith.kind, 'HIRWithStmt');
  assert.strictEqual(middleWith.aliasName, 'r2');

  const innerWith = middleWith.body.statements[0] as HIRWithStmt;
  assert.strictEqual(innerWith.kind, 'HIRWithStmt');
  assert.strictEqual(innerWith.aliasName, 'r3');

  // Verify LIFO order of unwinding:
  // Acquisition order: r1 -> r2 -> r3
  // Semantic cleanup order (guaranteed by lexical block scope unwinding): r3 -> r2 -> r1
  const acquisitionOrder = [outerWith.aliasName, middleWith.aliasName, innerWith.aliasName];
  assert.deepStrictEqual(acquisitionOrder, ['r1', 'r2', 'r3']);

  const cleanupOrder = [innerWith.aliasName, middleWith.aliasName, outerWith.aliasName];
  assert.deepStrictEqual(cleanupOrder, ['r3', 'r2', 'r1']);

  const validator = new HIRValidator();
  const valRes = validator.validate(res.hir);
  assert.strictEqual(valRes.success, true);
  assert.strictEqual(valRes.errors.length, 0);
});
