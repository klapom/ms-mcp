/**
 * -------------------------------------------------------------------------------------------
 * ensureUtf8ResponseCharset
 * -------------------------------------------------------------------------------------------
 */

import type { OutgoingHttpHeaders } from "node:http";
import type { NextFunction, Request, Response } from "express";

const BARE_JSON = /^application\/json\s*$/i;
const BARE_EVENT_STREAM = /^text\/event-stream\s*$/i;

/** Rewrites a bare JSON/SSE Content-Type value to declare charset=utf-8; leaves anything else untouched. */
function withUtf8Charset(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (BARE_JSON.test(value)) return "application/json; charset=utf-8";
  if (BARE_EVENT_STREAM.test(value)) return "text/event-stream; charset=utf-8";
  return value;
}

/** Mutates a headers object in place, fixing a bare Content-Type key regardless of casing. */
function fixHeaders(headers: OutgoingHttpHeaders | undefined): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "content-type") {
      headers[key] = withUtf8Charset(headers[key]) as never;
    }
  }
}

/**
 * Express middleware that forces `charset=utf-8` onto this server's own
 * `application/json` and `text/event-stream` responses.
 *
 * Root cause: `@modelcontextprotocol/sdk`'s Streamable HTTP transport
 * (`webStandardStreamableHttp.js`, as used via `@hono/node-server`) writes response
 * headers with a bare `Content-Type: application/json` or `Content-Type: text/event-stream` —
 * no charset parameter — and always does so through the raw Node `http.ServerResponse.writeHead()`
 * call (`@hono/node-server`'s `listener.js`), never through `res.setHeader()`.
 *
 * `text/event-stream` falls under the generic `text/*` top-level media type, whose HTTP default
 * charset per RFC 2616 §3.7.1 is ISO-8859-1, not UTF-8 — unlike `application/json`, which RFC 8259
 * mandates as UTF-8 regardless of a missing charset parameter, but not every HTTP client applies
 * that json-specific carve-out. Standards-conformant HTTP clients (Python's `requests`, and
 * observably some MCP client implementations too) that honour the RFC 2616 default therefore
 * decode this server's SSE/JSON bytes as Latin-1 instead of UTF-8. The visible symptom: any
 * non-ASCII character sent in a tool argument (German umlauts, accented names, …) round-trips
 * through this server's own encoding correctly all the way to the outgoing response — confirmed by
 * comparing the value at each step, including Microsoft Graph's own immediate echo of what it
 * stored — and then comes out mojibake'd exactly once, at the client, purely because of this
 * missing charset declaration (classic "Ã¼" for "ü": the UTF-8 bytes 0xC3 0xBC misread as two
 * separate Latin-1 characters).
 *
 * Fix: wrap `res.writeHead` for the lifetime of each request and rewrite a bare
 * `application/json` or `text/event-stream` Content-Type to include `; charset=utf-8` before the
 * headers are flushed. This is a request-scoped, side-effect-free patch (nothing survives the
 * request) that fixes every route this server exposes, including future ones, without depending
 * on an upstream SDK fix. Any Content-Type that already declares a charset, or isn't one of these
 * two bare forms, is left completely untouched.
 */
export function ensureUtf8ResponseCharset() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const originalWriteHead = res.writeHead.bind(res);

    // `http.ServerResponse#writeHead` has two call shapes:
    //   writeHead(statusCode, headers?)
    //   writeHead(statusCode, statusMessage, headers?)
    res.writeHead = ((
      statusCode: number,
      statusMessageOrHeaders?: string | OutgoingHttpHeaders,
      maybeHeaders?: OutgoingHttpHeaders,
    ) => {
      if (typeof statusMessageOrHeaders === "string") {
        fixHeaders(maybeHeaders);
        return originalWriteHead(statusCode, statusMessageOrHeaders, maybeHeaders);
      }
      fixHeaders(statusMessageOrHeaders);
      return originalWriteHead(statusCode, statusMessageOrHeaders);
    }) as Response["writeHead"];

    next();
  };
}
