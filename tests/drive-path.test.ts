import { describe, expect, it } from "vitest";
import {
  assertSafeDrivePath,
  assertSafeFileName,
  normalizeDrivePath,
  normalizeUserId,
  resolveDrivePath,
} from "../src/utils/drive-path.js";
import { ValidationError } from "../src/utils/errors.js";

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

  describe("folds in the traversal/injection guard (shared choke point)", () => {
    it("throws on a '..' traversal segment", () => {
      expect(() => normalizeDrivePath("/a/../b")).toThrow(ValidationError);
    });

    it("throws on a percent-encoded traversal segment", () => {
      expect(() => normalizeDrivePath("/a/..%2Fb")).toThrow(ValidationError);
    });

    it("throws on a path-addressing ':'", () => {
      expect(() => normalizeDrivePath("/a:/b")).toThrow(ValidationError);
    });

    it("throws on a backslash", () => {
      expect(() => normalizeDrivePath("/a\\b")).toThrow(ValidationError);
    });

    it("still tolerates the bare root '/' (empty-segment hygiene NOT applied here)", () => {
      expect(normalizeDrivePath("/")).toBe("/");
    });

    it("still tolerates a trailing slash (callers trim it downstream)", () => {
      expect(normalizeDrivePath("/Brand/Logos/")).toBe("/Brand/Logos/");
    });

    it("still tolerates a literal '%' in a name", () => {
      expect(normalizeDrivePath("/Reports/Umsatz 100%.xlsx")).toBe("/Reports/Umsatz 100%.xlsx");
    });
  });
});

describe("assertSafeDrivePath", () => {
  it("passes a normal nested path unchanged", () => {
    expect(assertSafeDrivePath("/Invoices/2026/a.pdf")).toBe("/Invoices/2026/a.pdf");
  });

  it("throws on a '..' segment inside the path", () => {
    expect(() => assertSafeDrivePath("/a/../b.pdf")).toThrow(ValidationError);
  });

  it("throws on a bare '..'", () => {
    expect(() => assertSafeDrivePath("..")).toThrow(ValidationError);
  });

  it("throws on a percent-encoded traversal segment (decoded '..')", () => {
    // "..%2Fb" is inert as a literal string (no callers in this codebase
    // decode paths before calling assertSafeDrivePath), but once spliced
    // into the Graph request URL, "%2F" is percent-decoded on the wire to
    // "/", turning the segment into an actual "../b" traversal. We decode
    // and re-validate to catch this smuggling attempt.
    expect(() => assertSafeDrivePath("/a/..%2Fb")).toThrow(ValidationError);
  });

  it("throws on a fully percent-encoded traversal ('%2e%2e%2f' → '../')", () => {
    // Decodes cleanly to "/a/../b"; the decoded-form segment check catches it.
    expect(() => assertSafeDrivePath("/a/%2e%2e%2fb")).toThrow(ValidationError);
  });

  it("allows a literal '%' that is not a valid escape (real file name)", () => {
    // "Umsatz 100%.xlsx" is a legitimate OneDrive name. The lone '%' is not a
    // valid %XX escape, so it is treated as a literal character, not a decode
    // failure that rejects the whole path.
    expect(assertSafeDrivePath("/Reports/Umsatz 100%.xlsx")).toBe("/Reports/Umsatz 100%.xlsx");
  });

  it("allows a bare '%' in various positions", () => {
    expect(assertSafeDrivePath("/100%/report.pdf")).toBe("/100%/report.pdf");
    expect(assertSafeDrivePath("/a/%foo.pdf")).toBe("/a/%foo.pdf");
    expect(assertSafeDrivePath("/a/foo%.pdf")).toBe("/a/foo%.pdf");
    expect(assertSafeDrivePath("/a/50%25off.pdf")).toBe("/a/50%25off.pdf");
  });

  it("still catches a smuggle mixed with a literal '%' (partial-decode holds)", () => {
    // A lone trailing '%' would abort a naive decodeURIComponent of the whole
    // string; lenient per-escape decoding still decodes the "%2e%2e%2f" run and
    // catches the traversal, so the malformed '%' does not become a bypass.
    expect(() => assertSafeDrivePath("/a/%2e%2e%2fb/50%")).toThrow(ValidationError);
  });

  it("throws on a ':' used for Graph path-addressing (folder-style)", () => {
    expect(() => assertSafeDrivePath("/a:/permissions")).toThrow(ValidationError);
  });

  it("throws on a ':' used for Graph path-addressing (content-style)", () => {
    expect(() => assertSafeDrivePath("a.pdf:/content?x=1")).toThrow(ValidationError);
  });

  it("throws on a backslash", () => {
    expect(() => assertSafeDrivePath("/a\\b.pdf")).toThrow(ValidationError);
  });

  it("allows a trailing space in a segment (spaces are not rejected)", () => {
    expect(assertSafeDrivePath("/a .pdf")).toBe("/a .pdf");
  });

  it("throws on a NUL control character", () => {
    expect(() => assertSafeDrivePath("/a\x00b.pdf")).toThrow(ValidationError);
  });

  it("throws on a US (0x1F) control character", () => {
    expect(() => assertSafeDrivePath("/a\x1fb.pdf")).toThrow(ValidationError);
  });

  it("throws on double slashes (empty segment)", () => {
    expect(() => assertSafeDrivePath("//foo")).toThrow(ValidationError);
  });

  it("throws on a trailing slash (empty segment)", () => {
    expect(() => assertSafeDrivePath("/foo/")).toThrow(ValidationError);
  });

  it("throws on an empty string", () => {
    expect(() => assertSafeDrivePath("")).toThrow(ValidationError);
  });

  describe("property: any accepted path yields exactly two ':' when spliced into the Graph URL template", () => {
    const acceptedPaths = [
      "/Invoices/2026/a.pdf",
      "/a .pdf",
      "/P_AI_Consult/Brand/logo.png",
      "report.xlsx",
      "/deeply/nested/folder/structure/file-name_2026.pdf",
      "/日本語/ファイル.pdf",
      "/a b c/d e f.pdf",
    ];

    for (const path of acceptedPaths) {
      it(`holds for ${JSON.stringify(path)}`, () => {
        const safe = assertSafeDrivePath(path);
        const cleanPath = safe.startsWith("/") ? safe : `/${safe}`;
        const drivePath = "/me/drive";
        // Mirrors the exact template literal from src/tools/drive-upload.ts.
        const url = `${drivePath}/root:${cleanPath}:/content`;
        const colonCount = (url.match(/:/g) ?? []).length;
        expect(colonCount).toBe(2);
      });
    }
  });
});

describe("assertSafeFileName", () => {
  it("passes a normal file name unchanged", () => {
    expect(assertSafeFileName("invoice.pdf")).toBe("invoice.pdf");
  });

  it("throws on '..'", () => {
    expect(() => assertSafeFileName("../x")).toThrow(ValidationError);
  });

  it("allows '..' as a substring of a longer, otherwise-safe name", () => {
    // Not a traversal: assertSafeFileName already rejects '/' and '\', so an
    // accepted single-segment name can never be split into "..".
    expect(assertSafeFileName("Q1..Q2-report.pdf")).toBe("Q1..Q2-report.pdf");
    expect(assertSafeFileName("scan..final.jpg")).toBe("scan..final.jpg");
  });

  it("throws when the whole name is exactly '..'", () => {
    expect(() => assertSafeFileName("..")).toThrow(ValidationError);
  });

  it("throws when the whole name is exactly '.'", () => {
    expect(() => assertSafeFileName(".")).toThrow(ValidationError);
  });

  it("throws on 'a/../b' (caught by the '/' separator check)", () => {
    expect(() => assertSafeFileName("a/../b")).toThrow(ValidationError);
  });

  it("throws on a path separator", () => {
    expect(() => assertSafeFileName("a/b")).toThrow(ValidationError);
  });

  it("throws on a colon", () => {
    expect(() => assertSafeFileName("a:b")).toThrow(ValidationError);
  });

  it("throws on a 256-character name", () => {
    expect(() => assertSafeFileName("a".repeat(256))).toThrow(ValidationError);
  });

  it("passes a 255-character name (boundary)", () => {
    const name = "a".repeat(255);
    expect(assertSafeFileName(name)).toBe(name);
  });

  it("throws on an empty string", () => {
    expect(() => assertSafeFileName("")).toThrow(ValidationError);
  });
});
