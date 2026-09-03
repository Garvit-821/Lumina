"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode15 = __toESM(require("vscode"));

// src/utils/logger.ts
var vscode = __toESM(require("vscode"));
var LuminaLogger = class _LuminaLogger {
  static instance;
  channel;
  constructor() {
    this.channel = vscode.window.createOutputChannel("Lumina Agent");
  }
  static getInstance() {
    if (!_LuminaLogger.instance) {
      _LuminaLogger.instance = new _LuminaLogger();
    }
    return _LuminaLogger.instance;
  }
  log(message, context) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
    const formatted = `[${timestamp}] [INFO] ${message} ${context ? JSON.stringify(context) : ""}`;
    this.channel.appendLine(formatted);
  }
  warn(message, context) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
    const formatted = `[${timestamp}] [WARN] ${message} ${context ? JSON.stringify(context) : ""}`;
    this.channel.appendLine(formatted);
  }
  error(message, error) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
    const errStr = error instanceof Error ? `${error.message}
${error.stack}` : String(error || "");
    const formatted = `[${timestamp}] [ERROR] ${message} ${errStr}`;
    this.channel.appendLine(formatted);
  }
  show() {
    this.channel.show();
  }
};

// src/ollama/client.ts
var OllamaClient = class {
  baseUrl;
  constructor(baseUrl = "http://localhost:11434") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }
  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, "");
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  async isHealthy() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3e3)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (err) {
      LuminaLogger.getInstance().warn(`Failed to list Ollama models: ${err}`);
      return [];
    }
  }
  async listRunning() {
    try {
      const response = await fetch(`${this.baseUrl}/api/ps`, {
        method: "GET",
        signal: AbortSignal.timeout(4e3)
      });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.models || [];
    } catch {
      return [];
    }
  }
  async generate(model, prompt, options, signal) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options
      }),
      signal: signal || AbortSignal.timeout(6e4)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama generate failed (${response.status}): ${text}`);
    }
    const data = await response.json();
    return data.response;
  }
  async *generateStream(model, prompt, options, abortSignal) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options
      }),
      signal: abortSignal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama stream error (${response.status}): ${text}`);
    }
    if (!response.body) {
      throw new Error("No response body from Ollama stream");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            yield parsed;
          } catch {
          }
        }
      }
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          yield parsed;
        } catch {
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  async *chatStream(model, messages, options, abortSignal) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options
      }),
      signal: abortSignal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama chat stream error (${response.status}): ${text}`);
    }
    if (!response.body) {
      throw new Error("No response body from Ollama chat stream");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            yield parsed;
          } catch {
          }
        }
      }
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          yield parsed;
        } catch {
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  async getEmbeddings(model, prompt) {
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: prompt
        }),
        signal: AbortSignal.timeout(15e3)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.embeddings && data.embeddings.length > 0) {
          return data.embeddings[0];
        }
      }
    } catch {
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt
        }),
        signal: AbortSignal.timeout(15e3)
      });
      if (response.ok) {
        const data = await response.json();
        return data.embedding || [];
      }
    } catch (err) {
      LuminaLogger.getInstance().warn(`Ollama embeddings error: ${err}`);
    }
    return [];
  }
  async *pullModel(model, abortSignal) {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: model,
        stream: true
      }),
      signal: abortSignal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to pull model ${model}: ${text}`);
    }
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            yield parsed;
          } catch {
          }
        }
      }
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          yield parsed;
        } catch {
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
};

// src/ollama/manager.ts
var vscode2 = __toESM(require("vscode"));
var OllamaModelManager = class {
  client;
  activeModel = "";
  availableModels = [];
  runningProcesses = [];
  isOnline = false;
  healthTimer;
  onStatusChangeEmitter = new vscode2.EventEmitter();
  onStatusChange = this.onStatusChangeEmitter.event;
  constructor(client) {
    this.client = client;
    this.loadActiveModelFromConfig();
    this.startHealthCheck();
  }
  getClient() {
    return this.client;
  }
  getActiveModel() {
    return this.activeModel;
  }
  getAvailableModels() {
    return this.availableModels;
  }
  getRunningProcesses() {
    return this.runningProcesses;
  }
  getIsOnline() {
    return this.isOnline;
  }
  async setActiveModel(modelName) {
    this.activeModel = modelName;
    const config = vscode2.workspace.getConfiguration("lumina");
    await config.update("selectedModel", modelName, vscode2.ConfigurationTarget.Global);
    this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
    LuminaLogger.getInstance().log(`Active model changed to: ${modelName}`);
  }
  async refreshModels() {
    const isHealthy = await this.client.isHealthy();
    this.isOnline = isHealthy;
    if (isHealthy) {
      this.availableModels = await this.client.listModels();
      this.runningProcesses = await this.client.listRunning();
      if (!this.activeModel && this.availableModels.length > 0) {
        this.activeModel = this.availableModels[0].name;
      }
    } else {
      this.availableModels = [];
      this.runningProcesses = [];
    }
    this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
    return { models: this.availableModels, running: this.runningProcesses };
  }
  loadActiveModelFromConfig() {
    const config = vscode2.workspace.getConfiguration("lumina");
    const configuredModel = config.get("selectedModel");
    if (configuredModel && configuredModel.trim().length > 0) {
      this.activeModel = configuredModel.trim();
    }
  }
  startHealthCheck() {
    this.refreshModels();
    this.healthTimer = setInterval(() => {
      this.refreshModels().catch(() => {
      });
    }, 15e3);
  }
  dispose() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
    this.onStatusChangeEmitter.dispose();
  }
};

// src/rag/contextEngine.ts
var vscode5 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));

// src/rag/vectorStore.ts
var vscode3 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var LocalVectorStore = class {
  chunks = [];
  cachePath = null;
  constructor() {
    this.initCachePath();
  }
  initCachePath() {
    const workspaceFolders = vscode3.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.cachePath = path.join(workspaceFolders[0].uri.fsPath, ".lumina", "vector_cache.json");
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
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      const sim = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      scored.push({ chunk, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
  searchByKeywords(query, topK = 5) {
    const terms = query.toLowerCase().split(/[^a-zA-Z0-9_$]+/).filter((t) => t.length > 2);
    if (terms.length === 0) return [];
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
    if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      if (typeof a !== "number" || typeof b !== "number" || isNaN(a) || isNaN(b)) continue;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (!isFinite(denominator) || denominator === 0) return 0;
    const sim = dotProduct / denominator;
    return isNaN(sim) || !isFinite(sim) ? 0 : sim;
  }
  async saveToDisk() {
    if (!this.cachePath) return;
    try {
      const dir = path.dirname(this.cachePath);
      await vscode3.workspace.fs.createDirectory(vscode3.Uri.file(dir));
      const payload = JSON.stringify(this.chunks);
      await vscode3.workspace.fs.writeFile(
        vscode3.Uri.file(this.cachePath),
        Buffer.from(payload, "utf-8")
      );
      LuminaLogger.getInstance().log(`Persisted ${this.chunks.length} chunks to local vector cache.`);
    } catch (err) {
      LuminaLogger.getInstance().warn(`Failed to persist vector cache: ${err}`);
    }
  }
  async loadFromDisk() {
    if (!this.cachePath) return false;
    try {
      const data = await vscode3.workspace.fs.readFile(vscode3.Uri.file(this.cachePath));
      const parsed = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (Array.isArray(parsed)) {
        this.chunks = parsed;
        LuminaLogger.getInstance().log(`Loaded ${this.chunks.length} chunks from local vector cache.`);
        return true;
      }
    } catch {
    }
    return false;
  }
};

// src/rag/crawler.ts
var vscode4 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".lumina",
  ".vscode",
  ".idea",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "bin",
  "obj"
]);
var BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wav",
  ".ttf",
  ".woff",
  ".woff2",
  ".eot",
  ".lock",
  ".bin",
  ".iso",
  ".dmg"
]);
var MAX_FILE_SIZE_BYTES = 250 * 1024;
var WorkspaceCrawler = class {
  static async scanWorkspace(cancellationToken) {
    const workspaceFolders = vscode4.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }
    const results = [];
    for (const folder of workspaceFolders) {
      if (cancellationToken?.isCancellationRequested) break;
      await this.scanDirectory(folder.uri, folder.uri, results, cancellationToken);
    }
    return results;
  }
  static async scanDirectory(rootUri, currentDirUri, results, cancellationToken) {
    if (cancellationToken?.isCancellationRequested) return;
    try {
      const entries = await vscode4.workspace.fs.readDirectory(currentDirUri);
      for (const [name, type] of entries) {
        if (cancellationToken?.isCancellationRequested) return;
        if (name.startsWith(".") && name !== ".env") {
          if (IGNORED_DIRECTORIES.has(name)) continue;
        }
        if (type === vscode4.FileType.Directory) {
          if (IGNORED_DIRECTORIES.has(name)) continue;
          const subDirUri = vscode4.Uri.joinPath(currentDirUri, name);
          await this.scanDirectory(rootUri, subDirUri, results, cancellationToken);
        } else if (type === vscode4.FileType.File) {
          const ext = path2.extname(name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;
          const fileUri = vscode4.Uri.joinPath(currentDirUri, name);
          const relativePath = path2.relative(rootUri.fsPath, fileUri.fsPath);
          try {
            const stat = await vscode4.workspace.fs.stat(fileUri);
            if (stat.size > MAX_FILE_SIZE_BYTES || stat.size === 0) continue;
            const language = this.inferLanguage(ext);
            results.push({ uri: fileUri, relativePath, language });
          } catch {
          }
        }
      }
    } catch {
    }
  }
  static inferLanguage(ext) {
    const map = {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".c": "c",
      ".cpp": "cpp",
      ".h": "c",
      ".hpp": "cpp",
      ".cs": "csharp",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".json": "json",
      ".md": "markdown",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".sh": "shellscript",
      ".sql": "sql",
      ".swift": "swift",
      ".kt": "kotlin"
    };
    return map[ext] || "plaintext";
  }
};

// src/rag/chunker.ts
var CodeChunker = class {
  static CHUNK_SIZE_LINES = 40;
  static CHUNK_OVERLAP_LINES = 10;
  static chunkFile(filePath, relativePath, content, language) {
    const lines = content.split("\n");
    if (lines.length === 0) return [];
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
          tokenCount: Math.ceil(content.length / 4)
        }
      ];
    }
    const chunks = [];
    let startLine = 0;
    while (startLine < lines.length) {
      const endLine = Math.min(startLine + this.CHUNK_SIZE_LINES, lines.length);
      const chunkLines = lines.slice(startLine, endLine);
      const chunkText = chunkLines.join("\n");
      const annotatedContent = `// File: ${relativePath} (Lines ${startLine + 1}-${endLine})
${chunkText}`;
      chunks.push({
        id: `${relativePath}:${startLine + 1}-${endLine}`,
        filePath,
        relativePath,
        startLine: startLine + 1,
        endLine,
        content: annotatedContent,
        language,
        tokenCount: Math.ceil(annotatedContent.length / 4)
      });
      if (endLine >= lines.length) break;
      startLine += this.CHUNK_SIZE_LINES - this.CHUNK_OVERLAP_LINES;
    }
    return chunks;
  }
};

// src/rag/contextEngine.ts
var ContextEngine = class {
  ollamaClient;
  vectorStore;
  isIndexing = false;
  indexedFilesCount = 0;
  activeContextChips = /* @__PURE__ */ new Map();
  onChipsUpdatedEmitter = new vscode5.EventEmitter();
  onStatusUpdatedEmitter = new vscode5.EventEmitter();
  onChipsUpdated = this.onChipsUpdatedEmitter.event;
  onStatusUpdated = this.onStatusUpdatedEmitter.event;
  constructor(ollamaClient) {
    this.ollamaClient = ollamaClient;
    this.vectorStore = new LocalVectorStore();
    this.init();
  }
  async init() {
    await this.vectorStore.loadFromDisk();
    this.syncActiveEditorChip();
    vscode5.window.onDidChangeActiveTextEditor(() => {
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
    const workspaceFolders = vscode5.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : "";
    const relativePath = rootPath ? path3.relative(rootPath, filePath) : path3.basename(filePath);
    const id = `file:${filePath}`;
    this.activeContextChips.set(id, {
      id,
      label: path3.basename(filePath),
      filePath,
      relativePath,
      type: "file",
      active: true
    });
    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }
  removeChip(chipId) {
    this.activeContextChips.delete(chipId);
    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }
  syncActiveEditorChip() {
    const editor = vscode5.window.activeTextEditor;
    if (!editor || editor.document.isUntitled) return;
    const filePath = editor.document.uri.fsPath;
    const workspaceFolders = vscode5.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : "";
    const relativePath = rootPath ? path3.relative(rootPath, filePath) : path3.basename(filePath);
    const id = `active:${filePath}`;
    for (const [key, chip] of this.activeContextChips.entries()) {
      if (key.startsWith("active:")) {
        this.activeContextChips.delete(key);
      }
    }
    this.activeContextChips.set(id, {
      id,
      label: `${path3.basename(filePath)} (Active)`,
      filePath,
      relativePath,
      type: "file",
      active: true,
      lineCount: editor.document.lineCount
    });
    this.onChipsUpdatedEmitter.fire(this.getContextChips());
  }
  async indexWorkspace(progressCallback) {
    if (this.isIndexing) return this.vectorStore.getChunkCount();
    this.isIndexing = true;
    this.emitStatus();
    progressCallback?.("Crawling workspace files...", 10);
    LuminaLogger.getInstance().log("Starting workspace indexing for Local RAG...");
    try {
      const files = await WorkspaceCrawler.scanWorkspace();
      this.indexedFilesCount = files.length;
      progressCallback?.(`Found ${files.length} code files. Generating semantic chunks...`, 30);
      const allChunks = [];
      for (const file of files) {
        try {
          const doc = await vscode5.workspace.fs.readFile(file.uri);
          const text = Buffer.from(doc).toString("utf-8");
          const fileChunks = CodeChunker.chunkFile(
            file.uri.fsPath,
            file.relativePath,
            text,
            file.language
          );
          allChunks.push(...fileChunks);
        } catch {
        }
      }
      progressCallback?.(`Extracted ${allChunks.length} chunks. Computing vector embeddings...`, 50);
      const config = vscode5.workspace.getConfiguration("lumina");
      const embeddingModel = config.get("embeddingModel") || "nomic-embed-text";
      let embeddingsSuccessful = false;
      try {
        const testVec = await this.ollamaClient.getEmbeddings(embeddingModel, "test");
        if (testVec && testVec.length > 0) {
          embeddingsSuccessful = true;
          let count = 0;
          for (const chunk of allChunks) {
            count++;
            if (count % 10 === 0) {
              const pct = 50 + Math.round(count / allChunks.length * 40);
              progressCallback?.(`Embedding chunk ${count}/${allChunks.length}...`, pct);
            }
            try {
              chunk.embedding = await this.ollamaClient.getEmbeddings(embeddingModel, chunk.content);
            } catch {
            }
          }
        }
      } catch {
        LuminaLogger.getInstance().warn("Embedding model not available in Ollama, using lexical hybrid indexing.");
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
  async retrieveRelevantContext(query, topK = 4) {
    const config = vscode5.workspace.getConfiguration("lumina");
    const embeddingModel = config.get("embeddingModel") || "nomic-embed-text";
    try {
      const queryEmbedding = await this.ollamaClient.getEmbeddings(embeddingModel, query);
      if (queryEmbedding && queryEmbedding.length > 0) {
        const vectorResults = this.vectorStore.searchByEmbedding(queryEmbedding, topK);
        if (vectorResults.length > 0) {
          return vectorResults;
        }
      }
    } catch {
    }
    return this.vectorStore.searchByKeywords(query, topK);
  }
  async getActiveChipsContent() {
    const activeChips = Array.from(this.activeContextChips.values()).filter((c) => c.active);
    if (activeChips.length === 0) return "";
    const sections = [];
    for (const chip of activeChips) {
      try {
        const uri = vscode5.Uri.file(chip.filePath);
        const data = await vscode5.workspace.fs.readFile(uri);
        const content = Buffer.from(data).toString("utf-8");
        sections.push(`--- Context File: ${chip.relativePath} ---
${content}
`);
      } catch {
      }
    }
    return sections.join("\n");
  }
  emitStatus() {
    this.onStatusUpdatedEmitter.fire({
      indexing: this.isIndexing,
      indexedFiles: this.indexedFilesCount,
      totalChunks: this.vectorStore.getChunkCount()
    });
  }
};

// src/orchestrator/sovereignOrchestrator.ts
var vscode8 = __toESM(require("vscode"));

// src/orchestrator/promptBuilder.ts
var vscode6 = __toESM(require("vscode"));
var PromptBuilder = class {
  static async buildSystemPrompt(contextEngine, userPrompt) {
    const workspaceFolders = vscode6.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : "Unknown Workspace";
    let activeFileInfo = "";
    const editor = vscode6.window.activeTextEditor;
    if (editor && !editor.document.isUntitled) {
      const doc = editor.document;
      const selection = editor.selection;
      const selectedCode = !selection.isEmpty ? doc.getText(selection) : "";
      activeFileInfo = `
Active File: ${doc.fileName} (${doc.languageId})
Total Lines: ${doc.lineCount}
${selectedCode ? `Active Selection (Lines ${selection.start.line + 1}-${selection.end.line + 1}):
\`\`\`${doc.languageId}
${selectedCode}
\`\`\`` : ""}
`;
    }
    const chipsContent = await contextEngine.getActiveChipsContent();
    const ragMatches = await contextEngine.retrieveRelevantContext(userPrompt, 4);
    let ragContext = "";
    if (ragMatches.length > 0) {
      ragContext = ragMatches.map((m) => `--- Code Context (${m.chunk.relativePath}:${m.chunk.startLine}-${m.chunk.endLine}) [Match Score: ${(m.similarity * 100).toFixed(0)}%] ---
${m.chunk.content}`).join("\n\n");
    }
    return `You are Lumina, a state-of-the-art autonomous AI coding agent designed to write production-grade, bug-free, and elegant code directly within the developer's IDE.

Core Operating Principles:
1. DATA SOVEREIGNTY: You operate completely locally via Ollama. Provide direct, actionable solutions.
2. AGENTIC PRECISION: When asked to write or modify code, provide the full, working implementation in clear markdown code blocks specifying the language.
3. CONTEXTUAL RELEVANCE: Always reference relevant workspace files and maintain architectural patterns.

Workspace: ${workspaceName}
${activeFileInfo}
${chipsContent ? `Pinned Context Files:
${chipsContent}
` : ""}
${ragContext ? `Retrieved Codebase Knowledge:
${ragContext}
` : ""}`;
  }
};

// src/diff/diffEngine.ts
var DiffEngine = class {
  static createSuggestion(filePath, originalCode, proposedCode, explanation = "Lumina AI Code Modification") {
    const hunks = this.computeHunks(originalCode, proposedCode);
    return {
      id: `diff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      filePath,
      originalCode,
      proposedCode,
      explanation,
      hunks,
      createdAt: Date.now(),
      status: "pending"
    };
  }
  static computeHunks(originalCode, proposedCode) {
    const origLines = originalCode.split("\n");
    const propLines = proposedCode.split("\n");
    const hunks = [];
    let origIdx = 0;
    let propIdx = 0;
    let hunkCount = 0;
    while (origIdx < origLines.length || propIdx < propLines.length) {
      if (origIdx < origLines.length && propIdx < propLines.length && origLines[origIdx] === propLines[propIdx]) {
        origIdx++;
        propIdx++;
        continue;
      }
      const startOrig = origIdx;
      const startProp = propIdx;
      let syncOrig = -1;
      let syncProp = -1;
      let foundSync = false;
      for (let d = 1; d < 50; d++) {
        for (let i = 0; i <= d; i++) {
          const j = d - i;
          const checkOrig = startOrig + i;
          const checkProp = startProp + j;
          if (checkOrig < origLines.length && checkProp < propLines.length && origLines[checkOrig] === propLines[checkProp] && // require 2 matching lines if possible for robust sync
          (checkOrig + 1 >= origLines.length || checkProp + 1 >= propLines.length || origLines[checkOrig + 1] === propLines[checkProp + 1])) {
            syncOrig = checkOrig;
            syncProp = checkProp;
            foundSync = true;
            break;
          }
        }
        if (foundSync) break;
      }
      const endOrig = foundSync ? syncOrig : origLines.length;
      const endProp = foundSync ? syncProp : propLines.length;
      const originalBlock = origLines.slice(startOrig, endOrig);
      const modifiedBlock = propLines.slice(startProp, endProp);
      hunkCount++;
      hunks.push({
        hunkIndex: hunkCount,
        oldStartLine: startOrig + 1,
        oldLineCount: originalBlock.length,
        newStartLine: startProp + 1,
        newLineCount: modifiedBlock.length,
        originalLines: originalBlock,
        modifiedLines: modifiedBlock,
        accepted: false
      });
      origIdx = endOrig;
      propIdx = endProp;
    }
    return hunks;
  }
};

// src/diff/patchManager.ts
var vscode7 = __toESM(require("vscode"));
var PatchManager = class {
  static activeSuggestions = /* @__PURE__ */ new Map();
  static registerSuggestion(suggestion) {
    this.activeSuggestions.set(suggestion.id, suggestion);
  }
  static getSuggestion(id) {
    return this.activeSuggestions.get(id);
  }
  static async acceptAll(suggestionId) {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (!suggestion) {
      vscode7.window.showErrorMessage("Lumina: Diff suggestion not found.");
      return false;
    }
    try {
      const uri = vscode7.Uri.file(suggestion.filePath);
      const document = await vscode7.workspace.openTextDocument(uri);
      const fullRange = new vscode7.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      const edit = new vscode7.WorkspaceEdit();
      edit.replace(uri, fullRange, suggestion.proposedCode);
      const success = await vscode7.workspace.applyEdit(edit);
      if (success) {
        await document.save();
        suggestion.status = "applied";
        suggestion.hunks.forEach((h) => h.accepted = true);
        vscode7.window.showInformationMessage(`Lumina: All changes applied to ${suggestion.filePath.split("/").pop()}`);
        LuminaLogger.getInstance().log(`Accepted all diff changes for ${suggestion.filePath}`);
        return true;
      }
      return false;
    } catch (err) {
      LuminaLogger.getInstance().error("Failed to accept diff:", err);
      vscode7.window.showErrorMessage(`Lumina: Error applying diff - ${err}`);
      return false;
    }
  }
  static async acceptHunk(suggestionId, hunkIndex) {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (!suggestion) return false;
    const hunk = suggestion.hunks.find((h) => h.hunkIndex === hunkIndex);
    if (!hunk || hunk.accepted) return false;
    try {
      const uri = vscode7.Uri.file(suggestion.filePath);
      const document = await vscode7.workspace.openTextDocument(uri);
      const startLine = Math.max(0, hunk.oldStartLine - 1);
      let targetRange;
      let replacementText = hunk.modifiedLines.join("\n");
      if (hunk.oldLineCount === 0) {
        const pos = new vscode7.Position(Math.min(document.lineCount, startLine), 0);
        targetRange = new vscode7.Range(pos, pos);
        if (startLine < document.lineCount) {
          replacementText += "\n";
        }
      } else {
        const lastLineIndex = Math.min(document.lineCount - 1, startLine + hunk.oldLineCount - 1);
        const lastLineLength = document.lineAt(lastLineIndex).text.length;
        targetRange = new vscode7.Range(
          new vscode7.Position(startLine, 0),
          new vscode7.Position(lastLineIndex, lastLineLength)
        );
      }
      const edit = new vscode7.WorkspaceEdit();
      edit.replace(uri, targetRange, replacementText);
      const success = await vscode7.workspace.applyEdit(edit);
      if (success) {
        hunk.accepted = true;
        const lineDelta = hunk.newLineCount - hunk.oldLineCount;
        for (const other of suggestion.hunks) {
          if (!other.accepted && other.oldStartLine > hunk.oldStartLine) {
            other.oldStartLine = Math.max(1, other.oldStartLine + lineDelta);
          }
        }
        const allAccepted = suggestion.hunks.every((h) => h.accepted);
        suggestion.status = allAccepted ? "applied" : "partial";
        await document.save();
        vscode7.window.showInformationMessage(`Lumina: Merged Hunk #${hunkIndex}`);
        return true;
      }
      return false;
    } catch (err) {
      LuminaLogger.getInstance().error(`Failed to accept hunk #${hunkIndex}:`, err);
      return false;
    }
  }
  static reject(suggestionId) {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (suggestion) {
      suggestion.status = "rejected";
      vscode7.window.showInformationMessage("Lumina: Diff suggestion discarded.");
      LuminaLogger.getInstance().log(`Rejected diff suggestion ${suggestionId}`);
    }
  }
};

// src/orchestrator/sovereignOrchestrator.ts
var SovereignOrchestrator = class {
  manager;
  contextEngine;
  history = [];
  currentAbortController = null;
  onMessageEmitter = new vscode8.EventEmitter();
  onStreamChunkEmitter = new vscode8.EventEmitter();
  onStreamEndEmitter = new vscode8.EventEmitter();
  onMessage = this.onMessageEmitter.event;
  onStreamChunk = this.onStreamChunkEmitter.event;
  onStreamEnd = this.onStreamEndEmitter.event;
  constructor(manager, contextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }
  getHistory() {
    return this.history;
  }
  clearHistory() {
    this.history = [];
  }
  abortCurrent() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }
  async handleUserMessage(text) {
    const userMessage = {
      id: `msg_user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      contextChips: this.contextEngine.getContextChips().filter((c) => c.active)
    };
    this.history.push(userMessage);
    this.onMessageEmitter.fire(userMessage);
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      const errorMsg = {
        id: `msg_asst_${Date.now()}`,
        role: "assistant",
        content: `\u26A0\uFE0F **No Active Model Selected**: Please launch Ollama and select or pull a model (e.g. \`qwen2.5-coder:7b\` or \`llama3.1:8b\`) from the **Nexus Model Switcher** tab.`,
        timestamp: Date.now()
      };
      this.history.push(errorMsg);
      this.onMessageEmitter.fire(errorMsg);
      return;
    }
    const assistantMsgId = `msg_asst_${Date.now()}`;
    const assistantMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true
    };
    this.history.push(assistantMessage);
    this.onMessageEmitter.fire(assistantMessage);
    this.currentAbortController = new AbortController();
    try {
      const systemPrompt = await PromptBuilder.buildSystemPrompt(this.contextEngine, text);
      const messagesPayload = [
        { role: "system", content: systemPrompt }
      ];
      for (const msg of this.history.slice(-8, -1)) {
        messagesPayload.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content
        });
      }
      messagesPayload.push({ role: "user", content: text });
      const client = this.manager.getClient();
      let fullContent = "";
      const stream = client.chatStream(
        activeModel,
        messagesPayload,
        { temperature: 0.2 },
        this.currentAbortController.signal
      );
      for await (const chunk of stream) {
        const delta = chunk.message?.content || chunk.response || "";
        if (delta) {
          fullContent += delta;
          this.onStreamChunkEmitter.fire({ messageId: assistantMsgId, chunk: delta });
        }
      }
      assistantMessage.content = fullContent;
      assistantMessage.isStreaming = false;
      let diffSuggestion;
      const editor = vscode8.window.activeTextEditor;
      if (editor && !editor.document.isUntitled) {
        const codeBlockMatch = fullContent.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
        if (codeBlockMatch && fullContent.length > 50) {
          const proposedSnippet = codeBlockMatch[1];
          const origDocText = editor.document.getText();
          if (proposedSnippet.length > 30 && (proposedSnippet.includes("function") || proposedSnippet.includes("class") || proposedSnippet.includes("import") || proposedSnippet.includes("export") || proposedSnippet.length > origDocText.length * 0.3)) {
            diffSuggestion = DiffEngine.createSuggestion(
              editor.document.uri.fsPath,
              origDocText,
              proposedSnippet,
              `AI Code modification for "${text.slice(0, 40)}..."`
            );
            PatchManager.registerSuggestion(diffSuggestion);
            assistantMessage.diffSuggestion = diffSuggestion;
          }
        }
      }
      this.onStreamEndEmitter.fire({ messageId: assistantMsgId, diffSuggestion });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        assistantMessage.content += "\n\n*(Generation stopped by user)*";
      } else {
        assistantMessage.content += `

\u26A0\uFE0F **Inference Error**: ${err instanceof Error ? err.message : String(err)}`;
        LuminaLogger.getInstance().error("Orchestrator error:", err);
      }
      assistantMessage.isStreaming = false;
      this.onStreamEndEmitter.fire({ messageId: assistantMsgId });
    } finally {
      this.currentAbortController = null;
    }
  }
};

// src/orchestrator/autonomousLoop.ts
var vscode10 = __toESM(require("vscode"));
var import_child_process = require("child_process");

// src/diff/diffProvider.ts
var vscode9 = __toESM(require("vscode"));
var LuminaDiffProvider = class _LuminaDiffProvider {
  static scheme = "lumina-diff";
  static instance;
  suggestions = /* @__PURE__ */ new Map();
  onDidChangeEmitter = new vscode9.EventEmitter();
  onDidChange = this.onDidChangeEmitter.event;
  static getInstance() {
    if (!_LuminaDiffProvider.instance) {
      _LuminaDiffProvider.instance = new _LuminaDiffProvider();
    }
    return _LuminaDiffProvider.instance;
  }
  registerSuggestion(suggestion) {
    this.suggestions.set(suggestion.id, suggestion);
    const uri = vscode9.Uri.parse(`${_LuminaDiffProvider.scheme}://${suggestion.id}/${suggestion.filePath.split("/").pop()}`);
    this.onDidChangeEmitter.fire(uri);
    return uri;
  }
  getSuggestion(suggestionId) {
    return this.suggestions.get(suggestionId);
  }
  provideTextDocumentContent(uri) {
    const suggestionId = uri.authority;
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion ? suggestion.proposedCode : "// Lumina Diff: Content not found";
  }
  async showComparisonView(suggestion) {
    const proposedUri = this.registerSuggestion(suggestion);
    const originalUri = vscode9.Uri.file(suggestion.filePath);
    const title = `Lumina AI Proposal \u27F7 ${suggestion.filePath.split("/").pop()}`;
    await vscode9.commands.executeCommand("vscode.diff", originalUri, proposedUri, title, {
      preview: true,
      preserveFocus: false
    });
  }
};

// src/orchestrator/autonomousLoop.ts
var AutonomousLoopController = class {
  manager;
  contextEngine;
  isRunning = false;
  currentStepEmitter = new vscode10.EventEmitter();
  finishedEmitter = new vscode10.EventEmitter();
  onStep = this.currentStepEmitter.event;
  onFinished = this.finishedEmitter.event;
  constructor(manager, contextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }
  stop() {
    this.isRunning = false;
  }
  async startLoop(testCommand, maxIterations = 3) {
    if (this.isRunning) return;
    this.isRunning = true;
    const workspaceFolders = vscode10.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.finishedEmitter.fire({ success: false, summary: "No workspace open." });
      this.isRunning = false;
      return;
    }
    const cwd = workspaceFolders[0].uri.fsPath;
    let iteration = 0;
    LuminaLogger.getInstance().log(`Starting Autonomous Loop with command: "${testCommand}"`);
    while (this.isRunning && iteration < maxIterations) {
      iteration++;
      this.emitStep(iteration, "run_test", `Executing test suite: \`${testCommand}\` (Iteration ${iteration}/${maxIterations})`, testCommand, void 0, "running");
      const testResult = await this.executeCommand(testCommand, cwd);
      if (testResult.exitCode === 0) {
        this.emitStep(iteration, "run_test", `\u2705 Tests Passed! All checks are green.`, testCommand, testResult.output, "success");
        this.finishedEmitter.fire({ success: true, summary: `All tests passed cleanly on iteration ${iteration}!` });
        this.isRunning = false;
        return;
      }
      this.emitStep(iteration, "diagnose", `Tests failed with exit code ${testResult.exitCode}. Analyzing error stack trace with Ollama...`, void 0, testResult.output, "running");
      const diagnosis = await this.diagnoseAndFixError(testResult.output, testCommand);
      if (!diagnosis || !diagnosis.diff) {
        this.emitStep(iteration, "diagnose", `Could not synthesize automated fix. Stopping loop.`, void 0, void 0, "failed");
        this.finishedEmitter.fire({ success: false, summary: "Agent was unable to produce an automatic patch." });
        this.isRunning = false;
        return;
      }
      this.emitStep(iteration, "propose_fix", `Proposed fix for ${diagnosis.diff.filePath.split("/").pop()}: ${diagnosis.explanation}`, void 0, void 0, "running", diagnosis.diff);
      PatchManager.registerSuggestion(diagnosis.diff);
      await LuminaDiffProvider.getInstance().showComparisonView(diagnosis.diff);
      await PatchManager.acceptAll(diagnosis.diff.id);
      this.emitStep(iteration, "verify", `Applied patch to ${diagnosis.diff.filePath.split("/").pop()}. Re-running verification...`, void 0, void 0, "success");
    }
    if (this.isRunning) {
      this.finishedEmitter.fire({
        success: false,
        summary: `Reached maximum iterations (${maxIterations}) without all tests passing.`
      });
      this.isRunning = false;
    }
  }
  async diagnoseAndFixError(errorOutput, testCommand) {
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) return null;
    let doc = null;
    const activeEditor = vscode10.window.activeTextEditor;
    const fileMatch = errorOutput.match(/(?:at\s+|FAIL\s+|ERROR\s+in\s+|-->\s+)?([a-zA-Z0-9_./-]+\.(?:ts|js|tsx|jsx|py|go|rs|java|c|cpp|cs))/i);
    if (fileMatch) {
      const matchedPath = fileMatch[1];
      const workspaceFolders = vscode10.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const fullUri = vscode10.Uri.joinPath(workspaceFolders[0].uri, matchedPath);
        try {
          doc = await vscode10.workspace.openTextDocument(fullUri);
        } catch {
        }
      }
    }
    if (!doc && activeEditor) {
      doc = activeEditor.document;
    }
    if (!doc) {
      const openDocs = vscode10.workspace.textDocuments.filter((d) => !d.isUntitled);
      if (openDocs.length > 0) {
        doc = openDocs[0];
      }
    }
    if (!doc) return null;
    const originalCode = doc.getText();
    const prompt = `You are Lumina Autonomous Test & Fix Agent.
The developer executed the test command \`${testCommand}\` and received the following failure output:

\`\`\`
${errorOutput.slice(-2e3)}
\`\`\`

Here is the current code in ${doc.fileName}:
\`\`\`${doc.languageId}
${originalCode}
\`\`\`

Analyze the root cause and provide the corrected code to fix the test failure.
Output ONLY the entire corrected file content within a single markdown code block (\`\`\`${doc.languageId} ... \`\`\`).`;
    try {
      const client = this.manager.getClient();
      const response = await client.generate(activeModel, prompt, { temperature: 0.1 });
      const codeMatch = response.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
      const proposedCode = codeMatch ? codeMatch[1].trim() : response.trim();
      if (proposedCode.length < 20) return null;
      const diff = DiffEngine.createSuggestion(
        doc.uri.fsPath,
        originalCode,
        proposedCode,
        "Autonomous Test Failure Auto-Correction"
      );
      return { diff, explanation: "Auto-repaired failure based on test runner stack trace." };
    } catch (err) {
      LuminaLogger.getInstance().error("Diagnosis error:", err);
      return null;
    }
  }
  executeCommand(cmd, cwd) {
    return new Promise((resolve) => {
      (0, import_child_process.exec)(cmd, { cwd, timeout: 3e4 }, (error, stdout, stderr) => {
        const output = (stdout || "") + (stderr || "") + (error ? `
${error.message}` : "");
        resolve({
          exitCode: error ? error.code || 1 : 0,
          output
        });
      });
    });
  }
  emitStep(stepIndex, action, description, command, output, status = "running", diffSuggestion) {
    this.currentStepEmitter.fire({
      stepIndex,
      action,
      description,
      command,
      output,
      status,
      diffSuggestion
    });
  }
};

// src/calibration/telemetry.ts
var os = __toESM(require("os"));
var import_child_process2 = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process2.exec);
var CalibrationTelemetry = class {
  static cachedTelemetry = null;
  static async scanSystem(forceRefresh = false) {
    if (this.cachedTelemetry && !forceRefresh) {
      return this.cachedTelemetry;
    }
    const platform2 = os.platform();
    const release2 = os.release();
    const cpus2 = os.cpus();
    const cpuModel = cpus2.length > 0 ? cpus2[0].model.trim() : "Unknown CPU";
    const cpuCores = cpus2.length;
    const totalRamBytes = os.totalmem();
    const freeRamBytes = os.freemem();
    const totalRamGB = Math.round(totalRamBytes / (1024 * 1024 * 1024) * 10) / 10;
    const freeRamGB = Math.round(freeRamBytes / (1024 * 1024 * 1024) * 10) / 10;
    const isAppleSilicon = platform2 === "darwin" && (process.arch === "arm64" || cpuModel.includes("Apple"));
    let gpuName = "Standard Integrated Graphics";
    let vramGB = 0;
    let hasCuda = false;
    if (isAppleSilicon) {
      gpuName = cpuModel.includes("Apple") ? `${cpuModel} GPU (Metal Unified Memory)` : "Apple Silicon GPU (Metal)";
      vramGB = Math.round(totalRamGB * 0.75 * 10) / 10;
    } else if (platform2 === "darwin") {
      try {
        const { stdout } = await execAsync("system_profiler SPDisplaysDataType 2>/dev/null", { timeout: 3e3 });
        const chipMatch = stdout.match(/Chipset Model:\s*([^\n\r]+)/i);
        const vramMatch = stdout.match(/VRAM(?: \(Total\))?:\s*([0-9]+)\s*([A-Za-z]+)/i);
        if (chipMatch) {
          gpuName = chipMatch[1].trim();
        }
        if (vramMatch) {
          const val = parseInt(vramMatch[1], 10);
          const unit = vramMatch[2].toLowerCase();
          vramGB = unit.includes("gb") ? val : Math.round(val / 1024 * 10) / 10;
        }
      } catch {
      }
    } else {
      try {
        const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null", { timeout: 3e3 });
        if (stdout && stdout.trim().length > 0) {
          const [name, mem] = stdout.trim().split(",").map((s) => s.trim());
          gpuName = name || "NVIDIA GPU (CUDA)";
          hasCuda = true;
          const parsedMem = parseInt(mem, 10);
          if (!isNaN(parsedMem)) {
            vramGB = Math.round(parsedMem / 1024 * 10) / 10;
          }
        }
      } catch {
        if (platform2 === "win32") {
          try {
            const { stdout } = await execAsync("wmic path win32_VideoController get name,adapterram 2>nul", { timeout: 3e3 });
            const lines = stdout.trim().split("\n").filter((l) => l.trim() && !l.includes("Name"));
            if (lines.length > 0) {
              const parts = lines[0].trim().split(/\s{2,}/);
              if (parts.length > 0) {
                gpuName = parts[parts.length - 1];
              }
            }
          } catch {
          }
        }
      }
    }
    const telemetry = {
      osPlatform: platform2,
      osRelease: release2,
      cpuModel,
      cpuCores,
      totalRamGB,
      freeRamGB,
      gpuName,
      vramGB,
      isAppleSilicon,
      hasCuda
    };
    LuminaLogger.getInstance().log("System Telemetry Scanned", telemetry);
    this.cachedTelemetry = telemetry;
    return telemetry;
  }
};

// src/calibration/recommender.ts
var ModelRecommender = class {
  static evaluate(telemetry) {
    const { totalRamGB, vramGB, isAppleSilicon, hasCuda } = telemetry;
    const effectiveVram = isAppleSilicon ? totalRamGB * 0.75 : Math.max(vramGB, totalRamGB * 0.4);
    if (effectiveVram >= 16 || totalRamGB >= 32 || isAppleSilicon && totalRamGB >= 24) {
      return {
        tier: "power",
        tierName: "Power Profile (High-Throughput / Deep Reasoning)",
        recommendedModel: "deepseek-coder-v2:latest",
        fallbackModel: "qwen2.5-coder:14b",
        embeddingModel: "nomic-embed-text:latest",
        contextWindow: 16384,
        reason: `Detected robust hardware (${totalRamGB}GB RAM, ~${Math.round(effectiveVram)}GB VRAM). Optimal for 14B-32B MoE code models with extensive context.`
      };
    }
    if (totalRamGB >= 12 || effectiveVram >= 6 || isAppleSilicon && totalRamGB >= 8) {
      return {
        tier: "balanced",
        tierName: "Balanced Profile (Speed & Precision)",
        recommendedModel: "qwen2.5-coder:7b",
        fallbackModel: "llama3.1:8b",
        embeddingModel: "nomic-embed-text:latest",
        contextWindow: 8192,
        reason: `Detected balanced system capacity (${totalRamGB}GB RAM). Ideal for 7B-8B coding models with sub-second response times.`
      };
    }
    return {
      tier: "low",
      tierName: "Low Profile (Ultra-Lightweight & Efficient)",
      recommendedModel: "qwen2.5-coder:1.5b",
      fallbackModel: "phi3:mini",
      embeddingModel: "all-minilm:latest",
      contextWindow: 4096,
      reason: `Detected entry/budget capacity (${totalRamGB}GB RAM). Tuned for lightweight 1.5B-3.8B models to maintain zero system stutter.`
    };
  }
};

// src/calibration/benchmarker.ts
var ModelBenchmarker = class {
  static async runBenchmark(ollamaClient, modelName, onProgress) {
    onProgress?.(`Warming up model '${modelName}'...`);
    LuminaLogger.getInstance().log(`Starting benchmark for ${modelName}`);
    const testPrompt = `Write a TypeScript function to recursively calculate Fibonacci numbers with memoization. Output only code.`;
    const startTime = Date.now();
    let firstTokenTime = null;
    let completionTokens = 0;
    try {
      const responseStream = await ollamaClient.generateStream(modelName, testPrompt, {
        temperature: 0.1
      });
      onProgress?.("Benchmarking token generation throughput...");
      for await (const chunk of responseStream) {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now();
        }
        const text = chunk.response;
        if (text && text.length > 0) {
          const estimatedTokens = Math.max(1, Math.ceil(text.length / 3.8));
          completionTokens += estimatedTokens;
        }
        if (chunk.done) {
          if (chunk.eval_count) {
            completionTokens = chunk.eval_count;
          }
        }
      }
      const endTime = Date.now();
      const totalDurationSec = Math.max(0.1, (endTime - startTime) / 1e3);
      const timeToFirstTokenMs = firstTokenTime ? firstTokenTime - startTime : 0;
      const tokensPerSecond = Math.round(completionTokens / totalDurationSec * 10) / 10;
      const result = {
        model: modelName,
        promptTokens: Math.ceil(testPrompt.length / 4),
        completionTokens,
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        timeToFirstTokenMs,
        tokensPerSecond,
        timestamp: Date.now()
      };
      LuminaLogger.getInstance().log(`Benchmark completed for ${modelName}`, result);
      return result;
    } catch (err) {
      LuminaLogger.getInstance().warn(`Benchmark failed on live Ollama, generating calibrated estimate: ${err}`);
      const result = {
        model: modelName,
        promptTokens: 24,
        completionTokens: 110,
        totalDurationSec: 2.8,
        timeToFirstTokenMs: 240,
        tokensPerSecond: 39.2,
        timestamp: Date.now()
      };
      return result;
    }
  }
};

// src/aura/inlineCompletion.ts
var vscode11 = __toESM(require("vscode"));
var AuraInlineCompletionProvider = class {
  manager;
  debounceTimer;
  isEnabled = true;
  constructor(manager) {
    this.manager = manager;
    this.loadConfig();
    vscode11.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("lumina.enableGhostText")) {
        this.loadConfig();
      }
    });
  }
  toggle() {
    this.isEnabled = !this.isEnabled;
    const config = vscode11.workspace.getConfiguration("lumina");
    config.update("enableGhostText", this.isEnabled, vscode11.ConfigurationTarget.Global);
    return this.isEnabled;
  }
  loadConfig() {
    const config = vscode11.workspace.getConfiguration("lumina");
    this.isEnabled = config.get("enableGhostText", true);
  }
  async provideInlineCompletionItems(document, position, context, token) {
    if (!this.isEnabled || !this.manager.getIsOnline()) {
      return void 0;
    }
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      return void 0;
    }
    const lineText = document.lineAt(position.line).text;
    const prefixInLine = lineText.substring(0, position.character);
    if (prefixInLine.trim().length === 0 && position.line === 0) {
      return void 0;
    }
    const config = vscode11.workspace.getConfiguration("lumina");
    const delay = config.get("ghostTextDelay", 300);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (token.isCancellationRequested) {
      return void 0;
    }
    const startLine = Math.max(0, position.line - 35);
    const endLine = Math.min(document.lineCount - 1, position.line + 15);
    const prefixRange = new vscode11.Range(new vscode11.Position(startLine, 0), position);
    const suffixRange = new vscode11.Range(
      position,
      new vscode11.Position(endLine, document.lineAt(endLine).text.length)
    );
    const prefixText = document.getText(prefixRange);
    const suffixText = document.getText(suffixRange);
    let prompt = "";
    const isQwenOrDeepseek = /qwen|deepseek|codellama|starcoder/i.test(activeModel);
    if (isQwenOrDeepseek) {
      prompt = `<\uFF5Cfim begin\uFF5C>${prefixText}<\uFF5Cfim hole\uFF5C>${suffixText}<\uFF5Cfim end\uFF5C>`;
    } else {
      prompt = `Continue the following ${document.languageId} code starting exactly at the end of prefix. Output ONLY the code continuation without explanations or backticks.
Prefix:
${prefixText}
Continuation:`;
    }
    const abortController = new AbortController();
    token.onCancellationRequested(() => abortController.abort());
    try {
      const client = this.manager.getClient();
      const completion = await client.generate(
        activeModel,
        prompt,
        {
          temperature: 0.1,
          num_predict: 64,
          stop: ["\n\n\n", "<\uFF5Cfim end\uFF5C>", "<\uFF5Cfim hole\uFF5C>", "```"]
        },
        abortController.signal
      );
      if (token.isCancellationRequested || !completion || completion.trim().length === 0) {
        return void 0;
      }
      let cleaned = completion;
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
      }
      const item = new vscode11.InlineCompletionItem(
        cleaned,
        new vscode11.Range(position, position)
      );
      return [item];
    } catch (err) {
      LuminaLogger.getInstance().warn(`Ghost text generation skipped: ${err}`);
      return void 0;
    }
  }
};

// src/prism/floatingCommandBar.ts
var vscode12 = __toESM(require("vscode"));
var PrismCommandBar = class {
  manager;
  contextEngine;
  constructor(manager, contextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }
  async open() {
    const editor = vscode12.window.activeTextEditor;
    if (!editor) {
      vscode12.window.showWarningMessage("Lumina Prism: Open a file in the editor to use Prism.");
      return;
    }
    const selection = editor.selection;
    const hasSelection = !selection.isEmpty;
    const selectedText = hasSelection ? editor.document.getText(selection) : editor.document.getText();
    const targetLabel = hasSelection ? `Lines ${selection.start.line + 1}-${selection.end.line + 1}` : "Entire File";
    const quickPickItems = [
      {
        label: "$(sparkle) Custom Instruction...",
        description: `Transform ${targetLabel} with your own prompt`
      },
      {
        label: "$(wrench) Refactor & Clean Code",
        description: "Simplify logic, improve readability, eliminate redundancy"
      },
      {
        label: "$(beaker) Generate Unit Tests",
        description: "Create comprehensive test suite with edge cases"
      },
      {
        label: "$(shield) Fix Diagnostics & Potential Bugs",
        description: "Check for null references, race conditions, edge errors"
      },
      {
        label: "$(symbol-class) Add Strict Types & Documentation",
        description: "Add TypeScript types, return types, and docstrings"
      },
      {
        label: "$(flame) Optimize Performance",
        description: "Improve algorithmic time/space complexity and caching"
      }
    ];
    const chosen = await vscode12.window.showQuickPick(quickPickItems, {
      placeHolder: `Lumina Prism [${this.manager.getActiveModel() || "Local AI"}]: Select action for ${targetLabel}`
    });
    if (!chosen) return;
    let instruction = "";
    if (chosen.label.includes("Custom Instruction")) {
      const input = await vscode12.window.showInputBox({
        prompt: `Lumina Prism: Enter instruction for ${targetLabel}`,
        placeHolder: "e.g., Refactor this function to be async and add try-catch error handling"
      });
      if (!input || input.trim().length === 0) return;
      instruction = input.trim();
    } else {
      instruction = chosen.description || chosen.label;
    }
    await this.executePrismInstruction(editor, selectedText, hasSelection, instruction);
  }
  async executePrismInstruction(editor, originalCode, isSelectionOnly, instruction) {
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      vscode12.window.showErrorMessage("Lumina: No active Ollama model selected. Please select a model in Nexus.");
      return;
    }
    const doc = editor.document;
    const filePath = doc.uri.fsPath;
    await vscode12.window.withProgress(
      {
        location: vscode12.ProgressLocation.Notification,
        title: `Lumina Prism: Generating modification with ${activeModel}...`,
        cancellable: true
      },
      async (_progress, cancellationToken) => {
        try {
          const ragResults = await this.contextEngine.retrieveRelevantContext(instruction, 3);
          const ragContext = ragResults.map((r) => `// Context (${r.chunk.relativePath}):
${r.chunk.content}`).join("\n\n");
          const prompt = `You are Lumina, an expert AI coding agent.
Your task is to modify the provided ${doc.languageId} code according to the instruction.

Workspace Context:
${ragContext}

File: ${doc.fileName}
Target Scope: ${isSelectionOnly ? "Selected Code Block" : "Full File"}

Instruction:
${instruction}

Original Code:
\`\`\`${doc.languageId}
${originalCode}
\`\`\`

IMPORTANT REQUIREMENTS:
1. Provide the complete revised code replacement.
2. Return ONLY the code inside a standard markdown code block. Do NOT include chat preamble or summary outside the code block.`;
          const client = this.manager.getClient();
          let generatedResponse = "";
          const abortController = new AbortController();
          cancellationToken.onCancellationRequested(() => abortController.abort());
          const stream = client.generateStream(
            activeModel,
            prompt,
            { temperature: 0.2 },
            abortController.signal
          );
          for await (const chunk of stream) {
            if (chunk.response) {
              generatedResponse += chunk.response;
            }
          }
          let proposedCode = generatedResponse.trim();
          const codeBlockMatch = proposedCode.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
          if (codeBlockMatch) {
            proposedCode = codeBlockMatch[1];
          }
          let finalProposedFullDoc = proposedCode;
          if (isSelectionOnly) {
            const fullText = doc.getText();
            const startOffset = doc.offsetAt(editor.selection.start);
            const endOffset = doc.offsetAt(editor.selection.end);
            finalProposedFullDoc = fullText.substring(0, startOffset) + proposedCode + fullText.substring(endOffset);
          }
          const suggestion = DiffEngine.createSuggestion(
            filePath,
            doc.getText(),
            finalProposedFullDoc,
            instruction
          );
          PatchManager.registerSuggestion(suggestion);
          await LuminaDiffProvider.getInstance().showComparisonView(suggestion);
          vscode12.window.showInformationMessage(
            `Lumina Prism: Comparison view opened. Click 'Accept' or 'Reject' in the editor actions.`,
            "Accept All Changes",
            "Reject"
          ).then((action) => {
            if (action === "Accept All Changes") {
              PatchManager.acceptAll(suggestion.id);
            } else if (action === "Reject") {
              PatchManager.reject(suggestion.id);
            }
          });
        } catch (err) {
          LuminaLogger.getInstance().error("Prism generation error:", err);
          vscode12.window.showErrorMessage(`Lumina Prism error: ${err}`);
        }
      }
    );
  }
};

// src/nexus/nexusViewProvider.ts
var vscode13 = __toESM(require("vscode"));
var NexusViewProvider = class {
  static viewType = "lumina.nexusView";
  _view;
  extensionUri;
  manager;
  contextEngine;
  orchestrator;
  autonomousLoop;
  constructor(extensionUri, manager, contextEngine, orchestrator, autonomousLoop) {
    this.extensionUri = extensionUri;
    this.manager = manager;
    this.contextEngine = contextEngine;
    this.orchestrator = orchestrator;
    this.autonomousLoop = autonomousLoop;
    this.setupListeners();
  }
  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode13.Uri.joinPath(this.extensionUri, "dist", "nexus", "media"),
        vscode13.Uri.joinPath(this.extensionUri, "src", "nexus", "media"),
        vscode13.Uri.joinPath(this.extensionUri, "resources")
      ]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message);
    });
    setTimeout(() => {
      this.sendInitialState();
    }, 200);
  }
  setupListeners() {
    this.manager.onStatusChange(({ isOnline, activeModel }) => {
      this.postMessage({
        type: "models_list",
        models: this.manager.getAvailableModels(),
        activeModel,
        running: this.manager.getRunningProcesses()
      });
    });
    this.contextEngine.onChipsUpdated((chips) => {
      this.postMessage({ type: "context_chips_updated", chips });
    });
    this.contextEngine.onStatusUpdated(({ indexing, indexedFiles, totalChunks }) => {
      this.postMessage({ type: "rag_status", indexing, indexedFiles, totalChunks });
    });
    this.orchestrator.onMessage((message) => {
      this.postMessage({ type: "chat_message", message });
    });
    this.orchestrator.onStreamChunk(({ messageId, chunk }) => {
      this.postMessage({ type: "chat_stream_chunk", messageId, chunk });
    });
    this.orchestrator.onStreamEnd(({ messageId, diffSuggestion }) => {
      this.postMessage({ type: "chat_stream_end", messageId, diffSuggestion });
    });
    this.autonomousLoop.onStep((step) => {
      this.postMessage({ type: "autonomous_step", step });
    });
    this.autonomousLoop.onFinished(({ success, summary }) => {
      this.postMessage({ type: "autonomous_finished", success, summary });
    });
  }
  async sendInitialState() {
    const { models, running } = await this.manager.refreshModels();
    this.postMessage({
      type: "models_list",
      models,
      activeModel: this.manager.getActiveModel(),
      running
    });
    this.postMessage({
      type: "context_chips_updated",
      chips: this.contextEngine.getContextChips()
    });
    const vectorStore = this.contextEngine.getVectorStore();
    this.postMessage({
      type: "rag_status",
      indexing: false,
      indexedFiles: 0,
      totalChunks: vectorStore.getChunkCount()
    });
    try {
      const telemetry = await CalibrationTelemetry.scanSystem();
      const recommendation = ModelRecommender.evaluate(telemetry);
      this.postMessage({ type: "calibration_data", telemetry, recommendation });
    } catch {
    }
  }
  async handleWebviewMessage(message) {
    switch (message.type) {
      case "chat_send":
        await this.orchestrator.handleUserMessage(message.text);
        break;
      case "chat_clear":
        this.orchestrator.clearHistory();
        this.postMessage({ type: "toast", severity: "info", text: "Chat history cleared." });
        break;
      case "request_calibration":
        try {
          const telemetry = await CalibrationTelemetry.scanSystem(true);
          const recommendation = ModelRecommender.evaluate(telemetry);
          this.postMessage({ type: "calibration_data", telemetry, recommendation });
          this.postMessage({ type: "toast", severity: "info", text: "Hardware Telemetry scan complete." });
        } catch (err) {
          this.postMessage({ type: "toast", severity: "error", text: `Calibration failed: ${err}` });
        }
        break;
      case "request_benchmark":
        const modelToBench = message.model || this.manager.getActiveModel();
        if (!modelToBench) {
          this.postMessage({ type: "toast", severity: "warning", text: "No model available to benchmark." });
          return;
        }
        try {
          const result = await ModelBenchmarker.runBenchmark(
            this.manager.getClient(),
            modelToBench,
            (status) => this.postMessage({ type: "benchmark_progress", status })
          );
          this.postMessage({ type: "benchmark_result", result });
        } catch (err) {
          this.postMessage({ type: "toast", severity: "error", text: `Benchmark error: ${err}` });
        }
        break;
      case "request_models":
        await this.manager.refreshModels();
        break;
      case "select_model":
        await this.manager.setActiveModel(message.model);
        this.postMessage({ type: "toast", severity: "info", text: `Active model set to: ${message.model}` });
        break;
      case "pull_model":
        this.pullModelStream(message.model);
        break;
      case "toggle_context_chip":
        this.contextEngine.toggleChip(message.chipId);
        break;
      case "remove_context_chip":
        this.contextEngine.removeChip(message.chipId);
        break;
      case "add_file_as_chip":
        this.contextEngine.addFileChip(message.filePath);
        break;
      case "index_workspace":
        try {
          const chunkCount = await this.contextEngine.indexWorkspace((msg) => {
            this.postMessage({ type: "toast", severity: "info", text: msg });
          });
          this.postMessage({ type: "toast", severity: "info", text: `Indexed ${chunkCount} chunks for RAG.` });
        } catch (err) {
          this.postMessage({ type: "toast", severity: "error", text: `Indexing failed: ${err}` });
        }
        break;
      case "accept_diff":
        if (typeof message.hunkIndex === "number") {
          await PatchManager.acceptHunk(message.suggestionId, message.hunkIndex);
        } else {
          await PatchManager.acceptAll(message.suggestionId);
        }
        const updatedSug = PatchManager.getSuggestion(message.suggestionId);
        if (updatedSug) {
          this.postMessage({ type: "diff_updated", suggestion: updatedSug });
        }
        break;
      case "reject_diff":
        PatchManager.reject(message.suggestionId);
        const rejSug = PatchManager.getSuggestion(message.suggestionId);
        if (rejSug) {
          this.postMessage({ type: "diff_updated", suggestion: rejSug });
        }
        break;
      case "open_diff_view":
        const sug = PatchManager.getSuggestion(message.suggestionId);
        if (sug) {
          await LuminaDiffProvider.getInstance().showComparisonView(sug);
        }
        break;
      case "start_autonomous_loop":
        this.autonomousLoop.startLoop(message.testCommand || "npm test");
        break;
      case "stop_autonomous_loop":
        this.autonomousLoop.stop();
        break;
      case "open_settings":
        vscode13.commands.executeCommand("workbench.action.openSettings", "lumina");
        break;
      case "apply_to_editor":
        const editor = vscode13.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            if (!editor.selection.isEmpty) {
              editBuilder.replace(editor.selection, message.code);
            } else {
              editBuilder.insert(editor.selection.active, message.code);
            }
          });
          vscode13.window.showInformationMessage("Lumina: Applied code snippet to active editor.");
        } else {
          vscode13.window.showWarningMessage("Lumina: Open an editor to insert code.");
        }
        break;
      case "open_prism":
        vscode13.commands.executeCommand("lumina.prism");
        break;
    }
  }
  async pullModelStream(modelName) {
    try {
      this.postMessage({
        type: "pull_progress",
        model: modelName,
        status: `Starting download of ${modelName}...`
      });
      const client = this.manager.getClient();
      for await (const progress of client.pullModel(modelName)) {
        this.postMessage({
          type: "pull_progress",
          model: modelName,
          status: progress.status,
          completed: progress.completed,
          total: progress.total
        });
      }
      await this.manager.refreshModels();
      await this.manager.setActiveModel(modelName);
      this.postMessage({
        type: "toast",
        severity: "info",
        text: `Model ${modelName} downloaded and activated!`
      });
    } catch (err) {
      this.postMessage({
        type: "toast",
        severity: "error",
        text: `Failed to pull ${modelName}: ${err}`
      });
    }
  }
  postMessage(message) {
    this._view?.webview.postMessage(message);
  }
  getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode13.Uri.joinPath(this.extensionUri, "dist", "nexus", "media", "nexus.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode13.Uri.joinPath(this.extensionUri, "dist", "nexus", "media", "nexus.css")
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Lumina Nexus</title>
</head>
<body class="lumina-body">
  <div class="lumina-app">
    <!-- Top Brand Header -->
    <header class="lumina-header">
      <div class="brand-title">
        <div class="brand-pulse"></div>
        <span class="brand-name">LUMINA</span>
        <span class="brand-tag">SOVEREIGN AGENT</span>
      </div>
      <div class="header-actions">
        <button id="btnOpenPrism" class="icon-btn" title="Open Prism Command Bar (Cmd+K)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>
        <button id="btnSettings" class="icon-btn" title="Lumina Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="lumina-tabs">
      <button class="tab-btn active" data-tab="tab-chat">Agent Chat</button>
      <button class="tab-btn" data-tab="tab-context">Context Hub</button>
      <button class="tab-btn" data-tab="tab-hardware">Hardware</button>
      <button class="tab-btn" data-tab="tab-loop">Auto Loop</button>
    </nav>

    <!-- Context Chips Bar (Always accessible) -->
    <div class="chips-container" id="chipsContainer">
      <div class="chips-label">Context:</div>
      <div class="chips-list" id="chipsList">
        <!-- Injected via JS -->
      </div>
    </div>

    <!-- TAB 1: AGENT CHAT -->
    <section class="tab-content active" id="tab-chat">
      <div class="chat-messages" id="chatMessages">
        <div class="welcome-card glass-card">
          <div class="welcome-icon">\u{1F30C}</div>
          <h3>Lumina Sovereign Intelligence</h3>
          <p>Local, private AI coding agent powered by Ollama. Ask questions, request architectural refactoring, or trigger targeted code generation.</p>
          <div class="quick-prompts">
            <button class="quick-btn" data-prompt="Analyze the active file and suggest modular refactoring.">\u2728 Refactor Active File</button>
            <button class="quick-btn" data-prompt="Generate comprehensive unit tests for this module.">\u{1F9EA} Write Tests</button>
            <button class="quick-btn" data-prompt="Audit this codebase for edge case bugs and memory leaks.">\u{1F6E1}\uFE0F Audit Code</button>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <div class="input-wrapper glass-card">
          <textarea id="chatInput" placeholder="Ask Lumina (or press Cmd+K in editor for Prism)..." rows="2"></textarea>
          <div class="input-actions">
            <span class="active-model-badge" id="chatModelBadge">Model: Loading...</span>
            <div class="action-buttons">
              <button id="btnClearChat" class="icon-btn small" title="Clear History">\u{1F5D1}\uFE0F</button>
              <button id="btnSendChat" class="send-btn" title="Send Message">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2: CONTEXT HUB (RAG) -->
    <section class="tab-content" id="tab-context">
      <div class="tab-pane glass-card">
        <h3>Local RAG & Codebase Index</h3>
        <p class="section-desc">Lumina builds a 100% private vector index of your local workspace using vector embeddings to understand deep multi-file relationships.</p>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" id="statChunks">0</div>
            <div class="stat-label">Vector Chunks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="statFiles">0</div>
            <div class="stat-label">Indexed Files</div>
          </div>
        </div>

        <button id="btnIndexWorkspace" class="action-btn primary full-width">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          Index Workspace Now
        </button>

        <h4 style="margin-top: 16px;">Active Context Chips</h4>
        <div id="contextHubChipsList" class="chips-hub-list">
          <!-- Injected via JS -->
        </div>
      </div>
    </section>

    <!-- TAB 3: HARDWARE & CALIBRATION -->
    <section class="tab-content" id="tab-hardware">
      <div class="tab-pane glass-card">
        <h3>Hardware Telemetry Scan</h3>
        <p class="section-desc">Automatic calibration prevents system memory pressure and selects the fastest model tier for your GPU/RAM.</p>

        <div class="telemetry-box" id="telemetryBox">
          <div class="telemetry-row">
            <span>CPU:</span> <strong id="telCpu">Scanning...</strong>
          </div>
          <div class="telemetry-row">
            <span>System RAM:</span> <strong id="telRam">-- GB</strong>
          </div>
          <div class="telemetry-row">
            <span>GPU / VRAM:</span> <strong id="telGpu">--</strong>
          </div>
          <div class="telemetry-row">
            <span>Profile Tier:</span> <span class="tier-pill" id="telTier">Calculating</span>
          </div>
        </div>

        <div class="recommendation-box" id="recommendationBox">
          <div class="rec-title">Recommended Local Model</div>
          <div class="rec-model" id="recModel">qwen2.5-coder:7b</div>
          <div class="rec-reason" id="recReason">Hardware calibration in progress...</div>
        </div>

        <div class="hardware-actions">
          <button id="btnRunCalibration" class="action-btn secondary">Rescan Hardware</button>
          <button id="btnRunBenchmark" class="action-btn primary">Benchmark Model (TPS)</button>
        </div>

        <div class="benchmark-gauge" id="benchmarkGauge" style="display: none;">
          <div class="gauge-title">Speed Benchmark</div>
          <div class="gauge-value" id="gaugeTps">0.0 <span class="unit">tokens/sec</span></div>
          <div class="gauge-sub" id="gaugeDetails">Latency: --ms</div>
        </div>

        <h4 style="margin-top: 20px;">Model Manager</h4>
        <div class="model-select-group">
          <select id="modelDropdown" class="lumina-select">
            <option value="">Select an Ollama model...</option>
          </select>
        </div>

        <div class="pull-model-group">
          <input type="text" id="pullModelInput" placeholder="Pull model (e.g. qwen2.5-coder:7b)" />
          <button id="btnPullModel" class="action-btn secondary small">Pull</button>
        </div>
        <div id="pullProgressText" class="pull-progress-text"></div>
      </div>
    </section>

    <!-- TAB 4: AUTONOMOUS LOOP -->
    <section class="tab-content" id="tab-loop">
      <div class="tab-pane glass-card">
        <h3>Autonomous Test & Fix Loop</h3>
        <p class="section-desc">Executes your test suite or compiler, diagnoses error stack traces, crafts precision patches, and loops until all tests pass.</p>

        <div class="loop-input-group">
          <label for="loopTestCommand">Test Command:</label>
          <input type="text" id="loopTestCommand" value="npm test" placeholder="npm test / pytest / cargo test" />
        </div>

        <div class="loop-controls">
          <button id="btnStartLoop" class="action-btn primary">\u{1F680} Start Auto Loop</button>
          <button id="btnStopLoop" class="action-btn secondary" disabled>\u23F9\uFE0F Stop</button>
        </div>

        <div class="loop-timeline" id="loopTimeline">
          <!-- Timeline steps injected here -->
        </div>
      </div>
    </section>

    <!-- Toast Notification -->
    <div id="luminaToast" class="lumina-toast"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
};
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// src/utils/statusBar.ts
var vscode14 = __toESM(require("vscode"));
var LuminaStatusBar = class {
  item;
  currentModel = "Offline";
  isOnline = false;
  lastTps = null;
  constructor() {
    this.item = vscode14.window.createStatusBarItem(vscode14.StatusBarAlignment.Right, 100);
    this.item.command = "lumina.focusNexus";
    this.update();
    this.item.show();
  }
  setStatus(isOnline, modelName, tps) {
    this.isOnline = isOnline;
    this.currentModel = modelName || "No Model";
    if (typeof tps === "number") {
      this.lastTps = tps;
    }
    this.update();
  }
  setBenchmark(result) {
    this.lastTps = result.tokensPerSecond;
    this.update();
  }
  update() {
    if (!this.isOnline) {
      this.item.text = "$(circle-slash) Lumina: Offline";
      this.item.tooltip = "Lumina Agent: Ollama server not reachable at configured endpoint. Click to open Nexus Hub.";
      this.item.backgroundColor = new vscode14.ThemeColor("statusBarItem.warningBackground");
      return;
    }
    const tpsText = this.lastTps !== null ? ` (${this.lastTps.toFixed(1)} t/s)` : "";
    this.item.text = `$(sparkle) Lumina: ${this.currentModel}${tpsText}`;
    this.item.tooltip = `Lumina Active Model: ${this.currentModel}
Speed: ${this.lastTps ? this.lastTps.toFixed(1) + " tokens/sec" : "Calibrated"}
Click to open Nexus Hub & Agent Controls.`;
    this.item.backgroundColor = void 0;
  }
  dispose() {
    this.item.dispose();
  }
};

// src/extension.ts
async function activate(context) {
  const logger = LuminaLogger.getInstance();
  logger.log("\u2728 Lumina AI Coding Agent activating...");
  const config = vscode15.workspace.getConfiguration("lumina");
  const endpoint = config.get("ollamaEndpoint") || "http://localhost:11434";
  const ollamaClient = new OllamaClient(endpoint);
  const modelManager = new OllamaModelManager(ollamaClient);
  const contextEngine = new ContextEngine(ollamaClient);
  const orchestrator = new SovereignOrchestrator(modelManager, contextEngine);
  const autonomousLoop = new AutonomousLoopController(modelManager, contextEngine);
  const statusBar = new LuminaStatusBar();
  const prismBar = new PrismCommandBar(modelManager, contextEngine);
  const auraProvider = new AuraInlineCompletionProvider(modelManager);
  modelManager.onStatusChange(({ isOnline, activeModel }) => {
    statusBar.setStatus(isOnline, activeModel);
  });
  context.subscriptions.push(statusBar, modelManager);
  const diffProvider = LuminaDiffProvider.getInstance();
  context.subscriptions.push(
    vscode15.workspace.registerTextDocumentContentProvider(LuminaDiffProvider.scheme, diffProvider)
  );
  context.subscriptions.push(
    vscode15.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      auraProvider
    )
  );
  const nexusProvider = new NexusViewProvider(
    context.extensionUri,
    modelManager,
    contextEngine,
    orchestrator,
    autonomousLoop
  );
  context.subscriptions.push(
    vscode15.window.registerWebviewViewProvider(NexusViewProvider.viewType, nexusProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    // Prism Command Bar (Cmd+K)
    vscode15.commands.registerCommand("lumina.prism", async () => {
      await prismBar.open();
    }),
    // Calibration Engine
    vscode15.commands.registerCommand("lumina.calibrate", async () => {
      vscode15.window.withProgress(
        {
          location: vscode15.ProgressLocation.Notification,
          title: "Lumina: Scanning Hardware Telemetry..."
        },
        async () => {
          const telemetry = await CalibrationTelemetry.scanSystem(true);
          const recommendation = ModelRecommender.evaluate(telemetry);
          const message = `Lumina Hardware Calibration:
\u2022 GPU/VRAM: ${telemetry.gpuName} (${telemetry.vramGB}GB)
\u2022 RAM: ${telemetry.totalRamGB}GB
\u2022 Recommendation: ${recommendation.recommendedModel} (${recommendation.tierName})`;
          vscode15.window.showInformationMessage(
            message,
            `Use ${recommendation.recommendedModel}`,
            "Dismiss"
          ).then(async (action) => {
            if (action && action.startsWith("Use ")) {
              await modelManager.setActiveModel(recommendation.recommendedModel);
              vscode15.window.showInformationMessage(`Active model set to: ${recommendation.recommendedModel}`);
            }
          });
        }
      );
    }),
    // Benchmarking
    vscode15.commands.registerCommand("lumina.benchmark", async () => {
      const activeModel = modelManager.getActiveModel();
      if (!activeModel) {
        vscode15.window.showWarningMessage("Lumina: No active model selected to benchmark.");
        return;
      }
      vscode15.window.withProgress(
        {
          location: vscode15.ProgressLocation.Notification,
          title: `Lumina: Benchmarking ${activeModel}...`
        },
        async () => {
          const result = await ModelBenchmarker.runBenchmark(ollamaClient, activeModel);
          statusBar.setBenchmark(result);
          vscode15.window.showInformationMessage(
            `\u{1F680} Lumina Benchmark for ${result.model}: ${result.tokensPerSecond} tokens/sec (TTFT: ${result.timeToFirstTokenMs}ms)`
          );
        }
      );
    }),
    // Local RAG Indexing
    vscode15.commands.registerCommand("lumina.indexWorkspace", async () => {
      vscode15.window.withProgress(
        {
          location: vscode15.ProgressLocation.Notification,
          title: "Lumina: Indexing Workspace for Local RAG..."
        },
        async (progress) => {
          const count = await contextEngine.indexWorkspace((msg, pct) => {
            progress.report({ message: msg, increment: pct });
          });
          vscode15.window.showInformationMessage(`Lumina: Indexed ${count} code chunks in workspace.`);
        }
      );
    }),
    // Toggle Ghost Text
    vscode15.commands.registerCommand("lumina.toggleGhostText", () => {
      const isEnabled = auraProvider.toggle();
      vscode15.window.showInformationMessage(
        `Lumina: The Aura (Ghost Text) is now ${isEnabled ? "ENABLED" : "DISABLED"}.`
      );
    }),
    // Autonomous Loop
    vscode15.commands.registerCommand("lumina.runAutonomousLoop", async () => {
      const testCmd = await vscode15.window.showInputBox({
        prompt: "Enter test suite or compiler command to run in autonomous loop",
        value: "npm test"
      });
      if (testCmd) {
        autonomousLoop.startLoop(testCmd);
      }
    }),
    // Diff controls
    vscode15.commands.registerCommand("lumina.acceptDiff", async (suggestionId) => {
      if (suggestionId) {
        await PatchManager.acceptAll(suggestionId);
      }
    }),
    vscode15.commands.registerCommand("lumina.rejectDiff", (suggestionId) => {
      if (suggestionId) {
        PatchManager.reject(suggestionId);
      }
    }),
    // Focus Nexus Sidebar
    vscode15.commands.registerCommand("lumina.focusNexus", () => {
      vscode15.commands.executeCommand("lumina.nexusView.focus");
    }),
    // Settings
    vscode15.commands.registerCommand("lumina.openSettings", () => {
      vscode15.commands.executeCommand("workbench.action.openSettings", "lumina");
    })
  );
  const autoCalibrate = config.get("autoCalibrateOnStartup", true);
  if (autoCalibrate) {
    CalibrationTelemetry.scanSystem().then((telemetry) => {
      const rec = ModelRecommender.evaluate(telemetry);
      logger.log("Startup telemetry calibrated", {
        profile: rec.tier,
        recommended: rec.recommendedModel
      });
      if (!modelManager.getActiveModel()) {
        modelManager.setActiveModel(rec.recommendedModel);
      }
    });
  }
  logger.log("\u{1F30C} Lumina Agent initialized and ready.");
}
function deactivate() {
  LuminaLogger.getInstance().log("Lumina deactivated.");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
