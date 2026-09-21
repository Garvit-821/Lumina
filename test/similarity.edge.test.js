const test = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../out/rag/similarity');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('opposite vectors score -1', () => {
  close(cosineSimilarity([1, 2], [-1, -2]), -1);
});

test('vector length does not affect the score', () => {
  close(cosineSimilarity([1, 2, 3], [10, 20, 30]), 1);
});

test('the score is the same in both directions', () => {
  const a = [0.2, -1.5, 3];
  const b = [4, 0.1, -2];
  assert.equal(cosineSimilarity(a, b), cosineSimilarity(b, a));
});

test('vectors 45 degrees apart score about 0.707', () => {
  close(cosineSimilarity([1, 0], [1, 1]), Math.SQRT1_2);
});
