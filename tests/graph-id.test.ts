import { describe, expect, it } from "vitest";
import { encodeGraphId } from "../src/utils/graph-id.js";

describe("encodeGraphId", () => {
  it("should encode + character", () => {
    expect(encodeGraphId("AAMk+test")).toBe("AAMk%2Btest");
  });

  it("should encode / character", () => {
    expect(encodeGraphId("folder/subfolder")).toBe("folder%2Fsubfolder");
  });

  it("should encode = character", () => {
    expect(encodeGraphId("base64id==")).toBe("base64id%3D%3D");
  });

  it("should pass through simple IDs unchanged", () => {
    expect(encodeGraphId("simple-id-123")).toBe("simple-id-123");
  });

  it("should handle empty string", () => {
    expect(encodeGraphId("")).toBe("");
  });

  it("should encode spaces", () => {
    expect(encodeGraphId("id with spaces")).toBe("id%20with%20spaces");
  });

  it("should preserve commas in SharePoint composite site IDs", () => {
    const siteId = "contoso.sharepoint.com,guid1-abc,guid2-def";
    expect(encodeGraphId(siteId)).toBe("contoso.sharepoint.com,guid1-abc,guid2-def");
  });

  it("should encode typical Graph API Base64 ID", () => {
    const base64Id = "AAMkAGI2TGuLAAA=";
    const encoded = encodeGraphId(base64Id);
    expect(encoded).toBe("AAMkAGI2TGuLAAA%3D");
    expect(encoded).not.toContain("=");
  });
});
