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
exports.LuminaStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class LuminaStatusBar {
    item;
    currentModel = 'Offline';
    isOnline = false;
    lastTps = null;
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'lumina.focusNexus';
        this.update();
        this.item.show();
    }
    setStatus(isOnline, modelName, tps) {
        this.isOnline = isOnline;
        this.currentModel = modelName || 'No Model';
        if (typeof tps === 'number') {
            this.lastTps = tps;
        }
        this.update();
    }
    setBenchmark(result) {
        this.lastTps = result.tokensPerSecond;
        this.update();
    }
    update() {
        if (!this.isOnline) {
            this.item.text = '$(circle-slash) Lumina: Offline';
            this.item.tooltip = 'Lumina Agent: Ollama server not reachable at configured endpoint. Click to open Nexus Hub.';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            return;
        }
        const tpsText = this.lastTps !== null ? ` (${this.lastTps.toFixed(1)} t/s)` : '';
        this.item.text = `$(sparkle) Lumina: ${this.currentModel}${tpsText}`;
        this.item.tooltip = `Lumina Active Model: ${this.currentModel}\nSpeed: ${this.lastTps ? this.lastTps.toFixed(1) + ' tokens/sec' : 'Calibrated'}\nClick to open Nexus Hub & Agent Controls.`;
        this.item.backgroundColor = undefined;
    }
    dispose() {
        this.item.dispose();
    }
}
exports.LuminaStatusBar = LuminaStatusBar;
//# sourceMappingURL=statusBar.js.map