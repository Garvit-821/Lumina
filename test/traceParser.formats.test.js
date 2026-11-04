const test = require('node:test');
const assert = require('node:assert/strict');
const { findCandidateFiles } = require('../out/orchestrator/traceParser');

test('TypeScript compiler errors are recognised', () => {
  const out = "src/app.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";
  assert.deepEqual(findCandidateFiles(out), ['src/app.ts']);
});

test('a leading ./ is stripped from paths', () => {
  assert.deepEqual(findCandidateFiles('    at run (./src/a.ts:1:1)'), ['src/a.ts']);
});

test('Go panics and Rust compiler errors are recognised', () => {
  const out = 'main.go:14 +0x1d\nerror[E0308]: mismatched types\n  --> src/lib.rs:7:9';
  assert.deepEqual(findCandidateFiles(out), ['main.go', 'src/lib.rs']);
});
