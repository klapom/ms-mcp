import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUserPath } from "../src/schemas/common.js";
import { SearchEmailsParams } from "../src/schemas/mail.js";
import {
  DEFAULT_SELECT,
  buildSelectParam,
  shapeListResponse,
} from "../src/utils/response-shaper.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("search_emails", () => {
  describe("SearchEmailsParams schema", () => {
    it("should parse with required query", () => {
      const result = SearchEmailsParams.parse({ query: "subject:Test" });
      expect(result.query).toBe("subject:Test");
      expect(result.folder).toBeUndefined();
      expect(result.filter).toBeUndefined();
      expect(result.orderby).toBeUndefined();
    });

    it("should parse with all parameters", () => {
      const result = SearchEmailsParams.parse({
        query: "from:mueller",
        folder: "sentitems",
        filter: "receivedDateTime ge 2025-01-01T00:00:00Z",
        orderby: "receivedDateTime desc",
        top: 50,
        skip: 0,
        user_id: "admin@contoso.com",
      });
      expect(result.query).toBe("from:mueller");
      expect(result.folder).toBe("sentitems");
      expect(result.filter).toContain("receivedDateTime");
      expect(result.orderby).toBe("receivedDateTime desc");
    });

    it("should reject empty query", () => {
      expect(SearchEmailsParams.safeParse({ query: "" }).success).toBe(false);
    });

    it("should reject missing query", () => {
      expect(SearchEmailsParams.safeParse({}).success).toBe(false);
    });

    it("should reject query exceeding 500 chars", () => {
      expect(SearchEmailsParams.safeParse({ query: "a".repeat(501) }).success).toBe(false);
    });

    it("should accept query at max length (500)", () => {
      expect(SearchEmailsParams.safeParse({ query: "a".repeat(500) }).success).toBe(true);
    });

    it("should accept query with special characters", () => {
      const result = SearchEmailsParams.parse({
        query: "subject:Üntersützung für Ärzte",
      });
      expect(result.query).toBe("subject:Üntersützung für Ärzte");
    });

    it("should inherit top/skip validation from ListParams", () => {
      expect(SearchEmailsParams.safeParse({ query: "test", top: 0 }).success).toBe(false);
      expect(SearchEmailsParams.safeParse({ query: "test", top: 101 }).success).toBe(false);
      expect(SearchEmailsParams.safeParse({ query: "test", skip: -1 }).success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search emails with KQL query", async () => {
      // Override handler for search
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/messages`, ({ request }) => {
          const url = new URL(request.url);
          const search = url.searchParams.get("$search");

          if (search) {
            return HttpResponse.json({
              "@odata.context": "...",
              value: [
                {
                  id: "search-001",
                  subject: "Test Subject Match",
                  from: {
                    emailAddress: {
                      name: "Searcher",
                      address: "search@example.com",
                    },
                  },
                  receivedDateTime: "2026-02-11T10:00:00Z",
                  bodyPreview: "Search result preview",
                  isRead: false,
                  importance: "normal",
                },
                {
                  id: "search-002",
                  subject: "Another Test Match",
                  from: {
                    emailAddress: {
                      name: "Finder",
                      address: "finder@example.com",
                    },
                  },
                  receivedDateTime: "2026-02-11T09:00:00Z",
                  bodyPreview: "Another preview",
                  isRead: true,
                  importance: "high",
                },
              ],
            });
          }

          return HttpResponse.json({ value: [] });
        }),
      );

      const response: unknown = await client
        .api("/me/messages")
        .search('"subject:Test"')
        .select(buildSelectParam(DEFAULT_SELECT.mail))
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      expect((data.value as unknown[]).length).toBe(2);
    });

    it("should search within a specific folder", async () => {
      // The handler for /me/mailFolders/:folderId/messages handles search
      const response: unknown = await client
        .api("/me/mailFolders/sentitems/messages")
        .search('"from:me"')
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      const items = data.value as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty("id", "search-sent-001");
    });

    it("should return empty results for no-match search", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/messages`, ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("$search")) {
            return HttpResponse.json({
              "@odata.context": "...",
              value: [],
            });
          }
          return HttpResponse.json({ value: [] });
        }),
      );

      const response: unknown = await client
        .api("/me/messages")
        .search('"nonexistent_xyz_12345"')
        .get();

      const data = response as Record<string, unknown>;
      expect((data.value as unknown[]).length).toBe(0);
    });

    it("should handle multi-tenant search", async () => {
      const userPath = resolveUserPath("admin@contoso.com");
      const response: unknown = await client
        .api(`${userPath}/messages`)
        .search('"subject:important"')
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      expect((data.value as unknown[]).length).toBeGreaterThan(0);
    });

    it("should shape search results", () => {
      const items = [
        {
          id: "s-001",
          subject: "Result 1",
          from: { emailAddress: { name: "User", address: "user@ex.com" } },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "Preview text that could be long",
          isRead: false,
          importance: "normal",
        },
      ];

      const { items: shaped, paginationHint } = shapeListResponse(
        items,
        1,
        {
          maxItems: 25,
          maxBodyLength: 10,
        },
        ["bodyPreview"],
      );

      expect(shaped).toHaveLength(1);
      expect(String(shaped[0].bodyPreview).length).toBeLessThanOrEqual(10);
    });
  });
});
