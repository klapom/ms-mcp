import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUserPath } from "../src/schemas/common.js";
import { ListMailFoldersParams } from "../src/schemas/mail.js";
import { fetchPage } from "../src/utils/pagination.js";
import {
  DEFAULT_SELECT,
  buildSelectParam,
  shapeListResponse,
} from "../src/utils/response-shaper.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("list_mail_folders", () => {
  describe("ListMailFoldersParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListMailFoldersParams.parse({});
      expect(result.include_children).toBe(false);
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
      expect(result.user_id).toBeUndefined();
    });

    it("should parse with all parameters", () => {
      const result = ListMailFoldersParams.parse({
        include_children: true,
        top: 50,
        skip: 10,
        user_id: "admin@contoso.com",
      });
      expect(result.include_children).toBe(true);
      expect(result.top).toBe(50);
      expect(result.skip).toBe(10);
      expect(result.user_id).toBe("admin@contoso.com");
    });

    it("should inherit top/skip validation from ListParams", () => {
      expect(ListMailFoldersParams.safeParse({ top: 0 }).success).toBe(false);
      expect(ListMailFoldersParams.safeParse({ top: 101 }).success).toBe(false);
      expect(ListMailFoldersParams.safeParse({ skip: -1 }).success).toBe(false);
    });

    it("should accept top at max boundary (100)", () => {
      expect(ListMailFoldersParams.safeParse({ top: 100 }).success).toBe(true);
    });

    it("should accept skip at boundary (0)", () => {
      expect(ListMailFoldersParams.safeParse({ skip: 0 }).success).toBe(true);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch all mail folders", async () => {
      const page = await fetchPage<Record<string, unknown>>(client, "/me/mailFolders", {
        select: buildSelectParam(DEFAULT_SELECT.mailFolder),
      });

      expect(page.items.length).toBe(6);
      expect(page.items[0]).toHaveProperty("displayName", "Inbox");
      expect(page.items[0]).toHaveProperty("totalItemCount", 142);
      expect(page.items[0]).toHaveProperty("unreadItemCount", 5);
      expect(page.items[0]).toHaveProperty("childFolderCount", 2);
    });

    it("should support pagination with top parameter", async () => {
      const page = await fetchPage<Record<string, unknown>>(client, "/me/mailFolders", {
        top: 2,
        select: buildSelectParam(DEFAULT_SELECT.mailFolder),
      });

      expect(page.items.length).toBe(2);
      expect(page.totalCount).toBe(6);
      expect(page.hasMore).toBe(true);
    });

    it("should fetch child folders", async () => {
      const childPage = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/AAMkInbox/childFolders",
        { select: buildSelectParam(DEFAULT_SELECT.mailFolder) },
      );

      expect(childPage.items.length).toBe(2);
      expect(childPage.items[0]).toHaveProperty("displayName", "Important");
      expect(childPage.items[1]).toHaveProperty("displayName", "Newsletters");
    });

    it("should return empty child folders for folder without children", async () => {
      const childPage = await fetchPage<Record<string, unknown>>(
        client,
        "/me/mailFolders/AAMkDrafts/childFolders",
        { select: buildSelectParam(DEFAULT_SELECT.mailFolder) },
      );

      expect(childPage.items.length).toBe(0);
    });

    it("should resolve multi-tenant path", async () => {
      const userPath = resolveUserPath("admin@contoso.com");
      const page = await fetchPage<Record<string, unknown>>(client, `${userPath}/mailFolders`, {
        select: buildSelectParam(DEFAULT_SELECT.mailFolder),
      });

      expect(page.items.length).toBe(2);
      expect(page.items[0]).toHaveProperty("displayName", "Inbox");
    });

    it("should handle child folder fetch errors gracefully", async () => {
      const { http, HttpResponse } = await import("msw");
      const { server: mswServer } = await import("./mocks/server.js");

      // Override to return 403 for child folders
      mswServer.use(
        http.get("https://graph.microsoft.com/v1.0/me/mailFolders/:folderId/childFolders", () => {
          return HttpResponse.json(
            {
              error: {
                code: "ErrorAccessDenied",
                message: "Access denied",
              },
            },
            { status: 403 },
          );
        }),
      );

      // The parent folder fetch should still work
      const page = await fetchPage<Record<string, unknown>>(client, "/me/mailFolders", {
        select: buildSelectParam(DEFAULT_SELECT.mailFolder),
      });

      expect(page.items.length).toBe(6);
      // Parent folders should be returned even if child fetch fails
      expect(page.items[0]).toHaveProperty("displayName", "Inbox");
    });

    it("should handle partial child folder failures (1 OK, 1 403)", async () => {
      const { http, HttpResponse } = await import("msw");
      const { server: mswServer } = await import("./mocks/server.js");

      // Override: Archive child folders return 403, Inbox child folders still work
      mswServer.use(
        http.get(
          "https://graph.microsoft.com/v1.0/me/mailFolders/:folderId/childFolders",
          ({ params }) => {
            const { folderId } = params;
            if (folderId === "AAMkArchive") {
              return HttpResponse.json(
                {
                  error: {
                    code: "ErrorAccessDenied",
                    message: "Access denied to archive child folders",
                  },
                },
                { status: 403 },
              );
            }
            if (folderId === "AAMkInbox") {
              return HttpResponse.json({
                "@odata.context": "...",
                "@odata.count": 2,
                value: [
                  {
                    id: "AAMkInboxChild1",
                    displayName: "Important",
                    parentFolderId: "AAMkInbox",
                    childFolderCount: 0,
                    totalItemCount: 10,
                    unreadItemCount: 2,
                  },
                  {
                    id: "AAMkInboxChild2",
                    displayName: "Newsletters",
                    parentFolderId: "AAMkInbox",
                    childFolderCount: 0,
                    totalItemCount: 45,
                    unreadItemCount: 15,
                  },
                ],
              });
            }
            return HttpResponse.json({ "@odata.context": "...", "@odata.count": 0, value: [] });
          },
        ),
      );

      // Fetch folders and manually expand (simulating expandChildFolders behavior)
      const page = await fetchPage<Record<string, unknown>>(client, "/me/mailFolders", {
        select: buildSelectParam(DEFAULT_SELECT.mailFolder),
      });

      // Inbox has 2 children, Archive has 1 — Archive will fail
      const foldersWithChildren = page.items.filter(
        (f) =>
          typeof f.childFolderCount === "number" &&
          f.childFolderCount > 0 &&
          typeof f.id === "string",
      );
      expect(foldersWithChildren).toHaveLength(2); // Inbox + Archive

      // Fetch children in parallel — Archive should fail
      const results = await Promise.allSettled(
        foldersWithChildren.map((folder) =>
          fetchPage<Record<string, unknown>>(
            client,
            `/me/mailFolders/${folder.id as string}/childFolders`,
            { select: buildSelectParam(DEFAULT_SELECT.mailFolder) },
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1); // Inbox children OK
      expect(rejected).toHaveLength(1); // Archive children failed
    });

    it("should shape folder response with pagination hint", () => {
      const folders = [
        {
          id: "1",
          displayName: "Inbox",
          totalItemCount: 100,
          unreadItemCount: 5,
          childFolderCount: 0,
        },
        {
          id: "2",
          displayName: "Sent",
          totalItemCount: 50,
          unreadItemCount: 0,
          childFolderCount: 0,
        },
      ];

      const { items, paginationHint } = shapeListResponse(folders, 6, {
        maxItems: 2,
        maxBodyLength: 500,
      });

      expect(items).toHaveLength(2);
      expect(paginationHint).toContain("2 von 6");
    });
  });

  describe("DEFAULT_SELECT.mailFolder", () => {
    it("should contain required folder fields", () => {
      expect(DEFAULT_SELECT.mailFolder).toBeDefined();
      expect(DEFAULT_SELECT.mailFolder).toContain("id");
      expect(DEFAULT_SELECT.mailFolder).toContain("displayName");
      expect(DEFAULT_SELECT.mailFolder).toContain("parentFolderId");
      expect(DEFAULT_SELECT.mailFolder).toContain("childFolderCount");
      expect(DEFAULT_SELECT.mailFolder).toContain("totalItemCount");
      expect(DEFAULT_SELECT.mailFolder).toContain("unreadItemCount");
    });
  });
});
