/**
 * Seira Compiler Diagnostics Engine
 * Provides structured, span-tracked diagnostics with error codes and formatted output.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Span {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  span: Span;
  file?: string;
  hint?: string;
}

export class DiagnosticBag {
  private diagnostics: Diagnostic[] = [];

  public report(
    code: string,
    message: string,
    span: Span,
    severity: DiagnosticSeverity = 'error',
    file?: string,
    hint?: string
  ): void {
    this.diagnostics.push({ code, message, severity, span, file, hint });
  }

  public reportError(code: string, message: string, span: Span, file?: string, hint?: string): void {
    this.report(code, message, span, 'error', file, hint);
  }

  public reportWarning(code: string, message: string, span: Span, file?: string, hint?: string): void {
    this.report(code, message, span, 'warning', file, hint);
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
  const location = `  --> ${fileName}:${diag.span.line}:${diag.span.column}`;

  if (!source) {
    return `${header}\n${location}`;
  }

  const lines = source.split(/\r?\n/);
  const lineIdx = diag.span.line - 1;
  const lineContent = lines[lineIdx] ?? '';
  const lineNumStr = String(diag.span.line);
  const padding = ' '.repeat(lineNumStr.length);

  const col = Math.max(1, diag.span.column);
  const length = Math.max(1, Math.min(diag.span.end - diag.span.start, lineContent.length - col + 1));
  const pointer = ' '.repeat(col - 1) + '^'.repeat(length);

  let output = `${header}\n${location}\n${padding} |\n${lineNumStr} | ${lineContent}\n${padding} | ${pointer}`;
  if (diag.hint) {
    output += `\n${padding} = hint: ${diag.hint}`;
  }

  return output;
}
