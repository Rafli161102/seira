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
  /** True when the loan is an incoming reference parameter owned by the caller. */
  readonly external?: boolean;
  /** True when NLL ended this loan before its lexical borrow.end marker. */
  readonly expiredByLiveness?: boolean;
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
    external: a.external === true && b.external === true,
    expiredByLiveness: a.expiredByLiveness === true && b.expiredByLiveness === true,
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
    for (let index = 0; index < states.length; index++) {
      const incoming = states[index].loans.get(id);
      loan = index === 0 ? incoming : joinLoan(loan, incoming);
    }
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
    if (!old || old.ownerId !== value.ownerId || old.kind !== value.kind || old.status !== value.status || old.external !== value.external || old.expiredByLiveness !== value.expiredByLiveness) return false;
  }
  return true;
}

function activeLoans(state: FlowState, ownerId: ValueId): Array<[ValueId, LoanState]> {
  return [...state.loans.entries()].filter(([, loan]) =>
    loan.ownerId === ownerId && loan.status !== 'ended'
  );
}


/**
 * Computes SSA value liveness over the MIR CFG. Synthetic borrow.end operands
 * are deliberately excluded: they describe lexical cleanup, not a semantic
 * use of the reference, and must not extend a loan's lifetime.
 */
function computeValueLiveness(
  fn: MIRFunction,
  blocks: ReadonlyMap<number, BasicBlock>,
  reachable: ReadonlySet<number>,
): Map<number, ReadonlyArray<ReadonlySet<ValueId>>> {
  const liveIn = new Map<number, Set<ValueId>>();
  for (const id of reachable) liveIn.set(id, new Set());

  const edgeLive = (targetId: number, args: ReadonlyArray<ValueId>): Set<ValueId> => {
    const target = blocks.get(targetId);
    const targetLive = liveIn.get(targetId) ?? new Set<ValueId>();
    const result = new Set(targetLive);
    if (!target) return result;
    target.parameters.forEach((parameter, index) => {
      if (!targetLive.has(parameter.id)) return;
      result.delete(parameter.id);
      const argument = args[index];
      if (argument !== undefined) result.add(argument);
    });
    return result;
  };

  const blockUseDef = new Map<number, { use: Set<ValueId>; def: Set<ValueId> }>();
  for (const block of fn.blocks) {
    if (!reachable.has(block.id)) continue;
    const use = new Set<ValueId>();
    // Block/function parameters are live-in values from the predecessor/caller
    // perspective. Keep them in liveIn so edgeLive can map block parameters
    // back to their incoming SSA arguments.
    const def = new Set<ValueId>();
    for (const operation of block.operations) {
      if (operation.opcode !== 'borrow.end') {
        for (const operand of operation.operands) if (!def.has(operand)) use.add(operand);
      }
      if (operation.dest !== undefined) def.add(operation.dest);
    }
    blockUseDef.set(block.id, { use, def });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const block of [...fn.blocks].reverse()) {
      if (!reachable.has(block.id)) continue;
      const nextOut = new Set<ValueId>();
      const term = block.terminator;
      if (term.kind === 'Branch') {
        for (const id of edgeLive(term.target, term.args)) nextOut.add(id);
      } else if (term.kind === 'CondBranch') {
        nextOut.add(term.condition);
        for (const id of edgeLive(term.trueTarget, term.trueArgs)) nextOut.add(id);
        for (const id of edgeLive(term.falseTarget, term.falseArgs)) nextOut.add(id);
      } else if (term.kind === 'Return' && term.value !== undefined) {
        nextOut.add(term.value);
      }
      const { use, def } = blockUseDef.get(block.id)!;
      const nextIn = new Set(use);
      for (const id of nextOut) if (!def.has(id)) nextIn.add(id);
      const current = liveIn.get(block.id)!;
      if (current.size !== nextIn.size || [...current].some((id) => !nextIn.has(id))) {
        liveIn.set(block.id, nextIn);
        changed = true;
      }
    }
  }

  const result = new Map<number, ReadonlyArray<ReadonlySet<ValueId>>>();
  for (const block of fn.blocks) {
    if (!reachable.has(block.id)) continue;
    const live = new Set<ValueId>();
    const term = block.terminator;
    if (term.kind === 'Branch') {
      for (const id of edgeLive(term.target, term.args)) live.add(id);
    } else if (term.kind === 'CondBranch') {
      live.add(term.condition);
      for (const id of edgeLive(term.trueTarget, term.trueArgs)) live.add(id);
      for (const id of edgeLive(term.falseTarget, term.falseArgs)) live.add(id);
    } else if (term.kind === 'Return' && term.value !== undefined) {
      live.add(term.value);
    }
    const snapshots: Set<ValueId>[] = new Array(block.operations.length + 1);
    snapshots[block.operations.length] = new Set(live);
    for (let index = block.operations.length - 1; index >= 0; index--) {
      const operation = block.operations[index];
      snapshots[index] = new Set(live);
      if (operation.dest !== undefined) live.delete(operation.dest);
      if (operation.opcode !== 'borrow.end') {
        for (const operand of operation.operands) live.add(operand);
      }
    }
    result.set(block.id, snapshots);
  }
  return result;
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

    const valueLiveness = computeValueLiveness(fn, blocks, reachable);
    const outgoing = new Map<number, FlowState>();
    const entryState = emptyState();
    for (const parameter of fn.parameters) {
      if (parameter.type.kind === 'Reference') {
        entryState.loans.set(parameter.id, {
          ownerId: parameter.id,
          kind: parameter.type.isMutableReference ? 'mutable' : 'shared',
          status: 'active',
          external: true,
        });
      }
    }

    const incomingFor = (blockId: number): FlowState | undefined => {
      const states: FlowState[] = [];
      if (blockId === fn.entry) states.push(entryState);
      const target = blocks.get(blockId);
      for (const pred of fn.blocks) {
        if (!reachable.has(pred.id)) continue;
        const state = outgoing.get(pred.id);
        if (!state) continue;
        const term = pred.terminator;
        const edges = term.kind === 'Branch'
          ? [{ target: term.target, args: term.args }]
          : term.kind === 'CondBranch'
            ? [
                { target: term.trueTarget, args: term.trueArgs },
                { target: term.falseTarget, args: term.falseArgs },
              ]
            : [];
        for (const edge of edges) {
          if (edge.target !== blockId || !target) continue;
          const mapped = cloneState(state);
          const valueMap = new Map<ValueId, ValueId>();
          target.parameters.forEach((parameter, index) => {
            const argument = edge.args[index];
            if (argument !== undefined) valueMap.set(argument, parameter.id);
          });
          for (const [loanId, loan] of [...mapped.loans]) {
            const mappedLoanId = valueMap.get(loanId);
            const mappedOwnerId = valueMap.get(loan.ownerId) ?? loan.ownerId;
            if (mappedLoanId !== undefined) {
              mapped.loans.delete(loanId);
              mapped.loans.set(mappedLoanId, { ...loan, ownerId: mappedOwnerId });
            } else if (mappedOwnerId !== loan.ownerId) {
              mapped.loans.set(loanId, { ...loan, ownerId: mappedOwnerId });
            }
          }
          states.push(mapped);
        }
      }
      return states.length ? mergeStates(states) : undefined;
    };

    const transferBlock = (block: BasicBlock, initial: FlowState, collectIssues: boolean, liveAfter: ReadonlyArray<ReadonlySet<ValueId>>): FlowState => {
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

      const expireDeadLoans = (live: ReadonlySet<ValueId>): void => {
        for (const [loanId, loan] of state.loans) {
          if (loan.status === 'active' && !live.has(loanId)) {
            state.loans.set(loanId, { ...loan, status: 'ended', expiredByLiveness: true });
          }
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

        if (opcode === 'deref.store') {
          const referenceId = operands[0];
          const loan = referenceId === undefined ? undefined : state.loans.get(referenceId);
          if (referenceId === undefined || !loan) {
            emitIssue('E7007', 'Dereference assignment requires an active reference value.', referenceId, operation.source);
          } else if (loan.status === 'ended' || loan.status === 'maybe') {
            emitIssue('E7007', `Reference %${referenceId} is not definitely active for mutation.`, referenceId, operation.source);
          } else if (loan.kind !== 'mutable') {
            emitIssue('E7005', `Cannot mutate through shared reference %${referenceId}; a mutable borrow is required.`, referenceId, operation.source);
          }
          if (operands[1] !== undefined) checkValueUse(operands[1], operation.source, 'deref.store value');
          return;
        }

        if (opcode === 'borrow.end') {
          const loanId = operands[0];
          const loan = loanId === undefined ? undefined : state.loans.get(loanId);
          if (loanId === undefined || !loan) {
            emitIssue('E7007', 'Borrow end references an unknown borrow value.', loanId, operation.source);
          } else if (loan.status === 'ended') {
            if (loan.expiredByLiveness) return;
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
        if (position < block.operations.length) {
          processOperation(block.operations[position]);
          expireDeadLoans(liveAfter[position]);
        }
      }

      expireDeadLoans(liveAfter[block.operations.length]);

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
          if (!loan.external && (loan.status === 'active' || loan.status === 'maybe')) {
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
        const next = transferBlock(block, incoming, false, valueLiveness.get(block.id) ?? []);
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
      if (incoming) transferBlock(block, incoming, true, valueLiveness.get(block.id) ?? []);
    }
  }

  return { success: issues.length === 0, issues };
}
