import * as vscode from 'vscode';
import * as path from 'path';
import { shouldIndexDirectory, shouldIndexFile } from './filePolicy';

/** Files larger than this are left out of the index, as are empty files. */
const MAX_FILE_SIZE_BYTES = 250 * 1024; // 250KB

/**
 * A file the crawler chose to index. `relativePath` is relative to the workspace folder it was found in;
 * `language` is a VS Code language id guessed from the extension ('plaintext' when unknown).
 */
export interface WorkspaceFileEntry {
  uri: vscode.Uri;
  relativePath: string;
  language: string;
}

/**
 * Walks the workspace folders and collects files worth indexing, using the rules in filePolicy
 * plus a size limit.
 */
export class WorkspaceCrawler {
  /**
   * Lists indexable files across all workspace folders, depth first. Returns an empty array when no
   * folder is open. Cancelling stops the walk and returns what was collected so far.
   */
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

        if (type === vscode.FileType.Directory) {
          if (!shouldIndexDirectory(name)) continue;
          const subDirUri = vscode.Uri.joinPath(currentDirUri, name);
          await this.scanDirectory(rootUri, subDirUri, results, cancellationToken);
        } else if (type === vscode.FileType.File) {
          if (!shouldIndexFile(name)) continue;
          const ext = path.extname(name).toLowerCase();

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
