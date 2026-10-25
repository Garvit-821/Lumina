const test = require('node:test');
const assert = require('node:assert/strict');
const { tokensPerSecond, sameModel } = require('../out/calibration/benchmarkMath');

test('throughput is rounded to one decimal place', () => {
  // 100 tokens in 3 seconds = 33.33… tokens/sec
  assert.equal(tokensPerSecond({ eval_count: 100, eval_duration: 3e9 }, { chars: 0, generationMs: 0 }), 33.3);
});

test('counters with a zero duration are ignored in favour of the estimate', () => {
  assert.equal(tokensPerSecond({ eval_count: 50, eval_duration: 0 }, { chars: 400, generationMs: 1000 }), 100);
});

test('an eval_count of zero falls back to the estimate', () => {
  assert.equal(tokensPerSecond({ eval_count: 0, eval_duration: 1e9 }, { chars: 8, generationMs: 2000 }), 1);
});

test('the estimate assumes four characters per token, rounded up', () => {
  // 10 chars -> 3 tokens in one second
  assert.equal(tokensPerSecond({}, { chars: 10, generationMs: 1000 }), 3);
});

test('the estimate is 0 for negative durations or character counts', () => {
  assert.equal(tokensPerSecond({}, { chars: 100, generationMs: -5 }), 0);
  assert.equal(tokensPerSecond({}, { chars: -1, generationMs: 100 }), 0);
});
