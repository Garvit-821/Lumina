const test = require('node:test');
const assert = require('node:assert/strict');
const { findCandidateFiles } = require('../out/orchestrator/traceParser');

test('TypeScript compiler errors are recognised', () => {
  const out = "src/app.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";
  assert.deepEqual(findCandidateFiles(out), ['src/app.ts']);
});
