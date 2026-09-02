import * as vscode from 'vscode';
import * as path from 'path';

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

export interface WorkspaceFileEntry {
  uri: vscode.Uri;
  relativePath: string;
  language: string;
}

export class WorkspaceCrawler {
  public static async scanWorkspace(
    cancellationToken?: vscode.CancellationToken
  ): Promise<WorkspaceFileEntry[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const results: WorkspaceFileEntry[] = [];

    for (const folder of workspaceFolders) {
      if (cancellationToken?.isCancellationRequested) break;
      await this.scanDirectory(folder.uri, folder.uri, results, cancellationToken);
    }

    return results;
  }

  private static async scanDirectory(
    rootUri: vscode.Uri,
    currentDirUri: vscode.Uri,
    results: WorkspaceFileEntry[],
    cancellationToken?: vscode.CancellationToken
  ): Promise<void> {
    if (cancellationToken?.isCancellationRequested) return;

    try {
      const entries = await vscode.workspace.fs.readDirectory(currentDirUri);

      for (const [name, type] of entries) {
        if (cancellationToken?.isCancellationRequested) return;

        if (name.startsWith('.') && name !== '.env') {
          if (IGNORED_DIRECTORIES.has(name)) continue;
        }

        if (type === vscode.FileType.Directory) {
          if (IGNORED_DIRECTORIES.has(name)) continue;
          const subDirUri = vscode.Uri.joinPath(currentDirUri, name);
          await this.scanDirectory(rootUri, subDirUri, results, cancellationToken);
        } else if (type === vscode.FileType.File) {
          const ext = path.extname(name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;

          const fileUri = vscode.Uri.joinPath(currentDirUri, name);
          const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath);

          try {
            const stat = await vscode.workspace.fs.stat(fileUri);
            if (stat.size > MAX_FILE_SIZE_BYTES || stat.size === 0) continue;

            const language = this.inferLanguage(ext);
            results.push({ uri: fileUri, relativePath, language });
          } catch {
            // Ignore unreadable files
          }
        }
      }
    } catch {
      // Permission or reading error
    }
  }

  private static inferLanguage(ext: string): string {
    const map: Record<string, string> = {
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
