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
exports.SovereignOrchestrator = void 0;
const vscode = __importStar(require("vscode"));
const promptBuilder_1 = require("./promptBuilder");
const diffEngine_1 = require("../diff/diffEngine");
const patchManager_1 = require("../diff/patchManager");
const logger_1 = require("../utils/logger");
class SovereignOrchestrator {
    manager;
    contextEngine;
    history = [];
    currentAbortController = null;
    onMessageEmitter = new vscode.EventEmitter();
    onStreamChunkEmitter = new vscode.EventEmitter();
    onStreamEndEmitter = new vscode.EventEmitter();
    onMessage = this.onMessageEmitter.event;
    onStreamChunk = this.onStreamChunkEmitter.event;
    onStreamEnd = this.onStreamEndEmitter.event;
    constructor(manager, contextEngine) {
        this.manager = manager;
        this.contextEngine = contextEngine;
    }
    getHistory() {
        return this.history;
    }
    clearHistory() {
        this.history = [];
    }
    abortCurrent() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }
    async handleUserMessage(text) {
        const userMessage = {
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
            const errorMsg = {
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
        const assistantMessage = {
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
            const systemPrompt = await promptBuilder_1.PromptBuilder.buildSystemPrompt(this.contextEngine, text);
            // Build chat messages payload
            const messagesPayload = [
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
            const stream = client.chatStream(activeModel, messagesPayload, { temperature: 0.2 }, this.currentAbortController.signal);
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
            let diffSuggestion;
            const editor = vscode.window.activeTextEditor;
            if (editor && !editor.document.isUntitled) {
                const codeBlockMatch = fullContent.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
                if (codeBlockMatch && fullContent.length > 50) {
                    const proposedSnippet = codeBlockMatch[1];
                    const origDocText = editor.document.getText();
                    // If the snippet looks like a full file or replacement candidate
                    if (proposedSnippet.length > 30 &&
                        (proposedSnippet.includes('function') ||
                            proposedSnippet.includes('class') ||
                            proposedSnippet.includes('import') ||
                            proposedSnippet.includes('export') ||
                            proposedSnippet.length > origDocText.length * 0.3)) {
                        diffSuggestion = diffEngine_1.DiffEngine.createSuggestion(editor.document.uri.fsPath, origDocText, proposedSnippet, `AI Code modification for "${text.slice(0, 40)}..."`);
                        patchManager_1.PatchManager.registerSuggestion(diffSuggestion);
                        assistantMessage.diffSuggestion = diffSuggestion;
                    }
                }
            }
            this.onStreamEndEmitter.fire({ messageId: assistantMsgId, diffSuggestion });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                assistantMessage.content += '\n\n*(Generation stopped by user)*';
            }
            else {
                assistantMessage.content += `\n\n⚠️ **Inference Error**: ${err instanceof Error ? err.message : String(err)}`;
                logger_1.LuminaLogger.getInstance().error('Orchestrator error:', err);
            }
            assistantMessage.isStreaming = false;
            this.onStreamEndEmitter.fire({ messageId: assistantMsgId });
        }
        finally {
            this.currentAbortController = null;
        }
    }
}
exports.SovereignOrchestrator = SovereignOrchestrator;
//# sourceMappingURL=sovereignOrchestrator.js.map