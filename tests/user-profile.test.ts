import { beforeEach, describe, expect, it } from "vitest";
import { GetManagerParams, GetMyProfileParams, GetUserParams } from "../src/schemas/user.js";

describe("user-profile schemas", () => {
  describe("GetMyProfileParams", () => {
    it("should parse with no params", () => {
      const result = GetMyProfileParams.parse({});
      expect(result).toEqual({});
    });

    it("should parse optional user_id for multi-tenant support", () => {
      const result = GetMyProfileParams.parse({ user_id: "users/user-123" });
      expect(result.user_id).toBe("users/user-123");
    });
  });

  describe("GetUserParams", () => {
    it("should parse user_id", () => {
      const result = GetUserParams.parse({ user_id: "user-123" });
      expect(result.user_id).toBe("user-123");
    });

    it("should parse UPN (email)", () => {
      const result = GetUserParams.parse({ user_id: "test@example.com" });
      expect(result.user_id).toBe("test@example.com");
    });

    it("should require user_id", () => {
      expect(() => GetUserParams.parse({})).toThrow();
    });

    it("should reject empty user_id", () => {
      expect(() => GetUserParams.parse({ user_id: "" })).toThrow();
    });
  });

  describe("GetManagerParams", () => {
    it("should parse with no params", () => {
      const result = GetManagerParams.parse({});
      expect(result.user_id).toBeUndefined();
    });

    it("should parse user_id", () => {
      const result = GetManagerParams.parse({ user_id: "user-123" });
      expect(result.user_id).toBe("user-123");
    });

    it("should allow undefined user_id", () => {
      const result = GetManagerParams.parse({});
      expect(result.user_id).toBeUndefined();
    });
  });
});
