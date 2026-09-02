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
exports.LuminaLogger = void 0;
const vscode = __importStar(require("vscode"));
class LuminaLogger {
    static instance;
    channel;
    constructor() {
        this.channel = vscode.window.createOutputChannel('Lumina Agent');
    }
    static getInstance() {
        if (!LuminaLogger.instance) {
            LuminaLogger.instance = new LuminaLogger();
        }
        return LuminaLogger.instance;
    }
    log(message, context) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const formatted = `[${timestamp}] [INFO] ${message} ${context ? JSON.stringify(context) : ''}`;
        this.channel.appendLine(formatted);
    }
    warn(message, context) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const formatted = `[${timestamp}] [WARN] ${message} ${context ? JSON.stringify(context) : ''}`;
        this.channel.appendLine(formatted);
    }
    error(message, error) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : String(error || '');
        const formatted = `[${timestamp}] [ERROR] ${message} ${errStr}`;
        this.channel.appendLine(formatted);
    }
    show() {
        this.channel.show();
    }
}
exports.LuminaLogger = LuminaLogger;
//# sourceMappingURL=logger.js.map