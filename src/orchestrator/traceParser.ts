/** File extensions treated as source code when scanning test or compiler output for paths. */
const SOURCE_EXT = 'ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|c|cc|cpp|h|hpp|cs|rb|php|swift';
/**
 * Matches a relative or absolute path (optionally with a Windows drive letter) that ends in a source
 * extension and is followed by a line/column colon, bracket, quote, comma, whitespace or end of input,
 * as in "src/a.ts:12:5" or "(src/a.ts)".
 */
const PATH_RE = new RegExp(String.raw`(?:[A-Za-z]:)?[\w@./\\-]*[\w-]+\.(?:${SOURCE_EXT})(?=[:(\s'",)\]]|$)`, 'g');

/**
 * Source file paths mentioned in test/compiler output, most likely culprit first.
 * Dependency and build paths are dropped; files that appear more often rank higher, ties keep first-seen order.
 */
export function findCandidateFiles(output: string): string[] {
  const counts = new Map<string, number>();
  for (const match of output.matchAll(PATH_RE)) {
    const p = match[0].replace(/\\/g, '/').replace(/^\.\//, '');
    if (/(^|\/)(node_modules|dist|out|build|\.git|site-packages|target)\//.test(p)) continue;
    if (/^node:|^internal\//.test(p)) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}
