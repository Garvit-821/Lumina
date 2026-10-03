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

test('skips blank and malformed lines', async () => {
  const got = await collect(readNdjson(streamOf('\n{"ok":true}\nnot json\n\n')));
  assert.deepEqual(got, [{ ok: true }]);
});

test('handles multi-byte characters split across chunks', async () => {
  const bytes = new TextEncoder().encode('{"t":"✦"}\n');
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(bytes.slice(0, 7));
      c.enqueue(bytes.slice(7));
      c.close();
    },
  });
  assert.deepEqual(await collect(readNdjson(stream)), [{ t: '✦' }]);
});

test('assertOk surfaces the Ollama error message', async () => {
  const res = new Response(JSON.stringify({ error: 'model "foo" not found' }), { status: 404 });
  await assert.rejects(assertOk(res, 'Ollama chat'), /HTTP 404\): model "foo" not found/);
});
