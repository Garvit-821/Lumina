import * as vscode from 'vscode';
import * as path from 'path';
import { OllamaClient } from '../ollama/client';
import { LocalVectorStore } from './vectorStore';
import { WorkspaceCrawler } from './crawler';
import { CodeChunker } from './chunker';
import { ContextChip, RAGChunk, VectorSearchResult } from '../types';
import { LuminaLogger } from '../utils/logger';
import { isSecretFile } from './filePolicy';
import { getLuminaConfig } from '../utils/config';

/**
 * Supplies workspace context for prompts: builds and queries the local RAG index, and manages
 * context chips, the files pinned to the chat plus one chip that follows the active editor.
 */
export class ContextEngine {
  private ollamaClient: OllamaClient;
  private vectorStore: LocalVectorStore;
  private isIndexing: boolean = false;
  private indexedFilesCount: number = 0;
  private activeContextChips: Map<string, ContextChip> = new Map();
  private onChipsUpdatedEmitter = new vscode.EventEmitter<ContextChip[]>();
  private onStatusUpdatedEmitter = new vscode.EventEmitter<{ indexing: boolean; indexedFiles: number; totalChunks: number }>();

  /** Fires with the full chip list after a chip is added, removed, toggled or replaced. */
  public readonly onChipsUpdated = this.onChipsUpdatedEmitter.event;
  /** Fires when indexing starts or finishes, and after a cached index is loaded at startup. */
  public readonly onStatusUpdated = this.onStatusUpdatedEmitter.event;

  /**
   * Starts loading the cached index and tracking the active editor. That work is not awaited,
   * so the index can still be empty for a moment after construction.
   */
  constructor(ollamaClient: OllamaClient) {
    this.ollamaClient = ollamaClient;
    this.vectorStore = new LocalVectorStore();
    this.init();
  }

  private async init(): Promise<void> {
    if (await this.vectorStore.loadFromDisk()) {
      this.indexedFilesCount = this.vectorStore.getFileCount();
      this.emitStatus();
    }
    this.syncActiveEditorChip();

    vscode.window.onDidChangeActiveTextEditor(() => {
      this.syncActiveEditorChip();
    });
  }

  public getVectorStore(): LocalVectorStore {
    return this.vectorStore;
  }

  public getContextChips(): ContextChip[] {
    return Array.from(this.activeContextChips.values());
  }

  public toggleChip(chipId: string): void {
    const chip = this.activeContextChips.get(chipId);
    if (chip) {
      chip.active = !chip.active;
      this.onChipsUpdatedEmitter.fire(this.getContextChips());
    }
  }

  public addFileChip(filePath: string): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';
    const relativePath = rootPath ? path.relative(rootPath, filePath) : path.basename(filePath);
    const id = `file:${filePath}`;

    this.activeContextChips.set(id, {
      id,
      label: path.basename(filePath),
      filePath,
      relativePath,
      type: 'file',
      active: true,
    });

    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }

  public removeChip(chipId: string): void {
    this.activeContextChips.delete(chipId);
    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }

  public syncActiveEditorChip(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.isUntitled) return;

    const filePath = editor.document.uri.fsPath;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';
    const relativePath = rootPath ? path.relative(rootPath, filePath) : path.basename(filePath);
    const id = `active:${filePath}`;

    // Remove previous active chip
    for (const [key, chip] of this.activeContextChips.entries()) {
      if (key.startsWith('active:')) {
        this.activeContextChips.delete(key);
      }
    }

    this.activeContextChips.set(id, {
      id,
      label: `${path.basename(filePath)} (Active)`,
      filePath,
      relativePath,
      type: 'file',
      active: true,
      lineCount: editor.document.lineCount,
    });

    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }

  public async indexWorkspace(progressCallback?: (msg: string, percent: number) => void): Promise<number> {
    if (this.isIndexing) return this.vectorStore.getChunkCount();

    this.isIndexing = true;
    this.emitStatus();
    progressCallback?.('Crawling workspace files...', 10);
    LuminaLogger.getInstance().log('Starting workspace indexing for Local RAG...');

    try {
      const files = await WorkspaceCrawler.scanWorkspace();
      this.indexedFilesCount = files.length;
      progressCallback?.(`Found ${files.length} code files. Generating semantic chunks...`, 30);

      const allChunks: RAGChunk[] = [];

      for (const file of files) {
        try {
          const doc = await vscode.workspace.fs.readFile(file.uri);
          const text = Buffer.from(doc).toString('utf-8');
          const fileChunks = CodeChunker.chunkFile(
            file.uri.fsPath,
            file.relativePath,
            text,
            file.language
          );
          allChunks.push(...fileChunks);
        } catch {
          // Skip unreadable files
        }
      }

      progressCallback?.(`Extracted ${allChunks.length} chunks. Computing vector embeddings...`, 50);

      // Attempt to generate embeddings via Ollama embedding model
      const embeddingModel = getLuminaConfig().embeddingModel;

      const BATCH_SIZE = 16;
      const probe = await this.ollamaClient.getEmbeddings(embeddingModel, 'probe');
      if (probe.length > 0) {
        for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
          const batch = allChunks.slice(i, i + BATCH_SIZE);
          const vectors = await this.ollamaClient.getEmbeddingsBatch(
            embeddingModel,
            batch.map((c) => c.content)
          );
          batch.forEach((chunk, j) => {
            if (vectors[j]?.length) chunk.embedding = vectors[j];
          });
          const done = Math.min(i + BATCH_SIZE, allChunks.length);
          progressCallback?.(`Embedded ${done}/${allChunks.length} chunks...`, 50 + Math.round((done / allChunks.length) * 40));
        }
      } else {
        LuminaLogger.getInstance().warn(
          `Embedding model "${embeddingModel}" is not available in Ollama; using keyword search only. Run \`ollama pull ${embeddingModel}\` to enable semantic search.`
        );
      }

      this.vectorStore.clear();
      this.vectorStore.setChunks(allChunks);
      await this.vectorStore.saveToDisk();

      progressCallback?.(`Indexed ${allChunks.length} chunks across ${files.length} files.`, 100);
      LuminaLogger.getInstance().log(`Workspace indexed successfully: ${allChunks.length} chunks.`);
      return allChunks.length;
    } finally {
      this.isIndexing = false;
      this.emitStatus();
    }
  }

  public async retrieveRelevantContext(query: string, topK: number = 4): Promise<VectorSearchResult[]> {
    if (this.vectorStore.getChunkCount() === 0) return [];
    const embeddingModel = getLuminaConfig().embeddingModel;

    try {
      const queryEmbedding = await this.ollamaClient.getEmbeddings(embeddingModel, query);
      if (queryEmbedding && queryEmbedding.length > 0) {
        const vectorResults = this.vectorStore.searchByEmbedding(queryEmbedding, topK);
        if (vectorResults.length > 0) {
          return vectorResults;
        }
      }
    } catch {
      // Fallback to keyword search
    }

    return this.vectorStore.searchByKeywords(query, topK);
  }

  public async getActiveChipsContent(): Promise<string> {
    const activeChips = Array.from(this.activeContextChips.values()).filter((c) => c.active);
    if (activeChips.length === 0) return '';

    const sections: string[] = [];

    for (const chip of activeChips) {
      if (isSecretFile(path.basename(chip.filePath))) {
        sections.push(`--- Context File: ${chip.relativePath} (omitted: may contain secrets) ---\n`);
        continue;
      }
      try {
        const uri = vscode.Uri.file(chip.filePath);
        const data = await vscode.workspace.fs.readFile(uri);
        let content = Buffer.from(data).toString('utf-8');
        const MAX_CHARS_PER_FILE = 24_000;
        if (content.length > MAX_CHARS_PER_FILE) {
          content = `${content.slice(0, MAX_CHARS_PER_FILE)}\n… (truncated: file is ${content.length.toLocaleString()} characters)`;
        }
        sections.push(`--- Context File: ${chip.relativePath} ---\n${content}\n`);
      } catch {
        // Skip
      }
    }

    return sections.join('\n');
  }

  private emitStatus(): void {
    this.onStatusUpdatedEmitter.fire({
      indexing: this.isIndexing,
      indexedFiles: this.indexedFilesCount,
      totalChunks: this.vectorStore.getChunkCount(),
    });
  }
}
