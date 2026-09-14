const test = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../out/rag/similarity');

test('identical vectors score 1, orthogonal vectors score 0', () => {
  assert.equal(Math.round(cosineSimilarity([1, 0, 1, 0], [1, 0, 1, 0])), 1);
  assert.equal(cosineSimilarity([1, 0, 1, 0], [0, 1, 0, 1]), 0);
});
