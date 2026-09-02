"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngine = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const vectorStore_1 = require("./vectorStore");
const crawler_1 = require("./crawler");
const chunker_1 = require("./chunker");
const logger_1 = require("../utils/logger");
class ContextEngine {
    ollamaClient;
    vectorStore;
    isIndexing = false;
    indexedFilesCount = 0;
    activeContextChips = new Map();
    onChipsUpdatedEmitter = new vscode.EventEmitter();
    onStatusUpdatedEmitter = new vscode.EventEmitter();
    onChipsUpdated = this.onChipsUpdatedEmitter.event;
    onStatusUpdated = this.onStatusUpdatedEmitter.event;
    constructor(ollamaClient) {
        this.ollamaClient = ollamaClient;
        this.vectorStore = new vectorStore_1.LocalVectorStore();
        this.init();
    }
    async init() {
        await this.vectorStore.loadFromDisk();
        this.syncActiveEditorChip();
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.syncActiveEditorChip();
        });
    }
    getVectorStore() {
        return this.vectorStore;
    }
    getContextChips() {
        return Array.from(this.activeContextChips.values());
    }
    toggleChip(chipId) {
        const chip = this.activeContextChips.get(chipId);
        if (chip) {
            chip.active = !chip.active;
            this.onChipsUpdatedEmitter.fire(this.getContextChips());
        }
    }
    addFileChip(filePath) {
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
    removeChip(chipId) {
        this.activeContextChips.delete(chipId);
        this.onChipsUpdatedEmitter.fire(this.getContextChips());
    }
    syncActiveEditorChip() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.isUntitled)
            return;
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
    async indexWorkspace(progressCallback) {
        if (this.isIndexing)
            return this.vectorStore.getChunkCount();
        this.isIndexing = true;
        this.emitStatus();
        progressCallback?.('Crawling workspace files...', 10);
        logger_1.LuminaLogger.getInstance().log('Starting workspace indexing for Local RAG...');
        try {
            const files = await crawler_1.WorkspaceCrawler.scanWorkspace();
            this.indexedFilesCount = files.length;
            progressCallback?.(`Found ${files.length} code files. Generating semantic chunks...`, 30);
            const allChunks = [];
            for (const file of files) {
                try {
                    const doc = await vscode.workspace.fs.readFile(file.uri);
                    const text = Buffer.from(doc).toString('utf-8');
                    const fileChunks = chunker_1.CodeChunker.chunkFile(file.uri.fsPath, file.relativePath, text, file.language);
                    allChunks.push(...fileChunks);
                }
                catch {
                    // Skip unreadable files
                }
            }
            progressCallback?.(`Extracted ${allChunks.length} chunks. Computing vector embeddings...`, 50);
            // Attempt to generate embeddings via Ollama embedding model
            const config = vscode.workspace.getConfiguration('lumina');
            const embeddingModel = config.get('embeddingModel') || 'nomic-embed-text';
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
                        }
                        catch {
                            // Ignore single failure
                        }
                    }
                }
            }
            catch {
                logger_1.LuminaLogger.getInstance().warn('Embedding model not available in Ollama, using lexical hybrid indexing.');
            }
            this.vectorStore.clear();
            this.vectorStore.setChunks(allChunks);
            await this.vectorStore.saveToDisk();
            progressCallback?.(`Indexed ${allChunks.length} chunks across ${files.length} files.`, 100);
            logger_1.LuminaLogger.getInstance().log(`Workspace indexed successfully: ${allChunks.length} chunks.`);
            return allChunks.length;
        }
        finally {
            this.isIndexing = false;
            this.emitStatus();
        }
    }
    async retrieveRelevantContext(query, topK = 4) {
        const config = vscode.workspace.getConfiguration('lumina');
        const embeddingModel = config.get('embeddingModel') || 'nomic-embed-text';
        try {
            const queryEmbedding = await this.ollamaClient.getEmbeddings(embeddingModel, query);
            if (queryEmbedding && queryEmbedding.length > 0) {
                const vectorResults = this.vectorStore.searchByEmbedding(queryEmbedding, topK);
                if (vectorResults.length > 0) {
                    return vectorResults;
                }
            }
        }
        catch {
            // Fallback to keyword search
        }
        return this.vectorStore.searchByKeywords(query, topK);
    }
    async getActiveChipsContent() {
        const activeChips = Array.from(this.activeContextChips.values()).filter((c) => c.active);
        if (activeChips.length === 0)
            return '';
        const sections = [];
        for (const chip of activeChips) {
            try {
                const uri = vscode.Uri.file(chip.filePath);
                const data = await vscode.workspace.fs.readFile(uri);
                const content = Buffer.from(data).toString('utf-8');
                sections.push(`--- Context File: ${chip.relativePath} ---\n${content}\n`);
            }
            catch {
                // Skip
            }
        }
        return sections.join('\n');
    }
    emitStatus() {
        this.onStatusUpdatedEmitter.fire({
            indexing: this.isIndexing,
            indexedFiles: this.indexedFilesCount,
            totalChunks: this.vectorStore.getChunkCount(),
        });
    }
}
exports.ContextEngine = ContextEngine;
//# sourceMappingURL=contextEngine.js.map