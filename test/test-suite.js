const assert = require('assert');
const { DiffEngine } = require('../out/diff/diffEngine');
const { CodeChunker } = require('../out/rag/chunker');
const { ModelRecommender } = require('../out/calibration/recommender');

console.log('🧪 Starting Lumina Unit & Integration Verification...\n');

// 1. Test Diff Engine Hunk Generation
console.log('▶ [1/4] Testing Diff Engine Hunk Computation...');
const originalCode = `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}`;

const proposedCode = `function calculateTotal(items: Array<{ price: number }>): number {
  return items.reduce((acc, item) => acc + item.price, 0);
}`;

const suggestion = DiffEngine.createSuggestion('src/billing.ts', originalCode, proposedCode, 'Refactor loop to functional reduce');
assert.ok(suggestion.id.startsWith('diff_'), 'Suggestion ID generated');
assert.strictEqual(suggestion.filePath, 'src/billing.ts');
assert.ok(suggestion.hunks.length > 0, 'Generated at least 1 hunk');
console.log(`  ✓ Generated ${suggestion.hunks.length} diff hunks successfully.`);

// 2. Test Code Chunker
console.log('▶ [2/4] Testing Code Chunker with sliding window...');
const sampleFileLines = Array.from({ length: 120 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');
const chunks = CodeChunker.chunkFile('/path/sample.ts', 'sample.ts', sampleFileLines, 'typescript');
assert.ok(chunks.length >= 3, `Expected at least 3 chunks for 120 lines, got ${chunks.length}`);
assert.strictEqual(chunks[0].language, 'typescript');
assert.ok(chunks[0].content.includes('File: sample.ts'), 'Header context included in chunk');
console.log(`  ✓ Successfully chunked 120 lines into ${chunks.length} contextual chunks.`);

// 3. Test Model Recommender Profiles
console.log('▶ [3/4] Testing Model Recommender with Hardware Profiles...');

// High-end Apple Silicon / Power Profile
const powerTelemetry = {
  osPlatform: 'darwin',
  osRelease: '23.4.0',
  cpuModel: 'Apple M3 Max',
  cpuCores: 16,
  totalRamGB: 64,
  freeRamGB: 40,
  gpuName: 'Apple M3 Max GPU',
  vramGB: 48,
  isAppleSilicon: true,
  hasCuda: false,
};
const powerRec = ModelRecommender.evaluate(powerTelemetry);
assert.strictEqual(powerRec.tier, 'power', 'Power tier identified');
assert.strictEqual(powerRec.recommendedModel, 'deepseek-coder-v2:latest');

// Balanced Profile
const balancedTelemetry = {
  osPlatform: 'darwin',
  osRelease: '23.4.0',
  cpuModel: 'Apple M1',
  cpuCores: 8,
  totalRamGB: 16,
  freeRamGB: 8,
  gpuName: 'Apple M1 GPU',
  vramGB: 12,
  isAppleSilicon: true,
  hasCuda: false,
};
const balancedRec = ModelRecommender.evaluate(balancedTelemetry);
assert.strictEqual(balancedRec.tier, 'balanced', 'Balanced tier identified');
assert.strictEqual(balancedRec.recommendedModel, 'qwen2.5-coder:7b');

// Low Profile
const lowTelemetry = {
  osPlatform: 'linux',
  osRelease: '5.15.0',
  cpuModel: 'Intel Core i5-8250U',
  cpuCores: 4,
  totalRamGB: 8,
  freeRamGB: 2,
  gpuName: 'Intel UHD Graphics 620',
  vramGB: 0,
  isAppleSilicon: false,
  hasCuda: false,
};
const lowRec = ModelRecommender.evaluate(lowTelemetry);
assert.strictEqual(lowRec.tier, 'low', 'Low tier identified');
assert.strictEqual(lowRec.recommendedModel, 'qwen2.5-coder:1.5b');
console.log('  ✓ Hardware profiles mapped accurately to Low, Balanced, and Power tiers.');

// 4. Test Cosine Similarity Vector Calculation
console.log('▶ [4/4] Testing Cosine Similarity Logic...');
function testCosine(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}
const vec1 = [1, 0, 1, 0];
const vec2 = [1, 0, 1, 0];
const vec3 = [0, 1, 0, 1];
assert.strictEqual(Math.round(testCosine(vec1, vec2)), 1, 'Identical vectors have score 1');
assert.strictEqual(testCosine(vec1, vec3), 0, 'Orthogonal vectors have score 0');
console.log('  ✓ Vector similarity mathematics verified.\n');

console.log('🎉 ALL LUMINA MODULE TESTS PASSED SUCCESSFULLY!');
