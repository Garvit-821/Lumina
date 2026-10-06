const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCodeBlocks, extractFirstCodeBlock, extractCodeReply } = require('../out/utils/codeBlocks');

test('text without fences yields an empty list', () => {
  assert.deepEqual(extractCodeBlocks('Just prose, with `inline code` only.'), []);
});

test('blank lines and indentation inside a block are preserved', () => {
  const md = '```py\ndef f():\n\n    return 1\n```';
  assert.equal(extractFirstCodeBlock(md).code, 'def f():\n\n    return 1');
});
