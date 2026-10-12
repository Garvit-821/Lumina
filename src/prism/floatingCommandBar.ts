import * as vscode from 'vscode';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { DiffEngine } from '../diff/diffEngine';
import { LuminaDiffProvider } from '../diff/diffProvider';
import { PatchManager } from '../diff/patchManager';
import { LuminaLogger } from '../utils/logger';
import { extractCodeReply } from '../utils/codeBlocks';
import { getLuminaConfig } from '../utils/config';

/**
 * Prism, the quick-pick command bar behind lumina.prism. It applies a preset or custom instruction to the
 * selection, or to the whole file when nothing is selected, and shows the model's rewrite as a diff to
 * accept or reject.
 */
export class PrismCommandBar {
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;

  constructor(manager: OllamaModelManager, contextEngine: ContextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }

  public async open(): Promise<void> {
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

    const quickPickItems: vscode.QuickPickItem[] = [
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

    if (!chosen) return;

    let instruction = '';

    if (chosen.label.includes('Custom Instruction')) {
      const input = await vscode.window.showInputBox({
        prompt: `Lumina Prism: Enter instruction for ${targetLabel}`,
        placeHolder: 'e.g., Refactor this function to be async and add try-catch error handling',
      });
      if (!input || input.trim().length === 0) return;
      instruction = input.trim();
    } else {
      instruction = chosen.description || chosen.label;
    }

    // Snapshot now: the user may move the cursor or edit while the model is generating.
    const snapshot = {
      fullText: editor.document.getText(),
      start: editor.document.offsetAt(selection.start),
      end: editor.document.offsetAt(selection.end),
    };
    await this.executePrismInstruction(editor, selectedText, hasSelection, instruction, snapshot);
  }

  private async executePrismInstruction(
    editor: vscode.TextEditor,
    originalCode: string,
    isSelectionOnly: boolean,
    instruction: string,
    snapshot: { fullText: string; start: number; end: number }
  ): Promise<void> {
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      vscode.window.showErrorMessage('Lumina: No active Ollama model selected. Please select a model in Nexus.');
      return;
    }

    const doc = editor.document;
    const filePath = doc.uri.fsPath;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Lumina Prism: Generating modification with ${activeModel}...`,
        cancellable: true,
      },
      async (_progress, cancellationToken) => {
        try {
          // Retrieve context chunks from RAG
          const ragResults = await this.contextEngine.retrieveRelevantContext(instruction, Math.min(3, getLuminaConfig().maxRagChunks));
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

          const stream = client.generateStream(
            activeModel,
            prompt,
            { temperature: getLuminaConfig().temperature },
            abortController.signal
          );

          for await (const chunk of stream) {
            if (chunk.response) {
              generatedResponse += chunk.response;
            }
          }

          // Extract code block
          if (cancellationToken.isCancellationRequested) return;
          const proposedCode = extractCodeReply(generatedResponse);
          if (!proposedCode.trim()) {
            vscode.window.showWarningMessage('Lumina Prism: The model returned an empty response.');
            return;
          }

          const finalProposedFullDoc = isSelectionOnly
            ? snapshot.fullText.slice(0, snapshot.start) + proposedCode + snapshot.fullText.slice(snapshot.end)
            : proposedCode;

          if (finalProposedFullDoc === snapshot.fullText) {
            vscode.window.showInformationMessage('Lumina Prism: No changes suggested.');
            return;
          }

          const suggestion = DiffEngine.createSuggestion(
            filePath,
            snapshot.fullText,
            finalProposedFullDoc,
            instruction
          );

          PatchManager.registerSuggestion(suggestion);
          await LuminaDiffProvider.getInstance().showComparisonView(suggestion);

          vscode.window.showInformationMessage(
            `Lumina Prism: Comparison view opened. Review the diff, then choose an action.`,
            'Accept All Changes',
            'Reject'
          ).then((action) => {
            if (action === 'Accept All Changes') {
              PatchManager.acceptAll(suggestion.id);
            } else if (action === 'Reject') {
              PatchManager.reject(suggestion.id);
            }
          });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return; // user cancelled
          LuminaLogger.getInstance().error('Prism generation error:', err);
          vscode.window.showErrorMessage(`Lumina Prism: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
