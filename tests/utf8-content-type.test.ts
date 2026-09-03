import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { describe, expect, it, vi } from "vitest";
import { Utf8ContentTypeMiddleware } from "../src/middleware/utf8-content-type.js";

function createNextMiddleware(): Middleware & { execute: ReturnType<typeof vi.fn> } {
  return {
    execute: vi.fn(async () => {}),
    setNext: vi.fn(),
  };
}

describe("Utf8ContentTypeMiddleware", () => {
  it("rewrites a bare 'application/json' Headers instance to declare charset=utf-8", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers = new Headers({ "Content-Type": "application/json" });
    const context = {
      request: "https://graph.microsoft.com/v1.0/me/messages",
      options: { method: "POST", headers },
    } as Context;

    await middleware.execute(context);

    expect(headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(next.execute).toHaveBeenCalledWith(context);
  });

  it("rewrites a bare 'application/json' plain-object header (GraphRequest's default shape)", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const context = {
      request: "https://graph.microsoft.com/v1.0/me/messages",
      options: { method: "POST", headers },
    } as unknown as Context;

    await middleware.execute(context);

    expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");
  });

  it("rewrites a bare 'application/json' header in string[][] array form", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers: string[][] = [["Content-Type", "application/json"]];
    const context = {
      request: "https://graph.microsoft.com/v1.0/me/messages",
      options: { method: "POST", headers },
    } as unknown as Context;

    await middleware.execute(context);

    expect(headers[0][1]).toBe("application/json; charset=utf-8");
  });

  it("is case-insensitive on both the header name and the media type", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers: Record<string, string> = { "content-type": "APPLICATION/JSON" };
    const context = { request: "x", options: { method: "POST", headers } } as unknown as Context;

    await middleware.execute(context);

    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("leaves a Content-Type that already declares a charset untouched", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=iso-8859-1",
    };
    const context = { request: "x", options: { method: "POST", headers } } as unknown as Context;

    await middleware.execute(context);

    expect(headers["Content-Type"]).toBe("application/json; charset=iso-8859-1");
  });

  it("leaves non-JSON Content-Types (e.g. multipart, octet-stream) untouched", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
    const context = { request: "x", options: { method: "PUT", headers } } as unknown as Context;

    await middleware.execute(context);

    expect(headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("does nothing and still forwards when there are no headers (e.g. GET requests)", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const context = { request: "x", options: { method: "GET" } } as unknown as Context;

    await expect(middleware.execute(context)).resolves.toBeUndefined();
    expect(next.execute).toHaveBeenCalledWith(context);
  });

  it("does nothing when options itself is absent", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const next = createNextMiddleware();
    middleware.setNext(next);

    const context = { request: "x" } as unknown as Context;

    await expect(middleware.execute(context)).resolves.toBeUndefined();
    expect(next.execute).toHaveBeenCalledWith(context);
  });

  it("is a no-op (no throw) when there is no next middleware set", async () => {
    const middleware = new Utf8ContentTypeMiddleware();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const context = { request: "x", options: { method: "POST", headers } } as unknown as Context;

    await expect(middleware.execute(context)).resolves.toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");
  });
});
