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

test('a final line without a trailing newline is still parsed', async () => {
  assert.deepEqual(await collect(readNdjson(streamOf('{"done":true}'))), [{ done: true }]);
});

test('CRLF-delimited lines are parsed', async () => {
  const got = await collect(readNdjson(streamOf('{"a":1}\r\n{"a":2}\r\n')));
  assert.deepEqual(got, [{ a: 1 }, { a: 2 }]);
});

test('whitespace around a line is ignored', async () => {
  assert.deepEqual(await collect(readNdjson(streamOf('   {"a":1}  \n'))), [{ a: 1 }]);
});

test('values keep their JSON types', async () => {
  const got = await collect(readNdjson(streamOf('{"n":1.5,"b":false,"s":"x","z":null,"arr":[1,2]}\n')));
  assert.deepEqual(got, [{ n: 1.5, b: false, s: 'x', z: null, arr: [1, 2] }]);
});

test('a stream delivered one character at a time still reassembles', async () => {
  const text = '{"response":"Hel"}\n{"response":"lo"}\n';
  const got = await collect(readNdjson(streamOf(...text.split(''))));
  assert.deepEqual(got.map((c) => c.response).join(''), 'Hello');
});

test('assertOk resolves quietly for successful responses', async () => {
  assert.equal(await assertOk(new Response('ok', { status: 200 }), 'Ollama chat'), undefined);
});

test('assertOk falls back to the raw body when it is not JSON', async () => {
  const res = new Response('gateway timeout', { status: 504 });
  await assert.rejects(assertOk(res, 'Pulling foo'), /Pulling foo failed \(HTTP 504\): gateway timeout/);
});

test('assertOk leaves out the detail when the body is empty', async () => {
  const res = new Response('', { status: 500 });
  await assert.rejects(assertOk(res, 'Ollama generate'), { message: 'Ollama generate failed (HTTP 500)' });
});
