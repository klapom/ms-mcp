import { describe, expect, it } from "vitest";
import { ListDirectReportsParams, ListUserGroupsParams } from "../src/schemas/user.js";

describe("user-org schemas", () => {
  describe("ListDirectReportsParams", () => {
    it("should parse with no params", () => {
      const result = ListDirectReportsParams.parse({});
      expect(result.user_id).toBeUndefined();
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should parse with user_id", () => {
      const result = ListDirectReportsParams.parse({ user_id: "user-123" });
      expect(result.user_id).toBe("user-123");
    });

    it("should parse with pagination", () => {
      const result = ListDirectReportsParams.parse({
        top: 10,
        skip: 5,
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should enforce max top (999)", () => {
      expect(() => ListDirectReportsParams.parse({ top: 1000 })).toThrow();
    });

    it("should reject negative skip", () => {
      expect(() => ListDirectReportsParams.parse({ skip: -1 })).toThrow();
    });
  });

  describe("ListUserGroupsParams", () => {
    it("should parse with no params", () => {
      const result = ListUserGroupsParams.parse({});
      expect(result.user_id).toBeUndefined();
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should parse with user_id", () => {
      const result = ListUserGroupsParams.parse({ user_id: "user-123" });
      expect(result.user_id).toBe("user-123");
    });

    it("should parse with pagination", () => {
      const result = ListUserGroupsParams.parse({
        top: 10,
        skip: 5,
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should enforce max top (999)", () => {
      expect(() => ListUserGroupsParams.parse({ top: 1000 })).toThrow();
    });

    it("should reject negative skip", () => {
      expect(() => ListUserGroupsParams.parse({ skip: -1 })).toThrow();
    });
  });
});
