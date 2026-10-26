import * as vscode from 'vscode';
import { OllamaClient } from './ollama/client';
import { OllamaModelManager } from './ollama/manager';
import { ContextEngine } from './rag/contextEngine';
import { SovereignOrchestrator } from './orchestrator/sovereignOrchestrator';
import { AutonomousLoopController } from './orchestrator/autonomousLoop';
import { CalibrationTelemetry } from './calibration/telemetry';
import { ModelRecommender } from './calibration/recommender';
import { ModelBenchmarker } from './calibration/benchmarker';
import { sameModel } from './calibration/benchmarkMath';
import { LuminaDiffProvider } from './diff/diffProvider';
import { PatchManager } from './diff/patchManager';
import { AuraInlineCompletionProvider } from './aura/inlineCompletion';
import { PrismCommandBar } from './prism/floatingCommandBar';
import { NexusViewProvider } from './nexus/nexusViewProvider';
import { LuminaStatusBar } from './utils/statusBar';
import { LuminaLogger } from './utils/logger';
import { getLuminaConfig } from './utils/config';

/**
 * Extension entry point, run once VS Code has finished starting up (activation event onStartupFinished).
 * Creates the shared services (Ollama client, model manager, RAG context engine, chat orchestrator and
 * test-and-fix loop), then registers the diff document provider, ghost-text completions, the Nexus
 * sidebar and the lumina.* commands. It ends with an optional hardware calibration that runs in the
 * background and never blocks activation.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = LuminaLogger.getInstance();
  logger.log('✨ Lumina AI Coding Agent activating...');

  // 1. Core Services Setup
  const config = vscode.workspace.getConfiguration('lumina');
  // Single HTTP client shared by every service; its base URL is updated in place when the endpoint setting changes.
  const ollamaClient = new OllamaClient(getLuminaConfig().endpoint);
  // Owns the active-model choice and polls Ollama every 15 s for its health and the installed and loaded models.
  const modelManager = new OllamaModelManager(ollamaClient);
  const contextEngine = new ContextEngine(ollamaClient);
  const orchestrator = new SovereignOrchestrator(modelManager, contextEngine);
  const autonomousLoop = new AutonomousLoopController(modelManager, contextEngine);
  const statusBar = new LuminaStatusBar();
  const prismBar = new PrismCommandBar(modelManager, contextEngine);
  const auraProvider = new AuraInlineCompletionProvider(modelManager);

  // Status Bar Sync
  modelManager.onStatusChange(({ isOnline, activeModel }) => {
    statusBar.setStatus(isOnline, activeModel);
  });

  context.subscriptions.push(statusBar, modelManager, auraProvider);

  // Apply endpoint / model changes from Settings immediately instead of requiring a window reload.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('lumina.ollamaEndpoint')) {
        ollamaClient.setBaseUrl(getLuminaConfig().endpoint);
        logger.log(`Ollama endpoint changed to ${ollamaClient.getBaseUrl()}`);
        await modelManager.reloadFromConfig();
      } else if (e.affectsConfiguration('lumina.selectedModel')) {
        await modelManager.reloadFromConfig();
      }
    })
  );

  // 2. Register Virtual Document Provider for Side-by-Side Diffs
  const diffProvider = LuminaDiffProvider.getInstance();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(LuminaDiffProvider.scheme, diffProvider)
  );

  // 3. Register The Aura (Ghost Text Inline Completion Provider)
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      auraProvider
    )
  );

  // 4. Register The Nexus (Glassmorphic Sidebar Webview)
  const nexusProvider = new NexusViewProvider(
    context.extensionUri,
    modelManager,
    contextEngine,
    orchestrator,
    autonomousLoop
  );
  // retainContextWhenHidden keeps the webview page alive while the sidebar is hidden, so a reply that is
  // still streaming and the scroll position survive; the cost is keeping the page in memory.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NexusViewProvider.viewType, nexusProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 5. Register Commands
  context.subscriptions.push(
    // Prism Command Bar (Cmd+Alt+K / Ctrl+Alt+K)
    vscode.commands.registerCommand('lumina.prism', async () => {
      await prismBar.open();
    }),

    // Calibration Engine
    vscode.commands.registerCommand('lumina.calibrate', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Lumina: Scanning Hardware Telemetry...',
        },
        async () => {
          // true skips the cached scan so a manual calibration reflects the machine as it is now.
          const telemetry = await CalibrationTelemetry.scanSystem(true);
          const recommendation = ModelRecommender.evaluate(telemetry);

          const message = `Lumina Hardware Calibration:\n• GPU/VRAM: ${telemetry.gpuName} (${telemetry.vramGB}GB)\n• RAM: ${telemetry.totalRamGB}GB\n• Recommendation: ${recommendation.recommendedModel} (${recommendation.tierName})`;

          vscode.window.showInformationMessage(
            message,
            `Use ${recommendation.recommendedModel}`,
            'Dismiss'
          ).then(async (action) => {
            if (action && action.startsWith('Use ')) {
              await modelManager.setActiveModel(recommendation.recommendedModel);
              vscode.window.showInformationMessage(`Active model set to: ${recommendation.recommendedModel}`);
            }
          });
        }
      );
    }),

    // Benchmarking
    vscode.commands.registerCommand('lumina.benchmark', async () => {
      const activeModel = modelManager.getActiveModel();
      if (!activeModel) {
        vscode.window.showWarningMessage('Lumina: No active model selected to benchmark.');
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Lumina: Benchmarking ${activeModel}...`,
        },
        async () => {
          try {
            const result = await ModelBenchmarker.runBenchmark(ollamaClient, activeModel);
            statusBar.setBenchmark(result);
            vscode.window.showInformationMessage(
              `Lumina: ${result.model} runs at ${result.tokensPerSecond} tokens/sec (first token in ${result.timeToFirstTokenMs} ms).`
            );
          } catch (err) {
            vscode.window.showErrorMessage(`Lumina: Benchmark failed. ${err instanceof Error ? err.message : err}`);
          }
        }
      );
    }),

    // Local RAG Indexing
    vscode.commands.registerCommand('lumina.indexWorkspace', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Lumina: Indexing Workspace for Local RAG...',
        },
        async (progress) => {
          const count = await contextEngine.indexWorkspace((msg, pct) => {
            progress.report({ message: msg, increment: pct });
          });
          vscode.window.showInformationMessage(`Lumina: Indexed ${count} code chunks in workspace.`);
        }
      );
    }),

    // Toggle Ghost Text
    vscode.commands.registerCommand('lumina.toggleGhostText', () => {
      const isEnabled = auraProvider.toggle();
      vscode.window.showInformationMessage(
        `Lumina: The Aura (Ghost Text) is now ${isEnabled ? 'ENABLED' : 'DISABLED'}.`
      );
    }),

    // Autonomous Loop
    vscode.commands.registerCommand('lumina.runAutonomousLoop', async () => {
      const testCmd = await vscode.window.showInputBox({
        prompt: 'Enter test suite or compiler command to run in autonomous loop',
        value: 'npm test',
      });
      if (testCmd) {
        autonomousLoop.startLoop(testCmd);
      }
    }),

    // Diff controls
    vscode.commands.registerCommand('lumina.acceptDiff', async (suggestionId?: string) => {
      if (suggestionId) {
        await PatchManager.acceptAll(suggestionId);
      }
    }),

    vscode.commands.registerCommand('lumina.rejectDiff', (suggestionId?: string) => {
      if (suggestionId) {
        PatchManager.reject(suggestionId);
      }
    }),

    // Focus Nexus Sidebar
    vscode.commands.registerCommand('lumina.focusNexus', () => {
      vscode.commands.executeCommand('lumina.nexusView.focus');
    }),

    // Settings
    vscode.commands.registerCommand('lumina.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'lumina');
    })
  );

  // 6. Startup Calibration
  const autoCalibrate = config.get<boolean>('autoCalibrateOnStartup', true);
  if (autoCalibrate) {
    CalibrationTelemetry.scanSystem()
      .then(async (telemetry) => {
        const rec = ModelRecommender.evaluate(telemetry);
        logger.log('Startup telemetry calibrated', { profile: rec.tier, recommended: rec.recommendedModel });
        if (modelManager.getActiveModel()) return;

        // Only auto-select the recommendation if it is installed; otherwise every chat would fail with "model not found".
        const { models } = await modelManager.refreshModels();
        const installed = models.find((m) => sameModel(m.name, rec.recommendedModel));
        if (installed) {
          await modelManager.setActiveModel(installed.name);
        } else {
          logger.log(`Recommended model ${rec.recommendedModel} is not installed; pull it from the Models tab.`);
        }
      })
      .catch((err) => logger.warn(`Startup calibration skipped: ${err}`));
  }

  logger.log('🌌 Lumina Agent initialized and ready.');
}

export function deactivate(): void {
  LuminaLogger.getInstance().log('Lumina deactivated.');
}
