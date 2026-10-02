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

test('reassembles JSON lines split across chunks', async () => {
  const got = await collect(readNdjson(streamOf('{"a":1}\n{"a"', ':2}\n', '{"a":3}')));
  assert.deepEqual(got, [{ a: 1 }, { a: 2 }, { a: 3 }]);
});
