const test = require('node:test');
const assert = require('node:assert/strict');
const { isLikelyFullFileReplacement } = require('../out/diff/proposalPolicy');

const file = [
  "import { readFile } from 'fs/promises';",
  "import { parse } from './parser';",
  '',
  'export async function load(path: string) {',
  "  const raw = await readFile(path, 'utf8');",
  '  return parse(raw);',
  '}',
  '',
  'export function validate(config: Config) {',
  '  if (!config.name) throw new Error("name required");',
  '  return true;',
  '}',
].join('\n');

test('a short example snippet is NOT treated as the whole file', () => {
  const snippet = 'export function validate(config: Config) {\n  return Boolean(config.name);\n}';
  assert.equal(isLikelyFullFileReplacement(file, snippet), false);
});
