import * as vscode from 'vscode';
import { exec, ChildProcess } from 'child_process';
import * as path from 'path';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { DiffEngine } from '../diff/diffEngine';
import { LuminaDiffProvider } from '../diff/diffProvider';
import { PatchManager } from '../diff/patchManager';
import { AutonomousLoopStep, DiffSuggestion } from '../types';
import { LuminaLogger } from '../utils/logger';
import { extractCodeReply } from '../utils/codeBlocks';
import { findCandidateFiles } from './traceParser';

/**
 * The test-and-fix loop: runs a test command and, on failure, asks the active model for a corrected version
 * of the file the failure points at, applies it and runs the tests again, up to a fixed number of iterations.
 * Progress is reported through onStep and the outcome through onFinished. Only one loop runs at a time.
 */
export class AutonomousLoopController {
  private manager: OllamaModelManager;
  /** Taken in the constructor but not used by the loop at the moment. */
  private contextEngine: ContextEngine;
  /** True while a loop is active. Doubles as the cancellation flag that startLoop checks after each await. */
  private isRunning: boolean = false;
  /** Aborts the in-flight diagnosis request when the loop is stopped. */
  private abortController: AbortController | null = null;
  /** The test process that is currently running, so stop() can kill it; null between runs. */
  private child: ChildProcess | null = null;
  private currentStepEmitter = new vscode.EventEmitter<AutonomousLoopStep>();
  private finishedEmitter = new vscode.EventEmitter<{ success: boolean; summary: string }>();

  /** Fires for each stage of each iteration (run_test, diagnose, propose_fix, verify) with its status. */
  public readonly onStep = this.currentStepEmitter.event;
  /**
   * Fires when a loop ends: tests passed, no fix could be produced, iterations ran out, it was stopped,
   * or no workspace is open.
   */
  public readonly onFinished = this.finishedEmitter.event;

  constructor(manager: OllamaModelManager, contextEngine: ContextEngine) {
    this.manager = manager;
    this.contextEngine = contextEngine;
  }

  /**
   * Stops a running loop: aborts the model request, kills the test process and fires onFinished with
   * success false. The pending startLoop call notices at its next check and returns quietly. No-op when idle.
   */
  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.abortController?.abort();
    this.child?.kill();
    this.finishedEmitter.fire({ success: false, summary: 'Loop stopped.' });
  }

  /**
   * Runs the test-and-fix loop in the first workspace folder. Exit code 0 ends the loop successfully; otherwise
   * the model proposes a whole-file fix, which is shown in a diff view and applied right away through
   * PatchManager.acceptAll (which also saves the file) before the tests run again.
   * Returns immediately if a loop is already running. The outcome is reported via onFinished, not the promise.
   */
  public async startLoop(testCommand: string, maxIterations: number = 3): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

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
      if (!this.isRunning) return;

      if (testResult.exitCode === 0) {
        this.emitStep(iteration, 'run_test', `✅ Tests Passed! All checks are green.`, testCommand, testResult.output, 'success');
        this.finishedEmitter.fire({ success: true, summary: `All tests passed cleanly on iteration ${iteration}!` });
        this.isRunning = false;
        return;
      }

      // Step 2: Diagnosis
      this.emitStep(iteration, 'diagnose', `Tests failed with exit code ${testResult.exitCode}. Analyzing error stack trace with Ollama...`, undefined, testResult.output, 'running');

      const diagnosis = await this.diagnoseAndFixError(testResult.output, testCommand);
      if (!this.isRunning) return;

      if (!diagnosis || !diagnosis.diff) {
        this.emitStep(iteration, 'diagnose', `Could not synthesize automated fix. Stopping loop.`, undefined, undefined, 'failed');
        this.finishedEmitter.fire({ success: false, summary: 'Agent was unable to produce an automatic patch.' });
        this.isRunning = false;
        return;
      }

      // Step 3: Propose Fix
      this.emitStep(iteration, 'propose_fix', `Proposed fix for ${path.basename(diagnosis.diff.filePath)}: ${diagnosis.explanation}`, undefined, undefined, 'running', diagnosis.diff);

      PatchManager.registerSuggestion(diagnosis.diff);
      await LuminaDiffProvider.getInstance().showComparisonView(diagnosis.diff);

      // Auto-apply patch to verify or prompt user
      await PatchManager.acceptAll(diagnosis.diff.id);

      this.emitStep(iteration, 'verify', `Applied patch to ${path.basename(diagnosis.diff.filePath)}. Re-running verification...`, undefined, undefined, 'success');
    }

    if (this.isRunning) {
      this.finishedEmitter.fire({
        success: false,
        summary: `Reached maximum iterations (${maxIterations}) without all tests passing.`,
      });
      this.isRunning = false;
    }
  }

  /**
   * Picks the file to fix (the first workspace file named in the failure output, else the active editor, else
   * any open document), sends it with the last 2000 characters of the output to the model and wraps the reply
   * in a diff suggestion. Returns null when there is no model or file, the reply is under 20 characters,
   * or the request fails (the error is logged).
   */
  private async diagnoseAndFixError(
    errorOutput: string,
    testCommand: string
  ): Promise<{ diff: DiffSuggestion; explanation: string } | null> {
    const activeModel = this.manager.getActiveModel();
    if (!activeModel) return null;

    let doc: vscode.TextDocument | null = null;
    const activeEditor = vscode.window.activeTextEditor;

    // Use the first file named in the failure output that exists inside the workspace.
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      for (const candidate of findCandidateFiles(errorOutput).slice(0, 10)) {
        const abs = path.resolve(root, candidate);
        if (path.relative(root, abs).startsWith('..')) continue; // outside the workspace
        try {
          doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
          break;
        } catch {
          // not a real file; try the next candidate
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

    if (!doc) return null;

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
      const response = await client.generate(activeModel, prompt, { temperature: 0.1 }, this.abortController?.signal);

      const proposedCode = extractCodeReply(response);

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
      this.child = exec(cmd, { cwd, timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        this.child = null;
        const output = (stdout || '') + (stderr || '') + (error ? `\n${error.message}` : '');
        resolve({
          exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
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
