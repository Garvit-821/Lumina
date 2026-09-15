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

test('a 41-line file is split in two, the second window starting 30 lines in', () => {
  const chunks = CodeChunker.chunkFile('/p/a.ts', 'a.ts', linesOf(41), 'typescript');
  assert.equal(chunks.length, 2);
  assert.deepEqual([chunks[1].startLine, chunks[1].endLine], [31, 41]);
});
