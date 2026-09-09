const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelRecommender } = require('../out/calibration/recommender');

const base = { osPlatform: 'darwin', osRelease: '23.4.0', cpuCores: 8, freeRamGB: 4, hasCuda: false };

test('64 GB Apple Silicon maps to the power tier', () => {
  const r = ModelRecommender.evaluate({ ...base, cpuModel: 'Apple M3 Max', totalRamGB: 64, gpuName: 'M3 Max', vramGB: 48, isAppleSilicon: true });
  assert.equal(r.tier, 'power');
});
