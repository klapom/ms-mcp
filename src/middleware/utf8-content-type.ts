/**
 * -------------------------------------------------------------------------------------------
 * Utf8ContentTypeMiddleware
 * -------------------------------------------------------------------------------------------
 */
import type { Context, Middleware } from "@microsoft/microsoft-graph-client";

const BARE_JSON = /^application\/json\s*$/i;
const UTF8_JSON = "application/json; charset=utf-8";

/**
 * Ensures outgoing JSON request bodies declare `charset=utf-8` explicitly.
 *
 * Root cause: `@microsoft/microsoft-graph-client`'s `GraphRequest.setHeaderContentType()`
 * defaults the Content-Type header to a bare `application/json` whenever the caller hasn't
 * set one (which covers every `.post()`/`.patch()`/`.put()` call in this codebase — see
 * `mail-drafts.ts`, `mail-send.ts`, `calendar-create.ts`, etc.). Node's `fetch` always encodes
 * a string request body as UTF-8 regardless of what the Content-Type header says, so the bytes
 * placed on the wire are already correct — but without an explicit `charset=utf-8` parameter,
 * Microsoft Graph's own request parser has been observed falling back to a non-UTF-8 codepage
 * when decoding the body server-side. The practical symptom: any non-ASCII character (German
 * umlauts, accents, …) sent in a subject/body/comment survives transport intact but is stored
 * mojibake'd (e.g. "ü" -> "Ã¼") in the created/updated Graph resource — reproducible even when
 * the request bytes are verifiably correct UTF-8, and even when clients try to route around it
 * themselves (ASCII-escaped `\uXXXX` JSON, raw UTF-8 bytes with an explicit request charset)
 * because the corruption happens on Graph's side, downstream of anything the client can control
 * except the header this middleware adds.
 *
 * Fix: rewrite a bare `application/json` Content-Type to `application/json; charset=utf-8`
 * before the request reaches `HTTPMessageHandler`. This covers every write endpoint uniformly
 * without touching each tool's call site individually, and without patching the SDK itself.
 * A Content-Type the caller already customized (anything other than the exact bare-JSON form,
 * e.g. FormData or an explicit octet-stream) is left untouched.
 */
export class Utf8ContentTypeMiddleware implements Middleware {
  private nextMiddleware?: Middleware;

  async execute(context: Context): Promise<void> {
    const headers = context.options?.headers;

    if (headers instanceof Headers) {
      const current = headers.get("Content-Type");
      if (current && BARE_JSON.test(current)) {
        headers.set("Content-Type", UTF8_JSON);
      }
    } else if (Array.isArray(headers)) {
      for (const pair of headers as string[][]) {
        if (pair[0]?.toLowerCase() === "content-type" && BARE_JSON.test(pair[1] ?? "")) {
          pair[1] = UTF8_JSON;
        }
      }
    } else if (headers && typeof headers === "object") {
      const record = headers as Record<string, string>;
      for (const key of Object.keys(record)) {
        if (key.toLowerCase() === "content-type" && BARE_JSON.test(record[key] ?? "")) {
          record[key] = UTF8_JSON;
        }
      }
    }

    if (this.nextMiddleware) {
      await this.nextMiddleware.execute(context);
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}
