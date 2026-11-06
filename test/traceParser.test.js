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

test('ranks the most-mentioned file first and handles Python and Windows paths', () => {
  const out = `  File "app/models.py", line 3\n  File "app/views.py", line 9\n  File "app/models.py", line 7\nC:\\proj\\lib\\util.js:4`;
  const files = findCandidateFiles(out);
  assert.equal(files[0], 'app/models.py');
  assert.ok(files.includes('C:/proj/lib/util.js'));
});
