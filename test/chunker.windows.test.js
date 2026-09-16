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

test('chunk ids encode the relative path and line range', () => {
  const chunks = CodeChunker.chunkFile('/p/f.ts', 'f.ts', linesOf(100), 'typescript');
  assert.deepEqual(chunks.map((c) => c.id), ['f.ts:1-40', 'f.ts:31-70', 'f.ts:61-100']);
});

test('every line of the file is covered by at least one chunk', () => {
  const total = 137;
  const chunks = CodeChunker.chunkFile('/p/f.ts', 'f.ts', linesOf(total), 'typescript');
  const covered = new Set();
  for (const c of chunks) {
    for (let l = c.startLine; l <= c.endLine; l++) covered.add(l);
  }
  assert.equal(covered.size, total);
});

test('split chunks start with a header naming the file and line range', () => {
  const chunks = CodeChunker.chunkFile('/p/lib/x.py', 'lib/x.py', linesOf(50), 'python');
  assert.ok(chunks[0].content.startsWith('// File: lib/x.py (Lines 1-40)\nline 1\n'));
  assert.ok(chunks[1].content.startsWith('// File: lib/x.py (Lines 31-50)\nline 31\n'));
});

test('token count is estimated as a quarter of the characters, rounded up', () => {
  assert.equal(CodeChunker.chunkFile('/p/a.ts', 'a.ts', 'abcdefgh', 'typescript')[0].tokenCount, 2);
  assert.equal(CodeChunker.chunkFile('/p/a.ts', 'a.ts', 'abcde', 'typescript')[0].tokenCount, 2);
});
