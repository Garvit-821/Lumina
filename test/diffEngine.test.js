const test = require('node:test');
const assert = require('node:assert/strict');
const { DiffEngine } = require('../out/diff/diffEngine');

test('createSuggestion produces an id, file path and at least one hunk', () => {
  const original = 'function calculateTotal(items) {\n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}';
  const proposed = 'function calculateTotal(items: Array<{ price: number }>): number {\n  return items.reduce((acc, item) => acc + item.price, 0);\n}';
  const s = DiffEngine.createSuggestion('src/billing.ts', original, proposed, 'Refactor');
  assert.match(s.id, /^diff_/);
  assert.equal(s.filePath, 'src/billing.ts');
  assert.equal(s.status, 'pending');
  assert.ok(s.hunks.length > 0);
});

test('identical input produces no hunks', () => {
  assert.deepEqual(DiffEngine.computeHunks('a\nb\nc', 'a\nb\nc'), []);
});

test('a one-line edit in a long file yields exactly one minimal hunk', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
  const changed = [...lines];
  changed[120] = 'line 120 (edited)';
  const hunks = DiffEngine.computeHunks(lines.join('\n'), changed.join('\n'));
  assert.equal(hunks.length, 1);
  assert.deepEqual(
    [hunks[0].oldStartLine, hunks[0].oldLineCount, hunks[0].newLineCount],
    [121, 1, 1]
  );
});

test('pure insertions and deletions are reported with zero-length sides', () => {
  const ins = DiffEngine.computeHunks('a\nc', 'a\nb\nc');
  assert.deepEqual([ins[0].oldStartLine, ins[0].oldLineCount, ins[0].modifiedLines], [2, 0, ['b']]);
  const del = DiffEngine.computeHunks('a\nb\nc', 'a\nc');
  assert.deepEqual([del[0].oldStartLine, del[0].oldLineCount, del[0].newLineCount], [2, 1, 0]);
});

test('repeated lines do not confuse the diff (greedy matching used to misalign here)', () => {
  const original = '}\n}\nfoo\n}\nbar';
  const proposed = '}\nfoo\n}\n}\nbar';
  const hunks = DiffEngine.computeHunks(original, proposed);
  assert.equal(DiffEngine.applyHunks(original, hunks), proposed);
  const changedLines = hunks.reduce((n, h) => n + h.oldLineCount + h.newLineCount, 0);
  assert.ok(changedLines <= 2, `expected a minimal diff, got ${changedLines} changed lines`);
});
