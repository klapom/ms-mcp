import { describe, expect, it } from "vitest";
import { ListEmailsParams } from "../src/schemas/mail.js";

describe("mail schemas", () => {
  describe("ListEmailsParams", () => {
    it("should parse with defaults", () => {
      const result = ListEmailsParams.parse({});
      expect(result.folder).toBeUndefined();
      expect(result.filter).toBeUndefined();
      expect(result.search).toBeUndefined();
      expect(result.orderby).toBeUndefined();
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
      expect(result.user_id).toBeUndefined();
    });

    it("should parse with all parameters", () => {
      const result = ListEmailsParams.parse({
        folder: "inbox",
        filter: "isRead eq false",
        search: "subject:test",
        orderby: "receivedDateTime desc",
        top: 10,
        skip: 0,
        user_id: "user@example.com",
      });
      expect(result.folder).toBe("inbox");
      expect(result.filter).toBe("isRead eq false");
      expect(result.search).toBe("subject:test");
      expect(result.orderby).toBe("receivedDateTime desc");
      expect(result.top).toBe(10);
      expect(result.skip).toBe(0);
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject invalid top value", () => {
      const result = ListEmailsParams.safeParse({ top: 101 });
      expect(result.success).toBe(false);
    });

    it("should reject negative skip", () => {
      const result = ListEmailsParams.safeParse({ skip: -1 });
      expect(result.success).toBe(false);
    });

    it("should reject non-integer top", () => {
      const result = ListEmailsParams.safeParse({ top: 3.5 });
      expect(result.success).toBe(false);
    });

    it("should reject zero top", () => {
      const result = ListEmailsParams.safeParse({ top: 0 });
      expect(result.success).toBe(false);
    });

    it("should accept top at max boundary (100)", () => {
      const result = ListEmailsParams.safeParse({ top: 100 });
      expect(result.success).toBe(true);
    });

    it("should accept folder as sentitems", () => {
      const result = ListEmailsParams.parse({ folder: "sentitems" });
      expect(result.folder).toBe("sentitems");
    });

    it("should accept folder as drafts", () => {
      const result = ListEmailsParams.parse({ folder: "drafts" });
      expect(result.folder).toBe("drafts");
    });

    it("should inherit user_id from BaseParams", () => {
      const result = ListEmailsParams.parse({ user_id: "admin@contoso.com" });
      expect(result.user_id).toBe("admin@contoso.com");
    });
  });
});
