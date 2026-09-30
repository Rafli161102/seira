/**
 * Seira Mid-Level Intermediate Representation (MIR)
 *
 * ARCHITECTURAL SKELETON — NOT IMPLEMENTED
 *
 * Responsibilities:
 * - Control Flow Graph (CFG) representation with Basic Blocks
 * - Explicit values and Static Single Assignment (SSA) form
 * - Deterministic resource operations (acquire/release for `with` blocks)
 * - Control flow terminators (Branch, CondBranch, Return, Panic)
 * - Dead code elimination and optimization passes
 *
 * Milestone: Planned for Development Series.
 */

import type { HIRProgram } from '../hir/index.ts';

export type BasicBlockId = number;
export type ValueId = number;

export interface MIRValue {
  readonly id: ValueId;
  readonly typeName: string;
}

export interface MIROperation {
  readonly op: string;
  readonly dest?: ValueId;
  readonly operands: ReadonlyArray<ValueId>;
}

export interface MIRResourceOp {
  readonly action: 'acquire' | 'release';
  readonly resourceId: ValueId;
}

export type MIRTerminator =
  | { readonly kind: 'Return'; readonly value?: ValueId }
  | { readonly kind: 'Branch'; readonly target: BasicBlockId }
  | { readonly kind: 'CondBranch'; readonly condition: ValueId; readonly trueTarget: BasicBlockId; readonly falseTarget: BasicBlockId }
  | { readonly kind: 'Panic'; readonly message: string };

export interface BasicBlock {
  readonly id: BasicBlockId;
  readonly operations: ReadonlyArray<MIROperation>;
  readonly resourceOps: ReadonlyArray<MIRResourceOp>;
  readonly terminator: MIRTerminator;
}

export interface MIRFunction {
  readonly name: string;
  readonly blocks: ReadonlyArray<BasicBlock>;
}

export interface MIRModule {
  readonly name: string;
  readonly functions: ReadonlyArray<MIRFunction>;
}

export class MIRBuilder {
  public build(hir: HIRProgram): MIRModule {
    return {
      name: 'root',
      functions: [],
    };
  }
}
