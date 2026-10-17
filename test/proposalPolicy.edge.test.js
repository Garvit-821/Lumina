const test = require('node:test');
const assert = require('node:assert/strict');
const { isLikelyFullFileReplacement } = require('../out/diff/proposalPolicy');

const statements = (n, prefix = 'const value') => Array.from({ length: n }, (_, i) => `${prefix}${i} = ${i};`);

test('whitespace-only originals accept any snippet', () => {
  assert.equal(isLikelyFullFileReplacement('  \n\n', 'const a = 1;'), true);
});
