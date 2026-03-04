/**
 * Memory Monitor — Periodic heap usage monitoring with threshold warnings
 *
 * Logs memory usage and emits warnings when heap usage exceeds thresholds:
 * - 80% heap usage: warning
 * - 90% heap usage: error/alert
 */

import type { Logger } from "pino";
import { createLogger } from "../utils/logger.js";

const defaultLogger = createLogger("memory-monitor");

export interface MemoryMonitorConfig {
  /** Warning threshold as fraction of heap (default: 0.80) */
  readonly warningThreshold: number;
  /** Alert/error threshold as fraction of heap (default: 0.90) */
  readonly alertThreshold: number;
}

const DEFAULT_CONFIG: MemoryMonitorConfig = {
  warningThreshold: 0.8,
  alertThreshold: 0.9,
};

export interface MemoryStatus {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapUsagePercent: number;
  level: "normal" | "warning" | "alert";
}

/**
 * Check current memory status and return structured info.
 */
export function checkMemoryStatus(config?: Partial<MemoryMonitorConfig>): MemoryStatus {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / 1024 / 1024;
  const heapTotalMB = mem.heapTotal / 1024 / 1024;
  const rssMB = mem.rss / 1024 / 1024;
  const heapUsagePercent = mem.heapUsed / mem.heapTotal;

  let level: MemoryStatus["level"] = "normal";
  if (heapUsagePercent >= cfg.alertThreshold) {
    level = "alert";
  } else if (heapUsagePercent >= cfg.warningThreshold) {
    level = "warning";
  }

  return {
    heapUsedMB: Number.parseFloat(heapUsedMB.toFixed(2)),
    heapTotalMB: Number.parseFloat(heapTotalMB.toFixed(2)),
    rssMB: Number.parseFloat(rssMB.toFixed(2)),
    heapUsagePercent: Number.parseFloat((heapUsagePercent * 100).toFixed(1)),
    level,
  };
}

/**
 * Log memory status with appropriate log level based on thresholds.
 */
export function logMemoryStatus(
  log: Logger = defaultLogger,
  config?: Partial<MemoryMonitorConfig>,
): MemoryStatus {
  const status = checkMemoryStatus(config);
  const logData = {
    memory: {
      heapUsedMB: status.heapUsedMB,
      heapTotalMB: status.heapTotalMB,
      rssMB: status.rssMB,
      heapUsagePercent: status.heapUsagePercent,
    },
  };

  if (status.level === "alert") {
    log.error(logData, "MEMORY ALERT: Heap usage exceeds 90%% - OOM risk");
  } else if (status.level === "warning") {
    log.warn(logData, "Memory warning: Heap usage exceeds 80%%");
  } else {
    log.info(logData, "Memory status: normal");
  }

  return status;
}
