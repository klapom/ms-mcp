import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUserPath } from "../src/schemas/common.js";
import { ListEmailsParams } from "../src/schemas/mail.js";
import { fetchPage } from "../src/utils/pagination.js";
import {
  DEFAULT_SELECT,
  buildSelectParam,
  shapeListResponse,
} from "../src/utils/response-shaper.js";
import { server as mswServer } from "./mocks/server.js";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: create a plain Graph client (no auth middleware) for MSW tests
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Graph client that skips auth middleware.
 * Uses only HTTPMessageHandler so requests go directly to MSW.
 */
function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

// ---------------------------------------------------------------------------
// Graph API integration tests (MSW-backed)
// ---------------------------------------------------------------------------

describe("list_emails Graph API integration", () => {
  let client: Client;

  beforeEach(() => {
    client = createTestGraphClient();
  });

  describe("success responses", () => {
    it("should fetch emails from inbox folder", async () => {
      const userPath = resolveUserPath(undefined);
      const folder = "inbox";
      const url = `${userPath}/mailFolders/${folder}/messages`;

      const page = await fetchPage<Record<string, unknown>>(client, url, {
        select: buildSelectParam(DEFAULT_SELECT.mail),
        orderby: "receivedDateTime desc",
      });

      expect(page.items).toHaveLength(2);
      expect(page.items[0]).toHaveProperty("id", "msg-001");
      expect(page.items[0]).toHaveProperty("subject", "Test Email 1");
      expect(page.items[1]).toHaveProperty("id", "msg-002");
      expect(page.items[1]).toHaveProperty("subject", "Test Email 2");
    });

    it("should return correct totalCount from @odata.count", async () => {
      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/inbox/messages",
        { select: buildSelectParam(DEFAULT_SELECT.mail) },
      );

      expect(page.totalCount).toBe(2);
    });

    it("should shape the response with truncation and pagination hint", async () => {
      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/inbox/messages",
      );

      const { items, paginationHint } = shapeListResponse(
        page.items,
        page.totalCount,
        { maxItems: 25, maxBodyLength: 10 },
        ["bodyPreview"],
      );

      expect(items).toHaveLength(2);
      // bodyPreview should be truncated to 10 chars
      for (const item of items) {
        expect(String(item.bodyPreview).length).toBeLessThanOrEqual(10);
      }
      expect(paginationHint).toContain("2 von 2");
    });

    it("should resolve user_id path for delegated access", () => {
      expect(resolveUserPath(undefined)).toBe("/me");
      expect(resolveUserPath("admin@contoso.com")).toBe("/users/admin@contoso.com");
    });
  });

  describe("error responses", () => {
    it("should receive 404 for non-existent folder", async () => {
      await expect(
        fetchPage<Record<string, unknown>>(client, "/me/mailFolders/nonexistent/messages"),
      ).rejects.toThrow();
    });

    it("should receive 429 for rate-limited folder", async () => {
      await expect(
        fetchPage<Record<string, unknown>>(client, "/me/mailFolders/rate-limited/messages"),
      ).rejects.toThrow();
    });

    it("should receive 401 when trigger_401 filter is used", async () => {
      await expect(
        fetchPage<Record<string, unknown>>(client, "/me/mailFolders/inbox/messages", {
          filter: "trigger_401",
        }),
      ).rejects.toThrow();
    });
  });

  describe("pagination", () => {
    it("should detect nextLink in paginated response", async () => {
      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/paginated/messages",
      );

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toHaveProperty("id", "page1-msg-001");
      expect(page.totalCount).toBe(50);
      expect(page.hasMore).toBe(true);
      expect(page.nextLink).toContain("$skip=25");
    });

    it("should produce correct pagination hint for paginated data", async () => {
      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/paginated/messages",
      );

      const { items, paginationHint } = shapeListResponse(
        page.items,
        page.totalCount,
        { maxItems: 25 },
        ["bodyPreview"],
      );

      expect(items).toHaveLength(1);
      expect(paginationHint).toContain("1 von 50");
      expect(paginationHint).toContain("skip");
    });
  });

  describe("MSW handler overrides", () => {
    it("should allow runtime handler override for custom responses", async () => {
      mswServer.use(
        http.get("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages", () => {
          return HttpResponse.json({
            "@odata.context": "...",
            "@odata.count": 1,
            value: [
              {
                id: "override-001",
                subject: "Overridden Email",
                from: {
                  emailAddress: { name: "Override", address: "override@example.com" },
                },
                receivedDateTime: "2026-02-11T12:00:00Z",
                bodyPreview: "Overridden preview",
                isRead: true,
                importance: "low",
              },
            ],
          });
        }),
      );

      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/inbox/messages",
      );

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toHaveProperty("id", "override-001");
      expect(page.items[0]).toHaveProperty("subject", "Overridden Email");
    });

    it("should allow runtime handler override for empty mailbox", async () => {
      mswServer.use(
        http.get("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages", () => {
          return HttpResponse.json({
            "@odata.context": "...",
            "@odata.count": 0,
            value: [],
          });
        }),
      );

      const page = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/inbox/messages",
      );

      expect(page.items).toHaveLength(0);
      expect(page.totalCount).toBe(0);
      expect(page.hasMore).toBe(false);
    });
  });
});
