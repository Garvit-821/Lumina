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
exports.OllamaModelManager = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class OllamaModelManager {
    client;
    activeModel = '';
    availableModels = [];
    runningProcesses = [];
    isOnline = false;
    healthTimer;
    onStatusChangeEmitter = new vscode.EventEmitter();
    onStatusChange = this.onStatusChangeEmitter.event;
    constructor(client) {
        this.client = client;
        this.loadActiveModelFromConfig();
        this.startHealthCheck();
    }
    getClient() {
        return this.client;
    }
    getActiveModel() {
        return this.activeModel;
    }
    getAvailableModels() {
        return this.availableModels;
    }
    getRunningProcesses() {
        return this.runningProcesses;
    }
    getIsOnline() {
        return this.isOnline;
    }
    async setActiveModel(modelName) {
        this.activeModel = modelName;
        const config = vscode.workspace.getConfiguration('lumina');
        await config.update('selectedModel', modelName, vscode.ConfigurationTarget.Global);
        this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
        logger_1.LuminaLogger.getInstance().log(`Active model changed to: ${modelName}`);
    }
    async refreshModels() {
        const isHealthy = await this.client.isHealthy();
        this.isOnline = isHealthy;
        if (isHealthy) {
            this.availableModels = await this.client.listModels();
            this.runningProcesses = await this.client.listRunning();
            if (!this.activeModel && this.availableModels.length > 0) {
                this.activeModel = this.availableModels[0].name;
            }
        }
        else {
            this.availableModels = [];
            this.runningProcesses = [];
        }
        this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
        return { models: this.availableModels, running: this.runningProcesses };
    }
    loadActiveModelFromConfig() {
        const config = vscode.workspace.getConfiguration('lumina');
        const configuredModel = config.get('selectedModel');
        if (configuredModel && configuredModel.trim().length > 0) {
            this.activeModel = configuredModel.trim();
        }
    }
    startHealthCheck() {
        this.refreshModels();
        this.healthTimer = setInterval(() => {
            this.refreshModels().catch(() => { });
        }, 15000);
    }
    dispose() {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
        }
        this.onStatusChangeEmitter.dispose();
    }
}
exports.OllamaModelManager = OllamaModelManager;
//# sourceMappingURL=manager.js.map