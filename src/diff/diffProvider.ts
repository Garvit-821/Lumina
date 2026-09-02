import * as vscode from 'vscode';
import { DiffSuggestion } from '../types';

export class LuminaDiffProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = 'lumina-diff';
  private static instance: LuminaDiffProvider;
  private suggestions: Map<string, DiffSuggestion> = new Map();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public static getInstance(): LuminaDiffProvider {
    if (!LuminaDiffProvider.instance) {
      LuminaDiffProvider.instance = new LuminaDiffProvider();
    }
    return LuminaDiffProvider.instance;
  }

  public registerSuggestion(suggestion: DiffSuggestion): vscode.Uri {
    this.suggestions.set(suggestion.id, suggestion);
    const uri = vscode.Uri.parse(`${LuminaDiffProvider.scheme}://${suggestion.id}/${suggestion.filePath.split('/').pop()}`);
    this.onDidChangeEmitter.fire(uri);
    return uri;
  }

  public getSuggestion(suggestionId: string): DiffSuggestion | undefined {
    return this.suggestions.get(suggestionId);
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    const suggestionId = uri.authority;
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion ? suggestion.proposedCode : '// Lumina Diff: Content not found';
  }

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
