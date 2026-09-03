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
exports.LocalVectorStore = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
class LocalVectorStore {
    chunks = [];
    cachePath = null;
    constructor() {
        this.initCachePath();
    }
    initCachePath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.cachePath = path.join(workspaceFolders[0].uri.fsPath, '.lumina', 'vector_cache.json');
        }
    }
    setChunks(chunks) {
        this.chunks = chunks;
    }
    addChunks(newChunks) {
        const existingIds = new Set(this.chunks.map((c) => c.id));
        for (const chunk of newChunks) {
            if (!existingIds.has(chunk.id)) {
                this.chunks.push(chunk);
            }
        }
    }
    getAllChunks() {
        return this.chunks;
    }
    getChunkCount() {
        return this.chunks.length;
    }
    clear() {
        this.chunks = [];
    }
    searchByEmbedding(queryEmbedding, topK = 5) {
        if (this.chunks.length === 0 || queryEmbedding.length === 0) {
            return [];
        }
        const scored = [];
        for (const chunk of this.chunks) {
            if (!chunk.embedding || chunk.embedding.length === 0)
                continue;
            const sim = this.cosineSimilarity(queryEmbedding, chunk.embedding);
            scored.push({ chunk, similarity: sim });
        }
        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, topK);
    }
    searchByKeywords(query, topK = 5) {
        const terms = query
            .toLowerCase()
            .split(/[^a-zA-Z0-9_$]+/)
            .filter((t) => t.length > 2);
        if (terms.length === 0)
            return [];
        const scored = [];
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
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            const a = vecA[i];
            const b = vecB[i];
            if (typeof a !== 'number' || typeof b !== 'number' || isNaN(a) || isNaN(b))
                continue;
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (!isFinite(denominator) || denominator === 0)
            return 0;
        const sim = dotProduct / denominator;
        return isNaN(sim) || !isFinite(sim) ? 0 : sim;
    }
    async saveToDisk() {
        if (!this.cachePath)
            return;
        try {
            const dir = path.dirname(this.cachePath);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            const payload = JSON.stringify(this.chunks);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.cachePath), Buffer.from(payload, 'utf-8'));
            logger_1.LuminaLogger.getInstance().log(`Persisted ${this.chunks.length} chunks to local vector cache.`);
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().warn(`Failed to persist vector cache: ${err}`);
        }
    }
    async loadFromDisk() {
        if (!this.cachePath)
            return false;
        try {
            const data = await vscode.workspace.fs.readFile(vscode.Uri.file(this.cachePath));
            const parsed = JSON.parse(Buffer.from(data).toString('utf-8'));
            if (Array.isArray(parsed)) {
                this.chunks = parsed;
                logger_1.LuminaLogger.getInstance().log(`Loaded ${this.chunks.length} chunks from local vector cache.`);
                return true;
            }
        }
        catch {
            // Cache file doesn't exist yet
        }
        return false;
    }
}
exports.LocalVectorStore = LocalVectorStore;
//# sourceMappingURL=vectorStore.js.map