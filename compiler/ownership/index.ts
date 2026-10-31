/**
 * Seira Ownership & Borrow Analysis over MIR.
 *
 * Resource lifetime events are emitted by HIR-to-MIR lowering. Borrow and
 * explicit ownership opcodes are part of the MIR contract so later language
 * syntax can feed the same checker without reworking the analysis.
 */

import type {
  BasicBlock,
  MIRFunction,
  MIRModule,
  MIROperation,
  MIRResourceOp,
  MIRSource,
  ValueId,
} from '../mir/index.ts';

export interface OwnershipIssue {
  readonly code: 'E7001' | 'E7002' | 'E7003' | 'E7004' | 'E7005' | 'E7006' | 'E7007';
  readonly message: string;
  readonly functionName: string;
  readonly blockId: number;
  readonly valueId?: ValueId;
  readonly source?: MIRSource;
}

export interface OwnershipAnalysisResult {
  readonly success: boolean;
  readonly issues: ReadonlyArray<OwnershipIssue>;
}

type OwnerStatus = 'owned' | 'released' | 'moved' | 'unowned' | 'maybe-owned' | 'unavailable';
type MoveStatus = 'moved' | 'maybe-moved';
type LoanKind = 'shared' | 'mutable';
type LoanStatus = 'active' | 'ended' | 'maybe';

interface LoanState {
  readonly ownerId: ValueId;
  readonly kind: LoanKind;
  readonly status: LoanStatus;
}

interface FlowState {
  readonly owners: Map<ValueId, OwnerStatus>;
  readonly moved: Map<ValueId, MoveStatus>;
  readonly loans: Map<ValueId, LoanState>;
}

function emptyState(): FlowState {
  return { owners: new Map(), moved: new Map(), loans: new Map() };
}

function joinOwner(a: OwnerStatus | undefined, b: OwnerStatus | undefined): OwnerStatus {
  const left = a ?? 'unowned';
  const right = b ?? 'unowned';
  if (left === right) return left;
  if (left === 'owned' || right === 'owned' || left === 'maybe-owned' || right === 'maybe-owned') {
    return 'maybe-owned';
  }
  if ((left === 'unowned' && right === 'released') || (right === 'unowned' && left === 'released') ||
      (left === 'unowned' && right === 'moved') || (right === 'unowned' && left === 'moved')) {
    return 'unowned';
  }
  return 'unavailable';
}

function joinMove(a: MoveStatus | undefined, b: MoveStatus | undefined): MoveStatus | undefined {
  if (a === b) return a;
  if (!a && !b) return undefined;
  return 'maybe-moved';
}

function joinLoan(a: LoanState | undefined, b: LoanState | undefined): LoanState | undefined {
  if (!a && !b) return undefined;
  if (!a || !b) {
    const loan = a ?? b!;
    return { ...loan, status: 'maybe' };
  }
  return {
    ownerId: a.ownerId === b.ownerId ? a.ownerId : Math.min(a.ownerId, b.ownerId),
    kind: a.kind === b.kind ? a.kind : 'mutable',
    status: a.status === b.status && a.ownerId === b.ownerId && a.kind === b.kind ? a.status : 'maybe',
  };
}

function mergeStates(states: ReadonlyArray<FlowState>): FlowState {
  const result = emptyState();
  const ownerIds = new Set(states.flatMap((state) => [...state.owners.keys()]));
  const movedIds = new Set(states.flatMap((state) => [...state.moved.keys()]));
  const loanIds = new Set(states.flatMap((state) => [...state.loans.keys()]));

  for (const id of ownerIds) {
    let status: OwnerStatus | undefined;
    for (const state of states) status = status === undefined ? (state.owners.get(id) ?? 'unowned') : joinOwner(status, state.owners.get(id));
    if (status && status !== 'unowned') result.owners.set(id, status);
  }
  for (const id of movedIds) {
    let status: MoveStatus | undefined;
    for (const state of states) status = joinMove(status, state.moved.get(id));
    if (status) result.moved.set(id, status);
  }
  for (const id of loanIds) {
    let loan: LoanState | undefined;
    for (const state of states) loan = joinLoan(loan, state.loans.get(id));
    if (loan) result.loans.set(id, loan);
  }
  return result;
}

function cloneState(state: FlowState): FlowState {
  return {
    owners: new Map(state.owners),
    moved: new Map(state.moved),
    loans: new Map([...state.loans].map(([id, loan]) => [id, { ...loan }])),
  };
}

function statesEqual(a: FlowState | undefined, b: FlowState): boolean {
  if (!a) return false;
  if (a.owners.size !== b.owners.size || a.moved.size !== b.moved.size || a.loans.size !== b.loans.size) return false;
  for (const [id, value] of b.owners) if (a.owners.get(id) !== value) return false;
  for (const [id, value] of b.moved) if (a.moved.get(id) !== value) return false;
  for (const [id, value] of b.loans) {
    const old = a.loans.get(id);
    if (!old || old.ownerId !== value.ownerId || old.kind !== value.kind || old.status !== value.status) return false;
  }
  return true;
}

function activeLoans(state: FlowState, ownerId: ValueId): Array<[ValueId, LoanState]> {
  return [...state.loans.entries()].filter(([, loan]) =>
    loan.ownerId === ownerId && loan.status !== 'ended'
  );
}

export function analyzeOwnership(module: MIRModule): OwnershipAnalysisResult {
  const issues: OwnershipIssue[] = [];
  const reported = new Set<string>();

  const report = (
    fn: MIRFunction,
    blockId: number,
    code: OwnershipIssue['code'],
    message: string,
    valueId?: ValueId,
    source?: MIRSource,
  ): void => {
    const key = [fn.functionId, blockId, code, valueId ?? '', message].join('|');
    if (reported.has(key)) return;
    reported.add(key);
    issues.push({ code, message, functionName: fn.name, blockId, valueId, source });
  };

  for (const fn of module.functions) {
    const blocks = new Map(fn.blocks.map((block) => [block.id, block]));
    if (!blocks.has(fn.entry)) continue;

    const predecessors = new Map<number, number[]>();
    const successors = new Map<number, number[]>();
    for (const block of fn.blocks) {
      predecessors.set(block.id, []);
      successors.set(block.id, []);
    }
    for (const block of fn.blocks) {
      const term = block.terminator;
      const targets = term.kind === 'Branch' ? [term.target] :
        term.kind === 'CondBranch' ? [term.trueTarget, term.falseTarget] : [];
      for (const target of targets) {
        if (!blocks.has(target)) continue;
        successors.get(block.id)!.push(target);
        predecessors.get(target)!.push(block.id);
      }
    }

    const reachable = new Set<number>();
    const reachWorklist = [fn.entry];
    while (reachWorklist.length) {
      const current = reachWorklist.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const next of successors.get(current) ?? []) reachWorklist.push(next);
    }

    const outgoing = new Map<number, FlowState>();
    const incomingFor = (blockId: number): FlowState | undefined => {
      const states: FlowState[] = [];
      if (blockId === fn.entry) states.push(emptyState());
      for (const pred of predecessors.get(blockId) ?? []) {
        const state = outgoing.get(pred);
        if (state && reachable.has(pred)) states.push(state);
      }
      return states.length ? mergeStates(states) : undefined;
    };

    const transferBlock = (block: BasicBlock, initial: FlowState, collectIssues: boolean): FlowState => {
      const state = cloneState(initial);
      const emitIssue = (
        code: OwnershipIssue['code'],
        message: string,
        valueId?: ValueId,
        source?: MIRSource,
      ): void => {
        if (collectIssues) report(fn, block.id, code, message, valueId, source);
      };

      const processResourceEvent = (event: MIRResourceOp): void => {
        const id = event.resourceId;
        const status = state.owners.get(id) ?? 'unowned';
        if (event.action === 'acquire') {
          if (status === 'owned' || status === 'maybe-owned') {
            emitIssue('E7002', `Resource %${id} is acquired again while its previous ownership may still be live.`, id, event.source);
          } else if (status === 'moved' || status === 'unavailable') {
            emitIssue('E7004', `Resource %${id} cannot be acquired because its ownership was moved or is path-dependent.`, id, event.source);
          }
          state.owners.set(id, 'owned');
          return;
        }

        if (status === 'unowned') {
          emitIssue('E7002', `Resource %${id} is released without a live acquisition.`, id, event.source);
        } else if (status === 'released') {
          emitIssue('E7002', `Resource %${id} is released more than once.`, id, event.source);
        } else if (status === 'moved') {
          emitIssue('E7004', `Resource %${id} is released after ownership was moved.`, id, event.source);
        } else if (status !== 'owned') {
          emitIssue('E7002', `Resource %${id} is not definitely owned on every path before release.`, id, event.source);
        }
        if (activeLoans(state, id).length) {
          emitIssue('E7005', `Resource %${id} cannot be released while one or more borrows are active.`, id, event.source);
        }
        state.owners.set(id, 'released');
      };

      const checkValueUse = (id: ValueId, source: MIRSource | undefined, context: string): void => {
        const loan = state.loans.get(id);
        if (loan) {
          if (loan.status === 'ended') {
            emitIssue('E7007', `Borrow value %${id} is used after its borrow ended (${context}).`, id, source);
          } else if (loan.status === 'maybe') {
            emitIssue('E7007', `Borrow value %${id} is not active on every control-flow path (${context}).`, id, source);
          }
          return;
        }

        const moveStatus = state.moved.get(id);
        if (moveStatus) {
          emitIssue('E7006', `Value %${id} is used after being moved (${context}).`, id, source);
          return;
        }

        const ownerStatus = state.owners.get(id);
        if (ownerStatus === 'released') {
          emitIssue('E7001', `Resource %${id} is used after release (${context}).`, id, source);
          return;
        }
        if (ownerStatus === 'moved') {
          emitIssue('E7006', `Resource %${id} is used after ownership was moved (${context}).`, id, source);
          return;
        }
        if (ownerStatus === 'maybe-owned' || ownerStatus === 'unavailable' || ownerStatus === 'unowned') {
          emitIssue('E7001', `Resource %${id} is not live and definitely owned on every path (${context}).`, id, source);
          return;
        }
        if (activeLoans(state, id).some(([, active]) => active.kind === 'mutable')) {
          emitIssue('E7006', `Owner %${id} is accessed directly while an exclusive mutable borrow is active (${context}).`, id, source);
        }
      };

      const processOperation = (operation: MIROperation): void => {
        const opcode = operation.opcode;
        const operands = operation.operands;
        const ownershipManagedOpcodes = new Set(['borrow.shared', 'borrow.mutable', 'borrow.end', 'ownership.move', 'ownership.drop', 'ownership.write']);
        if (!ownershipManagedOpcodes.has(opcode)) {
          for (const operand of operands) checkValueUse(operand, operation.source, opcode);
        }

        if (opcode === 'borrow.shared' || opcode === 'borrow.mutable') {
          const ownerId = operands[0];
          if (ownerId === undefined || operation.dest === undefined) {
            emitIssue('E7007', `Malformed ${opcode} operation: expected an owner operand and a destination.`, ownerId, operation.source);
            return;
          }
          checkValueUse(ownerId, operation.source, opcode);
          const existing = activeLoans(state, ownerId);
          const kind: LoanKind = opcode === 'borrow.mutable' ? 'mutable' : 'shared';
          if (kind === 'mutable' && existing.length) {
            emitIssue('E7005', `Mutable borrow of %${ownerId} conflicts with an existing active borrow.`, ownerId, operation.source);
          } else if (kind === 'shared' && existing.some(([, loan]) => loan.kind === 'mutable')) {
            emitIssue('E7005', `Shared borrow of %${ownerId} conflicts with an active mutable borrow.`, ownerId, operation.source);
          }
          state.loans.set(operation.dest, { ownerId, kind, status: 'active' });
          return;
        }

        if (opcode === 'borrow.end') {
          const loanId = operands[0];
          const loan = loanId === undefined ? undefined : state.loans.get(loanId);
          if (loanId === undefined || !loan) {
            emitIssue('E7007', 'Borrow end references an unknown borrow value.', loanId, operation.source);
          } else if (loan.status === 'ended') {
            emitIssue('E7007', `Borrow %${loanId} is ended more than once.`, loanId, operation.source);
          } else if (loan.status === 'maybe') {
            emitIssue('E7007', `Borrow %${loanId} is not active on every path where it is ended.`, loanId, operation.source);
          }
          if (loanId !== undefined && loan) state.loans.set(loanId, { ...loan, status: 'ended' });
          return;
        }

        if (opcode === 'ownership.move') {
          const sourceId = operands[0];
          if (sourceId === undefined || operation.dest === undefined) {
            emitIssue('E7006', 'Malformed ownership.move operation: expected a source operand and destination.', sourceId, operation.source);
            return;
          }
          checkValueUse(sourceId, operation.source, opcode);
          if (activeLoans(state, sourceId).length) {
            emitIssue('E7005', `Value %${sourceId} cannot be moved while borrows are active.`, sourceId, operation.source);
          }
          state.moved.set(sourceId, 'moved');
          const ownerStatus = state.owners.get(sourceId);
          if (ownerStatus !== undefined) {
            state.owners.set(sourceId, 'moved');
            state.owners.set(operation.dest, ownerStatus === 'owned' ? 'owned' : 'maybe-owned');
          }
          return;
        }

        if (opcode === 'ownership.drop') {
          const id = operands[0];
          if (id === undefined) {
            emitIssue('E7002', 'Malformed ownership.drop operation: expected an owner operand.', undefined, operation.source);
            return;
          }
          checkValueUse(id, operation.source, opcode);
          if (activeLoans(state, id).length) {
            emitIssue('E7005', `Value %${id} cannot be dropped while borrows are active.`, id, operation.source);
          }
          if (state.owners.has(id)) state.owners.set(id, 'released');
          else state.moved.set(id, 'moved');
          return;
        }

        if (opcode === 'ownership.write') {
          const id = operands[0];
          if (id === undefined) {
            emitIssue('E7006', 'Malformed ownership.write operation: expected an owner operand.', undefined, operation.source);
            return;
          }
          checkValueUse(id, operation.source, opcode);
          if (activeLoans(state, id).length) {
            emitIssue('E7005', `Value %${id} cannot be mutated while any borrow is active.`, id, operation.source);
          }
          return;
        }

        for (const operand of operands) checkValueUse(operand, operation.source, opcode);
      };

      const events = [...block.resourceOps].map((event, index) => ({
        event,
        position: event.position ?? block.operations.length,
        index,
      })).sort((a, b) => a.position - b.position || a.index - b.index);

      let eventIndex = 0;
      for (let position = 0; position <= block.operations.length; position++) {
        while (eventIndex < events.length && events[eventIndex].position <= position) {
          processResourceEvent(events[eventIndex].event);
          eventIndex++;
        }
        if (position < block.operations.length) processOperation(block.operations[position]);
      }

      if (block.terminator.kind === 'Return') {
        const returnedValue = block.terminator.value;
        if (returnedValue !== undefined) checkValueUse(returnedValue, undefined, 'return');
        if (collectIssues) for (const [id, status] of state.owners) {
          // Returning an owned resource transfers it to the caller.
          if (returnedValue === id) continue;
          if (status === 'owned') {
            emitIssue('E7003', `Resource %${id} reaches function return without being released or transferred.`, id);
          } else if (status === 'maybe-owned') {
            emitIssue('E7003', `Resource %${id} may reach function return without being released on every path.`, id);
          }
        }
        for (const [loanId, loan] of state.loans) {
          if (loan.status === 'active' || loan.status === 'maybe') {
            emitIssue('E7007', `Borrow %${loanId} remains active at function return.`, loanId);
          }
        }
      }
      return state;
    };

    // Solve the finite ownership/loan data-flow lattice before reporting issues.
    // This avoids false positives from temporarily incomplete predecessor states.
    const maxPasses = Math.max(16, fn.blocks.length * 16);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (const block of fn.blocks) {
        if (!reachable.has(block.id)) continue;
        const incoming = incomingFor(block.id);
        if (!incoming) continue;
        const next = transferBlock(block, incoming, false);
        if (!statesEqual(outgoing.get(block.id), next)) {
          outgoing.set(block.id, next);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Re-run every reachable block against stable merged input states and
    // report diagnostics once, with original MIR source provenance.
    for (const block of fn.blocks) {
      if (!reachable.has(block.id)) continue;
      const incoming = incomingFor(block.id);
      if (incoming) transferBlock(block, incoming, true);
    }
  }

  return { success: issues.length === 0, issues };
}
