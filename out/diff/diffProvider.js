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
exports.LuminaDiffProvider = void 0;
const vscode = __importStar(require("vscode"));
class LuminaDiffProvider {
    static scheme = 'lumina-diff';
    static instance;
    suggestions = new Map();
    onDidChangeEmitter = new vscode.EventEmitter();
    onDidChange = this.onDidChangeEmitter.event;
    static getInstance() {
        if (!LuminaDiffProvider.instance) {
            LuminaDiffProvider.instance = new LuminaDiffProvider();
        }
        return LuminaDiffProvider.instance;
    }
    registerSuggestion(suggestion) {
        this.suggestions.set(suggestion.id, suggestion);
        const uri = vscode.Uri.parse(`${LuminaDiffProvider.scheme}://${suggestion.id}/${suggestion.filePath.split('/').pop()}`);
        this.onDidChangeEmitter.fire(uri);
        return uri;
    }
    getSuggestion(suggestionId) {
        return this.suggestions.get(suggestionId);
    }
    provideTextDocumentContent(uri) {
        const suggestionId = uri.authority;
        const suggestion = this.suggestions.get(suggestionId);
        return suggestion ? suggestion.proposedCode : '// Lumina Diff: Content not found';
    }
    async showComparisonView(suggestion) {
        const proposedUri = this.registerSuggestion(suggestion);
        const originalUri = vscode.Uri.file(suggestion.filePath);
        const title = `Lumina AI Proposal ⟷ ${suggestion.filePath.split('/').pop()}`;
        await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, title, {
            preview: true,
            preserveFocus: false,
        });
    }
}
exports.LuminaDiffProvider = LuminaDiffProvider;
//# sourceMappingURL=diffProvider.js.map