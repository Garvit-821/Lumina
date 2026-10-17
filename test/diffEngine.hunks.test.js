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

test('two edits far apart become two hunks', () => {
  const before = numbered(20);
  const after = [...before];
  after[3] = 'changed 3';
  after[15] = 'changed 15';
  const hunks = DiffEngine.computeHunks(before.join('\n'), after.join('\n'));
  assert.deepEqual(hunks.map((h) => h.oldStartLine), [4, 16]);
});

test('hunk indexes count up from 1', () => {
  const before = numbered(12);
  const after = [...before];
  after[1] = 'x';
  after[6] = 'y';
  after[10] = 'z';
  const hunks = DiffEngine.computeHunks(before.join('\n'), after.join('\n'));
  assert.deepEqual(hunks.map((h) => h.hunkIndex), [1, 2, 3]);
});

test('unchanged leading and trailing lines never appear in a hunk', () => {
  const [h] = DiffEngine.computeHunks('keep 1\nkeep 2\nold\nkeep 3', 'keep 1\nkeep 2\nnew\nkeep 3');
  assert.deepEqual(h.originalLines, ['old']);
  assert.deepEqual(h.modifiedLines, ['new']);
});

test('clearing a file is a single hunk that applies back to empty text', () => {
  const hunks = DiffEngine.computeHunks('a\nb\nc', '');
  assert.equal(hunks.length, 1);
  assert.equal(DiffEngine.applyHunks('a\nb\nc', hunks), '');
});

test('inputs too large for the LCS table are diffed as one replacement', () => {
  const middle = numbered(2100);
  const before = ['first', ...middle, 'last'].join('\n');
  const after = ['FIRST', ...middle, 'LAST'].join('\n');
  const hunks = DiffEngine.computeHunks(before, after);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].oldLineCount, 2102);
  assert.equal(DiffEngine.applyHunks(before, hunks), after);
});

test('a new suggestion keeps both texts and starts with every hunk unaccepted', () => {
  const s = DiffEngine.createSuggestion('a.ts', 'one\ntwo', 'one\n2', 'Rename');
  assert.equal(s.originalCode, 'one\ntwo');
  assert.equal(s.proposedCode, 'one\n2');
  assert.equal(s.explanation, 'Rename');
  assert.ok(s.hunks.every((h) => h.accepted === false));
});
