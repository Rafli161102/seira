/**
 * Seira Compiler Diagnostics Engine
 *
 * Implements structured diagnostic reporting adhering to Seira diagnostic code families:
 * - E1xxx: Syntax / Parse
 * - E2xxx: Name / Resolution
 * - E3xxx: Type
 * - E4xxx: Trait / Generic
 * - E5xxx: Pattern
 * - E6xxx: Module / Package
 * - E7xxx: Resource / Ownership
 * - E8xxx: Effect / Concurrency
 * - E9xxx: Build / Dependency / Backend
 * - W1xxx: Warning
 * - I1xxx: Information
 *
 * Architecture supports:
 * - Severity (Error, Warning, Info)
 * - Code
 * - Message
 * - Primary Span
 * - Secondary Spans
 * - Notes
 * - Help
 * - Suggestions
 */

import { type SourceManager } from '../source/source_manager.ts';
import { type Span } from '../source/span.ts';

export * from './ice.ts';
export type { Span } from '../source/span.ts';

export const DiagnosticSeverity = {
  Error: 'error',
  Warning: 'warning',
  Info: 'info',
} as const;

export type DiagnosticSeverity = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export interface SecondarySpan {
  readonly span: Span;
  readonly label?: string;
  readonly file?: string;
}

export interface Suggestion {
  readonly message?: string;
  readonly replacement: string;
  readonly span?: Span;
}

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly primarySpan: Span;
  readonly secondarySpans?: ReadonlyArray<SecondarySpan>;
  readonly notes?: ReadonlyArray<string>;
  readonly note?: string;
  readonly help?: string;
  readonly suggestions?: ReadonlyArray<Suggestion>;
  readonly suggestion?: string;
  readonly file?: string;
}

export interface DiagnosticOptions {
  readonly severity?: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly primarySpan: Span;
  readonly secondarySpans?: ReadonlyArray<SecondarySpan>;
  readonly notes?: ReadonlyArray<string>;
  readonly note?: string;
  readonly help?: string;
  readonly suggestions?: ReadonlyArray<Suggestion>;
  readonly suggestion?: string;
  readonly file?: string;
}

export class DiagnosticBag {
  private diagnostics: Diagnostic[] = [];

  public report(options: DiagnosticOptions): void {
    const notes = options.notes ?? (options.note ? [options.note] : undefined);
    const suggestions =
      options.suggestions ??
      (options.suggestion ? [{ replacement: options.suggestion }] : undefined);

    this.diagnostics.push({
      severity: options.severity ?? DiagnosticSeverity.Error,
      code: options.code,
      primarySpan: options.primarySpan,
      secondarySpans: options.secondarySpans,
      message: options.message,
      notes,
      note: options.note ?? (notes && notes.length > 0 ? notes[0] : undefined),
      help: options.help,
      suggestions,
      suggestion:
        options.suggestion ?? (suggestions && suggestions.length > 0 ? suggestions[0].replacement : undefined),
      file: options.file,
    });
  }

  public reportError(
    code: string,
    message: string,
    span: Span,
    file?: string,
    help?: string,
    suggestion?: string,
    note?: string
  ): void {
    this.report({
      severity: DiagnosticSeverity.Error,
      code,
      primarySpan: span,
      message,
      file,
      help,
      suggestion,
      note,
    });
  }

  public reportWarning(
    code: string,
    message: string,
    span: Span,
    file?: string,
    help?: string,
    suggestion?: string,
    note?: string
  ): void {
    this.report({
      severity: DiagnosticSeverity.Warning,
      code,
      primarySpan: span,
      message,
      file,
      help,
      suggestion,
      note,
    });
  }

  public reportInfo(
    code: string,
    message: string,
    span: Span,
    file?: string,
    help?: string,
    suggestion?: string,
    note?: string
  ): void {
    this.report({
      severity: DiagnosticSeverity.Info,
      code,
      primarySpan: span,
      message,
      file,
      help,
      suggestion,
      note,
    });
  }

  public hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === DiagnosticSeverity.Error);
  }

  public getErrors(): ReadonlyArray<Diagnostic> {
    return this.diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error);
  }

  public getDiagnostics(): ReadonlyArray<Diagnostic> {
    return this.diagnostics;
  }

  public clear(): void {
    this.diagnostics = [];
  }

  public format(sourceOrManager?: SourceManager | string): string {
    return this.diagnostics.map((d) => formatDiagnostic(d, sourceOrManager)).join('\n\n');
  }
}

export function formatDiagnostic(diag: Diagnostic, sourceOrManager?: SourceManager | string): string {
  let sourceText: string | undefined;
  let fileName = diag.file ?? '<source>';
  let line = diag.primarySpan.line ?? 1;
  let column = diag.primarySpan.column ?? 1;

  if (typeof sourceOrManager === 'string') {
    sourceText = sourceOrManager;
  } else if (sourceOrManager && typeof sourceOrManager.resolveSpan === 'function') {
    const resolved = sourceOrManager.resolveSpan(diag.primarySpan);
    if (resolved) {
      sourceText = resolved.file.text;
      fileName = resolved.file.path;
      line = resolved.start.line;
      column = resolved.start.column;
    } else if (diag.file) {
      const file = sourceOrManager.getFileByPath(diag.file);
      if (file) {
        sourceText = file.text;
      }
    }
  }

  const header = `${diag.severity}[${diag.code}]: ${diag.message}`;
  const location = `  --> ${fileName}:${line}:${column}`;

  if (!sourceText) {
    let plain = `${header}\n${location}`;
    if (diag.help) plain += `\n  = help: ${diag.help}`;
    if (diag.suggestion) plain += `\n  = suggestion: ${diag.suggestion}`;
    if (diag.notes && diag.notes.length > 0) {
      for (const n of diag.notes) {
        plain += `\n  = note: ${n}`;
      }
    } else if (diag.note) {
      plain += `\n  = note: ${diag.note}`;
    }
    return plain;
  }

  const lines = sourceText.split(/\r?\n/);
  const lineIdx = line - 1;
  const lineContent = lines[lineIdx] ?? '';
  const lineNumStr = String(line);
  const padding = ' '.repeat(lineNumStr.length);

  const col = Math.max(1, column);
  const length = Math.max(1, Math.min(diag.primarySpan.end - diag.primarySpan.start, lineContent.length - col + 1));
  const pointer = ' '.repeat(col - 1) + '^'.repeat(length);

  let output = `${header}\n${location}\n${padding} |\n${lineNumStr} | ${lineContent}\n${padding} | ${pointer}`;

  // Secondary spans if present
  if (diag.secondarySpans && diag.secondarySpans.length > 0) {
    for (const sec of diag.secondarySpans) {
      const secLine = sec.span.line ?? 1;
      const secCol = Math.max(1, sec.span.column ?? 1);
      const secIdx = secLine - 1;
      const secContent = lines[secIdx] ?? '';
      const secNumStr = String(secLine);
      const secPadding = ' '.repeat(secNumStr.length);
      const secLen = Math.max(1, Math.min(sec.span.end - sec.span.start, secContent.length - secCol + 1));
      const secPtr = ' '.repeat(secCol - 1) + '-'.repeat(secLen) + (sec.label ? ` ${sec.label}` : '');
      output += `\n${secPadding} |\n${secNumStr} | ${secContent}\n${secPadding} | ${secPtr}`;
    }
  }

  if (diag.suggestion) {
    output += `\n${padding} = suggestion: ${diag.suggestion}`;
  } else if (diag.suggestions && diag.suggestions.length > 0) {
    for (const s of diag.suggestions) {
      output += `\n${padding} = suggestion: ${s.message ? `${s.message}: ` : ''}${s.replacement}`;
    }
  }

  if (diag.help) {
    output += `\n${padding} = help: ${diag.help}`;
  }

  if (diag.notes && diag.notes.length > 0) {
    for (const n of diag.notes) {
      output += `\n${padding} = note: ${n}`;
    }
  } else if (diag.note) {
    output += `\n${padding} = note: ${diag.note}`;
  }

  return output;
}
