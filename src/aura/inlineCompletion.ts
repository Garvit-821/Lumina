import * as vscode from 'vscode';
import { OllamaModelManager } from '../ollama/manager';
import { LuminaLogger } from '../utils/logger';

export class AuraInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private manager: OllamaModelManager;
  private debounceTimer?: NodeJS.Timeout;
  private isEnabled: boolean = true;

  constructor(manager: OllamaModelManager) {
    this.manager = manager;
    this.loadConfig();
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lumina.enableGhostText')) {
        this.loadConfig();
      }
    });
  }

  public toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    const config = vscode.workspace.getConfiguration('lumina');
    config.update('enableGhostText', this.isEnabled, vscode.ConfigurationTarget.Global);
    return this.isEnabled;
  }

  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('lumina');
    this.isEnabled = config.get<boolean>('enableGhostText', true);
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    if (!this.isEnabled || !this.manager.getIsOnline()) {
      return undefined;
    }

    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      return undefined;
    }

    const lineText = document.lineAt(position.line).text;
    const prefixInLine = lineText.substring(0, position.character);

    // Don't trigger on empty whitespace lines with no context
    if (prefixInLine.trim().length === 0 && position.line === 0) {
      return undefined;
    }

    // Debounce to avoid flooding Ollama while rapid typing
    const config = vscode.workspace.getConfiguration('lumina');
    const delay = config.get<number>('ghostTextDelay', 300);

    await new Promise((resolve) => setTimeout(resolve, delay));
    if (token.isCancellationRequested) {
      return undefined;
    }

    // Extract prefix and suffix context
    const startLine = Math.max(0, position.line - 35);
    const endLine = Math.min(document.lineCount - 1, position.line + 15);

    const prefixRange = new vscode.Range(new vscode.Position(startLine, 0), position);
    const suffixRange = new vscode.Range(
      position,
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );

    const prefixText = document.getText(prefixRange);
    const suffixText = document.getText(suffixRange);

    // Construct prompt suitable for code models (FIM format or direct continuation)
    let prompt = '';
    const isQwenOrDeepseek = /qwen|deepseek|codellama|starcoder/i.test(activeModel);

    if (isQwenOrDeepseek) {
      prompt = `<｜fim begin｜>${prefixText}<｜fim hole｜>${suffixText}<｜fim end｜>`;
    } else {
      prompt = `Continue the following ${document.languageId} code starting exactly at the end of prefix. Output ONLY the code continuation without explanations or backticks.\nPrefix:\n${prefixText}\nContinuation:`;
    }

    try {
      const client = this.manager.getClient();
      const completion = await client.generate(activeModel, prompt, {
        temperature: 0.1,
        num_predict: 64,
        stop: ['\n\n\n', '<｜fim end｜>', '<｜fim hole｜>', '```'],
      });

      if (token.isCancellationRequested || !completion || completion.trim().length === 0) {
        return undefined;
      }

      // Clean completion
      let cleaned = completion;
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
      }

      const item = new vscode.InlineCompletionItem(
        cleaned,
        new vscode.Range(position, position)
      );

      return [item];
    } catch (err) {
      LuminaLogger.getInstance().warn(`Ghost text generation skipped: ${err}`);
      return undefined;
    }
  }
}
