const test = require('node:test');
const assert = require('node:assert/strict');
const { CodeChunker } = require('../out/rag/chunker');

test('large files are split into overlapping annotated chunks', () => {
  const text = Array.from({ length: 120 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');
  const chunks = CodeChunker.chunkFile('/p/sample.ts', 'sample.ts', text, 'typescript');
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].language, 'typescript');
  assert.ok(chunks[0].content.includes('File: sample.ts'));
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks.at(-1).endLine, 120);
  assert.ok(chunks[1].startLine < chunks[0].endLine, 'chunks overlap');
});

test('small files stay as a single chunk', () => {
  const chunks = CodeChunker.chunkFile('/p/a.ts', 'a.ts', 'const a = 1;\n', 'typescript');
  assert.equal(chunks.length, 1);
});
