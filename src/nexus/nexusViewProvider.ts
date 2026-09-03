import * as vscode from 'vscode';
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

export class NexusViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'lumina.nexusView';
  private _view?: vscode.WebviewView;
  private extensionUri: vscode.Uri;
  private manager: OllamaModelManager;
  private contextEngine: ContextEngine;
  private orchestrator: SovereignOrchestrator;
  private autonomousLoop: AutonomousLoopController;

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

  private setupListeners(): void {
    this.manager.onStatusChange(({ isOnline, activeModel }) => {
      this.postMessage({
        type: 'models_list',
        models: this.manager.getAvailableModels(),
        activeModel,
        running: this.manager.getRunningProcesses(),
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
    const { models, running } = await this.manager.refreshModels();
    this.postMessage({
      type: 'models_list',
      models,
      activeModel: this.manager.getActiveModel(),
      running,
    });

    this.postMessage({
      type: 'context_chips_updated',
      chips: this.contextEngine.getContextChips(),
    });

    const vectorStore = this.contextEngine.getVectorStore();
    this.postMessage({
      type: 'rag_status',
      indexing: false,
      indexedFiles: 0,
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

      case 'chat_clear':
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Lumina Nexus</title>
</head>
<body class="lumina-body">
  <div class="lumina-app">
    <!-- Top Brand Header -->
    <header class="lumina-header">
      <div class="brand-title">
        <div class="brand-pulse"></div>
        <span class="brand-name">Lumina</span>
        <span class="brand-tag">SOVEREIGN</span>
      </div>
      <div class="header-actions">
        <button id="btnOpenPrism" class="icon-btn" title="Open Prism Command Bar (Cmd+K)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </button>
        <button id="btnSettings" class="icon-btn" title="Lumina Settings">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="lumina-tabs">
      <button class="tab-btn active" data-tab="tab-chat">Chat</button>
      <button class="tab-btn" data-tab="tab-context">Context</button>
      <button class="tab-btn" data-tab="tab-hardware">Hardware</button>
      <button class="tab-btn" data-tab="tab-loop">Auto Loop</button>
    </nav>

    <!-- Context Chips Bar -->
    <div class="chips-container" id="chipsContainer">
      <div class="chips-label">Context:</div>
      <div class="chips-list" id="chipsList">
        <!-- Injected via JS -->
      </div>
    </div>

    <!-- TAB 1: AGENT CHAT -->
    <section class="tab-content active" id="tab-chat">
      <div class="chat-messages" id="chatMessages">
        <div class="welcome-card">
          <div class="welcome-icon">✦</div>
          <h3>Local intelligence on your machine.</h3>
          <p>Autonomous coding agent powered by Ollama. 100% private, hardware-calibrated, and deeply connected to your codebase.</p>
          <div class="quick-prompts">
            <button class="quick-btn" data-prompt="Analyze the active file and suggest modular refactoring.">✦ Refactor Active File</button>
            <button class="quick-btn" data-prompt="Generate comprehensive unit tests for this module.">✦ Generate Unit Tests</button>
            <button class="quick-btn" data-prompt="Audit this codebase for edge case bugs and memory leaks.">✦ Audit Code Quality</button>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <div class="input-wrapper">
          <textarea id="chatInput" placeholder="Ask Lumina (or press Cmd+K in editor for Prism)..." rows="2"></textarea>
          <div class="input-actions">
            <span class="active-model-badge" id="chatModelBadge">Model: Loading...</span>
            <div class="action-buttons">
              <button id="btnClearChat" class="icon-btn small" title="Clear History">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <button id="btnSendChat" class="send-btn" title="Send Message">
                <span>Send</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2: CONTEXT HUB (RAG) -->
    <section class="tab-content" id="tab-context">
      <div class="tab-pane glass-card">
        <h3>Local RAG & Codebase Index.</h3>
        <p class="section-desc">Lumina builds a private local vector index of your repository using Cosine Similarity embeddings for deep multi-file awareness.</p>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" id="statChunks">0</div>
            <div class="stat-label">Vector Chunks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="statFiles">0</div>
            <div class="stat-label">Indexed Files</div>
          </div>
        </div>

        <button id="btnIndexWorkspace" class="action-btn primary full-width">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          Index Workspace Now
        </button>

        <h4 style="margin-top: 20px;">Active Context Chips</h4>
        <div id="contextHubChipsList" class="chips-hub-list">
          <!-- Injected via JS -->
        </div>
      </div>
    </section>

    <!-- TAB 3: HARDWARE & CALIBRATION -->
    <section class="tab-content" id="tab-hardware">
      <div class="tab-pane glass-card">
        <h3>Hardware Telemetry Scan.</h3>
        <p class="section-desc">Automatic calibration prevents system memory pressure and selects the fastest model tier for your GPU/RAM.</p>

        <div class="telemetry-box" id="telemetryBox">
          <div class="telemetry-row">
            <span>CPU</span> <strong id="telCpu">Scanning...</strong>
          </div>
          <div class="telemetry-row">
            <span>System RAM</span> <strong id="telRam">-- GB</strong>
          </div>
          <div class="telemetry-row">
            <span>GPU / VRAM</span> <strong id="telGpu">--</strong>
          </div>
          <div class="telemetry-row">
            <span>Profile Tier</span> <span class="tier-pill" id="telTier">Calculating</span>
          </div>
        </div>

        <div class="recommendation-box" id="recommendationBox">
          <div class="rec-title">Recommended Local Model</div>
          <div class="rec-model" id="recModel">qwen2.5-coder:7b</div>
          <div class="rec-reason" id="recReason">Hardware calibration in progress...</div>
        </div>

        <div class="hardware-actions">
          <button id="btnRunCalibration" class="action-btn secondary">Rescan Hardware</button>
          <button id="btnRunBenchmark" class="action-btn primary">Benchmark Speed (TPS)</button>
        </div>

        <div class="benchmark-gauge" id="benchmarkGauge" style="display: none;">
          <div class="gauge-title">Inference Throughput</div>
          <div class="gauge-value" id="gaugeTps">0.0 <span class="unit">tokens/sec</span></div>
          <div class="gauge-sub" id="gaugeDetails">Latency: --ms</div>
        </div>

        <h4 style="margin-top: 20px;">Model Manager</h4>
        <div class="model-select-group">
          <select id="modelDropdown" class="lumina-select">
            <option value="">Select an Ollama model...</option>
          </select>
        </div>

        <div class="pull-model-group">
          <input type="text" id="pullModelInput" placeholder="Pull model (e.g. qwen2.5-coder:7b)" />
          <button id="btnPullModel" class="action-btn secondary small">Pull</button>
        </div>
        <div id="pullProgressText" class="pull-progress-text"></div>
      </div>
    </section>

    <!-- TAB 4: AUTONOMOUS LOOP -->
    <section class="tab-content" id="tab-loop">
      <div class="tab-pane glass-card">
        <h3>Autonomous Test & Fix Loop.</h3>
        <p class="section-desc">Executes your test suite or compiler, diagnoses error stack traces, crafts precision patches, and loops until all tests pass.</p>

        <div class="loop-input-group">
          <label for="loopTestCommand">Test Command</label>
          <input type="text" id="loopTestCommand" value="npm test" placeholder="npm test / pytest / cargo test" />
        </div>

        <div class="loop-controls">
          <button id="btnStartLoop" class="action-btn primary">Start Auto Loop</button>
          <button id="btnStopLoop" class="action-btn secondary" disabled>Stop</button>
        </div>

        <div class="loop-timeline" id="loopTimeline">
          <!-- Timeline steps injected here -->
        </div>
      </div>
    </section>

    <!-- Toast Notification -->
    <div id="luminaToast" class="lumina-toast"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
