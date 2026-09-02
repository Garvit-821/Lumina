import * as vscode from 'vscode';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { PromptBuilder } from './promptBuilder';
import { DiffEngine } from '../diff/diffEngine';
import { PatchManager } from '../diff/patchManager';
import { ChatMessage, DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';

export class SovereignOrchestrator {
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;
  private history: ChatMessage[] = [];
  private currentAbortController: AbortController | null = null;

  private onMessageEmitter = new vscode.EventEmitter<ChatMessage>();
  private onStreamChunkEmitter = new vscode.EventEmitter<{ messageId: string; chunk: string }>();
  private onStreamEndEmitter = new vscode.EventEmitter<{ messageId: string; diffSuggestion?: DiffSuggestion }>();

  public readonly onMessage = this.onMessageEmitter.event;
  public readonly onStreamChunk = this.onStreamChunkEmitter.event;
  public readonly onStreamEnd = this.onStreamEndEmitter.event;

  constructor(manager: OllamaModelManager, contextEngine: ContextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }

  public getHistory(): ChatMessage[] {
    return this.history;
  }

  public clearHistory(): void {
    this.history = [];
  }

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

    try {
      const systemPrompt = await PromptBuilder.buildSystemPrompt(this.contextEngine, text);

      // Build chat messages payload
      const messagesPayload: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Append recent history
      for (const msg of this.history.slice(-8, -1)) {
        messagesPayload.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }

      messagesPayload.push({ role: 'user', content: text });

      const client = this.manager.getClient();
      let fullContent = '';

      const stream = client.chatStream(
        activeModel,
        messagesPayload,
        { temperature: 0.2 },
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

      // Check if response contains modified code for the active file
      let diffSuggestion: DiffSuggestion | undefined;
      const editor = vscode.window.activeTextEditor;

      if (editor && !editor.document.isUntitled) {
        const codeBlockMatch = fullContent.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
        if (codeBlockMatch && fullContent.length > 50) {
          const proposedSnippet = codeBlockMatch[1];
          const origDocText = editor.document.getText();

          // If the snippet looks like a full file or replacement candidate
          if (
            proposedSnippet.length > 30 &&
            (proposedSnippet.includes('function') ||
              proposedSnippet.includes('class') ||
              proposedSnippet.includes('import') ||
              proposedSnippet.includes('export') ||
              proposedSnippet.length > origDocText.length * 0.3)
          ) {
            diffSuggestion = DiffEngine.createSuggestion(
              editor.document.uri.fsPath,
              origDocText,
              proposedSnippet,
              `AI Code modification for "${text.slice(0, 40)}..."`
            );
            PatchManager.registerSuggestion(diffSuggestion);
            assistantMessage.diffSuggestion = diffSuggestion;
          }
        }
      }

      this.onStreamEndEmitter.fire({ messageId: assistantMsgId, diffSuggestion });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        assistantMessage.content += '\n\n*(Generation stopped by user)*';
      } else {
        assistantMessage.content += `\n\n⚠️ **Inference Error**: ${err instanceof Error ? err.message : String(err)}`;
        LuminaLogger.getInstance().error('Orchestrator error:', err);
      }
      assistantMessage.isStreaming = false;
      this.onStreamEndEmitter.fire({ messageId: assistantMsgId });
    } finally {
      this.currentAbortController = null;
    }
  }
}
