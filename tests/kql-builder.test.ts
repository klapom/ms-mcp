import { describe, expect, it } from "vitest";
import { buildKqlQuery, parseKqlDate, sanitizeKqlQuery } from "../src/utils/kql-builder.js";

describe("kql-builder", () => {
  describe("buildKqlQuery", () => {
    it("should build simple property:value filter", () => {
      const result = buildKqlQuery([
        { property: "from", operator: ":", value: "john@example.com" },
      ]);
      expect(result).toBe("from:john@example.com");
    });

    it("should quote values containing spaces", () => {
      const result = buildKqlQuery([
        { property: "subject", operator: ":", value: "quarterly report" },
      ]);
      expect(result).toBe('subject:"quarterly report"');
    });

    it("should join multiple filters with spaces", () => {
      const result = buildKqlQuery([
        { property: "from", operator: ":", value: "john@example.com" },
        { property: "subject", operator: ":", value: "budget" },
        { property: "hasAttachment", operator: ":", value: "true" },
      ]);
      expect(result).toBe("from:john@example.com subject:budget hasAttachment:true");
    });

    it("should support comparison operators", () => {
      const result = buildKqlQuery([
        { property: "received", operator: ">=", value: "2026-01-01" },
        { property: "received", operator: "<=", value: "2026-03-01" },
      ]);
      expect(result).toBe("received>=2026-01-01 received<=2026-03-01");
    });

    it("should return empty string for empty filters", () => {
      expect(buildKqlQuery([])).toBe("");
    });
  });

  describe("parseKqlDate", () => {
    it("should extract date from ISO 8601 string", () => {
      expect(parseKqlDate("2026-02-15T10:00:00Z")).toBe("2026-02-15");
    });

    it("should handle date-only input", () => {
      expect(parseKqlDate("2026-02-15")).toBe("2026-02-15");
    });
  });

  describe("sanitizeKqlQuery", () => {
    it("should trim whitespace", () => {
      expect(sanitizeKqlQuery("  from:john  ")).toBe("from:john");
    });

    it("should pass through valid queries unchanged", () => {
      expect(sanitizeKqlQuery("subject:test")).toBe("subject:test");
    });
  });
});
