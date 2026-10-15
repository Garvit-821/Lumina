import * as vscode from 'vscode';
import { OllamaModelManager } from '../ollama/manager';
import { LuminaLogger } from '../utils/logger';
import { getLuminaConfig } from '../utils/config';

/** Lines before the cursor sent to the model as the completion prefix. */
const PREFIX_LINES = 60;
/** Lines after the cursor sent as the fill-in-the-middle suffix. */
const SUFFIX_LINES = 20;

/**
 * The Aura: ghost-text inline completions from the active Ollama model. Uses fill-in-the-middle with the
 * surrounding code when the model supports it, and a plain "continue this code" prompt otherwise.
 * Follows the lumina.enableGhostText setting.
 */
export class AuraInlineCompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private manager: OllamaModelManager;
  /** Mirrors lumina.enableGhostText; updated by toggle() and by settings changes. */
  private isEnabled: boolean = true;
  /** Models that rejected `suffix` (no FIM support); they get a plain continuation prompt instead. */
  private noFimModels = new Set<string>();
  /** Settings subscription that keeps isEnabled in sync; released in dispose(). */
  private configListener: vscode.Disposable;

  /** Reads the initial enabled state and starts listening for changes to lumina.enableGhostText. */
  constructor(manager: OllamaModelManager) {
    this.manager = manager;
    this.isEnabled = getLuminaConfig().ghostTextEnabled;
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lumina.enableGhostText')) {
        this.isEnabled = getLuminaConfig().ghostTextEnabled;
      }
    });
  }

  public toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    vscode.workspace
      .getConfiguration('lumina')
      .update('enableGhostText', this.isEnabled, vscode.ConfigurationTarget.Global);
    return this.isEnabled;
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.isEnabled || !this.manager.getIsOnline()) return undefined;
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') return undefined;

    const model = this.manager.getActiveModel();
    if (!model) return undefined;

    // Only suggest at the end of a line; mid-line ghost text mostly gets in the way.
    const lineText = document.lineAt(position.line).text;
    if (lineText.slice(position.character).trim().length > 0) return undefined;

    // Debounce: VS Code cancels this token when the user keeps typing.
    await new Promise((resolve) => setTimeout(resolve, getLuminaConfig().ghostTextDelay));
    if (token.isCancellationRequested) return undefined;

    const startLine = Math.max(0, position.line - PREFIX_LINES);
    const endLine = Math.min(document.lineCount - 1, position.line + SUFFIX_LINES);
    const prefix = document.getText(new vscode.Range(new vscode.Position(startLine, 0), position));
    const suffix = document.getText(
      new vscode.Range(position, new vscode.Position(endLine, document.lineAt(endLine).text.length))
    );
    if (prefix.trim().length === 0) return undefined;

    const abortController = new AbortController();
    const cancelSub = token.onCancellationRequested(() => abortController.abort());
    const options = { temperature: 0.1, num_predict: 64, stop: ['\n\n\n', '```'] };
    const client = this.manager.getClient();

    try {
      let completion: string;
      if (!this.noFimModels.has(model)) {
        try {
          completion = await client.generate(model, prefix, options, abortController.signal, suffix);
        } catch (err) {
          if (!/does not support insert|suffix/i.test(String(err))) throw err;
          this.noFimModels.add(model);
          LuminaLogger.getInstance().log(`Model ${model} has no fill-in-the-middle support; using continuation prompts.`);
          completion = await this.continuation(model, document.languageId, prefix, options, abortController.signal);
        }
      } else {
        completion = await this.continuation(model, document.languageId, prefix, options, abortController.signal);
      }

      if (token.isCancellationRequested) return undefined;
      const cleaned = completion.replace(/^```[\w+-]*\n?/, '').replace(/```\s*$/, '');
      if (!cleaned.trim()) return undefined;

      return [new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position))];
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        LuminaLogger.getInstance().warn(`Ghost text skipped: ${err}`);
      }
      return undefined;
    } finally {
      cancelSub.dispose();
    }
  }

  private continuation(
    model: string,
    languageId: string,
    prefix: string,
    options: { temperature: number; num_predict: number; stop: string[] },
    signal: AbortSignal
  ): Promise<string> {
    const prompt = `Continue this ${languageId} code from exactly where it stops. Reply with only the continuation, no explanations or backticks.\n\n${prefix}`;
    return this.manager.getClient().generate(model, prompt, options, signal);
  }

  public dispose(): void {
    this.configListener.dispose();
  }
}
