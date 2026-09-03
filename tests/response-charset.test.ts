import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ensureUtf8ResponseCharset } from "../src/middleware/response-charset.js";

/** Minimal stand-in for Express's Response, capturing whatever writeHead ultimately receives. */
function createMockResponse() {
  const calls: unknown[][] = [];
  const res = {
    writeHead(...args: unknown[]) {
      calls.push(args);
      return res;
    },
  } as unknown as Response;
  return { res, calls };
}

function runMiddleware(res: Response): NextFunction {
  const next = vi.fn();
  ensureUtf8ResponseCharset()({} as Request, res, next as NextFunction);
  return next;
}

describe("ensureUtf8ResponseCharset", () => {
  it("calls next() so the request pipeline continues", () => {
    const { res } = createMockResponse();
    const next = runMiddleware(res);
    expect(next).toHaveBeenCalledOnce();
  });

  it("appends charset=utf-8 to a bare 'application/json' Content-Type (writeHead(status, headers))", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "Content-Type": "application/json" });

    expect(calls[0][1]).toEqual({ "Content-Type": "application/json; charset=utf-8" });
  });

  it("appends charset=utf-8 to a bare 'text/event-stream' Content-Type", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "Content-Type": "text/event-stream" });

    expect(calls[0][1]).toEqual({ "Content-Type": "text/event-stream; charset=utf-8" });
  });

  it("handles the writeHead(status, statusMessage, headers) call shape", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, "OK", { "Content-Type": "application/json" });

    expect(calls[0]).toEqual([200, "OK", { "Content-Type": "application/json; charset=utf-8" }]);
  });

  it("is case-insensitive on the header key", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "content-type": "application/json" });

    expect(calls[0][1]).toEqual({ "content-type": "application/json; charset=utf-8" });
  });

  it("leaves a Content-Type that already declares a charset untouched", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });

    expect(calls[0][1]).toEqual({ "Content-Type": "text/event-stream; charset=utf-8" });
  });

  it("leaves unrelated Content-Types (e.g. text/plain, application/octet-stream) untouched", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "Content-Type": "application/octet-stream" });

    expect(calls[0][1]).toEqual({ "Content-Type": "application/octet-stream" });
  });

  it("passes through a writeHead call with no headers at all", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(204);

    expect(calls[0]).toEqual([204, undefined]);
  });

  it("leaves other header keys in the same object untouched", () => {
    const { res, calls } = createMockResponse();
    runMiddleware(res);

    res.writeHead(200, { "Content-Type": "application/json", "X-Custom": "keep-me" });

    expect(calls[0][1]).toEqual({
      "Content-Type": "application/json; charset=utf-8",
      "X-Custom": "keep-me",
    });
  });
});
