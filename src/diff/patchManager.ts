import * as vscode from 'vscode';
import { DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';

export class PatchManager {
  private static activeSuggestions: Map<string, DiffSuggestion> = new Map();

  public static registerSuggestion(suggestion: DiffSuggestion): void {
    this.activeSuggestions.set(suggestion.id, suggestion);
  }

  public static getSuggestion(id: string): DiffSuggestion | undefined {
    return this.activeSuggestions.get(id);
  }

  public static async acceptAll(suggestionId: string): Promise<boolean> {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (!suggestion) {
      vscode.window.showErrorMessage('Lumina: Diff suggestion not found.');
      return false;
    }

    try {
      const uri = vscode.Uri.file(suggestion.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, fullRange, suggestion.proposedCode);
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        await document.save();
        suggestion.status = 'applied';
        suggestion.hunks.forEach((h) => (h.accepted = true));
        vscode.window.showInformationMessage(`Lumina: All changes applied to ${suggestion.filePath.split('/').pop()}`);
        LuminaLogger.getInstance().log(`Accepted all diff changes for ${suggestion.filePath}`);
        return true;
      }
      return false;
    } catch (err) {
      LuminaLogger.getInstance().error('Failed to accept diff:', err);
      vscode.window.showErrorMessage(`Lumina: Error applying diff - ${err}`);
      return false;
    }
  }

  public static async acceptHunk(suggestionId: string, hunkIndex: number): Promise<boolean> {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (!suggestion) return false;

    const hunk = suggestion.hunks.find((h) => h.hunkIndex === hunkIndex);
    if (!hunk || hunk.accepted) return false;

    try {
      const uri = vscode.Uri.file(suggestion.filePath);
      const document = await vscode.workspace.openTextDocument(uri);

      const startLine = Math.max(0, hunk.oldStartLine - 1);
      let targetRange: vscode.Range;
      let replacementText = hunk.modifiedLines.join('\n');

      if (hunk.oldLineCount === 0) {
        // Pure insertion
        const pos = new vscode.Position(Math.min(document.lineCount, startLine), 0);
        targetRange = new vscode.Range(pos, pos);
        if (startLine < document.lineCount) {
          replacementText += '\n';
        }
      } else {
        // Replacement or deletion
        const lastLineIndex = Math.min(document.lineCount - 1, startLine + hunk.oldLineCount - 1);
        const lastLineLength = document.lineAt(lastLineIndex).text.length;
        targetRange = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(lastLineIndex, lastLineLength)
        );
      }

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, targetRange, replacementText);
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        hunk.accepted = true;
        const lineDelta = hunk.newLineCount - hunk.oldLineCount;

        // Shift remaining unapplied hunks that start after this hunk
        for (const other of suggestion.hunks) {
          if (!other.accepted && other.oldStartLine > hunk.oldStartLine) {
            other.oldStartLine = Math.max(1, other.oldStartLine + lineDelta);
          }
        }

        const allAccepted = suggestion.hunks.every((h) => h.accepted);
        suggestion.status = allAccepted ? 'applied' : 'partial';
        await document.save();
        vscode.window.showInformationMessage(`Lumina: Merged Hunk #${hunkIndex}`);
        return true;
      }
      return false;
    } catch (err) {
      LuminaLogger.getInstance().error(`Failed to accept hunk #${hunkIndex}:`, err);
      return false;
    }
  }

  public static reject(suggestionId: string): void {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (suggestion) {
      suggestion.status = 'rejected';
      vscode.window.showInformationMessage('Lumina: Diff suggestion discarded.');
      LuminaLogger.getInstance().log(`Rejected diff suggestion ${suggestionId}`);
    }
  }
}
