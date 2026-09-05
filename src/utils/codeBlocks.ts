export interface CodeBlock {
  language: string;
  code: string;
}

const FENCE = /```([^\n`]*)\r?\n([\s\S]*?)```/g;

/** All fenced code blocks in a markdown reply, in order. Handles CRLF and info strings like ```ts title="a.ts". */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const match of markdown.matchAll(FENCE)) {
    blocks.push({
      language: match[1].trim().split(/\s+/)[0] || '',
      code: match[2].replace(/\r?\n$/, ''),
    });
  }
  return blocks;
}

/** The first fenced code block, or null when the reply has none. */
export function extractFirstCodeBlock(markdown: string): CodeBlock | null {
  return extractCodeBlocks(markdown)[0] ?? null;
}

/**
 * The code a model meant to return when it was asked for "only code": the first fenced block,
 * or the whole reply when the model skipped the fences.
 */
export function extractCodeReply(markdown: string): string {
  return extractFirstCodeBlock(markdown)?.code ?? markdown.trim();
}
