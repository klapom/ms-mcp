import { assertSiteAccessAllowed, pinUserId } from "../auth/persona-pinning.js";
import { getCallerIdentity } from "../auth/request-identity.js";
import { ValidationError } from "./errors.js";
import { encodeGraphId } from "./graph-id.js";
import { createLogger } from "./logger.js";

const logger = createLogger("utils:drive-path");

/** True if `value` contains a C0 control character (code point 0x00-0x1F). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) <= 0x1f) return true;
  }
  return false;
}

/**
 * Percent-decodes `value` the way the HTTP layer eventually will, but tolerant
 * of a literal `%` that is NOT part of a valid `%XX` escape — a legitimate
 * character in real OneDrive file names such as "Umsatz 100%.xlsx". Every valid
 * escape (including multi-byte UTF-8 groups that span several `%XX` triples) is
 * still decoded, so a pre-encoded traversal/colon smuggle like "%2e%2e%2f" is
 * fully exposed to the danger-character/segment checks. Only a genuinely
 * malformed `%` run is passed through literally instead of aborting the whole
 * decode — which is what lets a lone `%` survive without opening a hole, since
 * every ASCII character we reject (`:` `\` `..` control) is single-byte and
 * would still be decoded from its own valid escape.
 */
function lenientPercentDecode(value: string): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value[i] !== "%") {
      out += value[i];
      i += 1;
      continue;
    }
    // Accumulate a maximal run of consecutive "%XX" escapes and decode it as one
    // group so multi-byte UTF-8 sequences survive.
    let run = "";
    let j = i;
    while (value[j] === "%" && /^[0-9A-Fa-f]{2}$/.test(value.slice(j + 1, j + 3))) {
      run += value.slice(j, j + 3);
      j += 3;
    }
    if (run.length === 0) {
      // Lone '%' not starting a valid escape — a literal character.
      out += "%";
      i += 1;
      continue;
    }
    try {
      out += decodeURIComponent(run);
    } catch {
      // Valid %XX syntax but the bytes aren't valid UTF-8 (e.g. "%FF"). None of
      // our single-byte ASCII danger characters can hide here, so pass through.
      out += run;
    }
    i = j;
  }
  return out;
}

/**
 * Resolves the Graph API drive base path, supporting:
 * - OneDrive personal: /me/drive (default)
 * - Multi-tenant OneDrive: /users/{userId}/drive
 * - SharePoint document library: /sites/{siteId}/drives/{driveId}
 */
export function resolveDrivePath(userId?: string, siteId?: string, driveId?: string): string {
  const identity = getCallerIdentity();
  // Site/drive addressing bypasses the mailbox identity check entirely, so it is
  // gated on the persona's allowed sites before anything is built. No-op under
  // the off/operator bypass.
  assertSiteAccessAllowed(siteId, driveId, identity);
  if (siteId && driveId) {
    return `/sites/${encodeGraphId(siteId)}/drives/${encodeGraphId(driveId)}`;
  }
  const pinned = pinUserId(userId, identity);
  const normalizedUserId = normalizeUserId(pinned);
  const userPath = normalizedUserId ? `/users/${encodeGraphId(normalizedUserId)}` : "/me";
  return `${userPath}/drive`;
}

/**
 * LLMs frequently pass literal strings like "/me" or "me" as user_id because
 * they mirror the Graph API's `/me` endpoint. Those values are not valid user
 * identifiers and produce 404s when spliced into `/users/<id>/drive`. Treat
 * them as "no user_id" so the call falls back to `/me` as intended.
 */
export function normalizeUserId(userId?: string): string | undefined {
  if (!userId) return undefined;
  const trimmed = userId.trim().replace(/^\/+/, "");
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "me") return undefined;
  return trimmed;
}

/**
 * Normalizes a user-supplied drive path.
 *
 * OneDrive Personal/Business exposes the default library root directly (no
 * `/Documents` segment). LLMs frequently prefix paths with `/Documents` out of
 * habit — Graph answers those with 404. When no SharePoint site is addressed,
 * we transparently strip a leading `/Documents/` (or `/Documents`) so the call
 * succeeds instead of surfacing a confusing NotFound.
 *
 * On SharePoint sites `/Documents` CAN be a real folder, so we leave it alone
 * when siteId is set.
 *
 * This is the shared choke point every drive tool funnels its caller-supplied
 * path through before building a `root:{path}:` Graph URL, so the path-traversal
 * / colon-injection guard (`assertSafeDrivePathContent`) is enforced here — once
 * — for all current and future callers. The stricter empty-segment hygiene of
 * `assertSafeDrivePath` is deliberately NOT applied here: several callers
 * (list/download) legitimately pass root "/" or trailing-slash paths and trim
 * them afterward, and that pre-trim value must still flow through this choke
 * point without being rejected.
 *
 * Returns the path unchanged if nothing needs to be stripped.
 */
export function normalizeDrivePath(path: string, siteId?: string): string {
  const normalized = stripDocumentsPrefix(path, siteId);
  assertSafeDrivePathContent(normalized);
  return normalized;
}

function stripDocumentsPrefix(path: string, siteId?: string): string {
  if (siteId) return path;
  // Match "/Documents" or "/Documents/…" (case-insensitive), strip the prefix.
  const match = path.match(/^\/+Documents(\/.*)?$/i);
  if (!match) return path;
  const stripped = match[1] ?? "/";
  logger.warn(
    { original: path, normalized: stripped },
    "stripped /Documents prefix from personal-drive path",
  );
  return stripped;
}

/**
 * Security core of the drive-path guard: rejects the characters/sequences that
 * let a caller break out of the intended `root:<path>:` Graph addressing when
 * the path is spliced into a URL like `` `${drivePath}/root:${path}:/content` ``
 * (see `src/tools/drive-upload.ts`). Graph uses `:` as a mode switch inside that
 * template, so a caller-controlled `:` can escape the addressing; a `..` segment
 * can climb out of the intended folder; a `\` is a common alternate separator
 * downstream tooling might treat as a path component; C0 control characters have
 * no legitimate place in a file path.
 *
 * Encoding assumption: every caller in this codebase (MCP tool schemas via Zod,
 * then `normalizeDrivePath`/`resolveDrivePath`) passes along already-decoded
 * logical strings — there is no `decodeURIComponent`/`encodeURIComponent` on the
 * drive-path call chain. However, the *output* is spliced into a URL that Graph
 * (and any HTTP layer in between) WILL percent-decode, so a caller could smuggle
 * a traversal or path-addressing `:` past a naive literal check by pre-encoding
 * it (e.g. `..%2Fb`, inert as literal text but decoding to `../b` on the wire).
 * We therefore additionally percent-decode and re-run the same checks against
 * the decoded form. Decoding is lenient (see `lenientPercentDecode`): a real
 * pre-encoded smuggle still decodes and is still caught, while a lone `%` that
 * is simply a literal character in a legitimate name (e.g. "Umsatz 100%.xlsx")
 * is passed through instead of being rejected outright.
 *
 * Returns the decoded form so callers that need further segment checks
 * (`assertSafeDrivePath`) can reuse it without decoding twice. Does NOT enforce
 * empty-segment hygiene — that stricter shape check lives in
 * `assertSafeDrivePath`, because callers that post-process the path (list and
 * download trim slashes; root "/" is legal) must still be able to flow their
 * pre-trim value through the shared `normalizeDrivePath` choke point.
 */
function assertSafeDrivePathContent(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new ValidationError("path must be a non-empty string.");
  }
  if (hasControlChar(path)) {
    throw new ValidationError(`path must not contain control characters: ${JSON.stringify(path)}`);
  }
  if (path.includes(":")) {
    throw new ValidationError(
      `path must not contain ':' (reserved for Graph path-addressing): ${path}`,
    );
  }
  if (path.includes("\\")) {
    throw new ValidationError(`path must not contain '\\': ${path}`);
  }

  const decoded = lenientPercentDecode(path);
  if (decoded.includes(":")) {
    throw new ValidationError(
      `path must not contain an encoded ':' (reserved for Graph path-addressing): ${path}`,
    );
  }
  if (decoded.includes("\\")) {
    throw new ValidationError(`path must not contain an encoded '\\': ${path}`);
  }
  if (hasControlChar(decoded)) {
    throw new ValidationError(`path must not contain encoded control characters: ${path}`);
  }
  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      throw new ValidationError(`path must not contain '..' segments: ${path}`);
    }
  }

  return decoded;
}

/**
 * Full strict validation for callers that build a single canonical
 * `root:<path>:` segment from the path (upload, save-attachment): the security
 * core above PLUS empty-segment hygiene. A single leading `/` is expected and
 * fine, but any OTHER empty segment (double slashes like `//foo`, or a trailing
 * slash like `/foo/`) is rejected as malformed rather than silently collapsed.
 *
 * Because `normalizeDrivePath` already applies the security core, calling this
 * on an already-normalized path re-runs those checks as a harmless idempotent
 * no-op and adds only the empty-segment enforcement.
 *
 * Returns the path unchanged when it is safe.
 */
export function assertSafeDrivePath(path: string): string {
  const decoded = assertSafeDrivePathContent(path);

  const segments = decoded.split("/");
  segments.forEach((segment, index) => {
    if (segment === "") {
      const isSingleLeadingSlash = index === 0 && segments.length > 1;
      if (!isSingleLeadingSlash) {
        throw new ValidationError(`path must not contain empty segments: ${path}`);
      }
    }
  });

  return path;
}

/**
 * Validates a caller-supplied file/attachment name (a single path segment,
 * not a full path — e.g. the `name` used when creating an upload session or
 * naming an attachment). Rejects path separators, the Graph path-addressing
 * `:`, a name that is exactly "." or ".." (a real traversal segment once
 * appended after a `/`), control characters, empty strings, and names over 255
 * characters (the Windows/OneDrive filename length ceiling).
 *
 * Returns the name unchanged when it is safe.
 */
export function assertSafeFileName(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new ValidationError("file name must be a non-empty string.");
  }
  if (name.length > 255) {
    throw new ValidationError(`file name must not exceed 255 characters: ${name.length} given.`);
  }
  if (name.includes("/")) {
    throw new ValidationError(`file name must not contain '/': ${name}`);
  }
  if (name.includes("\\")) {
    throw new ValidationError(`file name must not contain '\\': ${name}`);
  }
  if (name.includes(":")) {
    throw new ValidationError(`file name must not contain ':': ${name}`);
  }
  // A single filename is one segment (the '/' and '\' checks above already
  // reject anything that could become multiple segments), so `..` is a real
  // traversal segment only when the WHOLE name is exactly ".." or "." — those
  // become traversal once appended after a '/' elsewhere. `..` merely appearing
  // as a substring of a longer, otherwise-safe name (e.g. "Q1..Q2-report.pdf")
  // is a legitimate filename and must not be rejected.
  if (name === ".." || name === ".") {
    throw new ValidationError(`file name must not be '.' or '..': ${name}`);
  }
  if (hasControlChar(name)) {
    throw new ValidationError(
      `file name must not contain control characters: ${JSON.stringify(name)}`,
    );
  }
  return name;
}
