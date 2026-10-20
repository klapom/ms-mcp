/**
 * Regression: send_draft and add_attachment looked up idempotency keys under
 * "create_draft" but stored them under their own name — a repeated call was
 * executed twice, and a key reused from create_draft silently skipped the send.
 */

import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { registerMailDraftTools } from "../src/tools/mail-drafts.js";
import type { ToolResult } from "../src/types/tools.js";
import { idempotencyCache } from "../src/utils/idempotency.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

let sendCalls: number;
let attachCalls: number;

function setup(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _shape: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  const client = Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
  registerMailDraftTools(server, client, testConfig);
  return handlers;
}

let keyCounter = 0;
const uniqueKey = (label: string) => `${label}-${Date.now()}-${keyCounter++}`;

beforeEach(() => {
  sendCalls = 0;
  attachCalls = 0;
  mswServer.use(
    http.post(`${GRAPH}/me/messages/:messageId/send`, () => {
      sendCalls++;
      return new HttpResponse(null, { status: 202 });
    }),
    http.post(`${GRAPH}/me/messages/:messageId/attachments`, () => {
      attachCalls++;
      return HttpResponse.json({ id: "att-1" }, { status: 201 });
    }),
  );
});

describe("send_draft idempotency", () => {
  it("sends only once for the same key", async () => {
    const key = uniqueKey("send");
    const handlers = setup();
    const params = { message_id: "draft-1", confirm: true, idempotency_key: key };
    await handlers.get("send_draft")?.(params);
    await handlers.get("send_draft")?.(params);
    expect(sendCalls).toBe(1);
  });

  it("is not skipped by a key previously used for create_draft", async () => {
    const key = uniqueKey("send-iso");
    idempotencyCache.set("create_draft", key, { message_id: "draft-1" });
    await setup().get("send_draft")?.({
      message_id: "draft-1",
      confirm: true,
      idempotency_key: key,
    });
    expect(sendCalls).toBe(1);
  });
});

describe("add_attachment idempotency", () => {
  it("attaches only once for the same key", async () => {
    const key = uniqueKey("attach");
    const handlers = setup();
    const params = {
      message_id: "draft-1",
      name: "a.txt",
      content_bytes: "SGVsbG8=",
      confirm: true,
      idempotency_key: key,
    };
    await handlers.get("add_attachment")?.(params);
    await handlers.get("add_attachment")?.(params);
    expect(attachCalls).toBe(1);
  });
});
