const test = require('node:test');
const assert = require('node:assert/strict');
const { readNdjson, assertOk } = require('../out/ollama/ndjson');

function streamOf(...parts) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      parts.forEach((p) => c.enqueue(enc.encode(p)));
      c.close();
    },
  });
}

async function collect(gen) {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
}

test('an empty stream yields nothing', async () => {
  assert.deepEqual(await collect(readNdjson(streamOf())), []);
});
