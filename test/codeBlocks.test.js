const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCodeBlocks, extractFirstCodeBlock, extractCodeReply } = require('../out/utils/codeBlocks');

test('extracts language and code from each fenced block', () => {
  const md = 'Here:\n```ts\nconst a = 1;\n```\nand\n```python\nprint(1)\n```';
  assert.deepEqual(extractCodeBlocks(md), [
    { language: 'ts', code: 'const a = 1;' },
    { language: 'python', code: 'print(1)' },
  ]);
});

test('supports CRLF, info strings and missing language', () => {
  assert.deepEqual(extractFirstCodeBlock('```c++ title="x"\r\nint x;\r\n```'), { language: 'c++', code: 'int x;' });
  assert.deepEqual(extractFirstCodeBlock('```\nplain\n```'), { language: '', code: 'plain' });
});

test('returns null without a block, and extractCodeReply falls back to the text', () => {
  assert.equal(extractFirstCodeBlock('no code here'), null);
  assert.equal(extractCodeReply('  const x = 1;  '), 'const x = 1;');
  assert.equal(extractCodeReply('Sure!\n```js\nx()\n```\nDone.'), 'x()');
});
