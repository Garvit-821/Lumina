const test = require('node:test');
const assert = require('node:assert/strict');
const { isLikelyFullFileReplacement } = require('../out/diff/proposalPolicy');

const statements = (n, prefix = 'const value') => Array.from({ length: n }, (_, i) => `${prefix}${i} = ${i};`);

test('whitespace-only originals accept any snippet', () => {
  assert.equal(isLikelyFullFileReplacement('  \n\n', 'const a = 1;'), true);
});

test('files of five lines or fewer accept any non-empty snippet', () => {
  assert.equal(isLikelyFullFileReplacement('a();\nb();\nc();', 'x();'), true);
});

test('a snippet under 60% of the original length is rejected even if every line matches', () => {
  const original = statements(10);
  assert.equal(isLikelyFullFileReplacement(original.join('\n'), original.slice(0, 5).join('\n')), false);
});

test('re-indented lines still count as kept', () => {
  const original = statements(10);
  const indented = original.map((l) => `    ${l}`);
  assert.equal(isLikelyFullFileReplacement(original.join('\n'), indented.join('\n')), true);
});

test('keeping exactly a quarter of the original lines is enough', () => {
  const original = statements(12);
  const rewrite = [...original.slice(0, 3), ...statements(9, 'let other')];
  assert.equal(isLikelyFullFileReplacement(original.join('\n'), rewrite.join('\n')), true);
});

test('keeping fewer than a quarter of the original lines is rejected', () => {
  const original = statements(12);
  const rewrite = [...original.slice(0, 2), ...statements(10, 'let other')];
  assert.equal(isLikelyFullFileReplacement(original.join('\n'), rewrite.join('\n')), false);
});
