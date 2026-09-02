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
exports.AuraInlineCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class AuraInlineCompletionProvider {
    manager;
    debounceTimer;
    isEnabled = true;
    constructor(manager) {
        this.manager = manager;
        this.loadConfig();
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('lumina.enableGhostText')) {
                this.loadConfig();
            }
        });
    }
    toggle() {
        this.isEnabled = !this.isEnabled;
        const config = vscode.workspace.getConfiguration('lumina');
        config.update('enableGhostText', this.isEnabled, vscode.ConfigurationTarget.Global);
        return this.isEnabled;
    }
    loadConfig() {
        const config = vscode.workspace.getConfiguration('lumina');
        this.isEnabled = config.get('enableGhostText', true);
    }
    async provideInlineCompletionItems(document, position, context, token) {
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
        const delay = config.get('ghostTextDelay', 300);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (token.isCancellationRequested) {
            return undefined;
        }
        // Extract prefix and suffix context
        const startLine = Math.max(0, position.line - 35);
        const endLine = Math.min(document.lineCount - 1, position.line + 15);
        const prefixRange = new vscode.Range(new vscode.Position(startLine, 0), position);
        const suffixRange = new vscode.Range(position, new vscode.Position(endLine, document.lineAt(endLine).text.length));
        const prefixText = document.getText(prefixRange);
        const suffixText = document.getText(suffixRange);
        // Construct prompt suitable for code models (FIM format or direct continuation)
        let prompt = '';
        const isQwenOrDeepseek = /qwen|deepseek|codellama|starcoder/i.test(activeModel);
        if (isQwenOrDeepseek) {
            prompt = `<｜fim begin｜>${prefixText}<｜fim hole｜>${suffixText}<｜fim end｜>`;
        }
        else {
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
            const item = new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position));
            return [item];
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().warn(`Ghost text generation skipped: ${err}`);
            return undefined;
        }
    }
}
exports.AuraInlineCompletionProvider = AuraInlineCompletionProvider;
//# sourceMappingURL=inlineCompletion.js.map