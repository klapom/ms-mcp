import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUserPath } from "../src/schemas/common.js";
import { SearchNotesParams } from "../src/schemas/onenote.js";
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

describe("search_notes", () => {
  describe("SearchNotesParams schema", () => {
    it("should parse with required query", () => {
      const result = SearchNotesParams.parse({ query: "project" });
      expect(result.query).toBe("project");
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should parse with all parameters", () => {
      const result = SearchNotesParams.parse({
        query: "meeting notes",
        top: 25,
        skip: 5,
        user_id: "user@example.com",
      });
      expect(result.query).toBe("meeting notes");
      expect(result.top).toBe(25);
      expect(result.skip).toBe(5);
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty query", () => {
      expect(SearchNotesParams.safeParse({ query: "" }).success).toBe(false);
    });

    it("should reject missing query", () => {
      expect(SearchNotesParams.safeParse({}).success).toBe(false);
    });

    it("should reject query exceeding 200 chars", () => {
      expect(SearchNotesParams.safeParse({ query: "a".repeat(201) }).success).toBe(false);
    });

    it("should accept query at max length (200)", () => {
      expect(SearchNotesParams.safeParse({ query: "a".repeat(200) }).success).toBe(true);
    });

    it("should accept query with special characters", () => {
      const result = SearchNotesParams.parse({
        query: "Über ärzt Dienst",
      });
      expect(result.query).toBe("Über ärzt Dienst");
    });

    it("should inherit top/skip validation from ListParams", () => {
      expect(SearchNotesParams.safeParse({ query: "test", top: 0 }).success).toBe(false);
      expect(SearchNotesParams.safeParse({ query: "test", top: 101 }).success).toBe(false);
      expect(SearchNotesParams.safeParse({ query: "test", skip: -1 }).success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search notes with full-text query", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/onenote/pages`, ({ request }) => {
          const url = new URL(request.url);
          const search = url.searchParams.get("$search");

          if (search) {
            return HttpResponse.json({
              "@odata.context": "...",
              value: [
                {
                  id: "page-001",
                  title: "Project Kickoff Notes",
                  createdDateTime: "2026-02-10T10:00:00Z",
                  lastModifiedDateTime: "2026-02-11T14:30:00Z",
                  contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-001/content",
                },
                {
                  id: "page-002",
                  title: "Project Status Update",
                  createdDateTime: "2026-02-09T09:00:00Z",
                  lastModifiedDateTime: "2026-02-11T15:00:00Z",
                  contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-002/content",
                },
              ],
            });
          }

          return HttpResponse.json({ value: [] });
        }),
      );

      const response: unknown = await client
        .api("/me/onenote/pages")
        .query({ $search: "project" })
        .select(buildSelectParam(DEFAULT_SELECT.page))
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      expect((data.value as unknown[]).length).toBe(2);
      const items = data.value as Record<string, unknown>[];
      expect(items[0]).toHaveProperty("id", "page-001");
      expect(items[1]).toHaveProperty("id", "page-002");
    });

    it("should return empty results for no-match search", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/onenote/pages`, ({ request }) => {
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
        .api("/me/onenote/pages")
        .query({ $search: "nonexistent_xyz_12345" })
        .get();

      const data = response as Record<string, unknown>;
      expect((data.value as unknown[]).length).toBe(0);
    });

    it("should handle pagination with top parameter", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/onenote/pages`, ({ request }) => {
          const url = new URL(request.url);
          const top = url.searchParams.get("$top");
          const skip = url.searchParams.get("$skip");

          if (url.searchParams.get("$search")) {
            const startIndex = skip ? Number.parseInt(skip) : 0;
            const pageSize = top ? Number.parseInt(top) : 10;

            const allPages = [
              {
                id: "page-001",
                title: "Note 1",
                createdDateTime: "2026-02-10T10:00:00Z",
                lastModifiedDateTime: "2026-02-11T14:30:00Z",
                contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-001/content",
              },
              {
                id: "page-002",
                title: "Note 2",
                createdDateTime: "2026-02-09T09:00:00Z",
                lastModifiedDateTime: "2026-02-11T15:00:00Z",
                contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-002/content",
              },
              {
                id: "page-003",
                title: "Note 3",
                createdDateTime: "2026-02-08T08:00:00Z",
                lastModifiedDateTime: "2026-02-10T12:00:00Z",
                contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-003/content",
              },
            ];

            const paginatedPages = allPages.slice(startIndex, startIndex + pageSize);
            const hasMore = startIndex + pageSize < allPages.length;

            return HttpResponse.json({
              "@odata.context": "...",
              "@odata.count": allPages.length,
              ...(hasMore && {
                "@odata.nextLink": `${GRAPH_BASE}/me/onenote/pages?$search=test&$top=${pageSize}&$skip=${startIndex + pageSize}`,
              }),
              value: paginatedPages,
            });
          }

          return HttpResponse.json({ value: [] });
        }),
      );

      const response: unknown = await client
        .api("/me/onenote/pages")
        .query({ $search: "test" })
        .top(2)
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      expect((data.value as unknown[]).length).toBe(2);
    });

    it("should handle multi-tenant search", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/users/admin@contoso.com/onenote/pages`, () => {
          return HttpResponse.json({
            "@odata.context": "...",
            value: [
              {
                id: "page-admin-001",
                title: "Important Note",
                createdDateTime: "2026-02-10T10:00:00Z",
                lastModifiedDateTime: "2026-02-11T14:30:00Z",
                contentUrl:
                  "https://graph.microsoft.com/v1.0/users/admin@contoso.com/onenote/pages/page-admin-001/content",
              },
            ],
          });
        }),
      );

      const userPath = resolveUserPath("admin@contoso.com");
      const response: unknown = await client
        .api(`${userPath}/onenote/pages`)
        .query({ $search: "important" })
        .get();

      const data = response as Record<string, unknown>;
      expect(Array.isArray(data.value)).toBe(true);
      expect((data.value as unknown[]).length).toBe(1);
    });

    it("should shape search results", () => {
      const items = [
        {
          id: "page-001",
          title: "First Note",
          createdDateTime: "2026-02-10T10:00:00Z",
          lastModifiedDateTime: "2026-02-11T14:30:00Z",
          contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-001/content",
        },
        {
          id: "page-002",
          title: "Second Note",
          createdDateTime: "2026-02-09T09:00:00Z",
          lastModifiedDateTime: "2026-02-11T15:00:00Z",
          contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-002/content",
        },
      ];

      const { items: shaped, paginationHint } = shapeListResponse(items, items.length, {
        maxItems: 50,
        maxBodyLength: 500,
      });

      expect(shaped).toHaveLength(2);
      expect(paginationHint).toContain("Showing 2 of 2 results");
      expect(shaped[0]).toHaveProperty("id", "page-001");
      expect(shaped[1]).toHaveProperty("id", "page-002");
    });

    it("should respect skip parameter", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/onenote/pages`, ({ request }) => {
          const url = new URL(request.url);
          const skip = url.searchParams.get("$skip");

          if (skip === "1") {
            return HttpResponse.json({
              "@odata.context": "...",
              value: [
                {
                  id: "page-002",
                  title: "Note 2",
                  createdDateTime: "2026-02-09T09:00:00Z",
                  lastModifiedDateTime: "2026-02-11T15:00:00Z",
                  contentUrl: "https://graph.microsoft.com/v1.0/me/onenote/pages/page-002/content",
                },
              ],
            });
          }

          return HttpResponse.json({ value: [] });
        }),
      );

      const response: unknown = await client.api("/me/onenote/pages").skip(1).get();

      const data = response as Record<string, unknown>;
      const items = data.value as Record<string, unknown>[];
      expect(items[0]).toHaveProperty("id", "page-002");
    });
  });

  describe("DEFAULT_SELECT integration", () => {
    it("should include page in DEFAULT_SELECT", () => {
      expect(DEFAULT_SELECT.page).toBeDefined();
      expect(DEFAULT_SELECT.page).toEqual([
        "id",
        "title",
        "createdDateTime",
        "lastModifiedDateTime",
        "contentUrl",
      ]);
    });

    it("should build valid select parameter from page fields", () => {
      const selectParam = buildSelectParam(DEFAULT_SELECT.page);
      expect(selectParam).toBe("id,title,createdDateTime,lastModifiedDateTime,contentUrl");
    });
  });
});
