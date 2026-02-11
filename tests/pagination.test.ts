import { describe, expect, it, vi } from "vitest";

// Suppress pino log output during tests
vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

const { fetchPage, paginate } = await import("../src/utils/pagination.js");

interface MockGraphClient {
  api: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Graph client that returns the given responses in order.
 * Each call to `.get()` returns the next response.
 */
function createMockClient(responses: unknown[]): MockGraphClient {
  let callIndex = 0;
  const mockRequest = {
    top: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    orderby: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(() => {
      const response = responses[callIndex];
      callIndex++;
      return Promise.resolve(response);
    }),
  };

  return {
    api: vi.fn().mockReturnValue(mockRequest),
  };
}

// Helper to extract the chained request object from a mock client
function getRequest(client: MockGraphClient) {
  return client.api.mock.results[0]?.value;
}

describe("pagination", () => {
  describe("fetchPage", () => {
    it("should return items from Graph API response", async () => {
      const mockItems = [
        { id: "1", subject: "Email 1" },
        { id: "2", subject: "Email 2" },
      ];
      const client = createMockClient([{ value: mockItems }]);

      const result = await fetchPage(client as never, "/me/messages");

      expect(result.items).toEqual(mockItems);
      expect(result.hasMore).toBe(false);
      expect(client.api).toHaveBeenCalledWith("/me/messages");
    });

    it("should handle @odata.count and @odata.nextLink", async () => {
      const mockItems = [{ id: "1" }];
      const client = createMockClient([
        {
          value: mockItems,
          "@odata.count": 42,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=10",
        },
      ]);

      const result = await fetchPage(client as never, "/me/messages");

      expect(result.items).toEqual(mockItems);
      expect(result.totalCount).toBe(42);
      expect(result.nextLink).toBe("https://graph.microsoft.com/v1.0/me/messages?$skip=10");
      expect(result.hasMore).toBe(true);
    });

    it("should pass OData params (top, skip, select, filter, orderby)", async () => {
      const client = createMockClient([{ value: [] }]);

      await fetchPage(client as never, "/me/messages", {
        top: 10,
        skip: 20,
        select: "id,subject",
        filter: "isRead eq false",
        orderby: "receivedDateTime desc",
      });

      const request = getRequest(client);
      expect(request.top).toHaveBeenCalledWith(10);
      expect(request.skip).toHaveBeenCalledWith(20);
      expect(request.select).toHaveBeenCalledWith("id,subject");
      expect(request.filter).toHaveBeenCalledWith("isRead eq false");
      expect(request.orderby).toHaveBeenCalledWith("receivedDateTime desc");
    });

    it("should not call param methods when params are not provided", async () => {
      const client = createMockClient([{ value: [] }]);

      await fetchPage(client as never, "/me/messages");

      const request = getRequest(client);
      expect(request.top).not.toHaveBeenCalled();
      expect(request.skip).not.toHaveBeenCalled();
      expect(request.select).not.toHaveBeenCalled();
      expect(request.filter).not.toHaveBeenCalled();
      expect(request.orderby).not.toHaveBeenCalled();
    });

    it("should return empty items for non-list response", async () => {
      const client = createMockClient([{ id: "single-item", name: "not a list" }]);

      const result = await fetchPage(client as never, "/me/messages/123");

      expect(result.items).toEqual([]);
      expect(result.totalCount).toBeUndefined();
      expect(result.nextLink).toBeUndefined();
      expect(result.hasMore).toBe(false);
    });

    it("should set hasMore based on nextLink presence", async () => {
      const withNextLink = createMockClient([
        {
          value: [{ id: "1" }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=1",
        },
      ]);

      const withoutNextLink = createMockClient([{ value: [{ id: "1" }] }]);

      const resultWith = await fetchPage(withNextLink as never, "/me/messages");
      const resultWithout = await fetchPage(withoutNextLink as never, "/me/messages");

      expect(resultWith.hasMore).toBe(true);
      expect(resultWithout.hasMore).toBe(false);
    });

    it("should handle response with @odata.count but no nextLink", async () => {
      const client = createMockClient([
        {
          value: [{ id: "1" }, { id: "2" }],
          "@odata.count": 2,
        },
      ]);

      const result = await fetchPage(client as never, "/me/messages");

      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextLink).toBeUndefined();
    });
  });

  describe("paginate", () => {
    it("should yield items from single page", async () => {
      const mockItems = [
        { id: "1", subject: "Email 1" },
        { id: "2", subject: "Email 2" },
      ];
      const client = createMockClient([{ value: mockItems }]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual(mockItems);
    });

    it("should follow @odata.nextLink across multiple pages", async () => {
      const page1Items = [{ id: "1" }, { id: "2" }];
      const page2Items = [{ id: "3" }, { id: "4" }];
      const page3Items = [{ id: "5" }];

      const client = createMockClient([
        {
          value: page1Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=2",
        },
        {
          value: page2Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=4",
        },
        {
          value: page3Items,
        },
      ]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toEqual(page1Items);
      expect(batches[1]).toEqual(page2Items);
      expect(batches[2]).toEqual(page3Items);

      // Verify it followed the nextLink URLs
      expect(client.api).toHaveBeenCalledTimes(3);
      expect(client.api).toHaveBeenNthCalledWith(1, "/me/messages");
      expect(client.api).toHaveBeenNthCalledWith(
        2,
        "https://graph.microsoft.com/v1.0/me/messages?$skip=2",
      );
      expect(client.api).toHaveBeenNthCalledWith(
        3,
        "https://graph.microsoft.com/v1.0/me/messages?$skip=4",
      );
    });

    it("should respect maxItems limit", async () => {
      const page1Items = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const client = createMockClient([
        {
          value: page1Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=3",
        },
      ]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages", 2)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
      expect(batches[0]).toEqual([{ id: "1" }, { id: "2" }]);
    });

    it("should stop across pages when maxItems is reached", async () => {
      const page1Items = [{ id: "1" }, { id: "2" }];
      const page2Items = [{ id: "3" }, { id: "4" }, { id: "5" }];

      const client = createMockClient([
        {
          value: page1Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=2",
        },
        {
          value: page2Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=5",
        },
      ]);

      const allItems: unknown[] = [];
      for await (const batch of paginate(client as never, "/me/messages", 3)) {
        allItems.push(...batch);
      }

      expect(allItems).toHaveLength(3);
      expect(allItems).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
      // Should not fetch a third page
      expect(client.api).toHaveBeenCalledTimes(2);
    });

    it("should stop when no more pages", async () => {
      const client = createMockClient([{ value: [{ id: "1" }] }]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(1);
      expect(client.api).toHaveBeenCalledTimes(1);
    });

    it("should handle empty response", async () => {
      const client = createMockClient([{ value: [] }]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual([]);
    });

    it("should stop on non-list response", async () => {
      const client = createMockClient([{ error: { code: "InvalidRequest" } }]);

      const batches: unknown[][] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(0);
    });

    it("should yield all items when maxItems is not specified", async () => {
      const page1Items = [{ id: "1" }, { id: "2" }];
      const page2Items = [{ id: "3" }];

      const client = createMockClient([
        {
          value: page1Items,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=2",
        },
        { value: page2Items },
      ]);

      const allItems: unknown[] = [];
      for await (const batch of paginate(client as never, "/me/messages")) {
        allItems.push(...batch);
      }

      expect(allItems).toHaveLength(3);
    });
  });
});
