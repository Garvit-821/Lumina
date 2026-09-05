/**
 * Decides whether a code block from a chat reply is a full replacement for a file.
 * Chat replies often contain short examples; treating those as the whole file would delete everything else
 * when the user clicks "Accept all".
 */
export function isLikelyFullFileReplacement(original: string, snippet: string): boolean {
  if (!snippet.trim()) return false;
  if (!original.trim()) return true;

  const origLines = original.split('\n');
  const snipLines = snippet.split('\n');

  // Tiny files: any non-trivial snippet is plausibly the whole thing.
  if (origLines.length <= 5) return snipLines.length >= 1;

  // A full rewrite is rarely less than ~60% of the original length.
  if (snipLines.length < origLines.length * 0.6) return false;

  // It should also keep a meaningful share of the original's lines (imports, signatures, etc).
  const snippetSet = new Set(snipLines.map((l) => l.trim()).filter(Boolean));
  const meaningful = origLines.map((l) => l.trim()).filter((l) => l.length > 3);
  if (meaningful.length === 0) return true;
  const kept = meaningful.filter((l) => snippetSet.has(l)).length;
  return kept / meaningful.length >= 0.25;
}
