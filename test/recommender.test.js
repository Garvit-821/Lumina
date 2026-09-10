const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelRecommender } = require('../out/calibration/recommender');

const base = { osPlatform: 'darwin', osRelease: '23.4.0', cpuCores: 8, freeRamGB: 4, hasCuda: false };

test('64 GB Apple Silicon maps to the power tier', () => {
  const r = ModelRecommender.evaluate({ ...base, cpuModel: 'Apple M3 Max', totalRamGB: 64, gpuName: 'M3 Max', vramGB: 48, isAppleSilicon: true });
  assert.equal(r.tier, 'power');
});

test('16 GB Apple Silicon maps to the balanced tier', () => {
  const r = ModelRecommender.evaluate({ ...base, cpuModel: 'Apple M1', totalRamGB: 16, gpuName: 'M1', vramGB: 12, isAppleSilicon: true });
  assert.equal(r.tier, 'balanced');
  assert.equal(r.recommendedModel, 'qwen2.5-coder:7b');
});

test('8 GB laptop without a GPU maps to the low tier', () => {
  const r = ModelRecommender.evaluate({ ...base, osPlatform: 'linux', cpuModel: 'i5-8250U', totalRamGB: 8, gpuName: 'Intel UHD', vramGB: 0, isAppleSilicon: false });
  assert.equal(r.tier, 'low');
  assert.equal(r.recommendedModel, 'qwen2.5-coder:1.5b');
});
