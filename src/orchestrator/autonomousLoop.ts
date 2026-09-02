import * as vscode from 'vscode';
import { exec } from 'child_process';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { DiffEngine } from '../diff/diffEngine';
import { LuminaDiffProvider } from '../diff/diffProvider';
import { PatchManager } from '../diff/patchManager';
import { AutonomousLoopStep, DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';

export class AutonomousLoopController {
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;
  private isRunning: boolean = false;
  private currentStepEmitter = new vscode.EventEmitter<AutonomousLoopStep>();
  private finishedEmitter = new vscode.EventEmitter<{ success: boolean; summary: string }>();

  public readonly onStep = this.currentStepEmitter.event;
  public readonly onFinished = this.finishedEmitter.event;

  constructor(manager: OllamaModelManager, contextEngine: ContextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }

  public stop(): void {
    this.isRunning = false;
  }

  public async startLoop(testCommand: string, maxIterations: number = 3): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.finishedEmitter.fire({ success: false, summary: 'No workspace open.' });
      this.isRunning = false;
      return;
    }

    const cwd = workspaceFolders[0].uri.fsPath;
    let iteration = 0;

    LuminaLogger.getInstance().log(`Starting Autonomous Loop with command: "${testCommand}"`);

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

      PatchManager.registerSuggestion(diagnosis.diff);
      await LuminaDiffProvider.getInstance().showComparisonView(diagnosis.diff);

      // Auto-apply patch to verify or prompt user
      await PatchManager.acceptAll(diagnosis.diff.id);

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

  private async diagnoseAndFixError(
    errorOutput: string,
    testCommand: string
  ): Promise<{ diff: DiffSuggestion; explanation: string } | null> {
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) return null;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const doc = editor.document;
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

      if (proposedCode.length < 20) return null;

      const diff = DiffEngine.createSuggestion(
        doc.uri.fsPath,
        originalCode,
        proposedCode,
        'Autonomous Test Failure Auto-Correction'
      );

      return { diff, explanation: 'Auto-repaired failure based on test runner stack trace.' };
    } catch (err) {
      LuminaLogger.getInstance().error('Diagnosis error:', err);
      return null;
    }
  }

  private executeCommand(cmd: string, cwd: string): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      exec(cmd, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '') + (error ? `\n${error.message}` : '');
        resolve({
          exitCode: error ? error.code || 1 : 0,
          output,
        });
      });
    });
  }

  private emitStep(
    stepIndex: number,
    action: AutonomousLoopStep['action'],
    description: string,
    command?: string,
    output?: string,
    status: AutonomousLoopStep['status'] = 'running',
    diffSuggestion?: DiffSuggestion
  ): void {
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
