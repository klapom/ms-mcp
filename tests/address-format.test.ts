import { describe, expect, it } from "vitest";
import {
  extractAddress,
  extractAddressList,
  extractAddressListFiltered,
} from "../src/utils/address-format.js";

describe("address-format utilities", () => {
  describe("extractAddress", () => {
    it("should return name + address when both present", () => {
      const result = extractAddress({
        emailAddress: { name: "Max Mustermann", address: "max@example.com" },
      });
      expect(result).toBe("Max Mustermann <max@example.com>");
    });

    it("should return address only when name is empty", () => {
      const result = extractAddress({
        emailAddress: { name: "", address: "max@example.com" },
      });
      expect(result).toBe("max@example.com");
    });

    it("should return address only when name is missing", () => {
      const result = extractAddress({
        emailAddress: { address: "max@example.com" },
      });
      expect(result).toBe("max@example.com");
    });

    it("should return (unknown) for null input", () => {
      expect(extractAddress(null)).toBe("(unknown)");
    });

    it("should return (unknown) for undefined input", () => {
      expect(extractAddress(undefined)).toBe("(unknown)");
    });

    it("should return (unknown) for missing emailAddress", () => {
      expect(extractAddress({})).toBe("(unknown)");
    });

    it("should return (unknown) for non-object emailAddress", () => {
      expect(extractAddress({ emailAddress: "string" })).toBe("(unknown)");
    });

    it("should return (unknown) when both name and address are missing", () => {
      expect(extractAddress({ emailAddress: {} })).toBe("(unknown)");
    });
  });

  describe("extractAddressList", () => {
    it("should join multiple addresses", () => {
      const result = extractAddressList([
        { emailAddress: { name: "A", address: "a@b.com" } },
        { emailAddress: { name: "B", address: "b@c.com" } },
      ]);
      expect(result).toBe("A <a@b.com>, B <b@c.com>");
    });

    it("should return empty string for non-array", () => {
      expect(extractAddressList(null)).toBe("");
      expect(extractAddressList(undefined)).toBe("");
    });

    it("should return empty string for empty array", () => {
      expect(extractAddressList([])).toBe("");
    });

    it("should include (unknown) entries", () => {
      const result = extractAddressList([null, { emailAddress: { address: "a@b.com" } }]);
      expect(result).toBe("(unknown), a@b.com");
    });
  });

  describe("extractAddressListFiltered", () => {
    it("should filter out (unknown) entries", () => {
      const result = extractAddressListFiltered([null, { emailAddress: { address: "a@b.com" } }]);
      expect(result).toBe("a@b.com");
    });

    it("should return empty string for all unknown", () => {
      const result = extractAddressListFiltered([null, {}]);
      expect(result).toBe("");
    });

    it("should return empty string for non-array", () => {
      expect(extractAddressListFiltered(undefined)).toBe("");
    });
  });
});
