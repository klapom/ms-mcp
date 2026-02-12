import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTildePath } from "../src/utils/path.js";

describe("resolveTildePath", () => {
  it("should expand ~/... to homedir", () => {
    const result = resolveTildePath("~/.ms-mcp/token-cache.json");
    expect(result).toBe(resolve(homedir(), ".ms-mcp/token-cache.json"));
  });

  it("should expand bare ~ to homedir", () => {
    const result = resolveTildePath("~");
    expect(result).toBe(resolve(homedir(), ""));
  });

  it("should pass absolute paths through unchanged", () => {
    const result = resolveTildePath("/tmp/cache.json");
    expect(result).toBe("/tmp/cache.json");
  });

  it("should resolve relative paths against cwd", () => {
    const result = resolveTildePath("cache/tokens.json");
    expect(result).toBe(resolve(process.cwd(), "cache/tokens.json"));
  });

  it("should not expand ~ in the middle of a path", () => {
    const result = resolveTildePath("/some/~user/file");
    expect(result).toBe("/some/~user/file");
  });
});
