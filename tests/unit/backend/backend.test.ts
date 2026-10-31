import assert from 'node:assert';
import test from 'node:test';
import { DiagnosticBag } from '../../../compiler/diagnostics/index.ts';
import { CompilerBackend } from '../../../compiler/backend/index.ts';
import {
  SEIRA_BACKEND_ABI_VERSION,
  validateBackendContract,
  validateBackendRequest,
  type BackendTargetContract,
} from '../../../compiler/backend/contract.ts';
import type { MIRModule } from '../../../compiler/mir/index.ts';

function nativeContract(): BackendTargetContract {
  return {
    abiVersion: SEIRA_BACKEND_ABI_VERSION,
    target: 'native',
    triple: 'x86_64-unknown-linux-gnu',
    objectFormat: 'elf' as const,
    callingConvention: 'seira-native-test-v1',
    dataLayout: {
      pointerWidth: 64,
      endianness: 'little',
      maxAlignment: 16,
      integerWidths: [8, 16, 32, 64],
    },
    runtime: {
      version: SEIRA_BACKEND_ABI_VERSION,
      entrySymbol: 'seira_test_main',
      panicSymbol: 'seira_test_panic',
      allocateSymbol: 'seira_test_alloc',
      deallocateSymbol: 'seira_test_dealloc',
      resourceCleanupSymbol: 'seira_test_cleanup',
      ioWriteSymbol: 'seira_test_write',
    },
    capabilities: ['integer', 'float', 'aggregate'],
  };
}

function wasmContract(): BackendTargetContract {
  return {
    ...nativeContract(),
    target: 'wasm32',
    triple: 'wasm32-unknown-unknown',
    objectFormat: 'wasm',
    dataLayout: {
      pointerWidth: 32,
      endianness: 'little',
      maxAlignment: 16,
      integerWidths: [8, 16, 32, 64],
    },
  };
}

function invalidMir(): MIRModule {
  return {
    name: 'invalid',
    functions: [{
      name: 'main',
      functionId: 'main',
      parameters: [],
      returnType: { kind: 'Unit' } as any,
      blocks: [],
      entry: 0,
    }],
  };
}

test('Backend contract: accepts structurally valid native and wasm32 target descriptors', () => {
  assert.equal(validateBackendContract(nativeContract()).success, true);
  assert.equal(validateBackendContract(wasmContract()).success, true);
});

test('Backend contract: rejects ABI mismatch, invalid wasm pointer width, and duplicate runtime symbols', () => {
  const invalid = {
    ...wasmContract(),
    abiVersion: '9.9.9',
    objectFormat: 'elf' as const,
    dataLayout: { ...wasmContract().dataLayout, pointerWidth: 64 as const, maxAlignment: 15 },
    runtime: { ...wasmContract().runtime, version: '9.9.9', ioWriteSymbol: 'seira_test_main' },
  };
  const result = validateBackendContract(invalid);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.message.includes('ABI version')));
  assert.ok(result.issues.some((issue) => issue.message.includes('32-bit pointer')));
  assert.ok(result.issues.some((issue) => issue.message.includes('must be unique')));
  assert.ok(result.issues.some((issue) => issue.message.includes('power of two')));
  assert.ok(result.issues.some((issue) => issue.message.includes('wasm32 target contracts must use the wasm object format')));
});

test('Backend request: rejects invalid MIR before any emitter can run', () => {
  const result = validateBackendRequest(invalidMir(), nativeContract());
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === 'E9003'));
});

test('CompilerBackend: reports E9003 for invalid MIR and retains E9001 for valid input', () => {
  const invalidDiagnostics = new DiagnosticBag();
  const invalidResult = new CompilerBackend('native', invalidDiagnostics).emit(invalidMir());
  assert.equal(invalidResult.success, false);
  assert.ok(invalidDiagnostics.getErrors().some((diagnostic) => diagnostic.code === 'E9003'));
  assert.ok(!invalidDiagnostics.getErrors().some((diagnostic) => diagnostic.code === 'E9001'));

  const validDiagnostics = new DiagnosticBag();
  const validResult = new CompilerBackend('native', validDiagnostics).emit({ name: 'empty', functions: [] });
  assert.equal(validResult.success, false);
  assert.ok(validDiagnostics.getErrors().some((diagnostic) => diagnostic.code === 'E9001'));
});
