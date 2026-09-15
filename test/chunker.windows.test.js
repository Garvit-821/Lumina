const test = require('node:test');
const assert = require('node:assert/strict');
const { CodeChunker } = require('../out/rag/chunker');

const linesOf = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

test('a file of exactly 40 lines is one chunk with its content untouched', () => {
  const text = linesOf(40);
  const chunks = CodeChunker.chunkFile('/p/a.ts', 'a.ts', text, 'typescript');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, text);
  assert.equal(chunks[0].id, 'a.ts:1-40');
});
