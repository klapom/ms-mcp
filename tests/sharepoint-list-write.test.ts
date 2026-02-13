import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  CreateListItemParams,
  DeleteListItemParams,
  UpdateListItemParams,
} from "../src/schemas/sharepoint.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

function createTestGraphClientWithErrorMapping(): Client {
  const errorMapping = new ErrorMappingMiddleware();
  const httpHandler = new HTTPMessageHandler();
  errorMapping.setNext(httpHandler);
  return Client.initWithMiddleware({
    middleware: errorMapping,
    defaultVersion: "v1.0",
  });
}

describe("create_list_item", () => {
  describe("CreateListItemParams schema", () => {
    it("should parse with required fields", () => {
      const result = CreateListItemParams.parse({
        site_id: "s1",
        list_id: "l1",
        fields: { Title: "Test" },
      });
      expect(result.site_id).toBe("s1");
      expect(result.fields).toEqual({ Title: "Test" });
      expect(result.confirm).toBe(false);
    });

    it("should reject missing fields", () => {
      const result = CreateListItemParams.safeParse({ site_id: "s1", list_id: "l1" });
      expect(result.success).toBe(false);
    });

    it("should reject missing site_id", () => {
      const result = CreateListItemParams.safeParse({
        list_id: "l1",
        fields: { Title: "Test" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should create a list item", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites/site-001/lists/list-001/items")
        .post({ fields: { Title: "New Task" } })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "new-item-001");
    });

    it("should return 404 for nonexistent list", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/sites/site-001/lists/nonexistent/items").post({ fields: { Title: "Test" } }),
      ).rejects.toThrow();
    });
  });
});

describe("update_list_item", () => {
  describe("UpdateListItemParams schema", () => {
    it("should parse with required fields", () => {
      const result = UpdateListItemParams.parse({
        site_id: "s1",
        list_id: "l1",
        item_id: "i1",
        fields: { Status: "Done" },
      });
      expect(result.item_id).toBe("i1");
      expect(result.confirm).toBe(false);
    });

    it("should reject missing item_id", () => {
      const result = UpdateListItemParams.safeParse({
        site_id: "s1",
        list_id: "l1",
        fields: { Status: "Done" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should update list item fields", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites/site-001/lists/list-001/items/item-001/fields")
        .patch({ Status: "Done" })) as Record<string, unknown>;
      expect(response).toHaveProperty("Status", "Done");
    });

    it("should return 404 for nonexistent item", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client
          .api("/sites/site-001/lists/list-001/items/nonexistent/fields")
          .patch({ Status: "Done" }),
      ).rejects.toThrow();
    });
  });
});

describe("delete_list_item", () => {
  describe("DeleteListItemParams schema", () => {
    it("should parse with required fields", () => {
      const result = DeleteListItemParams.parse({
        site_id: "s1",
        list_id: "l1",
        item_id: "i1",
      });
      expect(result.item_id).toBe("i1");
      expect(result.confirm).toBe(false);
    });

    it("should reject empty item_id", () => {
      const result = DeleteListItemParams.safeParse({
        site_id: "s1",
        list_id: "l1",
        item_id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should delete a list item", async () => {
      const client = createTestGraphClient();
      // Graph DELETE returns null/undefined for 204
      await client.api("/sites/site-001/lists/list-001/items/item-001").delete();
    });

    it("should return 404 for nonexistent item", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/sites/site-001/lists/list-001/items/nonexistent").delete(),
      ).rejects.toThrow();
    });
  });
});
