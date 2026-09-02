"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffEngine = void 0;
class DiffEngine {
    static createSuggestion(filePath, originalCode, proposedCode, explanation = 'Lumina AI Code Modification') {
        const hunks = this.computeHunks(originalCode, proposedCode);
        return {
            id: `diff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            filePath,
            originalCode,
            proposedCode,
            explanation,
            hunks,
            createdAt: Date.now(),
            status: 'pending',
        };
    }
    static computeHunks(originalCode, proposedCode) {
        const origLines = originalCode.split('\n');
        const propLines = proposedCode.split('\n');
        const hunks = [];
        let origIdx = 0;
        let propIdx = 0;
        let hunkCount = 0;
        while (origIdx < origLines.length || propIdx < propLines.length) {
            if (origIdx < origLines.length &&
                propIdx < propLines.length &&
                origLines[origIdx] === propLines[propIdx]) {
                origIdx++;
                propIdx++;
                continue;
            }
            // Found a difference: identify block of mismatch
            const startOrig = origIdx;
            const startProp = propIdx;
            // Look ahead for next synchronization point
            let syncOrig = -1;
            let syncProp = -1;
            let foundSync = false;
            for (let d = 1; d < 50; d++) {
                for (let i = 0; i <= d; i++) {
                    const j = d - i;
                    const checkOrig = startOrig + i;
                    const checkProp = startProp + j;
                    if (checkOrig < origLines.length &&
                        checkProp < propLines.length &&
                        origLines[checkOrig] === propLines[checkProp] &&
                        // require 2 matching lines if possible for robust sync
                        (checkOrig + 1 >= origLines.length ||
                            checkProp + 1 >= propLines.length ||
                            origLines[checkOrig + 1] === propLines[checkProp + 1])) {
                        syncOrig = checkOrig;
                        syncProp = checkProp;
                        foundSync = true;
                        break;
                    }
                }
                if (foundSync)
                    break;
            }
            const endOrig = foundSync ? syncOrig : origLines.length;
            const endProp = foundSync ? syncProp : propLines.length;
            const originalBlock = origLines.slice(startOrig, endOrig);
            const modifiedBlock = propLines.slice(startProp, endProp);
            hunkCount++;
            hunks.push({
                hunkIndex: hunkCount,
                oldStartLine: startOrig + 1,
                oldLineCount: originalBlock.length,
                newStartLine: startProp + 1,
                newLineCount: modifiedBlock.length,
                originalLines: originalBlock,
                modifiedLines: modifiedBlock,
                accepted: false,
            });
            origIdx = endOrig;
            propIdx = endProp;
        }
        return hunks;
    }
}
exports.DiffEngine = DiffEngine;
//# sourceMappingURL=diffEngine.js.map