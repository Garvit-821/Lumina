import { DiffHunk, DiffSuggestion } from '../types';

/** Above this many cells (old lines × new lines) the LCS table gets too big and we fall back to a greedy diff. */
const MAX_LCS_CELLS = 4_000_000;

type Op = 'equal' | 'delete' | 'insert';

export class DiffEngine {
  public static createSuggestion(
    filePath: string,
    originalCode: string,
    proposedCode: string,
    explanation: string = 'Lumina AI Code Modification'
  ): DiffSuggestion {
    const hunks = this.computeHunks(originalCode, proposedCode);
    return {
      id: `diff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      filePath,
      originalCode,
      proposedCode,
      explanation,
      hunks,
      createdAt: Date.now(),
      status: 'pending',
    };
  }

  /**
   * Line-level diff. Common leading/trailing lines are trimmed first, then the middle is diffed with a
   * longest-common-subsequence table, which gives the minimal set of changed lines.
   * Insert-only hunks have oldLineCount 0 and oldStartLine pointing at the line they are inserted before.
   */
  public static computeHunks(originalCode: string, proposedCode: string): DiffHunk[] {
    const a = originalCode.split('\n');
    const b = proposedCode.split('\n');

    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

    let suffix = 0;
    while (
      suffix < a.length - prefix &&
      suffix < b.length - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) {
      suffix++;
    }

    const midA = a.slice(prefix, a.length - suffix);
    const midB = b.slice(prefix, b.length - suffix);
    if (midA.length === 0 && midB.length === 0) return [];

    const ops =
      (midA.length + 1) * (midB.length + 1) <= MAX_LCS_CELLS
        ? this.lcsOps(midA, midB)
        : this.greedyOps(midA, midB);

    return this.opsToHunks(ops, midA, midB, prefix);
  }

  private static lcsOps(a: string[], b: string[]): Op[] {
    const n = a.length;
    const m = b.length;
    const width = m + 1;
    // table[i][j] = LCS length of a[i..] and b[j..]
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[i] === b[j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }

    const ops: Op[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push('equal');
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        ops.push('delete');
        i++;
      } else {
        ops.push('insert');
        j++;
      }
    }
    while (i++ < n) ops.push('delete');
    while (j++ < m) ops.push('insert');
    return ops;
  }

  /** Cheap fallback for very large inputs: treat the whole differing middle as one replacement. */
  private static greedyOps(a: string[], b: string[]): Op[] {
    return [...a.map((): Op => 'delete'), ...b.map((): Op => 'insert')];
  }

  private static opsToHunks(ops: Op[], a: string[], b: string[], offset: number): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let i = 0;
    let j = 0;
    let k = 0;

    while (k < ops.length) {
      if (ops[k] === 'equal') {
        i++;
        j++;
        k++;
        continue;
      }

      const startI = i;
      const startJ = j;
      while (k < ops.length && ops[k] !== 'equal') {
        if (ops[k] === 'delete') i++;
        else j++;
        k++;
      }

      const originalLines = a.slice(startI, i);
      const modifiedLines = b.slice(startJ, j);
      hunks.push({
        hunkIndex: hunks.length + 1,
        oldStartLine: offset + startI + 1,
        oldLineCount: originalLines.length,
        newStartLine: offset + startJ + 1,
        newLineCount: modifiedLines.length,
        originalLines,
        modifiedLines,
        accepted: false,
      });
    }

    return hunks;
  }

  /** Rebuilds the proposed text from the original plus every hunk. Used to verify hunks are self-consistent. */
  public static applyHunks(originalCode: string, hunks: DiffHunk[]): string {
    const lines = originalCode.split('\n');
    const sorted = [...hunks].sort((x, y) => y.oldStartLine - x.oldStartLine);
    for (const h of sorted) {
      lines.splice(h.oldStartLine - 1, h.oldLineCount, ...h.modifiedLines);
    }
    return lines.join('\n');
  }
}
