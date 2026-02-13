import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  CreateContactParams,
  DeleteContactParams,
  UpdateContactParams,
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

describe("create_contact", () => {
  describe("CreateContactParams schema", () => {
    it("should parse with defaults (no required fields except confirm)", () => {
      const result = CreateContactParams.parse({});
      expect(result.confirm).toBe(false);
      expect(result.given_name).toBeUndefined();
    });

    it("should accept all optional fields", () => {
      const result = CreateContactParams.parse({
        given_name: "Alice",
        surname: "Mueller",
        display_name: "Alice Mueller",
        email_addresses: [{ address: "alice@example.com", name: "Alice" }],
        business_phones: ["+49 123 456"],
        mobile_phone: "+49 170 1234",
        company_name: "Contoso",
        job_title: "Engineer",
        department: "IT",
        office_location: "Building A",
        business_address: { street: "Main St", city: "Berlin", postalCode: "10115" },
        home_address: { city: "Munich" },
        birthday: "1990-06-15",
        personal_notes: "Met at conference",
        categories: ["VIP"],
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.given_name).toBe("Alice");
      expect(result.email_addresses).toHaveLength(1);
      expect(result.business_address?.street).toBe("Main St");
    });

    it("should reject email_addresses with empty address", () => {
      expect(() =>
        CreateContactParams.parse({
          email_addresses: [{ address: "" }],
        }),
      ).toThrow();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create a contact", async () => {
      const result = (await client.api("/me/contacts").post({
        givenName: "New",
        displayName: "New Contact",
      })) as Record<string, unknown>;
      expect(result.id).toBe("contact-new-001");
      expect(result.displayName).toBe("New Contact");
    });
  });
});

describe("update_contact", () => {
  describe("UpdateContactParams schema", () => {
    it("should require contact_id", () => {
      expect(() => UpdateContactParams.parse({})).toThrow();
    });

    it("should accept contact_id with update fields", () => {
      const result = UpdateContactParams.parse({
        contact_id: "c-001",
        company_name: "New Company",
        confirm: true,
      });
      expect(result.contact_id).toBe("c-001");
      expect(result.company_name).toBe("New Company");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should update a contact", async () => {
      const result = (await client.api("/me/contacts/contact-001").patch({
        companyName: "Updated Corp",
      })) as Record<string, unknown>;
      expect(result.id).toBe("contact-001");
      expect(result.companyName).toBe("Updated Corp");
    });

    it("should fetch contact for preview", async () => {
      const contact = (await client.api("/me/contacts/contact-001").get()) as Record<
        string,
        unknown
      >;
      expect(contact.displayName).toBe("Alice Mueller");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 on update", async () => {
      try {
        await errorClient.api("/me/contacts/nonexistent").patch({ companyName: "X" });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

describe("delete_contact", () => {
  describe("DeleteContactParams schema", () => {
    it("should require contact_id", () => {
      expect(() => DeleteContactParams.parse({})).toThrow();
    });

    it("should accept valid params", () => {
      const result = DeleteContactParams.parse({
        contact_id: "c-001",
        confirm: true,
      });
      expect(result.contact_id).toBe("c-001");
      expect(result.confirm).toBe(true);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should delete a contact (204)", async () => {
      await client.api("/me/contacts/contact-001").delete();
      // No error = success (204 No Content)
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 on delete", async () => {
      try {
        await errorClient.api("/me/contacts/nonexistent").delete();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
