import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { OllamaModelManager } from '../ollama/manager';
import { ContextEngine } from '../rag/contextEngine';
import { SovereignOrchestrator } from '../orchestrator/sovereignOrchestrator';
import { AutonomousLoopController } from '../orchestrator/autonomousLoop';
import { CalibrationTelemetry } from '../calibration/telemetry';
import { ModelRecommender } from '../calibration/recommender';
import { ModelBenchmarker } from '../calibration/benchmarker';
import { PatchManager } from '../diff/patchManager';
import { LuminaDiffProvider } from '../diff/diffProvider';
import { WebviewMessage, ExtensionMessage } from '../types';
import { LuminaLogger } from '../utils/logger';

/**
 * Hosts the Nexus sidebar (view id lumina.nexusView): builds its HTML, relays service events to the page
 * as ExtensionMessage objects and carries out the WebviewMessage requests the page sends back.
 * Created once in activate(); VS Code calls resolveWebviewView when the view is first shown and again
 * if it is recreated.
 */
export class NexusViewProvider implements vscode.WebviewViewProvider {
  /** Must match the view id in package.json; lumina.focusNexus focuses it as 'lumina.nexusView.focus'. */
  public static readonly viewType = 'lumina.nexusView';
  private _view?: vscode.WebviewView;
  private extensionUri: vscode.Uri;
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;
  private orchestrator: SovereignOrchestrator;
  private autonomousLoop: AutonomousLoopController;

  /**
   * Stores the shared services and subscribes to their events straight away, so updates are relayed as
   * soon as a view exists. Events fired while no view is resolved are dropped.
   */
  constructor(
    extensionUri: vscode.Uri,
    manager: OllamaModelManager,
    contextEngine: ContextEngine,
    orchestrator: SovereignOrchestrator,
    autonomousLoop: AutonomousLoopController
  ) {
    this.extensionUri = extensionUri;
    this.manager = manager;
    this.contextEngine = contextEngine;
    this.orchestrator = orchestrator;
    this.autonomousLoop = autonomousLoop;

    this.setupListeners();
  }

  /**
   * Called by VS Code when the sidebar view is first shown, and again if it is recreated. Enables scripts,
   * limits local resources to the media and resources folders, installs the HTML and the message handler,
   * then sends the initial state after a 200 ms delay to give the page's script time to start listening.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'nexus', 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'src', 'nexus', 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'resources'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.handleWebviewMessage(message);
    });

    // Send initial state
    setTimeout(() => {
      this.sendInitialState();
    }, 200);
  }

  /**
   * Forwards events from the model manager, context engine, orchestrator and test-and-fix loop to the page.
   * Runs once from the constructor; the subscriptions are never disposed and last as long as the extension.
   */
  private setupListeners(): void {
    this.manager.onStatusChange(({ isOnline, activeModel }) => {
      this.postMessage({
        type: 'models_list',
        models: this.manager.getAvailableModels(),
        activeModel,
        running: this.manager.getRunningProcesses(),
        isOnline,
      });
    });

    this.contextEngine.onChipsUpdated((chips) => {
      this.postMessage({ type: 'context_chips_updated', chips });
    });

    this.contextEngine.onStatusUpdated(({ indexing, indexedFiles, totalChunks }) => {
      this.postMessage({ type: 'rag_status', indexing, indexedFiles, totalChunks });
    });

    this.orchestrator.onMessage((message) => {
      this.postMessage({ type: 'chat_message', message });
    });

    this.orchestrator.onStreamChunk(({ messageId, chunk }) => {
      this.postMessage({ type: 'chat_stream_chunk', messageId, chunk });
    });

    this.orchestrator.onStreamEnd(({ messageId, diffSuggestion }) => {
      this.postMessage({ type: 'chat_stream_end', messageId, diffSuggestion });
    });

    this.autonomousLoop.onStep((step) => {
      this.postMessage({ type: 'autonomous_step', step });
    });

    this.autonomousLoop.onFinished(({ success, summary }) => {
      this.postMessage({ type: 'autonomous_finished', success, summary });
    });
  }

  private async sendInitialState(): Promise<void> {
    // Restore the conversation when the view is re-created (e.g. after moving it or reloading the webview).
    this.postMessage({ type: 'chat_history', messages: this.orchestrator.getHistory() });

    const { models, running } = await this.manager.refreshModels();
    this.postMessage({
      type: 'models_list',
      models,
      activeModel: this.manager.getActiveModel(),
      running,
      isOnline: this.manager.getIsOnline(),
    });

    this.postMessage({
      type: 'context_chips_updated',
      chips: this.contextEngine.getContextChips(),
    });

    const vectorStore = this.contextEngine.getVectorStore();
    this.postMessage({
      type: 'rag_status',
      indexing: false,
      indexedFiles: vectorStore.getFileCount(),
      totalChunks: vectorStore.getChunkCount(),
    });

    // Run quick telemetry
    try {
      const telemetry = await CalibrationTelemetry.scanSystem();
      const recommendation = ModelRecommender.evaluate(telemetry);
      this.postMessage({ type: 'calibration_data', telemetry, recommendation });
    } catch {
      // Ignored
    }
  }

  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'chat_send':
        await this.orchestrator.handleUserMessage(message.text);
        break;

      case 'chat_stop':
        this.orchestrator.abortCurrent();
        break;

      case 'chat_clear':
        this.orchestrator.abortCurrent();
        this.orchestrator.clearHistory();
        this.postMessage({ type: 'toast', severity: 'info', text: 'Chat history cleared.' });
        break;

      case 'request_calibration':
        try {
          const telemetry = await CalibrationTelemetry.scanSystem(true);
          const recommendation = ModelRecommender.evaluate(telemetry);
          this.postMessage({ type: 'calibration_data', telemetry, recommendation });
          this.postMessage({ type: 'toast', severity: 'info', text: 'Hardware Telemetry scan complete.' });
        } catch (err) {
          this.postMessage({ type: 'toast', severity: 'error', text: `Calibration failed: ${err}` });
        }
        break;

      case 'request_benchmark':
        const modelToBench = message.model || this.manager.getActiveModel();
        if (!modelToBench) {
          this.postMessage({ type: 'toast', severity: 'warning', text: 'No model available to benchmark.' });
          return;
        }
        try {
          const result = await ModelBenchmarker.runBenchmark(
            this.manager.getClient(),
            modelToBench,
            (status) => this.postMessage({ type: 'benchmark_progress', status })
          );
          this.postMessage({ type: 'benchmark_result', result });
        } catch (err) {
          this.postMessage({ type: 'toast', severity: 'error', text: `Benchmark error: ${err}` });
        }
        break;

      case 'request_models':
        await this.manager.refreshModels();
        break;

      case 'select_model':
        await this.manager.setActiveModel(message.model);
        this.postMessage({ type: 'toast', severity: 'info', text: `Active model set to: ${message.model}` });
        break;

      case 'pull_model':
        this.pullModelStream(message.model);
        break;

      case 'toggle_context_chip':
        this.contextEngine.toggleChip(message.chipId);
        break;

      case 'remove_context_chip':
        this.contextEngine.removeChip(message.chipId);
        break;

      case 'add_file_as_chip':
        this.contextEngine.addFileChip(message.filePath);
        break;

      case 'index_workspace':
        try {
          const chunkCount = await this.contextEngine.indexWorkspace((msg) => {
            this.postMessage({ type: 'toast', severity: 'info', text: msg });
          });
          this.postMessage({ type: 'toast', severity: 'info', text: `Indexed ${chunkCount} chunks for RAG.` });
        } catch (err) {
          this.postMessage({ type: 'toast', severity: 'error', text: `Indexing failed: ${err}` });
        }
        break;

      case 'accept_diff':
        if (typeof message.hunkIndex === 'number') {
          await PatchManager.acceptHunk(message.suggestionId, message.hunkIndex);
        } else {
          await PatchManager.acceptAll(message.suggestionId);
        }
        const updatedSug = PatchManager.getSuggestion(message.suggestionId);
        if (updatedSug) {
          this.postMessage({ type: 'diff_updated', suggestion: updatedSug });
        }
        break;

      case 'reject_diff':
        PatchManager.reject(message.suggestionId);
        const rejSug = PatchManager.getSuggestion(message.suggestionId);
        if (rejSug) {
          this.postMessage({ type: 'diff_updated', suggestion: rejSug });
        }
        break;

      case 'open_diff_view':
        const sug = PatchManager.getSuggestion(message.suggestionId);
        if (sug) {
          await LuminaDiffProvider.getInstance().showComparisonView(sug);
        }
        break;

      case 'start_autonomous_loop':
        this.autonomousLoop.startLoop(message.testCommand || 'npm test');
        break;

      case 'stop_autonomous_loop':
        this.autonomousLoop.stop();
        break;

      case 'open_settings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'lumina');
        break;

      case 'apply_to_editor':
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            if (!editor.selection.isEmpty) {
              editBuilder.replace(editor.selection, message.code);
            } else {
              editBuilder.insert(editor.selection.active, message.code);
            }
          });
          vscode.window.showInformationMessage('Lumina: Applied code snippet to active editor.');
        } else {
          vscode.window.showWarningMessage('Lumina: Open an editor to insert code.');
        }
        break;

      case 'open_prism':
        vscode.commands.executeCommand('lumina.prism');
        break;
    }
  }

  private async pullModelStream(modelName: string): Promise<void> {
    try {
      this.postMessage({
        type: 'pull_progress',
        model: modelName,
        status: `Starting download of ${modelName}...`,
      });

      const client = this.manager.getClient();
      for await (const progress of client.pullModel(modelName)) {
        this.postMessage({
          type: 'pull_progress',
          model: modelName,
          status: progress.status,
          completed: progress.completed,
          total: progress.total,
        });
      }

      await this.manager.refreshModels();
      await this.manager.setActiveModel(modelName);
      this.postMessage({
        type: 'toast',
        severity: 'info',
        text: `Model ${modelName} downloaded and activated!`,
      });
    } catch (err) {
      this.postMessage({
        type: 'toast',
        severity: 'error',
        text: `Failed to pull ${modelName}: ${err}`,
      });
    }
  }

  private postMessage(message: ExtensionMessage): void {
    this._view?.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'nexus', 'media', 'nexus.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'nexus', 'media', 'nexus.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Lumina Nexus</title>
</head>
<body class="lumina-body">
  <div class="lumina-app">
    <header class="lumina-header">
      <div class="brand-title">
        <span class="brand-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
        </span>
        <span class="brand-name">Lumina</span>
        <span class="status-pill" id="statusPill" data-state="connecting" title="Ollama connection status">
          <span class="status-dot"></span><span id="statusText">Connecting</span>
        </span>
      </div>
      <div class="header-actions">
        <button id="btnOpenPrism" class="icon-btn" title="Open Prism Command Bar" aria-label="Open Prism Command Bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>
        <button id="btnSettings" class="icon-btn" title="Lumina Settings" aria-label="Lumina Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>

    <nav class="lumina-tabs" role="tablist">
      <button class="tab-btn active" role="tab" data-tab="tab-chat">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Chat</span>
      </button>
      <button class="tab-btn" role="tab" data-tab="tab-context">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        <span>Context</span>
      </button>
      <button class="tab-btn" role="tab" data-tab="tab-hardware">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>
        <span>Models</span>
      </button>
      <button class="tab-btn" role="tab" data-tab="tab-loop">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span>Loop</span>
      </button>
    </nav>

    <!-- TAB 1: AGENT CHAT -->
    <section class="tab-content active" id="tab-chat">
      <div class="chat-messages" id="chatMessages">
        <div class="welcome-card" id="welcomeCard">
          <div class="welcome-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
          </div>
          <h3>What are we building?</h3>
          <p>A local coding agent powered by Ollama. Your code never leaves this machine.</p>
          <div class="quick-prompts">
            <button class="quick-btn" data-prompt="Analyze the active file and suggest modular refactoring.">
              <span class="quick-title">Refactor active file</span>
              <span class="quick-sub">Split it into smaller, clearer pieces</span>
            </button>
            <button class="quick-btn" data-prompt="Generate comprehensive unit tests for this module.">
              <span class="quick-title">Write unit tests</span>
              <span class="quick-sub">Cover the module's edge cases</span>
            </button>
            <button class="quick-btn" data-prompt="Audit this codebase for edge case bugs and memory leaks.">
              <span class="quick-title">Audit for bugs</span>
              <span class="quick-sub">Look for edge cases and leaks</span>
            </button>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <div class="chips-list" id="chipsList"></div>
        <div class="input-wrapper">
          <textarea id="chatInput" placeholder="Ask Lumina anything…" rows="1" aria-label="Message Lumina"></textarea>
          <div class="input-actions">
            <button class="model-badge" id="chatModelBadge" title="Change model">
              <span class="model-dot"></span><span id="chatModelName">Loading…</span>
            </button>
            <div class="action-buttons">
              <button id="btnClearChat" class="icon-btn ghost" title="Clear chat" aria-label="Clear chat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <button id="btnSendChat" class="send-btn" title="Send (Enter)" aria-label="Send message">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="input-hint"><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> stop</div>
      </div>
    </section>

    <!-- TAB 2: CONTEXT HUB (RAG) -->
    <section class="tab-content" id="tab-context">
      <div class="panel">
        <div class="panel-head">
          <h3>Codebase index</h3>
          <p class="section-desc">A private vector index of your repository, used to pull relevant code into each answer.</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Chunks</div>
            <div class="stat-value" id="statChunks">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Files</div>
            <div class="stat-value" id="statFiles">0</div>
          </div>
        </div>
        <button id="btnIndexWorkspace" class="action-btn primary full-width">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span>Index workspace</span>
        </button>
      </div>

      <div class="panel">
        <div class="panel-head row">
          <h4>Context files</h4>
          <span class="count-badge" id="chipCount">0</span>
        </div>
        <div id="contextHubChipsList" class="chips-hub-list"></div>
      </div>
    </section>

    <!-- TAB 3: HARDWARE & MODELS -->
    <section class="tab-content" id="tab-hardware">
      <div class="panel">
        <div class="panel-head">
          <h3>Active model</h3>
          <p class="section-desc">Pick an installed Ollama model, or pull a new one.</p>
        </div>
        <select id="modelDropdown" class="lumina-select" aria-label="Active model">
          <option value="">Select an Ollama model…</option>
        </select>
        <div class="pull-model-group">
          <input type="text" id="pullModelInput" placeholder="e.g. qwen2.5-coder:7b" aria-label="Model to pull" />
          <button id="btnPullModel" class="action-btn secondary">Pull</button>
        </div>
        <div class="progress" id="pullProgress" hidden>
          <div class="progress-bar" id="pullProgressBar"></div>
        </div>
        <div id="pullProgressText" class="pull-progress-text"></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>Hardware</h3>
          <p class="section-desc">Lumina scans your machine to suggest a model that fits your memory.</p>
        </div>
        <dl class="telemetry-box" id="telemetryBox">
          <div class="telemetry-row"><dt>CPU</dt><dd id="telCpu"><span class="skeleton"></span></dd></div>
          <div class="telemetry-row"><dt>Memory</dt><dd id="telRam"><span class="skeleton"></span></dd></div>
          <div class="telemetry-row"><dt>GPU</dt><dd id="telGpu"><span class="skeleton"></span></dd></div>
          <div class="telemetry-row"><dt>Tier</dt><dd><span class="tier-pill" id="telTier">Calculating</span></dd></div>
        </dl>

        <div class="recommendation-box" id="recommendationBox">
          <div class="rec-title">Recommended</div>
          <div class="rec-model" id="recModel">—</div>
          <div class="rec-reason" id="recReason">Scanning hardware…</div>
        </div>

        <div class="hardware-actions">
          <button id="btnRunCalibration" class="action-btn secondary">Rescan</button>
          <button id="btnRunBenchmark" class="action-btn primary">Benchmark speed</button>
        </div>

        <div class="benchmark-gauge" id="benchmarkGauge" hidden>
          <div class="gauge-title">Throughput</div>
          <div class="gauge-value" id="gaugeTps">—</div>
          <div class="gauge-sub" id="gaugeDetails"></div>
        </div>
      </div>
    </section>

    <!-- TAB 4: AUTONOMOUS LOOP -->
    <section class="tab-content" id="tab-loop">
      <div class="panel">
        <div class="panel-head">
          <h3>Test &amp; fix loop</h3>
          <p class="section-desc">Runs your test command, reads the failures, patches the code, and repeats until the tests pass.</p>
        </div>
        <label class="field-label" for="loopTestCommand">Test command</label>
        <input type="text" id="loopTestCommand" class="lumina-input mono" value="npm test" placeholder="npm test / pytest / cargo test" />
        <div class="loop-controls">
          <button id="btnStartLoop" class="action-btn primary">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>Start</span>
          </button>
          <button id="btnStopLoop" class="action-btn secondary" disabled>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>
            <span>Stop</span>
          </button>
        </div>
      </div>
      <ol class="loop-timeline" id="loopTimeline">
        <li class="empty-state">No runs yet. Start the loop to see each step here.</li>
      </ol>
    </section>

    <div id="luminaToast" class="lumina-toast" role="status" aria-live="polite"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return randomBytes(16).toString('base64');
}
