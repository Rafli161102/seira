/**
 * Seira Compiler Diagnostics Engine
 *
 * Implements structured diagnostic reporting adhering to Seira diagnostic code families:
 * - E1xxx: Syntax / Parse
 * - E2xxx: Name / Resolution
 * - E3xxx: Type
 * - E4xxx: Trait / Generic
 * - E5xxx: Pattern
 * - E6xxx: Effect
 * - E7xxx: Resource / Ownership
 * - E8xxx: Module / Visibility
 * - E9xxx: Build / Dependency / Backend
 * - W1xxx: Warning
 * - I1xxx: Information
 *
 * Architecture supports:
 * - Severity
 * - Code
 * - Primary Span
 * - Secondary Spans
 * - Message
 * - Note
 * - Help
 * - Suggestion
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Span {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface SecondarySpan {
  span: Span;
  label?: string;
  file?: string;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  primarySpan: Span;
  secondarySpans?: SecondarySpan[];
  message: string;
  note?: string;
  help?: string;
  suggestion?: string;
  file?: string;
}

export interface DiagnosticOptions {
  severity?: DiagnosticSeverity;
  code: string;
  primarySpan: Span;
  secondarySpans?: SecondarySpan[];
  message: string;
  note?: string;
  help?: string;
  suggestion?: string;
  file?: string;
}

export class DiagnosticBag {
  private diagnostics: Diagnostic[] = [];

  public report(options: DiagnosticOptions): void {
    this.diagnostics.push({
      severity: options.severity ?? 'error',
      code: options.code,
      primarySpan: options.primarySpan,
      secondarySpans: options.secondarySpans,
      message: options.message,
      note: options.note,
      help: options.help,
      suggestion: options.suggestion,
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
      severity: 'error',
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
      severity: 'warning',
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
      severity: 'info',
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
    return this.diagnostics.some((d) => d.severity === 'error');
  }

  public getDiagnostics(): readonly Diagnostic[] {
    return this.diagnostics;
  }

  public clear(): void {
    this.diagnostics = [];
  }

  public format(source?: string): string {
    return this.diagnostics.map((d) => formatDiagnostic(d, source)).join('\n\n');
  }
}

export function formatDiagnostic(diag: Diagnostic, source?: string): string {
  const fileName = diag.file ?? '<source>';
  const header = `${diag.severity}[${diag.code}]: ${diag.message}`;
  const location = `  --> ${fileName}:${diag.primarySpan.line}:${diag.primarySpan.column}`;

  if (!source) {
    let plain = `${header}\n${location}`;
    if (diag.help) plain += `\n  = help: ${diag.help}`;
    if (diag.suggestion) plain += `\n  = suggestion: ${diag.suggestion}`;
    if (diag.note) plain += `\n  = note: ${diag.note}`;
    return plain;
  }

  const lines = source.split(/\r?\n/);
  const lineIdx = diag.primarySpan.line - 1;
  const lineContent = lines[lineIdx] ?? '';
  const lineNumStr = String(diag.primarySpan.line);
  const padding = ' '.repeat(lineNumStr.length);

  const col = Math.max(1, diag.primarySpan.column);
  const length = Math.max(1, Math.min(diag.primarySpan.end - diag.primarySpan.start, lineContent.length - col + 1));
  const pointer = ' '.repeat(col - 1) + '^'.repeat(length);

  let output = `${header}\n${location}\n${padding} |\n${lineNumStr} | ${lineContent}\n${padding} | ${pointer}`;

  // Secondary spans if present
  if (diag.secondarySpans && diag.secondarySpans.length > 0) {
    for (const sec of diag.secondarySpans) {
      const secIdx = sec.span.line - 1;
      const secContent = lines[secIdx] ?? '';
      const secNumStr = String(sec.span.line);
      const secPadding = ' '.repeat(secNumStr.length);
      const secCol = Math.max(1, sec.span.column);
      const secLen = Math.max(1, Math.min(sec.span.end - sec.span.start, secContent.length - secCol + 1));
      const secPtr = ' '.repeat(secCol - 1) + '-'.repeat(secLen) + (sec.label ? ` ${sec.label}` : '');
      output += `\n${secPadding} |\n${secNumStr} | ${secContent}\n${secPadding} | ${secPtr}`;
    }
  }

  if (diag.suggestion) {
    output += `\n${padding} = suggestion: ${diag.suggestion}`;
  }
  if (diag.help) {
    output += `\n${padding} = help: ${diag.help}`;
  }
  if (diag.note) {
    output += `\n${padding} = note: ${diag.note}`;
  }

  return output;
}
