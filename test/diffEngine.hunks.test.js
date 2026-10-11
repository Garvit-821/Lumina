const test = require('node:test');
const assert = require('node:assert/strict');
const { DiffEngine } = require('../out/diff/diffEngine');

const numbered = (n) => Array.from({ length: n }, (_, i) => `line ${i}`);

test('a change on the first line starts at line 1', () => {
  const [h] = DiffEngine.computeHunks('a\nb\nc', 'x\nb\nc');
  assert.deepEqual([h.oldStartLine, h.oldLineCount, h.newStartLine, h.modifiedLines], [1, 1, 1, ['x']]);
});

test('a change on the last line is located correctly', () => {
  const [h] = DiffEngine.computeHunks('a\nb\nc', 'a\nb\nz');
  assert.deepEqual([h.oldStartLine, h.originalLines, h.modifiedLines], [3, ['c'], ['z']]);
});
