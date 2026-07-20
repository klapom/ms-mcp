import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { DownloadAttachmentParams, ListAttachmentsParams } from "../src/schemas/mail.js";
import { fetchAttachmentContent, handleDownloadAttachment } from "../src/tools/mail-attachments.js";
import { formatFileSize, isTextContent } from "../src/utils/file-size.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// formatFileSize tests
// ---------------------------------------------------------------------------

describe("formatFileSize", () => {
  it("should format bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("should format kilobytes", () => {
    expect(formatFileSize(46080)).toBe("45.0 KB");
  });

  it("should format megabytes", () => {
    expect(formatFileSize(6291456)).toBe("6.0 MB");
  });

  it("should format gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("should format zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

// ---------------------------------------------------------------------------
// isTextContent tests
// ---------------------------------------------------------------------------

describe("isTextContent", () => {
  it("should detect text/plain", () => {
    expect(isTextContent("text/plain", "file.txt")).toBe(true);
  });

  it("should detect text/csv", () => {
    expect(isTextContent("text/csv", "data.csv")).toBe(true);
  });

  it("should detect application/json", () => {
    expect(isTextContent("application/json", "config.json")).toBe(true);
  });

  it("should detect application/xml", () => {
    expect(isTextContent("application/xml", "data.xml")).toBe(true);
  });

  it("should detect octet-stream with text extension", () => {
    expect(isTextContent("application/octet-stream", "readme.md")).toBe(true);
  });

  it("should reject octet-stream with binary extension", () => {
    expect(isTextContent("application/octet-stream", "photo.jpg")).toBe(false);
  });

  it("should reject octet-stream with no extension", () => {
    expect(isTextContent("application/octet-stream", "noext")).toBe(false);
  });

  it("should reject binary content types", () => {
    expect(isTextContent("application/pdf", "doc.pdf")).toBe(false);
  });

  it("should detect application/javascript", () => {
    expect(isTextContent("application/javascript", "app.js")).toBe(true);
  });

  it("should detect application/csv", () => {
    expect(isTextContent("application/csv", "data.csv")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// list_attachments
// ---------------------------------------------------------------------------

describe("list_attachments", () => {
  describe("ListAttachmentsParams schema", () => {
    it("should parse with required fields", () => {
      const result = ListAttachmentsParams.parse({ message_id: "msg-001" });
      expect(result.message_id).toBe("msg-001");
    });

    it("should reject empty message_id", () => {
      expect(ListAttachmentsParams.safeParse({ message_id: "" }).success).toBe(false);
    });

    it("should accept optional user_id", () => {
      const result = ListAttachmentsParams.parse({
        message_id: "msg-001",
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list multiple attachments", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments")
        .select("id,name,contentType,size,isInline,lastModifiedDateTime")
        .get()) as Record<string, unknown>;

      const attachments = response.value as Array<Record<string, unknown>>;
      expect(attachments).toHaveLength(4);
      expect(attachments[0]).toHaveProperty("name", "Dokument.pdf");
      expect(attachments[1]).toHaveProperty("name", "Huge.zip");
      expect(attachments[2]).toHaveProperty("name", "Logo.png");
      expect(attachments[2]).toHaveProperty("isInline", true);
      expect(attachments[3]).toHaveProperty("@odata.type", "#microsoft.graph.itemAttachment");
    });

    it("should return empty list for no-attachments message", async () => {
      const response = (await client
        .api("/me/messages/no-attachments-msg/attachments")
        .get()) as Record<string, unknown>;

      const attachments = response.value as Array<Record<string, unknown>>;
      expect(attachments).toHaveLength(0);
    });

    it("should list attachments via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client
        .api(`${userPath}/messages/msg-001/attachments`)
        .get()) as Record<string, unknown>;

      const attachments = response.value as Array<Record<string, unknown>>;
      expect(attachments).toHaveLength(1);
      expect(attachments[0]).toHaveProperty("name", "MT-Doc.pdf");
    });

    it("should identify large attachment (>4MB)", async () => {
      const response = (await client.api("/me/messages/msg-001/attachments").get()) as Record<
        string,
        unknown
      >;

      const attachments = response.value as Array<Record<string, unknown>>;
      const largeAtt = attachments.find((a) => a.name === "Huge.zip") as Record<string, unknown>;
      expect(largeAtt.size).toBeGreaterThan(4 * 1024 * 1024);
    });

    it("should distinguish file, item, and reference attachment types", async () => {
      const response = (await client.api("/me/messages/msg-001/attachments").get()) as Record<
        string,
        unknown
      >;

      const attachments = response.value as Array<Record<string, unknown>>;
      const types = attachments.map((a) => a["@odata.type"]);
      expect(types).toContain("#microsoft.graph.fileAttachment");
      expect(types).toContain("#microsoft.graph.itemAttachment");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent message", async () => {
      try {
        await errorClient.api("/me/messages/nonexistent/attachments").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// download_attachment
// ---------------------------------------------------------------------------

describe("download_attachment", () => {
  describe("DownloadAttachmentParams schema", () => {
    it("should parse with required fields", () => {
      const result = DownloadAttachmentParams.parse({
        message_id: "msg-001",
        attachment_id: "aid-pdf",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.attachment_id).toBe("aid-pdf");
    });

    it("should reject empty message_id", () => {
      expect(
        DownloadAttachmentParams.safeParse({ message_id: "", attachment_id: "aid-pdf" }).success,
      ).toBe(false);
    });

    it("should reject empty attachment_id", () => {
      expect(
        DownloadAttachmentParams.safeParse({ message_id: "msg-001", attachment_id: "" }).success,
      ).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should download a PDF file attachment", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-pdf")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("@odata.type", "#microsoft.graph.fileAttachment");
      expect(response).toHaveProperty("contentBytes");
      expect(response).toHaveProperty("name", "Dokument.pdf");
    });

    it("should download a text file with UTF-8 content", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-txt")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("contentType", "text/plain");
      const decoded = Buffer.from(String(response.contentBytes), "base64").toString("utf-8");
      expect(decoded).toBe("Hello World");
    });

    it("should download a CSV file", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-csv")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("contentType", "text/csv");
      const decoded = Buffer.from(String(response.contentBytes), "base64").toString("utf-8");
      expect(decoded).toContain("name,age");
    });

    it("should download a JSON file", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-json")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("contentType", "application/json");
      const decoded = Buffer.from(String(response.contentBytes), "base64").toString("utf-8");
      expect(decoded).toBe('{"key":"value"}');
    });

    it("should detect >4MB attachment for warning (5MB)", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-large")
        .get()) as Record<string, unknown>;

      const size = response.size as number;
      expect(size).toBe(5242880);
      expect(size).toBeGreaterThan(4 * 1024 * 1024);
    });

    it("should detect >10MB attachment for abort (11MB)", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-huge")
        .get()) as Record<string, unknown>;

      const size = response.size as number;
      expect(size).toBe(11534336);
      expect(size).toBeGreaterThan(10 * 1024 * 1024);
    });

    it("should identify itemAttachment type", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-item")
        .get()) as Record<string, unknown>;

      expect(response["@odata.type"]).toContain("itemAttachment");
    });

    it("should identify referenceAttachment type", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-ref")
        .get()) as Record<string, unknown>;

      expect(response["@odata.type"]).toContain("referenceAttachment");
    });

    it("should handle zero-byte attachment", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-zero")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("size", 0);
      expect(response).toHaveProperty("contentBytes", "");
    });

    it("should include inline attachment metadata", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-inline")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("isInline", true);
      expect(response).toHaveProperty("contentId", "<logo@embedded>");
    });

    it("should handle boundary: exactly 4MB (no warning)", async () => {
      const response = (await client
        .api("/me/messages/msg-001/attachments/aid-exact4mb")
        .get()) as Record<string, unknown>;

      const size = response.size as number;
      expect(size).toBe(4194304);
      // Exactly 4MB should NOT trigger warning (>4MB, not >=4MB)
      expect(size).toBeLessThanOrEqual(4 * 1024 * 1024);
    });

    it("should download via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client
        .api(`${userPath}/messages/msg-001/attachments/aid-pdf`)
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("contentBytes");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent attachment", async () => {
      try {
        await errorClient.api("/me/messages/msg-001/attachments/nonexistent").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// fetchAttachmentContent — unit tests for the extracted fetcher
// ---------------------------------------------------------------------------

/**
 * Minimal fake Graph client whose metadata GET resolves to `meta`. The metadata
 * step in fetchAttachmentContent only uses `.api(path).select(...).get()`.
 */
function fakeGraphClient(meta: Record<string, unknown>): Client {
  return {
    api: () => ({
      select: () => ({
        get: async () => meta,
      }),
    }),
  } as unknown as Client;
}

const VALUE_URL_SUFFIX = "/$value";

describe("fetchAttachmentContent", () => {
  const token = "test-token";
  const getAccessToken = async () => token;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  function mockValueFetch(response: Response): ReturnType<typeof vi.spyOn> {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response) as ReturnType<
      typeof vi.spyOn
    >;
    return fetchSpy;
  }

  function valueCalls(): unknown[][] {
    if (!fetchSpy) return [];
    return fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith(VALUE_URL_SUFFIX));
  }

  it("returns unsupported-type error for an itemAttachment and never fetches content", async () => {
    mockValueFetch(new Response(Buffer.from("nope"), { status: 200 }));
    const client = fakeGraphClient({
      "@odata.type": "#microsoft.graph.itemAttachment",
      name: "Forwarded.eml",
      contentType: "message/rfc822",
      size: 1024,
    });

    const result = await fetchAttachmentContent(
      client,
      { message_id: "msg-001", attachment_id: "aid-item" },
      getAccessToken,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("Item Attachment");
    }
    expect(valueCalls()).toHaveLength(0);
  });

  it("aborts on >10MB metadata and never attempts the /$value fetch", async () => {
    mockValueFetch(new Response(Buffer.from("should-not-be-read"), { status: 200 }));
    const client = fakeGraphClient({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Enormous.bin",
      contentType: "application/octet-stream",
      size: 11 * 1024 * 1024, // 11 MB
    });

    const result = await fetchAttachmentContent(
      client,
      { message_id: "msg-001", attachment_id: "aid-huge" },
      getAccessToken,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("too large");
    }
    expect(valueCalls()).toHaveLength(0);
  });

  it("fetches the /$value endpoint and returns the exact raw bytes", async () => {
    const rawBytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x7f, 0x80]);
    const spy = mockValueFetch(new Response(rawBytes, { status: 200 }));
    const client = fakeGraphClient({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "binary.dat",
      contentType: "application/octet-stream",
      size: rawBytes.length,
    });

    const result = await fetchAttachmentContent(
      client,
      { message_id: "msg-001", attachment_id: "aid-bin" },
      getAccessToken,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.equals(rawBytes)).toBe(true);
    }

    // The behavior change under test: fetch goes to the /$value path with the bearer token.
    expect(valueCalls()).toHaveLength(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/\$value$/);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
  });

  it("returns the could-not-download error on a non-ok /$value response", async () => {
    mockValueFetch(new Response(null, { status: 500 }));
    const client = fakeGraphClient({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Dokument.pdf",
      contentType: "application/pdf",
      size: 245760,
    });

    const result = await fetchAttachmentContent(
      client,
      { message_id: "msg-001", attachment_id: "aid-pdf" },
      getAccessToken,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("Could not download");
    }
    expect(valueCalls()).toHaveLength(1);
  });

  it("treats an empty (zero-length) /$value body as could-not-download", async () => {
    mockValueFetch(new Response(Buffer.alloc(0), { status: 200 }));
    const client = fakeGraphClient({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "empty.bin",
      contentType: "application/octet-stream",
      size: 0,
    });

    const result = await fetchAttachmentContent(
      client,
      { message_id: "msg-001", attachment_id: "aid-zero" },
      getAccessToken,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.content[0].text).toContain("Could not download");
    }
  });
});

// ---------------------------------------------------------------------------
// handleDownloadAttachment — round-trip through the thin wrapper
// ---------------------------------------------------------------------------

describe("handleDownloadAttachment round-trip", () => {
  const getAccessToken = async () => "test-token";
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  function fakeGraphClientRT(meta: Record<string, unknown>): Client {
    return {
      api: () => ({ select: () => ({ get: async () => meta }) }),
    } as unknown as Client;
  }

  it("base64-encodes the raw /$value bytes losslessly in the tool result", async () => {
    const rawBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x10, 0x7f, 0x80, 0xff]);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(rawBytes, { status: 200 })) as ReturnType<typeof vi.spyOn>;

    const client = fakeGraphClientRT({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "image.png",
      contentType: "image/png",
      size: rawBytes.length,
    });

    const result = await handleDownloadAttachment(
      client,
      { message_id: "msg-001", attachment_id: "aid-bin" },
      getAccessToken,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Binary content is emitted as a labeled base64 block; extract and decode it.
    const marker = "Base64-encoded content (image/png):\n";
    const idx = text.indexOf(marker);
    expect(idx).toBeGreaterThanOrEqual(0);
    const base64 = text.slice(idx + marker.length).trim();
    expect(Buffer.from(base64, "base64").equals(rawBytes)).toBe(true);
  });
});
