import { describe, expect, it } from "vitest";
import { normalizeDrivePath, normalizeUserId, resolveDrivePath } from "../src/utils/drive-path.js";

describe("resolveDrivePath", () => {
  it("defaults to /me/drive", () => {
    expect(resolveDrivePath()).toBe("/me/drive");
  });

  it("uses /users/<id>/drive for multi-tenant", () => {
    expect(resolveDrivePath("user@tenant.com")).toBe("/users/user%40tenant.com/drive");
  });

  it("uses /sites/<site>/drives/<drive> for SharePoint", () => {
    expect(resolveDrivePath(undefined, "site-abc", "drive-xyz")).toBe(
      "/sites/site-abc/drives/drive-xyz",
    );
  });
});

describe("normalizeUserId", () => {
  it("returns undefined for empty/missing values", () => {
    expect(normalizeUserId(undefined)).toBeUndefined();
    expect(normalizeUserId("")).toBeUndefined();
    expect(normalizeUserId("   ")).toBeUndefined();
  });

  it("strips literal /me and me as no-user", () => {
    expect(normalizeUserId("/me")).toBeUndefined();
    expect(normalizeUserId("me")).toBeUndefined();
    expect(normalizeUserId("/ME")).toBeUndefined();
    expect(normalizeUserId("//me")).toBeUndefined();
  });

  it("passes real UPNs and IDs through", () => {
    expect(normalizeUserId("alice@contoso.com")).toBe("alice@contoso.com");
    expect(normalizeUserId("abc-123-guid")).toBe("abc-123-guid");
  });
});

describe("resolveDrivePath with bogus user_id", () => {
  it("falls back to /me when user_id is '/me'", () => {
    expect(resolveDrivePath("/me")).toBe("/me/drive");
  });

  it("falls back to /me when user_id is empty string", () => {
    expect(resolveDrivePath("")).toBe("/me/drive");
  });

  it("still routes to /users/<id>/drive for real UPNs", () => {
    expect(resolveDrivePath("alice@contoso.com")).toBe("/users/alice%40contoso.com/drive");
  });
});

describe("normalizeDrivePath", () => {
  it("strips /Documents/ prefix on personal drive", () => {
    expect(normalizeDrivePath("/Documents/P_AI_Consult/file.md")).toBe("/P_AI_Consult/file.md");
  });

  it("strips bare /Documents (no trailing content) to root", () => {
    expect(normalizeDrivePath("/Documents")).toBe("/");
    expect(normalizeDrivePath("/Documents/")).toBe("/");
  });

  it("is case-insensitive", () => {
    expect(normalizeDrivePath("/documents/Reports")).toBe("/Reports");
    expect(normalizeDrivePath("/DOCUMENTS/Reports")).toBe("/Reports");
  });

  it("tolerates multiple leading slashes", () => {
    expect(normalizeDrivePath("//Documents/Reports")).toBe("/Reports");
  });

  it("leaves non-/Documents paths unchanged", () => {
    expect(normalizeDrivePath("/P_AI_Consult/Brand")).toBe("/P_AI_Consult/Brand");
    expect(normalizeDrivePath("/DocumentsDraft")).toBe("/DocumentsDraft");
  });

  it("leaves /Documents untouched when siteId is set (SharePoint)", () => {
    expect(normalizeDrivePath("/Documents/Reports", "site-abc")).toBe("/Documents/Reports");
  });
});
