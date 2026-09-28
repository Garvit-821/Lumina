import * as vscode from 'vscode';
import * as path from 'path';
import { RAGChunk, VectorSearchResult } from '../types';
import { LuminaLogger } from '../utils/logger';
import { cosineSimilarity } from './similarity';
import { isSecretFile } from './filePolicy';

/**
 * In-memory store of RAG chunks with brute-force cosine and keyword search, persisted as JSON in
 * `.lumina/vector_cache.json` under the first workspace folder. Every search scans all chunks.
 */
export class LocalVectorStore {
  private chunks: RAGChunk[] = [];
  /** Absolute path of the cache file, or null when no folder was open; persistence is then a no-op. */
  private cachePath: string | null = null;

  constructor() {
    this.initCachePath();
  }

  /** Resolves the cache path from the first workspace folder. Folders opened later are not picked up. */
  private initCachePath(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.cachePath = path.join(workspaceFolders[0].uri.fsPath, '.lumina', 'vector_cache.json');
    }
  }

  /** Replaces the whole index with `chunks`, keeping the array by reference. Does not save to disk. */
  public setChunks(chunks: RAGChunk[]): void {
    this.chunks = chunks;
  }

  /**
   * Appends chunks whose ids are not already present; a chunk with an existing id is ignored, not
   * updated. Does not save to disk.
   */
  public addChunks(newChunks: RAGChunk[]): void {
    const existingIds = new Set(this.chunks.map((c) => c.id));
    for (const chunk of newChunks) {
      if (!existingIds.has(chunk.id)) {
        this.chunks.push(chunk);
      }
    }
  }

  public getAllChunks(): RAGChunk[] {
    return this.chunks;
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  public getFileCount(): number {
    return new Set(this.chunks.map((c) => c.filePath)).size;
  }

  public clear(): void {
    this.chunks = [];
  }

  public searchByEmbedding(queryEmbedding: number[], topK: number = 5): VectorSearchResult[] {
    if (this.chunks.length === 0 || queryEmbedding.length === 0) {
      return [];
    }

    const scored: Array<{ chunk: RAGChunk; similarity: number }> = [];

    for (const chunk of this.chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
      scored.push({ chunk, similarity: sim });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  public searchByKeywords(query: string, topK: number = 5): VectorSearchResult[] {
    const terms = query
      .toLowerCase()
      .split(/[^a-zA-Z0-9_$]+/)
      .filter((t) => t.length > 2);

    if (terms.length === 0) return [];

    const scored: Array<{ chunk: RAGChunk; similarity: number }> = [];

    for (const chunk of this.chunks) {
      const text = chunk.content.toLowerCase();
      let matchCount = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        const score = matchCount / terms.length;
        scored.push({ chunk, similarity: score });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  public async saveToDisk(): Promise<void> {
    if (!this.cachePath) return;

    try {
      const dir = path.dirname(this.cachePath);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));

      const payload = JSON.stringify(this.chunks);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(this.cachePath),
        Buffer.from(payload, 'utf-8')
      );
      LuminaLogger.getInstance().log(`Persisted ${this.chunks.length} chunks to local vector cache.`);
    } catch (err) {
      LuminaLogger.getInstance().warn(`Failed to persist vector cache: ${err}`);
    }
  }

  public async loadFromDisk(): Promise<boolean> {
    if (!this.cachePath) return false;

    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(this.cachePath));
      const parsed = JSON.parse(Buffer.from(data).toString('utf-8')) as RAGChunk[];
      if (Array.isArray(parsed)) {
        // Caches written before secret filtering existed may contain .env and key files.
        this.chunks = parsed.filter((c) => !isSecretFile(path.basename(c.filePath || '')));
        LuminaLogger.getInstance().log(`Loaded ${this.chunks.length} chunks from local vector cache.`);
        return true;
      }
    } catch {
      // Cache file doesn't exist yet
    }
    return false;
  }
}
