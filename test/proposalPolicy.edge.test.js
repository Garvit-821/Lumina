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
