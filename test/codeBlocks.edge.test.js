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

test('only the final newline before the closing fence is trimmed', () => {
  assert.equal(extractFirstCodeBlock('```\na\n\n```').code, 'a\n');
});

test('an unclosed fence is not a block', () => {
  const md = '```js\nconst a = 1;';
  assert.deepEqual(extractCodeBlocks(md), []);
  assert.equal(extractCodeReply(md), md);
});

test('extractCodeReply returns the first of several blocks', () => {
  const md = 'Before:\n```js\nold()\n```\nAfter:\n```js\nfresh()\n```';
  assert.equal(extractCodeReply(md), 'old()');
});

test('the language is the first word of the info string', () => {
  assert.equal(extractFirstCodeBlock('```typescript {1,3}\nx\n```').language, 'typescript');
});

test('an empty block yields empty code rather than null', () => {
  assert.deepEqual(extractFirstCodeBlock('```js\n```'), { language: 'js', code: '' });
});

test('CRLF line endings inside a block are kept', () => {
  assert.equal(extractFirstCodeBlock('```\r\na\r\nb\r\n```').code, 'a\r\nb');
});
