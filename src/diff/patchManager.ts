import * as vscode from 'vscode';
import * as path from 'path';
import { DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';

/**
 * Applies or discards diff suggestions in the real file. Suggestions must be registered first. State lives in
 * a static map for the session, and a suggestion moves from pending to partial, applied or rejected.
 */
export class PatchManager {
  /**
   * Registered suggestions by id. Callers get these objects by reference, so accepting hunks mutates what
   * they hold. Entries are never removed.
   */
  private static activeSuggestions: Map<string, DiffSuggestion> = new Map();

  /**
   * Makes a suggestion available to acceptAll, acceptHunk and reject. Registering the same id again
   * replaces it.
   */
  public static registerSuggestion(suggestion: DiffSuggestion): void {
    this.activeSuggestions.set(suggestion.id, suggestion);
  }

  /** Returns the stored suggestion with its current status and hunk flags, or undefined for an unknown id. */
  public static getSuggestion(id: string): DiffSuggestion | undefined {
    return this.activeSuggestions.get(id);
  }

  /**
   * A pending suggestion was computed against a snapshot of the file. If the file has changed since,
   * applying it would silently drop those edits, so ask first.
   */
  private static async confirmIfStale(suggestion: DiffSuggestion, document: vscode.TextDocument): Promise<boolean> {
    if (suggestion.status !== 'pending' || document.getText() === suggestion.originalCode) return true;
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(suggestion.filePath)} has changed since Lumina proposed this edit. Applying it will overwrite your newer changes.`,
      { modal: true },
      'Apply anyway'
    );
    return choice === 'Apply anyway';
  }

  /**
   * Replaces the whole file with the suggestion's proposed code and saves it, asking first if the file changed
   * since a still-pending suggestion was made. Returns false without throwing when the suggestion is unknown,
   * already applied or rejected, the user declines, or the edit fails (errors are logged and shown).
   */
  public static async acceptAll(suggestionId: string): Promise<boolean> {
    const suggestion = this.activeSuggestions.get(suggestionId);
    if (!suggestion) {
      vscode.window.showErrorMessage('Lumina: Diff suggestion not found.');
      return false;
    }
    if (suggestion.status === 'applied' || suggestion.status === 'rejected') return false;

    try {
      const uri = vscode.Uri.file(suggestion.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      if (!(await this.confirmIfStale(suggestion, document))) return false;
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
        vscode.window.showInformationMessage(`Lumina: All changes applied to ${path.basename(suggestion.filePath)}`);
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
      if (!(await this.confirmIfStale(suggestion, document))) return false;

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
