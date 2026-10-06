import * as vscode from 'vscode';
import { DiffSuggestion } from '../types';

/**
 * Serves the proposed side of Lumina's diff views as read-only virtual documents under the lumina-diff
 * scheme. One shared instance is registered in extension.ts, and suggestions are kept in memory for the
 * session.
 */
export class LuminaDiffProvider implements vscode.TextDocumentContentProvider {
  /** URI scheme for proposal documents. URIs look like lumina-diff://<suggestionId>/<fileName>. */
  public static readonly scheme = 'lumina-diff';
  private static instance: LuminaDiffProvider;
  /** Suggestions by id, so provideTextDocumentContent can resolve a URI. Entries are never removed. */
  private suggestions: Map<string, DiffSuggestion> = new Map();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  /** Tells VS Code to re-read a proposal document; fired every time a suggestion is registered. */
  public readonly onDidChange = this.onDidChangeEmitter.event;

  /** Returns the shared provider, creating it on first use. */
  public static getInstance(): LuminaDiffProvider {
    if (!LuminaDiffProvider.instance) {
      LuminaDiffProvider.instance = new LuminaDiffProvider();
    }
    return LuminaDiffProvider.instance;
  }

  /**
   * Stores a suggestion and returns the virtual URI that shows its proposed code. The file name in the URI is
   * the last "/"-separated segment of filePath and only serves the tab label and language detection.
   */
  public registerSuggestion(suggestion: DiffSuggestion): vscode.Uri {
    this.suggestions.set(suggestion.id, suggestion);
    const uri = vscode.Uri.parse(`${LuminaDiffProvider.scheme}://${suggestion.id}/${suggestion.filePath.split('/').pop()}`);
    this.onDidChangeEmitter.fire(uri);
    return uri;
  }

  /** Looks up a suggestion by id; undefined if it was never registered with this provider. */
  public getSuggestion(suggestionId: string): DiffSuggestion | undefined {
    return this.suggestions.get(suggestionId);
  }

  /**
   * Returns the proposed code for a lumina-diff URI (the URI authority is the suggestion id),
   * or a placeholder comment when the id is unknown.
   */
  public provideTextDocumentContent(uri: vscode.Uri): string {
    const suggestionId = uri.authority;
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion ? suggestion.proposedCode : '// Lumina Diff: Content not found';
  }

  /**
   * Opens VS Code's diff editor with the current file on the left and the proposed code on the right.
   * It only displays the proposal; accepting or rejecting it goes through PatchManager.
   */
  public async showComparisonView(suggestion: DiffSuggestion): Promise<void> {
    const proposedUri = this.registerSuggestion(suggestion);
    const originalUri = vscode.Uri.file(suggestion.filePath);
    const title = `Lumina AI Proposal ⟷ ${suggestion.filePath.split('/').pop()}`;

    await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, title, {
      preview: true,
      preserveFocus: false,
    });
  }
}
