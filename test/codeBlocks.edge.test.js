const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCodeBlocks, extractFirstCodeBlock, extractCodeReply } = require('../out/utils/codeBlocks');

test('text without fences yields an empty list', () => {
  assert.deepEqual(extractCodeBlocks('Just prose, with `inline code` only.'), []);
});
