import * as vscode from 'vscode';
import * as path from 'path';
import { OllamaClient } from '../ollama/client';
import { LocalVectorStore } from './vectorStore';
import { WorkspaceCrawler } from './crawler';
import { CodeChunker } from './chunker';
import { ContextChip, RAGChunk, VectorSearchResult } from '../types';
import { LuminaLogger } from '../utils/logger';

export class ContextEngine {
  private ollamaClient: OllamaClient;
  private vectorStore: LocalVectorStore;
  private isIndexing: boolean = false;
  private indexedFilesCount: number = 0;
  private activeContextChips: Map<string, ContextChip> = new Map();
  private onChipsUpdatedEmitter = new vscode.EventEmitter<ContextChip[]>();
  private onStatusUpdatedEmitter = new vscode.EventEmitter<{ indexing: boolean; indexedFiles: number; totalChunks: number }>();

  public readonly onChipsUpdated = this.onChipsUpdatedEmitter.event;
  public readonly onStatusUpdated = this.onStatusUpdatedEmitter.event;

  constructor(ollamaClient: OllamaClient) {
    this.ollamaClient = ollamaClient;
    this.vectorStore = new LocalVectorStore();
    this.init();
  }

  private async init(): Promise<void> {
    await this.vectorStore.loadFromDisk();
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
      const config = vscode.workspace.getConfiguration('lumina');
      const embeddingModel = config.get<string>('embeddingModel') || 'nomic-embed-text';

      let embeddingsSuccessful = false;
      try {
        const testVec = await this.ollamaClient.getEmbeddings(embeddingModel, 'test');
        if (testVec && testVec.length > 0) {
          embeddingsSuccessful = true;
          let count = 0;
          for (const chunk of allChunks) {
            count++;
            if (count % 10 === 0) {
              const pct = 50 + Math.round((count / allChunks.length) * 40);
              progressCallback?.(`Embedding chunk ${count}/${allChunks.length}...`, pct);
            }
            try {
              chunk.embedding = await this.ollamaClient.getEmbeddings(embeddingModel, chunk.content);
            } catch {
              // Ignore single failure
            }
          }
        }
      } catch {
        LuminaLogger.getInstance().warn('Embedding model not available in Ollama, using lexical hybrid indexing.');
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
    const config = vscode.workspace.getConfiguration('lumina');
    const embeddingModel = config.get<string>('embeddingModel') || 'nomic-embed-text';

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
      try {
        const uri = vscode.Uri.file(chip.filePath);
        const data = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(data).toString('utf-8');
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
