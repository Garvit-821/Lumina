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
