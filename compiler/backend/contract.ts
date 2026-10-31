import { validateMIR, type MIRModule } from '../mir/index.ts';

export const SEIRA_BACKEND_ABI_VERSION = '0.1.0' as const;

export type BackendObjectFormat = 'elf' | 'macho' | 'coff' | 'wasm';
export type BackendEndianness = 'little' | 'big';

export interface BackendDataLayout {
  readonly pointerWidth: 32 | 64;
  readonly endianness: BackendEndianness;
  readonly maxAlignment: number;
  readonly integerWidths: ReadonlyArray<8 | 16 | 32 | 64>;
}

export interface BackendRuntimeABI {
  readonly version: string;
  readonly entrySymbol: string;
  readonly panicSymbol: string;
  readonly allocateSymbol: string;
  readonly deallocateSymbol: string;
  readonly resourceCleanupSymbol: string;
  readonly ioWriteSymbol: string;
}

export interface BackendTargetContract {
  readonly abiVersion: string;
  readonly target: 'native' | 'wasm32';
  readonly triple: string;
  readonly objectFormat: BackendObjectFormat;
  readonly callingConvention: string;
  readonly dataLayout: BackendDataLayout;
  readonly runtime: BackendRuntimeABI;
  readonly capabilities: ReadonlyArray<string>;
}

export interface BackendContractIssue {
  readonly code: 'E9002' | 'E9003';
  readonly message: string;
}

export interface BackendRequestValidation {
  readonly success: boolean;
  readonly issues: ReadonlyArray<BackendContractIssue>;
}

/** Validates an explicit target/ABI description without selecting a real target ABI. */
export function validateBackendContract(contract: BackendTargetContract): BackendRequestValidation {
  const issues: BackendContractIssue[] = [];
  const add = (message: string): void => { issues.push({ code: 'E9002', message }); };

  if (contract.abiVersion !== SEIRA_BACKEND_ABI_VERSION) {
    add(`Unsupported backend ABI version '${contract.abiVersion}'; expected '${SEIRA_BACKEND_ABI_VERSION}'.`);
  }
  if (!contract.triple.trim()) add('Target triple must not be empty.');
  if (!contract.callingConvention.trim()) add('Calling convention must not be empty.');

  const layout = contract.dataLayout;
  if (!Number.isInteger(layout.maxAlignment) || layout.maxAlignment <= 0 || (layout.maxAlignment & (layout.maxAlignment - 1)) !== 0) {
    add('Maximum data alignment must be a positive integer power of two.');
  }
  if (layout.integerWidths.length === 0) add('At least one integer width must be declared.');
  if (layout.integerWidths.some((width) => ![8, 16, 32, 64].includes(width))) {
    add('Integer widths must be one of 8, 16, 32, or 64 bits.');
  }
  if (!['elf', 'macho', 'coff', 'wasm'].includes(contract.objectFormat)) {
    add('Object format must be one of elf, macho, coff, or wasm.');
  }
  if (!['little', 'big'].includes(layout.endianness)) {
    add('Data endianness must be little or big.');
  }
  if (new Set(layout.integerWidths).size !== layout.integerWidths.length) {
    add('Integer widths must not contain duplicates.');
  }

  if (contract.target === 'wasm32') {
    if (layout.pointerWidth !== 32) add('wasm32 target contracts must use a 32-bit pointer width.');
    if (contract.objectFormat !== 'wasm') add('wasm32 target contracts must use the wasm object format.');
    if (layout.endianness !== 'little') add('wasm32 target contracts must use little-endian data layout.');
    if (!contract.triple.startsWith('wasm32')) add('wasm32 target triple must start with wasm32.');
  } else if (contract.target === 'native') {
    if (layout.pointerWidth !== 32 && layout.pointerWidth !== 64) {
      add('Native target pointer width must be 32 or 64.');
    }
    if (contract.objectFormat === 'wasm') add('Native target contracts cannot use the wasm object format.');
    if (contract.triple.startsWith('wasm32')) add('Native target triple cannot use the wasm32 architecture.');
  } else {
    add('Backend target must be native or wasm32.');
  }

  if (contract.runtime.version !== contract.abiVersion) {
    add('Runtime ABI version must match the backend ABI version.');
  }
  const runtimeSymbols = [
    contract.runtime.entrySymbol,
    contract.runtime.panicSymbol,
    contract.runtime.allocateSymbol,
    contract.runtime.deallocateSymbol,
    contract.runtime.resourceCleanupSymbol,
    contract.runtime.ioWriteSymbol,
  ];
  if (runtimeSymbols.some((symbol) => !symbol.trim())) {
    add('All required runtime ABI symbols must be non-empty.');
  }
  if (new Set(runtimeSymbols).size !== runtimeSymbols.length) {
    add('Runtime ABI symbols must be unique.');
  }
  if (contract.capabilities.some((capability) => !capability.trim())) {
    add('Target capability names must be non-empty.');
  }
  if (new Set(contract.capabilities).size !== contract.capabilities.length) {
    add('Target capability names must be unique.');
  }

  return { success: issues.length === 0, issues };
}

/**
 * Validates both the explicit target contract and the MIR input before any
 * emitter is invoked. The MIR verifier remains the authority for CFG validity.
 */
export function validateBackendRequest(
  module: MIRModule,
  contract: BackendTargetContract,
): BackendRequestValidation {
  const contractResult = validateBackendContract(contract);
  const issues = [...contractResult.issues];
  const mirResult = validateMIR(module);
  for (const error of mirResult.errors) {
    issues.push({ code: 'E9003', message: `Invalid MIR input: ${error}` });
  }
  return { success: issues.length === 0, issues };
}
