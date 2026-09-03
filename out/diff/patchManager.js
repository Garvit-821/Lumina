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
exports.PatchManager = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class PatchManager {
    static activeSuggestions = new Map();
    static registerSuggestion(suggestion) {
        this.activeSuggestions.set(suggestion.id, suggestion);
    }
    static getSuggestion(id) {
        return this.activeSuggestions.get(id);
    }
    static async acceptAll(suggestionId) {
        const suggestion = this.activeSuggestions.get(suggestionId);
        if (!suggestion) {
            vscode.window.showErrorMessage('Lumina: Diff suggestion not found.');
            return false;
        }
        try {
            const uri = vscode.Uri.file(suggestion.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, fullRange, suggestion.proposedCode);
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                await document.save();
                suggestion.status = 'applied';
                suggestion.hunks.forEach((h) => (h.accepted = true));
                vscode.window.showInformationMessage(`Lumina: All changes applied to ${suggestion.filePath.split('/').pop()}`);
                logger_1.LuminaLogger.getInstance().log(`Accepted all diff changes for ${suggestion.filePath}`);
                return true;
            }
            return false;
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().error('Failed to accept diff:', err);
            vscode.window.showErrorMessage(`Lumina: Error applying diff - ${err}`);
            return false;
        }
    }
    static async acceptHunk(suggestionId, hunkIndex) {
        const suggestion = this.activeSuggestions.get(suggestionId);
        if (!suggestion)
            return false;
        const hunk = suggestion.hunks.find((h) => h.hunkIndex === hunkIndex);
        if (!hunk || hunk.accepted)
            return false;
        try {
            const uri = vscode.Uri.file(suggestion.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const startLine = Math.max(0, hunk.oldStartLine - 1);
            let targetRange;
            let replacementText = hunk.modifiedLines.join('\n');
            if (hunk.oldLineCount === 0) {
                // Pure insertion
                const pos = new vscode.Position(Math.min(document.lineCount, startLine), 0);
                targetRange = new vscode.Range(pos, pos);
                if (startLine < document.lineCount) {
                    replacementText += '\n';
                }
            }
            else {
                // Replacement or deletion
                const lastLineIndex = Math.min(document.lineCount - 1, startLine + hunk.oldLineCount - 1);
                const lastLineLength = document.lineAt(lastLineIndex).text.length;
                targetRange = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(lastLineIndex, lastLineLength));
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
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().error(`Failed to accept hunk #${hunkIndex}:`, err);
            return false;
        }
    }
    static reject(suggestionId) {
        const suggestion = this.activeSuggestions.get(suggestionId);
        if (suggestion) {
            suggestion.status = 'rejected';
            vscode.window.showInformationMessage('Lumina: Diff suggestion discarded.');
            logger_1.LuminaLogger.getInstance().log(`Rejected diff suggestion ${suggestionId}`);
        }
    }
}
exports.PatchManager = PatchManager;
//# sourceMappingURL=patchManager.js.map