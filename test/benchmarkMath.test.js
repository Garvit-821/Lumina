const test = require('node:test');
const assert = require('node:assert/strict');
const { tokensPerSecond, sameModel } = require('../out/calibration/benchmarkMath');

test("uses Ollama's own counters when available", () => {
  // 120 tokens in 3 seconds of generation
  assert.equal(tokensPerSecond({ eval_count: 120, eval_duration: 3e9 }, { chars: 1, generationMs: 99999 }), 40);
});

test('falls back to a wall-clock estimate, and to 0 with no data', () => {
  assert.equal(tokensPerSecond({}, { chars: 400, generationMs: 2000 }), 50);
  assert.equal(tokensPerSecond({}, { chars: 0, generationMs: 0 }), 0);
});
