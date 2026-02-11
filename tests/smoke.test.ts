import { describe, expect, it } from "vitest";
import { ConfigSchema, loadConfig } from "../src/config.js";
import { BaseParams, ListParams, WriteParams, resolveUserPath } from "../src/schemas/common.js";

describe("smoke tests", () => {
  describe("config", () => {
    it("should load config with defaults when env vars are empty", () => {
      expect(() => loadConfig()).toThrow(); // AZURE_TENANT_ID required
    });

    it("should validate config schema", () => {
      const result = ConfigSchema.safeParse({
        azure: { tenantId: "test-tenant", clientId: "test-client" },
        server: {},
        limits: {},
      });
      expect(result.success).toBe(true);
    });
  });

  describe("schemas/common", () => {
    it("should parse BaseParams with empty input", () => {
      const result = BaseParams.parse({});
      expect(result.user_id).toBeUndefined();
    });

    it("should parse BaseParams with user_id", () => {
      const result = BaseParams.parse({ user_id: "user@example.com" });
      expect(result.user_id).toBe("user@example.com");
    });

    it("should parse WriteParams with defaults", () => {
      const result = WriteParams.parse({});
      expect(result.confirm).toBe(false);
      expect(result.idempotency_key).toBeUndefined();
    });

    it("should parse ListParams with pagination", () => {
      const result = ListParams.parse({ top: 10, skip: 20 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(20);
    });

    it("should reject invalid ListParams", () => {
      const result = ListParams.safeParse({ top: -1 });
      expect(result.success).toBe(false);
    });

    it("should reject top > 100", () => {
      const result = ListParams.safeParse({ top: 101 });
      expect(result.success).toBe(false);
    });
  });

  describe("resolveUserPath", () => {
    it("should return /me without user_id", () => {
      expect(resolveUserPath()).toBe("/me");
    });

    it("should return /users/{id} with user_id", () => {
      expect(resolveUserPath("user@example.com")).toBe("/users/user@example.com");
    });
  });
});
