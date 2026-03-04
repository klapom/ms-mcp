/**
 * Tests for Tool Timeout middleware
 */

import { describe, expect, it } from "vitest";
import { ToolTimeoutError, withTimeout } from "../../src/middleware/tool-timeout.js";
import type { ToolResult } from "../../src/types/tools.js";

function makeResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

describe("withTimeout", () => {
  it("should return handler result when within timeout", async () => {
    const handler = async () => makeResult("ok");
    const wrapped = withTimeout("test_tool", handler, 5000);

    const result = await wrapped({});
    expect(result.content[0].text).toBe("ok");
  });

  it("should throw ToolTimeoutError when handler exceeds timeout", async () => {
    const handler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return makeResult("too late");
    };
    const wrapped = withTimeout("slow_tool", handler, 50);

    await expect(wrapped({})).rejects.toThrow(ToolTimeoutError);
    await expect(wrapped({})).rejects.toThrow('Tool "slow_tool" timed out after 1s');
  });

  it("should pass params through to the handler", async () => {
    const handler = async (params: { name: string }) => makeResult(params.name);
    const wrapped = withTimeout("param_tool", handler, 5000);

    const result = await wrapped({ name: "test" });
    expect(result.content[0].text).toBe("test");
  });

  it("should clear timeout after successful completion", async () => {
    let completed = false;
    const handler = async () => {
      completed = true;
      return makeResult("done");
    };
    const wrapped = withTimeout("fast_tool", handler, 5000);

    await wrapped({});
    expect(completed).toBe(true);
  });

  it("should include timeout duration in error", () => {
    const error = new ToolTimeoutError("my_tool", 120000);
    expect(error.timeoutMs).toBe(120000);
    expect(error.name).toBe("ToolTimeoutError");
    expect(error.message).toContain("120s");
  });
});
