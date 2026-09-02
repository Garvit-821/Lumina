import * as vscode from 'vscode';
import { ContextEngine } from '../rag/contextEngine';

export class PromptBuilder {
  public static async buildSystemPrompt(contextEngine: ContextEngine, userPrompt: string): Promise<string> {
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
