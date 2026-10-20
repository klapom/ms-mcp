/**
 * Outgoing mail bodies are always HTML in Aptos 11pt black (send_email,
 * create_draft, update_draft). Asserts on the helper and on what each tool
 * actually sends to Graph.
 */

import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { SendEmailParams } from "../src/schemas/mail.js";
import { registerMailDraftUpdateTools } from "../src/tools/mail-draft-update.js";
import { registerMailDraftTools } from "../src/tools/mail-drafts.js";
import { buildGraphRequestBody } from "../src/tools/mail-send.js";
import type { ToolResult } from "../src/types/tools.js";
import { MAIL_FONT_STYLE, textToHtml, toStyledHtmlBody } from "../src/utils/mail-html.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const OPEN = `<div style="${MAIL_FONT_STYLE}">`;

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

describe("mail house style", () => {
  it("is Aptos 11pt in black", () => {
    expect(MAIL_FONT_STYLE).toMatch(/^font-family: Aptos,/);
    expect(MAIL_FONT_STYLE).toContain("font-size: 11pt");
    expect(MAIL_FONT_STYLE).toContain("color: rgb(0, 0, 0)");
  });
});

describe("textToHtml", () => {
  it("escapes markup and keeps line breaks", () => {
    expect(textToHtml("a < b & c\r\nZeile 2\nÄrger \"x\" 'y'")).toBe(
      "a &lt; b &amp; c<br>Zeile 2<br>Ärger &quot;x&quot; &#39;y&#39;",
    );
  });
});

describe("toStyledHtmlBody", () => {
  it("always returns HTML, wrapping escaped text", () => {
    expect(toStyledHtmlBody("Hallo\n<Welt>", "text")).toEqual({
      contentType: "HTML",
      content: `${OPEN}Hallo<br>&lt;Welt&gt;</div>`,
    });
  });

  it("wraps an HTML fragment unchanged", () => {
    expect(toStyledHtmlBody("<p>Hi <b>du</b></p>", "html").content).toBe(
      `${OPEN}<p>Hi <b>du</b></p></div>`,
    );
  });

  it("puts the wrapper inside the body of a full HTML document", () => {
    const doc = '<html><head><meta charset="utf-8"></head><body class="x"><p>Hi</p></body></html>';
    expect(toStyledHtmlBody(doc, "html").content).toBe(
      `<html><head><meta charset="utf-8"></head><body class="x">${OPEN}<p>Hi</p></div></body></html>`,
    );
  });

  it("wraps an empty body so text typed later in Outlook starts in the house style", () => {
    expect(toStyledHtmlBody("", "text").content).toBe(`${OPEN}</div>`);
  });
});

describe("send_email request body", () => {
  it("sends a text body as styled HTML", () => {
    const params = SendEmailParams.parse({
      to: ["a@b.com"],
      subject: "S",
      body: "Hallo\nZeile 2",
      confirm: true,
    });
    const message = buildGraphRequestBody(params).message as Record<string, unknown>;
    expect(message.body).toEqual({
      contentType: "HTML",
      content: `${OPEN}Hallo<br>Zeile 2</div>`,
    });
  });

  it("sends an HTML body as styled HTML", () => {
    const params = SendEmailParams.parse({
      to: ["a@b.com"],
      subject: "S",
      body: "<p>Hi</p>",
      body_type: "html",
      confirm: true,
    });
    const message = buildGraphRequestBody(params).message as Record<string, unknown>;
    expect(message.body).toEqual({ contentType: "HTML", content: `${OPEN}<p>Hi</p></div>` });
  });
});

describe("draft tools send styled HTML to Graph", () => {
  let handlers: Map<string, ToolHandler>;
  let posted: Array<Record<string, unknown>>;
  let patched: Array<Record<string, unknown>>;

  beforeEach(() => {
    posted = [];
    patched = [];
    mswServer.use(
      http.post(`${GRAPH}/me/messages`, async ({ request }) => {
        posted.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: "draft-1", subject: "S", isDraft: true }, { status: 201 });
      }),
      http.get(`${GRAPH}/me/messages/:id`, () =>
        HttpResponse.json({ id: "draft-1", isDraft: true }),
      ),
      http.patch(`${GRAPH}/me/messages/:id`, async ({ request }) => {
        patched.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: "draft-1", subject: "S" });
      }),
    );

    handlers = new Map();
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
    registerMailDraftUpdateTools(server, client, testConfig);
  });

  it("create_draft stores a text body as styled HTML", async () => {
    const result = await handlers.get("create_draft")?.({
      subject: "S",
      body: "Hallo\nGruß",
      confirm: true,
    });
    expect(result?.isError).toBeFalsy();
    expect(posted[0].body).toEqual({
      contentType: "HTML",
      content: `${OPEN}Hallo<br>Gruß</div>`,
    });
  });

  it("create_draft stores an HTML body as styled HTML", async () => {
    await handlers.get("create_draft")?.({
      subject: "S",
      body: "<p>Hi</p>",
      body_type: "html",
      confirm: true,
    });
    expect(posted[0].body).toEqual({ contentType: "HTML", content: `${OPEN}<p>Hi</p></div>` });
  });

  it("update_draft patches a text body as styled HTML", async () => {
    const result = await handlers.get("update_draft")?.({
      message_id: "draft-1",
      body: "Neu & besser",
      confirm: true,
    });
    expect(result?.isError).toBeFalsy();
    expect(patched[0].body).toEqual({
      contentType: "HTML",
      content: `${OPEN}Neu &amp; besser</div>`,
    });
  });
});
