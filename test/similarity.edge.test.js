const test = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../out/rag/similarity');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('opposite vectors score -1', () => {
  close(cosineSimilarity([1, 2], [-1, -2]), -1);
});
