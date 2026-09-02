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
exports.PrismCommandBar = void 0;
const vscode = __importStar(require("vscode"));
const diffEngine_1 = require("../diff/diffEngine");
const diffProvider_1 = require("../diff/diffProvider");
const patchManager_1 = require("../diff/patchManager");
const logger_1 = require("../utils/logger");
class PrismCommandBar {
    manager;
    contextEngine;
    constructor(manager, contextEngine) {
        this.manager = manager;
        this.contextEngine = contextEngine;
    }
    async open() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Lumina Prism: Open a file in the editor to use Prism.');
            return;
        }
        const selection = editor.selection;
        const hasSelection = !selection.isEmpty;
        const selectedText = hasSelection
            ? editor.document.getText(selection)
            : editor.document.getText();
        const targetLabel = hasSelection
            ? `Lines ${selection.start.line + 1}-${selection.end.line + 1}`
            : 'Entire File';
        const quickPickItems = [
            {
                label: '$(sparkle) Custom Instruction...',
                description: `Transform ${targetLabel} with your own prompt`,
            },
            {
                label: '$(wrench) Refactor & Clean Code',
                description: 'Simplify logic, improve readability, eliminate redundancy',
            },
            {
                label: '$(beaker) Generate Unit Tests',
                description: 'Create comprehensive test suite with edge cases',
            },
            {
                label: '$(shield) Fix Diagnostics & Potential Bugs',
                description: 'Check for null references, race conditions, edge errors',
            },
            {
                label: '$(symbol-class) Add Strict Types & Documentation',
                description: 'Add TypeScript types, return types, and docstrings',
            },
            {
                label: '$(flame) Optimize Performance',
                description: 'Improve algorithmic time/space complexity and caching',
            },
        ];
        const chosen = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: `Lumina Prism [${this.manager.getActiveModel() || 'Local AI'}]: Select action for ${targetLabel}`,
        });
        if (!chosen)
            return;
        let instruction = '';
        if (chosen.label.includes('Custom Instruction')) {
            const input = await vscode.window.showInputBox({
                prompt: `Lumina Prism: Enter instruction for ${targetLabel}`,
                placeHolder: 'e.g., Refactor this function to be async and add try-catch error handling',
            });
            if (!input || input.trim().length === 0)
                return;
            instruction = input.trim();
        }
        else {
            instruction = chosen.description || chosen.label;
        }
        await this.executePrismInstruction(editor, selectedText, hasSelection, instruction);
    }
    async executePrismInstruction(editor, originalCode, isSelectionOnly, instruction) {
        const activeModel = this.manager.getActiveModel();
        if (!activeModel) {
            vscode.window.showErrorMessage('Lumina: No active Ollama model selected. Please select a model in Nexus.');
            return;
        }
        const doc = editor.document;
        const filePath = doc.uri.fsPath;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Lumina Prism: Generating modification with ${activeModel}...`,
            cancellable: true,
        }, async (_progress, cancellationToken) => {
            try {
                // Retrieve context chunks from RAG
                const ragResults = await this.contextEngine.retrieveRelevantContext(instruction, 3);
                const ragContext = ragResults
                    .map((r) => `// Context (${r.chunk.relativePath}):\n${r.chunk.content}`)
                    .join('\n\n');
                const prompt = `You are Lumina, an expert AI coding agent.
Your task is to modify the provided ${doc.languageId} code according to the instruction.

Workspace Context:
${ragContext}

File: ${doc.fileName}
Target Scope: ${isSelectionOnly ? 'Selected Code Block' : 'Full File'}

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
                let generatedResponse = '';
                const abortController = new AbortController();
                cancellationToken.onCancellationRequested(() => abortController.abort());
                const stream = client.generateStream(activeModel, prompt, { temperature: 0.2 }, abortController.signal);
                for await (const chunk of stream) {
                    if (chunk.response) {
                        generatedResponse += chunk.response;
                    }
                }
                // Extract code block
                let proposedCode = generatedResponse.trim();
                const codeBlockMatch = proposedCode.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
                if (codeBlockMatch) {
                    proposedCode = codeBlockMatch[1];
                }
                // If operating on whole document or selection, form full target proposed file
                let finalProposedFullDoc = proposedCode;
                if (isSelectionOnly) {
                    const fullText = doc.getText();
                    const startOffset = doc.offsetAt(editor.selection.start);
                    const endOffset = doc.offsetAt(editor.selection.end);
                    finalProposedFullDoc =
                        fullText.substring(0, startOffset) + proposedCode + fullText.substring(endOffset);
                }
                const suggestion = diffEngine_1.DiffEngine.createSuggestion(filePath, doc.getText(), finalProposedFullDoc, instruction);
                patchManager_1.PatchManager.registerSuggestion(suggestion);
                await diffProvider_1.LuminaDiffProvider.getInstance().showComparisonView(suggestion);
                vscode.window.showInformationMessage(`Lumina Prism: Comparison view opened. Click 'Accept' or 'Reject' in the editor actions.`, 'Accept All Changes', 'Reject').then((action) => {
                    if (action === 'Accept All Changes') {
                        patchManager_1.PatchManager.acceptAll(suggestion.id);
                    }
                    else if (action === 'Reject') {
                        patchManager_1.PatchManager.reject(suggestion.id);
                    }
                });
            }
            catch (err) {
                logger_1.LuminaLogger.getInstance().error('Prism generation error:', err);
                vscode.window.showErrorMessage(`Lumina Prism error: ${err}`);
            }
        });
    }
}
exports.PrismCommandBar = PrismCommandBar;
//# sourceMappingURL=floatingCommandBar.js.map