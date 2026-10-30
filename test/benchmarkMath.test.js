const test = require('node:test');
const assert = require('node:assert/strict');
const { tokensPerSecond, sameModel } = require('../out/calibration/benchmarkMath');

test("uses Ollama's own counters when available", () => {
  // 120 tokens in 3 seconds of generation
  assert.equal(tokensPerSecond({ eval_count: 120, eval_duration: 3e9 }, { chars: 1, generationMs: 99999 }), 40);
});
