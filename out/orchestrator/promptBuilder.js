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
exports.PromptBuilder = void 0;
const vscode = __importStar(require("vscode"));
class PromptBuilder {
    static async buildSystemPrompt(contextEngine, userPrompt) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceName = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].name : 'Unknown Workspace';
        // Retrieve active editor info
        let activeFileInfo = '';
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.document.isUntitled) {
            const doc = editor.document;
            const selection = editor.selection;
            const selectedCode = !selection.isEmpty ? doc.getText(selection) : '';
            activeFileInfo = `
Active File: ${doc.fileName} (${doc.languageId})
Total Lines: ${doc.lineCount}
${selectedCode ? `Active Selection (Lines ${selection.start.line + 1}-${selection.end.line + 1}):\n\`\`\`${doc.languageId}\n${selectedCode}\n\`\`\`` : ''}
`;
        }
        // Retrieve active Context Chips content
        const chipsContent = await contextEngine.getActiveChipsContent();
        // Retrieve RAG Context matches
        const ragMatches = await contextEngine.retrieveRelevantContext(userPrompt, 4);
        let ragContext = '';
        if (ragMatches.length > 0) {
            ragContext = ragMatches
                .map((m) => `--- Code Context (${m.chunk.relativePath}:${m.chunk.startLine}-${m.chunk.endLine}) [Match Score: ${(m.similarity * 100).toFixed(0)}%] ---\n${m.chunk.content}`)
                .join('\n\n');
        }
        return `You are Lumina, a state-of-the-art autonomous AI coding agent designed to write production-grade, bug-free, and elegant code directly within the developer's IDE.

Core Operating Principles:
1. DATA SOVEREIGNTY: You operate completely locally via Ollama. Provide direct, actionable solutions.
2. AGENTIC PRECISION: When asked to write or modify code, provide the full, working implementation in clear markdown code blocks specifying the language.
3. CONTEXTUAL RELEVANCE: Always reference relevant workspace files and maintain architectural patterns.

Workspace: ${workspaceName}
${activeFileInfo}
${chipsContent ? `Pinned Context Files:\n${chipsContent}\n` : ''}
${ragContext ? `Retrieved Codebase Knowledge:\n${ragContext}\n` : ''}`;
    }
}
exports.PromptBuilder = PromptBuilder;
//# sourceMappingURL=promptBuilder.js.map