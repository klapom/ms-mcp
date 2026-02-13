import { describe, expect, it } from "vitest";
import { SearchUsersParams } from "../src/schemas/user.js";

describe("user-search schemas", () => {
  describe("SearchUsersParams", () => {
    it("should parse query", () => {
      const result = SearchUsersParams.parse({ query: "test" });
      expect(result.query).toBe("test");
    });

    it("should parse with pagination", () => {
      const result = SearchUsersParams.parse({
        query: "test",
        top: 10,
        skip: 5,
      });
      expect(result.query).toBe("test");
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should require query", () => {
      expect(() => SearchUsersParams.parse({})).toThrow();
    });

    it("should reject empty query", () => {
      expect(() => SearchUsersParams.parse({ query: "" })).toThrow();
    });

    it("should enforce query max length (200)", () => {
      expect(() => SearchUsersParams.parse({ query: "a".repeat(201) })).toThrow();
    });

    it("should allow query at max length", () => {
      const result = SearchUsersParams.parse({ query: "a".repeat(200) });
      expect(result.query).toHaveLength(200);
    });
  });
});
