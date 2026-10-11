import * as vscode from 'vscode';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { PromptBuilder } from './promptBuilder';
import { DiffEngine } from '../diff/diffEngine';
import { PatchManager } from '../diff/patchManager';
import { ChatMessage, DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';
import { extractFirstCodeBlock } from '../utils/codeBlocks';
import { isLikelyFullFileReplacement } from '../diff/proposalPolicy';
import { getLuminaConfig } from '../utils/config';

/**
 * Drives the Nexus chat: keeps the conversation history, streams replies from the active Ollama model and,
 * when a reply contains a usable code block, turns it into a reviewable diff suggestion.
 * The Nexus view subscribes to its events to render messages as they arrive.
 */
export class SovereignOrchestrator {
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;
  /**
   * Full chat transcript in display order, including error notices and stopped replies.
   * Only the last 8 non-empty earlier messages are replayed to the model on each turn.
   */
  private history: ChatMessage[] = [];
  /** Aborts the reply that is currently streaming; null when no request is in flight. */
  private currentAbortController: AbortController | null = null;

  private onMessageEmitter = new vscode.EventEmitter<ChatMessage>();
  private onStreamChunkEmitter = new vscode.EventEmitter<{ messageId: string; chunk: string }>();
  private onStreamEndEmitter = new vscode.EventEmitter<{ messageId: string; diffSuggestion?: DiffSuggestion }>();

  /**
   * Fires when a message joins the history: the user's message, the empty streaming placeholder or an
   * error notice.
   */
  public readonly onMessage = this.onMessageEmitter.event;
  /**
   * Fires for each text delta of a streaming reply, and once more with the stop or error note if the
   * stream fails.
   */
  public readonly onStreamChunk = this.onStreamChunkEmitter.event;
  /**
   * Fires once per reply when streaming ends, successfully or not; carries the diff suggestion if one
   * was built.
   */
  public readonly onStreamEnd = this.onStreamEndEmitter.event;

  constructor(manager: OllamaModelManager, contextEngine: ContextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }

  /**
   * Returns the live history array, not a copy. The Nexus view uses it to restore the chat after a
   * webview reload.
   */
  public getHistory(): ChatMessage[] {
    return this.history;
  }

  /** Forgets the conversation. It does not stop a reply in progress, so callers call abortCurrent first. */
  public clearHistory(): void {
    this.history = [];
  }

  /**
   * Cancels the reply that is currently streaming, if any. The partial text is kept and handleUserMessage
   * appends a "Stopped." note to it. Safe to call when nothing is running.
   */
  public abortCurrent(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  public async handleUserMessage(text: string): Promise<void> {
    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      contextChips: this.contextEngine.getContextChips().filter((c) => c.active),
    };

    this.history.push(userMessage);
    this.onMessageEmitter.fire(userMessage);

    const activeModel = this.manager.getActiveModel();
    if (!activeModel) {
      const errorMsg: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **No Active Model Selected**: Please launch Ollama and select or pull a model (e.g. \`qwen2.5-coder:7b\` or \`llama3.1:8b\`) from the **Nexus Model Switcher** tab.`,
        timestamp: Date.now(),
      };
      this.history.push(errorMsg);
      this.onMessageEmitter.fire(errorMsg);
      return;
    }

    const assistantMsgId = `msg_asst_${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    this.history.push(assistantMessage);
    this.onMessageEmitter.fire(assistantMessage);

    this.currentAbortController = new AbortController();

    // Capture the target now: the user may switch editors while the reply streams.
    const editorAtRequest = vscode.window.activeTextEditor;
    const target =
      editorAtRequest && !editorAtRequest.document.isUntitled
        ? {
            document: editorAtRequest.document,
            selection: editorAtRequest.selection.isEmpty
              ? null
              : {
                  start: editorAtRequest.document.offsetAt(editorAtRequest.selection.start),
                  end: editorAtRequest.document.offsetAt(editorAtRequest.selection.end),
                },
          }
        : null;

    let fullContent = '';

    try {
      const systemPrompt = await PromptBuilder.buildSystemPrompt(this.contextEngine, text);

      // Build chat messages payload
      const messagesPayload: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Earlier turns only: the last two entries are this turn's user message and the empty reply placeholder.
      const earlier = this.history.slice(0, -2).filter((m) => m.content.trim().length > 0);
      for (const msg of earlier.slice(-8)) {
        messagesPayload.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }

      messagesPayload.push({ role: 'user', content: text });

      const client = this.manager.getClient();

      const stream = client.chatStream(
        activeModel,
        messagesPayload,
        { temperature: getLuminaConfig().temperature },
        this.currentAbortController.signal
      );

      for await (const chunk of stream) {
        const delta = chunk.message?.content || chunk.response || '';
        if (delta) {
          fullContent += delta;
          this.onStreamChunkEmitter.fire({ messageId: assistantMsgId, chunk: delta });
        }
      }

      assistantMessage.content = fullContent;
      assistantMessage.isStreaming = false;

      const diffSuggestion = this.buildDiffSuggestion(fullContent, target, text);
      if (diffSuggestion) {
        PatchManager.registerSuggestion(diffSuggestion);
        assistantMessage.diffSuggestion = diffSuggestion;
      }

      this.onStreamEndEmitter.fire({ messageId: assistantMsgId, diffSuggestion });
    } catch (err: unknown) {
      // Keep whatever streamed before the failure, and show the reason in the chat itself.
      const note =
        err instanceof Error && err.name === 'AbortError'
          ? '\n\n_Stopped._'
          : `\n\n**Error:** ${err instanceof Error ? err.message : String(err)}`;
      if (!(err instanceof Error && err.name === 'AbortError')) {
        LuminaLogger.getInstance().error('Orchestrator error:', err);
      }
      assistantMessage.content = fullContent + note;
      assistantMessage.isStreaming = false;
      this.onStreamChunkEmitter.fire({ messageId: assistantMsgId, chunk: note });
      this.onStreamEndEmitter.fire({ messageId: assistantMsgId });
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Turns the reply's first code block into a reviewable diff, but only when that is safe:
   * with a selection, the block replaces the selection; otherwise only if it looks like the whole file.
   */
  private buildDiffSuggestion(
    reply: string,
    target: { document: vscode.TextDocument; selection: { start: number; end: number } | null } | null,
    userText: string
  ): DiffSuggestion | undefined {
    if (!target || target.document.isClosed) return undefined;
    const block = extractFirstCodeBlock(reply);
    if (!block || block.code.trim().length < 10) return undefined;

    const currentText = target.document.getText();
    let proposed: string;

    if (target.selection) {
      proposed =
        currentText.slice(0, target.selection.start) + block.code + currentText.slice(target.selection.end);
    } else if (isLikelyFullFileReplacement(currentText, block.code)) {
      proposed = block.code;
    } else {
      return undefined;
    }

    if (proposed === currentText) return undefined;
    const label = userText.length > 40 ? `${userText.slice(0, 40)}…` : userText;
    return DiffEngine.createSuggestion(target.document.uri.fsPath, currentText, proposed, `Chat: "${label}"`);
  }
}
