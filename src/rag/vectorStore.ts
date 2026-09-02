import * as vscode from 'vscode';
import * as path from 'path';
import { RAGChunk, VectorSearchResult } from '../types';
import { LuminaLogger } from '../utils/logger';

export class LocalVectorStore {
  private chunks: RAGChunk[] = [];
  private cachePath: string | null = null;

  constructor() {
    this.initCachePath();
  }

  private initCachePath(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.cachePath = path.join(workspaceFolders[0].uri.fsPath, '.lumina', 'vector_cache.json');
    }
  }

  public setChunks(chunks: RAGChunk[]): void {
    this.chunks = chunks;
  }

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
      const sim = this.cosineSimilarity(queryEmbedding, chunk.embedding);
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

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
        this.chunks = parsed;
        LuminaLogger.getInstance().log(`Loaded ${this.chunks.length} chunks from local vector cache.`);
        return true;
      }
    } catch {
      // Cache file doesn't exist yet
    }
    return false;
  }
}
