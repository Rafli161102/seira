import assert from 'node:assert';
import test from 'node:test';
import { DiagnosticBag, formatDiagnostic } from '../../compiler/diagnostics/index.ts';

test('Diagnostics: records errors and warnings accurately', () => {
  const bag = new DiagnosticBag();
  assert.strictEqual(bag.hasErrors(), false);

  bag.reportWarning('SEIRA-W0001', 'Unused variable', { start: 0, end: 5, line: 1, column: 1 });
  assert.strictEqual(bag.hasErrors(), false);
  assert.strictEqual(bag.getDiagnostics().length, 1);

  bag.reportError('SEIRA-E0001', 'Type mismatch', { start: 10, end: 15, line: 2, column: 5 }, 'main.sra', 'Cast explicitly');
  assert.strictEqual(bag.hasErrors(), true);
  assert.strictEqual(bag.getDiagnostics().length, 2);
});

test('Diagnostics: formats diagnostic with code pointer and line snippet', () => {
  const source = 'fn main() {\n  bad syntax here\n}';
  const diag = {
    code: 'SEIRA-E0200',
    message: 'Unexpected token',
    severity: 'error' as const,
    span: { start: 14, end: 17, line: 2, column: 3 },
    file: 'example.sra',
    hint: 'Check statement termination',
  };

  const formatted = formatDiagnostic(diag, source);
  assert.ok(formatted.includes('error[SEIRA-E0200]: Unexpected token'));
  assert.ok(formatted.includes('--> example.sra:2:3'));
  assert.ok(formatted.includes('2 |   bad syntax here'));
  assert.ok(formatted.includes('^^^'));
  assert.ok(formatted.includes('hint: Check statement termination'));
});
