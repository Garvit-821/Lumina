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
exports.CalibrationTelemetry = void 0;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("../utils/logger");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class CalibrationTelemetry {
    static cachedTelemetry = null;
    static async scanSystem(forceRefresh = false) {
        if (this.cachedTelemetry && !forceRefresh) {
            return this.cachedTelemetry;
        }
        const platform = os.platform();
        const release = os.release();
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
        const cpuCores = cpus.length;
        const totalRamBytes = os.totalmem();
        const freeRamBytes = os.freemem();
        const totalRamGB = Math.round((totalRamBytes / (1024 * 1024 * 1024)) * 10) / 10;
        const freeRamGB = Math.round((freeRamBytes / (1024 * 1024 * 1024)) * 10) / 10;
        const isAppleSilicon = platform === 'darwin' && (process.arch === 'arm64' || cpuModel.includes('Apple'));
        let gpuName = 'Standard Integrated Graphics';
        let vramGB = 0;
        let hasCuda = false;
        if (isAppleSilicon) {
            // Apple Silicon unified memory architecture
            gpuName = cpuModel.includes('Apple') ? `${cpuModel} GPU (Metal Unified Memory)` : 'Apple Silicon GPU (Metal)';
            // On Apple Silicon, unified memory is shared with VRAM (typically 70-75% can be allocated to Metal)
            vramGB = Math.round(totalRamGB * 0.75 * 10) / 10;
        }
        else if (platform === 'darwin') {
            try {
                const { stdout } = await execAsync('system_profiler SPDisplaysDataType 2>/dev/null', { timeout: 3000 });
                const chipMatch = stdout.match(/Chipset Model:\s*([^\n\r]+)/i);
                const vramMatch = stdout.match(/VRAM(?: \(Total\))?:\s*([0-9]+)\s*([A-Za-z]+)/i);
                if (chipMatch) {
                    gpuName = chipMatch[1].trim();
                }
                if (vramMatch) {
                    const val = parseInt(vramMatch[1], 10);
                    const unit = vramMatch[2].toLowerCase();
                    vramGB = unit.includes('gb') ? val : Math.round((val / 1024) * 10) / 10;
                }
            }
            catch {
                // Fallback
            }
        }
        else {
            // Check for NVIDIA CUDA via nvidia-smi
            try {
                const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null', { timeout: 3000 });
                if (stdout && stdout.trim().length > 0) {
                    const [name, mem] = stdout.trim().split(',').map((s) => s.trim());
                    gpuName = name || 'NVIDIA GPU (CUDA)';
                    hasCuda = true;
                    const parsedMem = parseInt(mem, 10);
                    if (!isNaN(parsedMem)) {
                        vramGB = Math.round((parsedMem / 1024) * 10) / 10;
                    }
                }
            }
            catch {
                // nvidia-smi not available or failed
                if (platform === 'win32') {
                    try {
                        const { stdout } = await execAsync('wmic path win32_VideoController get name,adapterram 2>nul', { timeout: 3000 });
                        const lines = stdout.trim().split('\n').filter((l) => l.trim() && !l.includes('Name'));
                        if (lines.length > 0) {
                            const parts = lines[0].trim().split(/\s{2,}/);
                            if (parts.length > 0) {
                                gpuName = parts[parts.length - 1];
                            }
                        }
                    }
                    catch {
                        // wmic failed
                    }
                }
            }
        }
        const telemetry = {
            osPlatform: platform,
            osRelease: release,
            cpuModel,
            cpuCores,
            totalRamGB,
            freeRamGB,
            gpuName,
            vramGB,
            isAppleSilicon,
            hasCuda,
        };
        logger_1.LuminaLogger.getInstance().log('System Telemetry Scanned', telemetry);
        this.cachedTelemetry = telemetry;
        return telemetry;
    }
}
exports.CalibrationTelemetry = CalibrationTelemetry;
//# sourceMappingURL=telemetry.js.map