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

test('Java stack frames yield the source file name', () => {
  const files = findCandidateFiles('\tat com.acme.App.main(App.java:14)');
  assert.ok(files.includes('App.java'), JSON.stringify(files));
});

test('build output directories are ignored', () => {
  const out = 'at dist/extension.js:1:1\nat out/a.js:2:2\nat build/x.js:3:3';
  assert.deepEqual(findCandidateFiles(out), []);
});

test('Python site-packages frames are dropped', () => {
  const out = '  File "/usr/lib/python3/site-packages/django/core.py", line 1\n  File "app/main.py", line 2';
  assert.deepEqual(findCandidateFiles(out), ['app/main.py']);
});

test('files mentioned more often rank first', () => {
  assert.deepEqual(findCandidateFiles('src/a.ts:1\nsrc/b.ts:2\nsrc/b.ts:9'), ['src/b.ts', 'src/a.ts']);
});

test('ties keep the order in which files first appear', () => {
  assert.deepEqual(findCandidateFiles('b.py:1\na.py:2'), ['b.py', 'a.py']);
});

test('files without a source extension are ignored', () => {
  assert.deepEqual(findCandidateFiles('see README.md and config.yaml for details'), []);
});

test('paths through scoped packages are kept intact', () => {
  assert.deepEqual(findCandidateFiles('at packages/@app/core/index.ts:3:1'), ['packages/@app/core/index.ts']);
});
