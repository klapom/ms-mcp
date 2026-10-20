/**
 * HTTP session lifecycle: idle eviction and 404 for unknown sessions.
 *
 * Regression: sessions a client never DELETE-d stayed in memory for the
 * lifetime of the process (~0.56 MB each, 150 open after 41 h live).
 * The integration part runs a real McpServer + StreamableHTTPServerTransport
 * behind Express, wired like src/index.ts (which runs main() on import).
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ClosableTransport,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  dispatchSessionRequest,
  idleTimeoutFromEnv,
  SessionRegistry,
} from "../src/utils/session-registry.js";

const HOUR = 60 * 60 * 1000;

interface LogEntry {
  obj: Record<string, unknown>;
  msg: string;
}

function makeLogger() {
  const info: LogEntry[] = [];
  const warn: LogEntry[] = [];
  return {
    info,
    warn,
    logger: {
      info: (obj: Record<string, unknown>, msg: string) => info.push({ obj, msg }),
      warn: (obj: Record<string, unknown>, msg: string) => warn.push({ obj, msg }),
    },
  };
}

function fakeTransport(closeImpl?: () => Promise<void>) {
  const t = {
    closed: 0,
    async close() {
      t.closed++;
      await closeImpl?.();
    },
  };
  return t;
}

describe("idleTimeoutFromEnv", () => {
  it("defaults to 60 minutes", () => {
    expect(DEFAULT_SESSION_IDLE_TIMEOUT_MS).toBe(HOUR);
    expect(idleTimeoutFromEnv(undefined)).toBe(HOUR);
    expect(idleTimeoutFromEnv("")).toBe(HOUR);
  });

  it("reads minutes, 0 disables", () => {
    expect(idleTimeoutFromEnv("30")).toBe(30 * 60 * 1000);
    expect(idleTimeoutFromEnv("0")).toBe(0);
  });

  it("falls back to the default for invalid values", () => {
    expect(idleTimeoutFromEnv("abc")).toBe(HOUR);
    expect(idleTimeoutFromEnv("-5")).toBe(HOUR);
  });
});

describe("SessionRegistry.closeIdle", () => {
  let now: number;
  let log: ReturnType<typeof makeLogger>;
  let registry: SessionRegistry<ClosableTransport>;

  beforeEach(() => {
    now = 1_000_000;
    log = makeLogger();
    registry = new SessionRegistry({ idleTimeoutMs: HOUR, logger: log.logger, now: () => now });
  });

  it("keeps a session until it has been idle longer than the timeout", async () => {
    const t = fakeTransport();
    registry.add("s1", t);

    now += HOUR;
    expect(await registry.closeIdle()).toEqual([]);
    expect(registry.size).toBe(1);

    now += 1;
    expect(await registry.closeIdle()).toEqual(["s1"]);
    expect(registry.size).toBe(0);
    expect(registry.get("s1")).toBeUndefined();
    expect(t.closed).toBe(1);
    expect(log.info).toContainEqual({
      obj: { sessionId: "s1", idle_min: 60 },
      msg: "MCP session closed (idle)",
    });
  });

  it("measures idleness from the last request, not from session creation", async () => {
    registry.add("s1", fakeTransport());
    now += 50 * 60 * 1000;
    registry.trackRequest("s1")();

    now += 50 * 60 * 1000;
    expect(await registry.closeIdle()).toEqual([]);

    now += 11 * 60 * 1000;
    expect(await registry.closeIdle()).toEqual(["s1"]);
  });

  it("never closes a session with a request or stream still open", async () => {
    registry.add("s1", fakeTransport());
    const done = registry.trackRequest("s1");

    now += 5 * HOUR;
    expect(await registry.closeIdle()).toEqual([]);

    done();
    done(); // calling twice must not make the counter negative
    now += HOUR + 1;
    expect(await registry.closeIdle()).toEqual(["s1"]);
  });

  it("only closes the idle sessions", async () => {
    registry.add("old", fakeTransport());
    now += 30 * 60 * 1000;
    registry.add("new", fakeTransport());
    now += 31 * 60 * 1000;

    expect(await registry.closeIdle()).toEqual(["old"]);
    expect(registry.get("new")).toBeDefined();
  });

  it("removes the session even when close() throws", async () => {
    registry.add(
      "s1",
      fakeTransport(() => Promise.reject(new Error("boom"))),
    );
    now += HOUR + 1;

    expect(await registry.closeIdle()).toEqual(["s1"]);
    expect(registry.size).toBe(0);
    expect(log.warn[0]).toEqual({
      obj: { sessionId: "s1", error: "boom" },
      msg: "Closing idle MCP session failed",
    });
  });

  it("is disabled with a timeout of 0", async () => {
    const disabled = new SessionRegistry({ idleTimeoutMs: 0, logger: log.logger, now: () => now });
    disabled.add("s1", fakeTransport());
    now += 100 * HOUR;
    expect(await disabled.closeIdle()).toEqual([]);
    expect(disabled.size).toBe(1);
  });
});

describe("/mcp session routing (real SDK transport)", () => {
  let now: number;
  let registry: SessionRegistry<StreamableHTTPServerTransport>;
  let serversClosed: number;
  let app: express.Express;

  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    },
  };
  const ACCEPT = "application/json, text/event-stream";

  async function openSession(): Promise<string> {
    const res = await request(app).post("/mcp").set("Accept", ACCEPT).send(initialize);
    expect(res.status).toBe(200);
    const id = res.headers["mcp-session-id"];
    expect(id).toBeTruthy();
    await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT)
      .set("mcp-session-id", id)
      .send({ jsonrpc: "2.0", method: "notifications/initialized" });
    return id;
  }

  function listTools(id: string) {
    return request(app)
      .post("/mcp")
      .set("Accept", ACCEPT)
      .set("mcp-session-id", id)
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  }

  beforeEach(() => {
    now = 1_000_000;
    serversClosed = 0;
    registry = new SessionRegistry({
      idleTimeoutMs: HOUR,
      logger: makeLogger().logger,
      now: () => now,
    });

    const createTransport = async () => {
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => registry.add(id, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) registry.remove(transport.sessionId);
      };
      const server = new McpServer({ name: "test", version: "0.0.1" });
      server.tool("echo", "Echo", { text: z.string() }, async ({ text }) => ({
        content: [{ type: "text", text }],
      }));
      server.server.onclose = () => {
        serversClosed++;
      };
      await server.connect(transport);
      return transport;
    };

    app = express();
    app.use(express.json());
    app.all("/mcp", (req, res) => dispatchSessionRequest(req, res, registry, createTransport));
  });

  it("serves an open session", async () => {
    const id = await openSession();
    expect(registry.size).toBe(1);
    const res = await listTools(id);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"echo"');
  });

  it("evicts a session idle for over an hour, closing its McpServer", async () => {
    const id = await openSession();

    now += HOUR + 1;
    expect(await registry.closeIdle()).toEqual([id]);

    expect(registry.size).toBe(0);
    expect(serversClosed).toBe(1);
  });

  it("answers a request on an evicted session with 404 Session not found", async () => {
    const id = await openSession();
    now += HOUR + 1;
    await registry.closeIdle();

    const res = await listTools(id);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found" },
      id: null,
    });
    expect(registry.size).toBe(0);
  });

  it("keeps a session that was used within the hour", async () => {
    const id = await openSession();
    now += 50 * 60 * 1000;
    expect((await listTools(id)).status).toBe(200);

    now += 50 * 60 * 1000;
    expect(await registry.closeIdle()).toEqual([]);
    expect((await listTools(id)).status).toBe(200);
  });

  it("answers an unknown session id with 404 without creating a session", async () => {
    const res = await listTools("does-not-exist");
    expect(res.status).toBe(404);
    expect(registry.size).toBe(0);
  });

  it("closes a session on DELETE", async () => {
    const id = await openSession();
    const res = await request(app).delete("/mcp").set("mcp-session-id", id);
    expect(res.status).toBe(200);
    expect(registry.size).toBe(0);
    expect(serversClosed).toBe(1);
  });
});
