import { describe, expect, it } from "vitest";
import { GetUserPhotoParams } from "../src/schemas/user.js";

describe("user-photo schemas", () => {
  describe("GetUserPhotoParams", () => {
    it("should parse user_id", () => {
      const result = GetUserPhotoParams.parse({ user_id: "user-123" });
      expect(result.user_id).toBe("user-123");
    });

    it("should parse with size", () => {
      const result = GetUserPhotoParams.parse({
        user_id: "user-123",
        size: "240x240",
      });
      expect(result.user_id).toBe("user-123");
      expect(result.size).toBe("240x240");
    });

    it("should allow all valid sizes", () => {
      const sizes = [
        "48x48",
        "64x64",
        "96x96",
        "120x120",
        "240x240",
        "360x360",
        "432x432",
        "504x504",
        "648x648",
      ];

      for (const size of sizes) {
        const result = GetUserPhotoParams.parse({ user_id: "user-123", size });
        expect(result.size).toBe(size);
      }
    });

    it("should require user_id", () => {
      expect(() => GetUserPhotoParams.parse({})).toThrow();
    });

    it("should reject empty user_id", () => {
      expect(() => GetUserPhotoParams.parse({ user_id: "" })).toThrow();
    });

    it("should reject invalid size", () => {
      expect(() => GetUserPhotoParams.parse({ user_id: "user-123", size: "invalid" })).toThrow();
    });

    it("should allow undefined size", () => {
      const result = GetUserPhotoParams.parse({ user_id: "user-123" });
      expect(result.size).toBeUndefined();
    });
  });
});
