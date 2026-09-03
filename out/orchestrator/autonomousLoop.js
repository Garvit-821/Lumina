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
exports.AutonomousLoopController = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const diffEngine_1 = require("../diff/diffEngine");
const diffProvider_1 = require("../diff/diffProvider");
const patchManager_1 = require("../diff/patchManager");
const logger_1 = require("../utils/logger");
class AutonomousLoopController {
    manager;
    contextEngine;
    isRunning = false;
    currentStepEmitter = new vscode.EventEmitter();
    finishedEmitter = new vscode.EventEmitter();
    onStep = this.currentStepEmitter.event;
    onFinished = this.finishedEmitter.event;
    constructor(manager, contextEngine) {
        this.manager = manager;
        this.contextEngine = contextEngine;
    }
    stop() {
        this.isRunning = false;
    }
    async startLoop(testCommand, maxIterations = 3) {
        if (this.isRunning)
            return;
        this.isRunning = true;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.finishedEmitter.fire({ success: false, summary: 'No workspace open.' });
            this.isRunning = false;
            return;
        }
        const cwd = workspaceFolders[0].uri.fsPath;
        let iteration = 0;
        logger_1.LuminaLogger.getInstance().log(`Starting Autonomous Loop with command: "${testCommand}"`);
        while (this.isRunning && iteration < maxIterations) {
            iteration++;
            // Step 1: Run test
            this.emitStep(iteration, 'run_test', `Executing test suite: \`${testCommand}\` (Iteration ${iteration}/${maxIterations})`, testCommand, undefined, 'running');
            const testResult = await this.executeCommand(testCommand, cwd);
            if (testResult.exitCode === 0) {
                this.emitStep(iteration, 'run_test', `✅ Tests Passed! All checks are green.`, testCommand, testResult.output, 'success');
                this.finishedEmitter.fire({ success: true, summary: `All tests passed cleanly on iteration ${iteration}!` });
                this.isRunning = false;
                return;
            }
            // Step 2: Diagnosis
            this.emitStep(iteration, 'diagnose', `Tests failed with exit code ${testResult.exitCode}. Analyzing error stack trace with Ollama...`, undefined, testResult.output, 'running');
            const diagnosis = await this.diagnoseAndFixError(testResult.output, testCommand);
            if (!diagnosis || !diagnosis.diff) {
                this.emitStep(iteration, 'diagnose', `Could not synthesize automated fix. Stopping loop.`, undefined, undefined, 'failed');
                this.finishedEmitter.fire({ success: false, summary: 'Agent was unable to produce an automatic patch.' });
                this.isRunning = false;
                return;
            }
            // Step 3: Propose Fix
            this.emitStep(iteration, 'propose_fix', `Proposed fix for ${diagnosis.diff.filePath.split('/').pop()}: ${diagnosis.explanation}`, undefined, undefined, 'running', diagnosis.diff);
            patchManager_1.PatchManager.registerSuggestion(diagnosis.diff);
            await diffProvider_1.LuminaDiffProvider.getInstance().showComparisonView(diagnosis.diff);
            // Auto-apply patch to verify or prompt user
            await patchManager_1.PatchManager.acceptAll(diagnosis.diff.id);
            this.emitStep(iteration, 'verify', `Applied patch to ${diagnosis.diff.filePath.split('/').pop()}. Re-running verification...`, undefined, undefined, 'success');
        }
        if (this.isRunning) {
            this.finishedEmitter.fire({
                success: false,
                summary: `Reached maximum iterations (${maxIterations}) without all tests passing.`,
            });
            this.isRunning = false;
        }
    }
    async diagnoseAndFixError(errorOutput, testCommand) {
        const activeModel = this.manager.getActiveModel();
        if (!activeModel)
            return null;
        let doc = null;
        const activeEditor = vscode.window.activeTextEditor;
        // Check if error trace mentions specific project source files
        const fileMatch = errorOutput.match(/(?:at\s+|FAIL\s+|ERROR\s+in\s+|-->\s+)?([a-zA-Z0-9_./-]+\.(?:ts|js|tsx|jsx|py|go|rs|java|c|cpp|cs))/i);
        if (fileMatch) {
            const matchedPath = fileMatch[1];
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const fullUri = vscode.Uri.joinPath(workspaceFolders[0].uri, matchedPath);
                try {
                    doc = await vscode.workspace.openTextDocument(fullUri);
                }
                catch {
                    // Fallback to active editor
                }
            }
        }
        if (!doc && activeEditor) {
            doc = activeEditor.document;
        }
        if (!doc) {
            const openDocs = vscode.workspace.textDocuments.filter((d) => !d.isUntitled);
            if (openDocs.length > 0) {
                doc = openDocs[0];
            }
        }
        if (!doc)
            return null;
        const originalCode = doc.getText();
        const prompt = `You are Lumina Autonomous Test & Fix Agent.
The developer executed the test command \`${testCommand}\` and received the following failure output:

\`\`\`
${errorOutput.slice(-2000)}
\`\`\`

Here is the current code in ${doc.fileName}:
\`\`\`${doc.languageId}
${originalCode}
\`\`\`

Analyze the root cause and provide the corrected code to fix the test failure.
Output ONLY the entire corrected file content within a single markdown code block (\`\`\`${doc.languageId} ... \`\`\`).`;
        try {
            const client = this.manager.getClient();
            const response = await client.generate(activeModel, prompt, { temperature: 0.1 });
            const codeMatch = response.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
            const proposedCode = codeMatch ? codeMatch[1].trim() : response.trim();
            if (proposedCode.length < 20)
                return null;
            const diff = diffEngine_1.DiffEngine.createSuggestion(doc.uri.fsPath, originalCode, proposedCode, 'Autonomous Test Failure Auto-Correction');
            return { diff, explanation: 'Auto-repaired failure based on test runner stack trace.' };
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().error('Diagnosis error:', err);
            return null;
        }
    }
    executeCommand(cmd, cwd) {
        return new Promise((resolve) => {
            (0, child_process_1.exec)(cmd, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
                const output = (stdout || '') + (stderr || '') + (error ? `\n${error.message}` : '');
                resolve({
                    exitCode: error ? error.code || 1 : 0,
                    output,
                });
            });
        });
    }
    emitStep(stepIndex, action, description, command, output, status = 'running', diffSuggestion) {
        this.currentStepEmitter.fire({
            stepIndex,
            action,
            description,
            command,
            output,
            status,
            diffSuggestion,
        });
    }
}
exports.AutonomousLoopController = AutonomousLoopController;
//# sourceMappingURL=autonomousLoop.js.map