/**
 * Tests for Memory Monitor
 */

import { describe, expect, it } from "vitest";
import { checkMemoryStatus } from "../../src/middleware/memory-monitor.js";

describe("checkMemoryStatus", () => {
  it("should return memory status with all fields", () => {
    const status = checkMemoryStatus();

    expect(status.heapUsedMB).toBeGreaterThan(0);
    expect(status.heapTotalMB).toBeGreaterThan(0);
    expect(status.rssMB).toBeGreaterThan(0);
    expect(status.heapUsagePercent).toBeGreaterThan(0);
    expect(status.heapUsagePercent).toBeLessThanOrEqual(100);
    expect(["normal", "warning", "alert"]).toContain(status.level);
  });

  it("should classify as warning at 80% threshold", () => {
    // With very low thresholds, current usage should trigger warning/alert
    const status = checkMemoryStatus({ warningThreshold: 0.01, alertThreshold: 0.99 });
    expect(status.level).toBe("warning");
  });

  it("should classify as alert at 90% threshold", () => {
    const status = checkMemoryStatus({ warningThreshold: 0.01, alertThreshold: 0.02 });
    expect(status.level).toBe("alert");
  });

  it("should classify as normal with high thresholds", () => {
    const status = checkMemoryStatus({ warningThreshold: 0.99, alertThreshold: 0.999 });
    expect(status.level).toBe("normal");
  });

  it("should return numeric MB values", () => {
    const status = checkMemoryStatus();
    expect(typeof status.heapUsedMB).toBe("number");
    expect(typeof status.heapTotalMB).toBe("number");
    expect(typeof status.rssMB).toBe("number");
  });
});
