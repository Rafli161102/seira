import assert from 'node:assert';
import test from 'node:test';
import {
  createPosition,
  createSpan,
  emptySpan,
  mergeSpans,
  LineMap,
  SourceFile,
  SourceManager,
} from '../../compiler/source/index.ts';

test('Source: Position creation and invariants', () => {
  const pos = createPosition(10, 5, 142);
  assert.strictEqual(pos.line, 10);
  assert.strictEqual(pos.column, 5);
  assert.strictEqual(pos.offset, 142);
});

test('Source: Span creation, merging, and empty span', () => {
  const span1 = createSpan(0, 10, 1, 1, 1);
  const span2 = createSpan(15, 25, 1, 2, 5);

  assert.strictEqual(span1.start, 0);
  assert.strictEqual(span1.end, 10);
  assert.strictEqual(span1.sourceId, 1);

  const merged = mergeSpans(span1, span2);
  assert.strictEqual(merged.start, 0);
  assert.strictEqual(merged.end, 25);
  assert.strictEqual(merged.sourceId, 1);

  const empty = emptySpan(2);
  assert.strictEqual(empty.start, 0);
  assert.strictEqual(empty.end, 0);
  assert.strictEqual(empty.sourceId, 2);
});

test('Source: LineMap maps offsets to lines and columns correctly', () => {
  const source = 'fn main() {\n    let x = 42;\n    return x;\n}';
  const lineMap = new LineMap(source);

  assert.strictEqual(lineMap.getLineCount(), 4);

  // Line 1: 'fn main() {' -> length 11, line start 0
  const posStart = lineMap.lookup(0);
  assert.strictEqual(posStart.line, 1);
  assert.strictEqual(posStart.column, 1);

  // Offset 12: start of line 2 ('    let x = 42;')
  const posLine2 = lineMap.lookup(12);
  assert.strictEqual(posLine2.line, 2);
  assert.strictEqual(posLine2.column, 1);

  // Offset 16: 'let' on line 2
  const posLet = lineMap.lookup(16);
  assert.strictEqual(posLet.line, 2);
  assert.strictEqual(posLet.column, 5);

  // Line content retrieval
  assert.strictEqual(lineMap.getLineContent(1), 'fn main() {');
  assert.strictEqual(lineMap.getLineContent(2), '    let x = 42;');
  assert.strictEqual(lineMap.getLineContent(4), '}');
});

test('Source: SourceFile provides snippet extraction and span lookup', () => {
  const text = 'let value = 100;\nprint(value);';
  const file = new SourceFile(1, 'src/main.sra', text);

  assert.strictEqual(file.id, 1);
  assert.strictEqual(file.path, 'src/main.sra');

  const span = createSpan(4, 9, 1); // 'value'
  assert.strictEqual(file.getSnippet(span), 'value');

  const { start, end } = file.lookupSpan(span);
  assert.strictEqual(start.line, 1);
  assert.strictEqual(start.column, 5);
  assert.strictEqual(end.column, 10);
});

test('Source: SourceManager manages scoped files without global state', () => {
  const sm1 = new SourceManager();
  const file1 = sm1.addFile('main.sra', 'fn main() {}');
  const file2 = sm1.addFile('lib.sra', 'fn add(a, b) -> a + b');

  assert.strictEqual(sm1.getAllFiles().length, 2);
  assert.strictEqual(sm1.getFile(file1.id)?.path, 'main.sra');
  assert.strictEqual(sm1.getFileByPath('lib.sra')?.id, file2.id);

  // Separate manager instance has independent state
  const sm2 = new SourceManager();
  assert.strictEqual(sm2.getAllFiles().length, 0);

  // Span resolution
  const resolved = sm1.resolveSpan(createSpan(0, 7, file1.id));
  assert.ok(resolved);
  assert.strictEqual(resolved?.file.path, 'main.sra');
  assert.strictEqual(resolved?.snippet, 'fn main');
});
