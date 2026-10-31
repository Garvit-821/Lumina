const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelRecommender } = require('../out/calibration/recommender');

const pc = (totalRamGB, vramGB = 0) => ({
  osPlatform: 'linux', osRelease: '6.8', cpuModel: 'Ryzen 5', cpuCores: 8, freeRamGB: 4,
  gpuName: vramGB ? 'Discrete GPU' : 'Integrated', hasCuda: vramGB > 0, isAppleSilicon: false, totalRamGB, vramGB,
});
const mac = (totalRamGB) => ({
  osPlatform: 'darwin', osRelease: '23.4.0', cpuModel: 'Apple M2', cpuCores: 8, freeRamGB: 4,
  gpuName: 'Apple M2', hasCuda: false, isAppleSilicon: true, totalRamGB, vramGB: totalRamGB,
});
const tier = (t) => ModelRecommender.evaluate(t).tier;

test('32 GB of RAM reaches the power tier without a graphics card', () => {
  assert.equal(tier(pc(32)), 'power');
});

test('a 16 GB graphics card reaches the power tier on a 16 GB machine', () => {
  assert.equal(tier(pc(16, 16)), 'power');
});

test('24 GB Apple Silicon is power, 18 GB is balanced', () => {
  assert.equal(tier(mac(24)), 'power');
  assert.equal(tier(mac(18)), 'balanced');
});

test('8 GB Apple Silicon is balanced thanks to unified memory', () => {
  assert.equal(tier(mac(8)), 'balanced');
});

test('a 6 GB graphics card lifts an 8 GB PC to the balanced tier', () => {
  assert.equal(tier(pc(8, 6)), 'balanced');
});

test('an 8 GB PC with a 4 GB card stays in the low tier', () => {
  assert.equal(tier(pc(8, 4)), 'low');
});

test('12 GB of RAM without a GPU is balanced, 11 GB is low', () => {
  assert.equal(tier(pc(12)), 'balanced');
  assert.equal(tier(pc(11)), 'low');
});

test('the context window doubles with each tier', () => {
  const windows = [pc(8), pc(16), pc(64)].map((t) => ModelRecommender.evaluate(t).contextWindow);
  assert.deepEqual(windows, [4096, 8192, 16384]);
});
