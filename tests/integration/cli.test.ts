import assert from 'node:assert';
import test from 'node:test';
import { main } from '../../tools/cli/index.ts';

test('CLI: --version and version output Seira 0.0.7-s', () => {
  const originalLog = console.log;
  let logged = '';
  console.log = (msg) => {
    logged += msg + '\n';
  };

  try {
    const code1 = main(['--version']);
    assert.strictEqual(code1, 0);
    assert.ok(logged.includes('Seira 0.0.7-s'));

    logged = '';
    const code2 = main(['version']);
    assert.strictEqual(code2, 0);
    assert.ok(logged.includes('Seira 0.0.7-s'));
  } finally {
    console.log = originalLog;
  }
});

test('CLI: --help lists core and reserved commands', () => {
  const originalLog = console.log;
  let logged = '';
  console.log = (msg) => {
    logged += msg + '\n';
  };

  try {
    const code = main(['--help']);
    assert.strictEqual(code, 0);
    assert.ok(logged.includes('CORE COMMANDS'));
    assert.ok(logged.includes('TOOLCHAIN COMMANDS'));
    assert.ok(logged.includes('check'));
    assert.ok(logged.includes('build'));
  } finally {
    console.log = originalLog;
  }
});

test('CLI: check command succeeds on example and fails on missing file', () => {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  try {
    const passCode = main(['check', 'examples/hello_world.sra']);
    assert.strictEqual(passCode, 0);

    const failCode = main(['check', 'examples/does_not_exist.sra']);
    assert.strictEqual(failCode, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('CLI: run command executes hello_world.sra successfully', () => {
  const originalLog = console.log;
  const originalError = console.error;
  let logged = '';
  console.log = (msg: unknown) => { logged += String(msg) + '\n'; };
  console.error = () => {};

  try {
    const code = main(['run', 'examples/hello_world.sra']);
    assert.strictEqual(code, 0, `Expected exit 0, got 1`);
    assert.ok(
      logged.includes('Hello, Seira!'),
      `Expected 'Hello, Seira!' in output, got: ${JSON.stringify(logged)}`
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('CLI: run command validates before execution — invalid file fails', () => {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  try {
    const code = main(['run', 'examples/does_not_exist.sra']);
    assert.strictEqual(code, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('CLI: run command fails with type error, not crash', () => {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  try {
    // This file has a type error. run should fail at validation, not during execution.
    const code = main(['run', 'tests/fixtures/invalid/type_mismatch.sra']);
    assert.strictEqual(code, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('CLI: reserved commands return clear notification', () => {
  const originalLog = console.log;
  let logged = '';
  console.log = (msg) => {
    logged += msg + '\n';
  };

  try {
    const code = main(['build']);
    assert.strictEqual(code, 0);
    assert.ok(logged.includes('This command is not implemented in Seira 0.0.7-s.'));
    assert.ok(logged.includes('0.1.0-alpha'));
  } finally {
    console.log = originalLog;
  }
});

