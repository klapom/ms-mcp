import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  GetContactParams,
  ListContactFoldersParams,
  ListContactsParams,
} from "../src/schemas/contacts.js";

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

describe("list_contacts", () => {
  describe("ListContactsParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListContactsParams.parse({});
      expect(result.user_id).toBeUndefined();
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
      expect(result.folder_id).toBeUndefined();
      expect(result.filter).toBeUndefined();
      expect(result.orderby).toBeUndefined();
    });

    it("should accept all optional params", () => {
      const result = ListContactsParams.parse({
        top: 10,
        skip: 5,
        folder_id: "folder-1",
        filter: "companyName eq 'Contoso'",
        orderby: "displayName asc",
        user_id: "user@example.com",
      });
      expect(result.top).toBe(10);
      expect(result.folder_id).toBe("folder-1");
    });

    it("should reject top > 100", () => {
      expect(() => ListContactsParams.parse({ top: 101 })).toThrow();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch contacts list", async () => {
      const response = (await client.api("/me/contacts").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0].displayName).toBe("Alice Mueller");
    });

    it("should fetch contacts from folder", async () => {
      const response = (await client.api("/me/contactFolders/folder-1/contacts").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
    });

    it("should support multi-tenant", async () => {
      const response = (await client.api("/users/user@example.com/contacts").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
    });
  });
});

describe("get_contact", () => {
  describe("GetContactParams schema", () => {
    it("should require contact_id", () => {
      expect(() => GetContactParams.parse({})).toThrow();
    });

    it("should accept valid contact_id", () => {
      const result = GetContactParams.parse({ contact_id: "c-123" });
      expect(result.contact_id).toBe("c-123");
    });

    it("should reject empty contact_id", () => {
      expect(() => GetContactParams.parse({ contact_id: "" })).toThrow();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch single contact detail", async () => {
      const contact = (await client.api("/me/contacts/contact-001").get()) as Record<
        string,
        unknown
      >;
      expect(contact.displayName).toBe("Alice Mueller");
      expect(contact.companyName).toBe("Contoso GmbH");
      expect(contact.jobTitle).toBe("Software Engineer");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 to NotFoundError", async () => {
      try {
        await errorClient.api("/me/contacts/nonexistent").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

describe("list_contact_folders", () => {
  describe("ListContactFoldersParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListContactFoldersParams.parse({});
      expect(result.top).toBeUndefined();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch contact folders", async () => {
      const response = (await client.api("/me/contactFolders").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].displayName).toBe("Business Contacts");
    });
  });
});
