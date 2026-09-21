import { RAGChunk } from '../types';

/**
 * Splits source files into overlapping line windows for the RAG index.
 * Chunk ids are `relativePath:start-end`, with 1-based inclusive line numbers.
 */
export class CodeChunker {
  /** Lines per chunk. A file with this many lines or fewer becomes a single chunk. */
  private static readonly CHUNK_SIZE_LINES = 40;
  /** Lines shared by consecutive chunks, so code near a boundary keeps some surrounding context. */
  private static readonly CHUNK_OVERLAP_LINES = 10;

  /**
   * Chunks one file. Files of up to 40 lines return one chunk holding the raw content; longer files are
   * cut into 40-line windows that advance 30 lines at a time, each prefixed with a
   * `// File: path (Lines a-b)` header (always a `//` comment, whatever the language).
   * `tokenCount` is a rough estimate of characters / 4. An empty string still yields one chunk.
   */
  public static chunkFile(
    filePath: string,
    relativePath: string,
    content: string,
    language: string
  ): RAGChunk[] {
    const lines = content.split('\n');
    if (lines.length === 0) return [];

    // If file is small, return as single chunk
    if (lines.length <= this.CHUNK_SIZE_LINES) {
      return [
        {
          id: `${relativePath}:1-${lines.length}`,
          filePath,
          relativePath,
          startLine: 1,
          endLine: lines.length,
          content,
          language,
          tokenCount: Math.ceil(content.length / 4),
        },
      ];
    }

    const chunks: RAGChunk[] = [];
    let startLine = 0;

    while (startLine < lines.length) {
      const endLine = Math.min(startLine + this.CHUNK_SIZE_LINES, lines.length);
      const chunkLines = lines.slice(startLine, endLine);
      const chunkText = chunkLines.join('\n');

      // Add context header with relative path and line numbers
      const annotatedContent = `// File: ${relativePath} (Lines ${startLine + 1}-${endLine})\n${chunkText}`;

      chunks.push({
        id: `${relativePath}:${startLine + 1}-${endLine}`,
        filePath,
        relativePath,
        startLine: startLine + 1,
        endLine,
        content: annotatedContent,
        language,
        tokenCount: Math.ceil(annotatedContent.length / 4),
      });

      if (endLine >= lines.length) break;
      startLine += this.CHUNK_SIZE_LINES - this.CHUNK_OVERLAP_LINES;
    }

    return chunks;
  }
}
