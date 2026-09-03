import * as vscode from 'vscode';
import { OllamaClient } from './ollama/client';
import { OllamaModelManager } from './ollama/manager';
import { ContextEngine } from './rag/contextEngine';
import { SovereignOrchestrator } from './orchestrator/sovereignOrchestrator';
import { AutonomousLoopController } from './orchestrator/autonomousLoop';
import { CalibrationTelemetry } from './calibration/telemetry';
import { ModelRecommender } from './calibration/recommender';
import { ModelBenchmarker } from './calibration/benchmarker';
import { LuminaDiffProvider } from './diff/diffProvider';
import { PatchManager } from './diff/patchManager';
import { AuraInlineCompletionProvider } from './aura/inlineCompletion';
import { PrismCommandBar } from './prism/floatingCommandBar';
import { NexusViewProvider } from './nexus/nexusViewProvider';
import { LuminaStatusBar } from './utils/statusBar';
import { LuminaLogger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = LuminaLogger.getInstance();
  logger.log('✨ Lumina AI Coding Agent activating...');

  // 1. Core Services Setup
  const config = vscode.workspace.getConfiguration('lumina');
  const endpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';

  const ollamaClient = new OllamaClient(endpoint);
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

  context.subscriptions.push(statusBar, modelManager);

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
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NexusViewProvider.viewType, nexusProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 5. Register Commands
  context.subscriptions.push(
    // Prism Command Bar (Cmd+K)
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
          const result = await ModelBenchmarker.runBenchmark(ollamaClient, activeModel);
          statusBar.setBenchmark(result);
          vscode.window.showInformationMessage(
            `🚀 Lumina Benchmark for ${result.model}: ${result.tokensPerSecond} tokens/sec (TTFT: ${result.timeToFirstTokenMs}ms)`
          );
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
    CalibrationTelemetry.scanSystem().then((telemetry) => {
      const rec = ModelRecommender.evaluate(telemetry);
      logger.log('Startup telemetry calibrated', {
        profile: rec.tier,
        recommended: rec.recommendedModel,
      });
      if (!modelManager.getActiveModel()) {
        modelManager.setActiveModel(rec.recommendedModel);
      }
    });
  }

  logger.log('🌌 Lumina Agent initialized and ready.');
}

export function deactivate(): void {
  LuminaLogger.getInstance().log('Lumina deactivated.');
}
