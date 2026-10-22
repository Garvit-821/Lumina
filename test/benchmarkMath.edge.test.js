const test = require('node:test');
const assert = require('node:assert/strict');
const { tokensPerSecond, sameModel } = require('../out/calibration/benchmarkMath');

test('throughput is rounded to one decimal place', () => {
  // 100 tokens in 3 seconds = 33.33… tokens/sec
  assert.equal(tokensPerSecond({ eval_count: 100, eval_duration: 3e9 }, { chars: 0, generationMs: 0 }), 33.3);
});
