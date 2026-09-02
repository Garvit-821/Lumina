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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const client_1 = require("./ollama/client");
const manager_1 = require("./ollama/manager");
const contextEngine_1 = require("./rag/contextEngine");
const sovereignOrchestrator_1 = require("./orchestrator/sovereignOrchestrator");
const autonomousLoop_1 = require("./orchestrator/autonomousLoop");
const telemetry_1 = require("./calibration/telemetry");
const recommender_1 = require("./calibration/recommender");
const benchmarker_1 = require("./calibration/benchmarker");
const diffProvider_1 = require("./diff/diffProvider");
const patchManager_1 = require("./diff/patchManager");
const inlineCompletion_1 = require("./aura/inlineCompletion");
const floatingCommandBar_1 = require("./prism/floatingCommandBar");
const nexusViewProvider_1 = require("./nexus/nexusViewProvider");
const statusBar_1 = require("./utils/statusBar");
const logger_1 = require("./utils/logger");
async function activate(context) {
    const logger = logger_1.LuminaLogger.getInstance();
    logger.log('✨ Lumina AI Coding Agent activating...');
    // 1. Core Services Setup
    const config = vscode.workspace.getConfiguration('lumina');
    const endpoint = config.get('ollamaEndpoint') || 'http://localhost:11434';
    const ollamaClient = new client_1.OllamaClient(endpoint);
    const modelManager = new manager_1.OllamaModelManager(ollamaClient);
    const contextEngine = new contextEngine_1.ContextEngine(ollamaClient);
    const orchestrator = new sovereignOrchestrator_1.SovereignOrchestrator(modelManager, contextEngine);
    const autonomousLoop = new autonomousLoop_1.AutonomousLoopController(modelManager, contextEngine);
    const statusBar = new statusBar_1.LuminaStatusBar();
    const prismBar = new floatingCommandBar_1.PrismCommandBar(modelManager, contextEngine);
    const auraProvider = new inlineCompletion_1.AuraInlineCompletionProvider(modelManager);
    // Status Bar Sync
    modelManager.onStatusChange(({ isOnline, activeModel }) => {
        statusBar.setStatus(isOnline, activeModel);
    });
    // 2. Register Virtual Document Provider for Side-by-Side Diffs
    const diffProvider = diffProvider_1.LuminaDiffProvider.getInstance();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(diffProvider_1.LuminaDiffProvider.scheme, diffProvider));
    // 3. Register The Aura (Ghost Text Inline Completion Provider)
    context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, auraProvider));
    // 4. Register The Nexus (Glassmorphic Sidebar Webview)
    const nexusProvider = new nexusViewProvider_1.NexusViewProvider(context.extensionUri, modelManager, contextEngine, orchestrator, autonomousLoop);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(nexusViewProvider_1.NexusViewProvider.viewType, nexusProvider, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    // 5. Register Commands
    context.subscriptions.push(
    // Prism Command Bar (Cmd+K)
    vscode.commands.registerCommand('lumina.prism', async () => {
        await prismBar.open();
    }), 
    // Calibration Engine
    vscode.commands.registerCommand('lumina.calibrate', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Lumina: Scanning Hardware Telemetry...',
        }, async () => {
            const telemetry = await telemetry_1.CalibrationTelemetry.scanSystem(true);
            const recommendation = recommender_1.ModelRecommender.evaluate(telemetry);
            const message = `Lumina Hardware Calibration:\n• GPU/VRAM: ${telemetry.gpuName} (${telemetry.vramGB}GB)\n• RAM: ${telemetry.totalRamGB}GB\n• Recommendation: ${recommendation.recommendedModel} (${recommendation.tierName})`;
            vscode.window.showInformationMessage(message, `Use ${recommendation.recommendedModel}`, 'Dismiss').then(async (action) => {
                if (action && action.startsWith('Use ')) {
                    await modelManager.setActiveModel(recommendation.recommendedModel);
                    vscode.window.showInformationMessage(`Active model set to: ${recommendation.recommendedModel}`);
                }
            });
        });
    }), 
    // Benchmarking
    vscode.commands.registerCommand('lumina.benchmark', async () => {
        const activeModel = modelManager.getActiveModel();
        if (!activeModel) {
            vscode.window.showWarningMessage('Lumina: No active model selected to benchmark.');
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Lumina: Benchmarking ${activeModel}...`,
        }, async () => {
            const result = await benchmarker_1.ModelBenchmarker.runBenchmark(ollamaClient, activeModel);
            statusBar.setBenchmark(result);
            vscode.window.showInformationMessage(`🚀 Lumina Benchmark for ${result.model}: ${result.tokensPerSecond} tokens/sec (TTFT: ${result.timeToFirstTokenMs}ms)`);
        });
    }), 
    // Local RAG Indexing
    vscode.commands.registerCommand('lumina.indexWorkspace', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Lumina: Indexing Workspace for Local RAG...',
        }, async (progress) => {
            const count = await contextEngine.indexWorkspace((msg, pct) => {
                progress.report({ message: msg, increment: pct });
            });
            vscode.window.showInformationMessage(`Lumina: Indexed ${count} code chunks in workspace.`);
        });
    }), 
    // Toggle Ghost Text
    vscode.commands.registerCommand('lumina.toggleGhostText', () => {
        const isEnabled = auraProvider.toggle();
        vscode.window.showInformationMessage(`Lumina: The Aura (Ghost Text) is now ${isEnabled ? 'ENABLED' : 'DISABLED'}.`);
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
    vscode.commands.registerCommand('lumina.acceptDiff', async (suggestionId) => {
        if (suggestionId) {
            await patchManager_1.PatchManager.acceptAll(suggestionId);
        }
    }), vscode.commands.registerCommand('lumina.rejectDiff', (suggestionId) => {
        if (suggestionId) {
            patchManager_1.PatchManager.reject(suggestionId);
        }
    }), 
    // Focus Nexus Sidebar
    vscode.commands.registerCommand('lumina.focusNexus', () => {
        vscode.commands.executeCommand('lumina.nexusView.focus');
    }), 
    // Settings
    vscode.commands.registerCommand('lumina.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'lumina');
    }));
    // 6. Startup Calibration
    const autoCalibrate = config.get('autoCalibrateOnStartup', true);
    if (autoCalibrate) {
        telemetry_1.CalibrationTelemetry.scanSystem().then((telemetry) => {
            const rec = recommender_1.ModelRecommender.evaluate(telemetry);
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
function deactivate() {
    logger_1.LuminaLogger.getInstance().log('Lumina deactivated.');
}
//# sourceMappingURL=extension.js.map