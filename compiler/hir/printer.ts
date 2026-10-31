/**
 * Seira High-Level Intermediate Representation (HIR) — Deterministic Printer
 *
 * Emits canonical, deterministic text representation of an HIR program.
 * Guarantees identical output for semantically equivalent HIR trees.
 */

import type {
  HIRBlock,
  HIRExpr,
  HIRFunction,
  HIRItem,
  HIRMatchArm,
  HIRModule,
  HIRParameter,
  HIRPattern,
  HIRProgram,
  HIRStmt,
} from './nodes.ts';
import type { HIRType } from './types.ts';

export interface HIRPrinterOptions {
  readonly includeIds?: boolean;
  readonly includeTypes?: boolean;
  readonly includeOrigins?: boolean;
  readonly indentSize?: number;
}

export class HIRPrinter {
  private readonly includeIds: boolean;
  private readonly includeTypes: boolean;
  private readonly includeOrigins: boolean;
  private readonly indentStr: string;

  constructor(options?: HIRPrinterOptions) {
    this.includeIds = options?.includeIds ?? true;
    this.includeTypes = options?.includeTypes ?? true;
    this.includeOrigins = options?.includeOrigins ?? true;
    this.indentStr = ' '.repeat(options?.indentSize ?? 2);
  }

  public print(program: HIRProgram): string {
    const lines: string[] = [];
    lines.push(`// HIR Program (v${program.version}) [id: ${program.id}]`);

    if (program.modules.length > 0) {
      for (const mod of program.modules) {
        lines.push('');
        lines.push(...this.printModule(mod, 0));
      }
    }

    if (program.topLevelItems.length > 0) {
      lines.push('');
      lines.push('// Top-Level Items');
      for (const item of program.topLevelItems) {
        lines.push(...this.printItem(item, 0));
      }
    }

    return lines.join('\n');
  }

  private printModule(mod: HIRModule, depth: number): string[] {
    const lines: string[] = [];
    const indent = this.indentStr.repeat(depth);
    lines.push(`${indent}module ${mod.name} [id: ${mod.moduleId}] {`);

    for (const item of mod.items) {
      lines.push(...this.printItem(item, depth + 1));
    }

    lines.push(`${indent}}`);
    return lines;
  }

  private printItem(item: HIRItem, depth: number): string[] {
    switch (item.kind) {
      case 'HIRFunction':
        return this.printFunction(item, depth);
      case 'HIRStruct':
        return this.printStruct(item, depth);
      case 'HIRTrait':
        return this.printTrait(item, depth);
      case 'HIRImpl':
        return this.printImpl(item, depth);
      default:
        return this.printStmt(item, depth);
    }
  }

  private printFunction(fn: HIRFunction, depth: number): string[] {
    const lines: string[] = [];
    const indent = this.indentStr.repeat(depth);

    const eff = fn.isEffectful ? '! ' : '';
    const pub = fn.isPublic ? 'pub ' : '';
    const params = fn.params
      .map((p) => `${p.isMut ? 'mut ' : ''}${p.name}: ${this.formatType(p.type)}`)
      .join(', ');
    const ret = `: ${this.formatType(fn.returnType)}`;
    const idTag = this.includeIds ? ` [id: ${fn.functionId}]` : '';
    const effTag = fn.effects.length > 0 ? ` [effects: ${fn.effects.join(', ')}]` : '';
    const originTag = this.formatOrigin(fn.source);

    lines.push(`${indent}${pub}fn ${fn.name}${eff}(${params})${ret}${idTag}${effTag}${originTag} {`);
    lines.push(...this.printBlockBody(fn.body, depth + 1));
    lines.push(`${indent}}`);
    return lines;
  }

  private printStruct(item: any, depth: number): string[] {
    const lines: string[] = [];
    const indent = this.indentStr.repeat(depth);
    const pub = item.isPublic ? 'pub ' : '';
    lines.push(`${indent}${pub}struct ${item.name} {`);
    for (const f of item.fields) {
      lines.push(`${indent}${this.indentStr}${f.name}: ${this.formatType(f.type)};`);
    }
    lines.push(`${indent}}`);
    return lines;
  }

  private printTrait(item: any, depth: number): string[] {
    const lines: string[] = [];
    const indent = this.indentStr.repeat(depth);
    const pub = item.isPublic ? 'pub ' : '';
    lines.push(`${indent}${pub}trait ${item.name} {`);
    for (const m of item.methods) {
      const eff = m.isEffectful ? '! ' : '';
      const params = m.params.map((p: any) => `${p.name}: ${this.formatType(p.type)}`).join(', ');
      lines.push(`${indent}${this.indentStr}fn ${m.name}${eff}(${params}): ${this.formatType(m.returnType)};`);
    }
    lines.push(`${indent}}`);
    return lines;
  }

  private printImpl(item: any, depth: number): string[] {
    const lines: string[] = [];
    const indent = this.indentStr.repeat(depth);
    const traitPart = item.traitId ? ` for ${item.traitId}` : '';
    lines.push(`${indent}impl ${this.formatType(item.targetType)}${traitPart} {`);
    for (const m of item.methods) {
      lines.push(...this.printFunction(m, depth + 1));
    }
    lines.push(`${indent}}`);
    return lines;
  }

  private printBlockBody(block: HIRBlock, depth: number): string[] {
    const lines: string[] = [];
    for (const stmt of block.statements) {
      lines.push(...this.printStmt(stmt, depth));
    }
    if (block.resultExpr) {
      const indent = this.indentStr.repeat(depth);
      lines.push(`${indent}${this.printExpr(block.resultExpr)}`);
    }
    return lines;
  }

  private printStmt(stmt: HIRStmt, depth: number): string[] {
    const indent = this.indentStr.repeat(depth);
    const originTag = this.formatOrigin(stmt.source);

    switch (stmt.kind) {
      case 'HIRLetStmt': {
        const mut = stmt.isMut ? 'mut ' : '';
        const init = stmt.initializer ? ` = ${this.printExpr(stmt.initializer)}` : '';
        return [`${indent}let ${mut}${stmt.name}: ${this.formatType(stmt.type)}${init};${originTag}`];
      }

      case 'HIRAssignStmt':
        return [`${indent}${this.printExpr(stmt.target)} ${stmt.operator} ${this.printExpr(stmt.value)};${originTag}`];

      case 'HIRExprStmt':
        return [`${indent}${this.printExpr(stmt.expr)};${originTag}`];

      case 'HIRWithStmt': {
        const alias = stmt.aliasName ? ` as ${stmt.aliasName}` : '';
        const lines: string[] = [
          `${indent}with ${this.printExpr(stmt.resource)}${alias} [cleanup: ${stmt.cleanupContract}] {${originTag}`,
        ];
        lines.push(...this.printBlockBody(stmt.body, depth + 1));
        lines.push(`${indent}}`);
        return lines;
      }

      case 'HIRLoopStmt': {
        const lines: string[] = [];
        if (stmt.loopKind === 'Condition' && stmt.condition) {
          lines.push(`${indent}while ${this.printExpr(stmt.condition)} {${originTag}`);
        } else if (stmt.loopKind === 'Iterator' && stmt.iterator) {
          lines.push(`${indent}for ${stmt.iterator.variableName} in ${this.printExpr(stmt.iterator.iterable)} {${originTag}`);
        } else {
          lines.push(`${indent}loop {${originTag}`);
        }
        lines.push(...this.printBlockBody(stmt.body, depth + 1));
        lines.push(`${indent}}`);
        return lines;
      }

      case 'HIRReturnStmt':
        return stmt.value
          ? [`${indent}return ${this.printExpr(stmt.value)};${originTag}`]
          : [`${indent}return;${originTag}`];

      case 'HIRBreakStmt':
        return [`${indent}break;${originTag}`];

      case 'HIRContinueStmt':
        return [`${indent}continue;${originTag}`];
    }
  }

  private printExpr(expr: HIRExpr): string {
    const typeTag = this.includeTypes ? `: ${this.formatType(expr.type)}` : '';

    switch (expr.kind) {
      case 'HIRLiteralExpr':
        return `${expr.raw}${typeTag}`;

      case 'HIRLocalExpr':
        return `${expr.name}[${expr.symbolId}]${typeTag}`;

      case 'HIRGlobalExpr':
        return `@${expr.name}[${expr.symbolId}]${typeTag}`;

      case 'HIRBlockExpr': {
        const lines = this.printBlockBody(expr.block, 1);
        return `{\n${lines.join('\n')}\n}${typeTag}`;
      }

      case 'HIRCallExpr': {
        const args = expr.args.map((a) => this.printExpr(a)).join(', ');
        return `call ${expr.functionId}(${args})${typeTag}`;
      }

      case 'HIRFunctionValueCallExpr': {
        const callee = this.printExpr(expr.callee);
        const args = expr.args.map((a) => this.printExpr(a)).join(', ');
        return `${callee}(${args})${typeTag}`;
      }

      case 'HIRMethodCallExpr': {
        const recv = this.printExpr(expr.receiver);
        const args = expr.args.map((a) => this.printExpr(a)).join(', ');
        const dispatchTag = `[${expr.dispatch.kind}]`;
        return `${recv}.${expr.method}(${args}) ${dispatchTag}${typeTag}`;
      }

      case 'HIRFieldAccessExpr':
        return `${this.printExpr(expr.target)}.${expr.fieldName}[${expr.fieldId}]${typeTag}`;

      case 'HIRIndexExpr':
        return `${this.printExpr(expr.target)}[${this.printExpr(expr.index)}]${typeTag}`;

      case 'HIRUnaryExpr':
        return `(${expr.operator}${this.printExpr(expr.operand)})${typeTag}`;

      case 'HIRBinaryExpr':
        return `(${this.printExpr(expr.left)} ${expr.operator} ${this.printExpr(expr.right)})${typeTag}`;

      case 'HIRConstructExpr': {
        if (expr.constructKind === 'Struct') {
          const fields = (expr.fields ?? []).map((f) => `${f.fieldName}: ${this.printExpr(f.value)}`).join(', ');
          return `${expr.name ?? 'Struct'} { ${fields} }${typeTag}`;
        }
        if (expr.constructKind === 'List') {
          const els = (expr.elements ?? []).map((e) => this.printExpr(e)).join(', ');
          return `[${els}]${typeTag}`;
        }
        if (expr.constructKind === 'Tuple') {
          const els = (expr.elements ?? []).map((e) => this.printExpr(e)).join(', ');
          return `(${els})${typeTag}`;
        }
        if (expr.constructKind === 'Map') {
          const entries = (expr.entries ?? []).map((e) => `${this.printExpr(e.key)}: ${this.printExpr(e.value)}`).join(', ');
          return `{ ${entries} }${typeTag}`;
        }
        return `construct(${expr.constructKind})${typeTag}`;
      }

      case 'HIRClosureExpr': {
        const params = expr.params.map((p) => `${p.name}: ${this.formatType(p.type)}`).join(', ');
        return `|${params}| { ... }${typeTag}`;
      }

      case 'HIRIfExpr': {
        const cond = this.printExpr(expr.condition);
        const thenLines = this.printBlockBody(expr.thenBranch, 1);
        let res = `if ${cond} {\n${thenLines.join('\n')}\n}`;
        if (expr.elseBranch) {
          if ('statements' in expr.elseBranch) {
            const elseLines = this.printBlockBody(expr.elseBranch, 1);
            res += ` else {\n${elseLines.join('\n')}\n}`;
          } else {
            res += ` else ${this.printExpr(expr.elseBranch)}`;
          }
        }
        return `${res}${typeTag}`;
      }

      case 'HIRMatchExpr': {
        const val = this.printExpr(expr.value);
        const arms = expr.arms.map((a) => this.printMatchArm(a)).join(', ');
        return `match ${val} { ${arms} }${typeTag}`;
      }

      case 'HIRFallbackExpr':
        return `(${this.printExpr(expr.left)} ?? ${this.printExpr(expr.right)})${typeTag}`;

      case 'HIRTryExpr':
        return `(?${expr.tryKind} ${this.printExpr(expr.operand)})${typeTag}`;
    }
  }

  private printMatchArm(arm: HIRMatchArm): string {
    const pat = this.printPattern(arm.pattern);
    const body = 'statements' in arm.body
      ? `{ ... }`
      : this.printExpr(arm.body);
    return `${pat} => ${body}`;
  }

  private printPattern(pat: HIRPattern): string {
    switch (pat.kind) {
      case 'HIRWildcardPattern':
        return '_';
      case 'HIRLiteralPattern':
        return pat.literal.raw;
      case 'HIRBindingPattern':
        return `${pat.isMut ? 'mut ' : ''}${pat.name}[${pat.symbolId}]`;
      case 'HIRConstructorPattern': {
        const args = pat.args.map((a) => this.printPattern(a)).join(', ');
        return `${pat.name}(${args})`;
      }
    }
  }

  private formatType(t: HIRType): string {
    return t.name ?? 'Unknown';
  }

  private formatOrigin(source: any): string {
    if (!this.includeOrigins || !source) return '';
    if (source.kind === 'Synthetic') {
      return ` /* [synth: ${source.reason ?? 'desugared'}] */`;
    }
    return '';
  }
}

export function printHIR(program: HIRProgram, options?: HIRPrinterOptions): string {
  const printer = new HIRPrinter(options);
  return printer.print(program);
}
