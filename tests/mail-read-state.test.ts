import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { registerMailReadStateTools } from "../src/tools/mail-read-state.js";
import type { ToolResult } from "../src/types/tools.js";
import { AuthError, NotFoundError } from "../src/utils/errors.js";
import { encodeGraphId } from "../src/utils/graph-id.js";

const ULLA = "ulla.vogel@pommerconsulting.de";
const testConfig = {} as unknown as Config;

type Handler = (params: Record<string, unknown>) => Promise<ToolResult>;

function setup(patchImpl?: () => Promise<unknown>) {
  const patch = vi.fn(patchImpl ?? (() => Promise.resolve({})));
  const api = vi.fn().mockReturnValue({ patch });
  const handlers = new Map<string, Handler>();
  const capturing = {
    tool: (name: string, _d: string, _s: unknown, h: Handler) => handlers.set(name, h),
  } as unknown as McpServer;
  registerMailReadStateTools(capturing, { api } as unknown as Client, testConfig);
  const handler = handlers.get("mark_email_read");
  if (!handler) throw new Error("mark_email_read not registered");
  return { handler, api, patch };
}

describe("mark_email_read", () => {
  it("marks a message in another mailbox as read (PATCH isRead:true, default)", async () => {
    const { handler, api, patch } = setup();
    const result = await handler({ message_id: "AAMkAbc", user_id: ULLA });
    expect(result.isError).toBeUndefined();
    expect(api).toHaveBeenCalledWith(`/users/${ULLA}/messages/AAMkAbc`);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ isRead: true });
    expect(result.content[0].text).toContain("read");
  });

  it("is_read=false marks unread; no user_id acts on /me", async () => {
    const { handler, api, patch } = setup();
    const result = await handler({ message_id: "m1", is_read: false });
    expect(result.isError).toBeUndefined();
    expect(api).toHaveBeenCalledWith("/me/messages/m1");
    expect(patch).toHaveBeenCalledWith({ isRead: false });
    expect(result.content[0].text).toContain("unread");
  });

  it("encodes base64 padding and slashes in the message id", async () => {
    const { handler, api } = setup();
    const raw = "AQMk/AbC+d==";
    await handler({ message_id: raw, user_id: ULLA });
    const path = api.mock.calls[0][0] as string;
    expect(path).toBe(`/users/${ULLA}/messages/${encodeGraphId(raw)}`);
    expect(decodeURIComponent(path.split("/messages/")[1])).toBe(raw);
  });

  it("maps Graph 403/404 to an isError result", async () => {
    for (const err of [
      new AuthError("Access is denied", 403),
      new NotFoundError("message", "m1"),
    ]) {
      const { handler } = setup(() => Promise.reject(err));
      const result = await handler({ message_id: "m1", user_id: ULLA });
      expect(result.isError).toBe(true);
    }
  });

  it("rejects an empty message_id without calling Graph", async () => {
    const { handler, api } = setup();
    await expect(handler({ message_id: "" })).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
});
