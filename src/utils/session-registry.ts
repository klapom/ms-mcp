/**
 * Streamable-HTTP session bookkeeping with idle eviction.
 *
 * Every session holds its own McpServer with all tool registrations (~0.56 MB).
 * Clients that open a new session without DELETE-ing the old one leaked them
 * for the lifetime of the process, so sessions idle for longer than
 * `idleTimeoutMs` are closed. A session with a request or stream still open is
 * never idle.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface ClosableTransport {
  close(): Promise<void>;
}

export interface SessionTransport extends ClosableTransport {
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
}

interface SessionLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

interface SessionEntry<T> {
  transport: T;
  lastActivity: number;
  openRequests: number;
}

export interface SessionRegistryOptions {
  /** Close sessions without activity for longer than this. 0 disables eviction. */
  idleTimeoutMs: number;
  logger: SessionLogger;
  now?: () => number;
}

export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

/** Reads `MCP_SESSION_IDLE_TIMEOUT_MIN` (minutes, 0 disables); default 60. */
export function idleTimeoutFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  return minutes * 60 * 1000;
}

export class SessionRegistry<T extends ClosableTransport> {
  private readonly sessions = new Map<string, SessionEntry<T>>();
  private readonly now: () => number;

  constructor(private readonly options: SessionRegistryOptions) {
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.sessions.size;
  }

  add(id: string, transport: T): void {
    this.sessions.set(id, { transport, lastActivity: this.now(), openRequests: 0 });
  }

  get(id: string): T | undefined {
    return this.sessions.get(id)?.transport;
  }

  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Record a request on a session. Call the returned function once the response
   * has closed; until then the session counts as active.
   */
  trackRequest(id: string): () => void {
    const entry = this.sessions.get(id);
    if (!entry) return () => {};
    entry.openRequests++;
    entry.lastActivity = this.now();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      entry.openRequests--;
      entry.lastActivity = this.now();
    };
  }

  /** Close every session idle for longer than the timeout. Returns the closed ids. */
  async closeIdle(): Promise<string[]> {
    const { idleTimeoutMs, logger } = this.options;
    if (idleTimeoutMs <= 0) return [];

    const now = this.now();
    const idle = [...this.sessions].filter(
      ([, e]) => e.openRequests === 0 && now - e.lastActivity > idleTimeoutMs,
    );
    for (const [id, entry] of idle) {
      this.sessions.delete(id);
      const idleMinutes = Math.round((now - entry.lastActivity) / 60_000);
      logger.info({ sessionId: id, idle_min: idleMinutes }, "MCP session closed (idle)");
      try {
        await entry.transport.close();
      } catch (error) {
        logger.warn(
          { sessionId: id, error: error instanceof Error ? error.message : String(error) },
          "Closing idle MCP session failed",
        );
      }
    }
    return idle.map(([id]) => id);
  }

  /** Run `closeIdle` periodically. The timer does not keep the process alive. */
  startSweeper(intervalMs: number): () => void {
    if (this.options.idleTimeoutMs <= 0) return () => {};
    const timer = setInterval(() => {
      void this.closeIdle();
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

/**
 * Route one /mcp request to its session: DELETE closes it, an unknown (closed,
 * evicted or pre-restart) session id gets 404 so the client starts a new session
 * as the MCP spec requires, and a request without id starts a new session.
 */
export async function dispatchSessionRequest<T extends SessionTransport>(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
  sessions: SessionRegistry<T>,
  createTransport: () => Promise<T>,
): Promise<void> {
  const header = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(header) ? header[0] : header;
  const existing = sessionId ? sessions.get(sessionId) : undefined;

  if (req.method === "DELETE") {
    if (sessionId && existing) {
      await existing.close();
      sessions.remove(sessionId);
    }
    res.statusCode = 200;
    res.end();
    return;
  }

  if (sessionId && !existing) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      }),
    );
    return;
  }

  if (sessionId) res.on("close", sessions.trackRequest(sessionId));
  const transport = existing ?? (await createTransport());
  await transport.handleRequest(req, res, req.body);
}
