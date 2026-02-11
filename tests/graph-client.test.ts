import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all middleware and logger to avoid real dependencies
vi.mock("../src/middleware/logging.js", () => ({
  LoggingMiddleware: vi.fn().mockImplementation(() => ({
    setNext: vi.fn(),
    execute: vi.fn(),
  })),
}));

vi.mock("../src/middleware/retry.js", () => ({
  RetryMiddleware: vi.fn().mockImplementation(() => ({
    setNext: vi.fn(),
    execute: vi.fn(),
  })),
}));

vi.mock("../src/middleware/error-mapping.js", () => ({
  ErrorMappingMiddleware: vi.fn().mockImplementation(() => ({
    setNext: vi.fn(),
    execute: vi.fn(),
  })),
}));

vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

const { createGraphClient, getGraphClient, generateRequestId } = await import(
  "../src/auth/graph-client.js"
);
const { Client } = await import("@microsoft/microsoft-graph-client");

interface MockMsalClient {
  tenantId: string;
  clientId: string;
  getAccessToken: ReturnType<typeof vi.fn>;
}

function createMockMsalClient(tenantId = "tenant1", clientId = "client1"): MockMsalClient {
  return {
    tenantId,
    clientId,
    getAccessToken: vi.fn().mockResolvedValue("mock-token-123"),
  };
}

describe("graph-client", () => {
  beforeEach(() => {
    // Clear the internal clientCache between tests by creating fresh clients
    // with unique identities
    vi.clearAllMocks();
  });

  describe("createGraphClient", () => {
    it("should return a Client instance", () => {
      const msalClient = createMockMsalClient("create-tenant", "create-client");
      const client = createGraphClient(msalClient as never);

      expect(client).toBeInstanceOf(Client);
    });
  });

  describe("getGraphClient", () => {
    it("should return the same client for the same tenantId:clientId", () => {
      const msalClient = createMockMsalClient("same-tenant", "same-client");

      const client1 = getGraphClient(msalClient as never);
      const client2 = getGraphClient(msalClient as never);

      expect(client1).toBe(client2);
    });

    it("should return different clients for different identities", () => {
      const msalClient1 = createMockMsalClient("tenant-a", "client-a");
      const msalClient2 = createMockMsalClient("tenant-b", "client-b");

      const client1 = getGraphClient(msalClient1 as never);
      const client2 = getGraphClient(msalClient2 as never);

      expect(client1).not.toBe(client2);
    });

    it("should return different clients for same tenant but different client", () => {
      const msalClient1 = createMockMsalClient("shared-tenant", "client-x");
      const msalClient2 = createMockMsalClient("shared-tenant", "client-y");

      const client1 = getGraphClient(msalClient1 as never);
      const client2 = getGraphClient(msalClient2 as never);

      expect(client1).not.toBe(client2);
    });

    it("should return a Client instance", () => {
      const msalClient = createMockMsalClient("instance-tenant", "instance-client");
      const client = getGraphClient(msalClient as never);

      expect(client).toBeInstanceOf(Client);
    });
  });

  describe("generateRequestId", () => {
    it("should return a valid UUID string", () => {
      const id = generateRequestId();

      // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it("should return unique values on each call", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });

    it("should return a string", () => {
      const id = generateRequestId();
      expect(typeof id).toBe("string");
    });
  });
});
