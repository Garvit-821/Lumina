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

test('appended lines form an insert-only hunk after the last line', () => {
  const hunks = DiffEngine.computeHunks('a\nb', 'a\nb\nc\nd');
  assert.equal(hunks.length, 1);
  assert.deepEqual(
    [hunks[0].oldStartLine, hunks[0].oldLineCount, hunks[0].newStartLine, hunks[0].newLineCount],
    [3, 0, 3, 2]
  );
});
