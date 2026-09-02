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
exports.WorkspaceCrawler = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const IGNORED_DIRECTORIES = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.nuxt',
    '.lumina',
    '.vscode',
    '.idea',
    '__pycache__',
    '.venv',
    'venv',
    'target',
    'bin',
    'obj',
]);
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.wasm',
    '.mp3', '.mp4', '.mov', '.avi', '.wav',
    '.ttf', '.woff', '.woff2', '.eot',
    '.lock', '.bin', '.iso', '.dmg'
]);
const MAX_FILE_SIZE_BYTES = 250 * 1024; // 250KB
class WorkspaceCrawler {
    static async scanWorkspace(cancellationToken) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }
        const results = [];
        for (const folder of workspaceFolders) {
            if (cancellationToken?.isCancellationRequested)
                break;
            await this.scanDirectory(folder.uri, folder.uri, results, cancellationToken);
        }
        return results;
    }
    static async scanDirectory(rootUri, currentDirUri, results, cancellationToken) {
        if (cancellationToken?.isCancellationRequested)
            return;
        try {
            const entries = await vscode.workspace.fs.readDirectory(currentDirUri);
            for (const [name, type] of entries) {
                if (cancellationToken?.isCancellationRequested)
                    return;
                if (name.startsWith('.') && name !== '.env') {
                    if (IGNORED_DIRECTORIES.has(name))
                        continue;
                }
                if (type === vscode.FileType.Directory) {
                    if (IGNORED_DIRECTORIES.has(name))
                        continue;
                    const subDirUri = vscode.Uri.joinPath(currentDirUri, name);
                    await this.scanDirectory(rootUri, subDirUri, results, cancellationToken);
                }
                else if (type === vscode.FileType.File) {
                    const ext = path.extname(name).toLowerCase();
                    if (BINARY_EXTENSIONS.has(ext))
                        continue;
                    const fileUri = vscode.Uri.joinPath(currentDirUri, name);
                    const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath);
                    try {
                        const stat = await vscode.workspace.fs.stat(fileUri);
                        if (stat.size > MAX_FILE_SIZE_BYTES || stat.size === 0)
                            continue;
                        const language = this.inferLanguage(ext);
                        results.push({ uri: fileUri, relativePath, language });
                    }
                    catch {
                        // Ignore unreadable files
                    }
                }
            }
        }
        catch {
            // Permission or reading error
        }
    }
    static inferLanguage(ext) {
        const map = {
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.js': 'javascript',
            '.jsx': 'javascriptreact',
            '.py': 'python',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
            '.cs': 'csharp',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.json': 'json',
            '.md': 'markdown',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.sh': 'shellscript',
            '.sql': 'sql',
            '.swift': 'swift',
            '.kt': 'kotlin',
        };
        return map[ext] || 'plaintext';
    }
}
exports.WorkspaceCrawler = WorkspaceCrawler;
//# sourceMappingURL=crawler.js.map