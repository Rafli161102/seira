import assert from 'node:assert';
import test from 'node:test';
import { fromSource, HIRValidator } from '../../../compiler/index.ts';

test('HIR Architecture Boundary: validator strictly rejects low-level IR constructs', () => {
  const leakedHir: any = {
    kind: 'HIRProgram',
    id: 1,
    version: '0.0.4-s',
    modules: [],
    source: fromSource({ start: 0, end: 10, line: 1, column: 1 }),
    topLevelItems: [
      {
        kind: 'HIRFunction',
        id: 2,
        functionId: 'fn:leak',
        symbolId: 'sym:leak',
        name: 'leak',
        params: [],
        returnType: { id: 'type:Unit', kind: 'Primitive', name: 'Unit' },
        isEffectful: false,
        effects: [],
        genericParams: [],
        basicBlocks: [1, 2, 3], // Banned low-level IR construct
        cfg: {},                // Banned low-level IR construct
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
  const valRes = validator.validate(leakedHir);
  assert.strictEqual(valRes.success, false);
  assert.ok(valRes.errors.some((e) => e.includes('Architecture Boundary Violation')));
  assert.ok(valRes.errors.some((e) => e.includes('basicBlocks')));
});
