const test = require('node:test');
const assert = require('node:assert/strict');
const { findCandidateFiles } = require('../out/orchestrator/traceParser');

test('finds project files in a Node stack trace and skips node_modules / internals', () => {
  const out = `TypeError: x is undefined
    at sum (/repo/src/math.ts:12:5)
    at Object.<anonymous> (/repo/node_modules/jest/build/index.js:3:1)
    at node:internal/main/run_main_module.js:28:49
FAIL src/math.test.ts`;
  const files = findCandidateFiles(out);
  assert.ok(files.includes('/repo/src/math.ts'));
  assert.ok(files.includes('src/math.test.ts'));
  assert.ok(!files.some((f) => f.includes('node_modules') || f.startsWith('node:')));
});
