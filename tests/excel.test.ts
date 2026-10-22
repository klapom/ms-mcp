import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { enforceToolCapability } from "../src/auth/persona-pinning.js";
import { loadPersonaScopesFromFile, resetLoadedPersonaScopes } from "../src/auth/persona-scopes.js";
import type { CallerIdentity } from "../src/auth/request-identity.js";
import type { Config } from "../src/config.js";
import { ReadExcelRangeParams } from "../src/schemas/excel.js";
import { registerExcelTools } from "../src/tools/excel.js";
import type { ToolResult } from "../src/types/tools.js";
import { AuthError, NotFoundError } from "../src/utils/errors.js";

const testConfig = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
} as unknown as Config;

const WB = "/me/drive/items/file-1/workbook";

type Call = { method: string; url: string; headers: Record<string, string>; body?: unknown };
type Responder = (method: string, url: string, body?: unknown) => unknown;

/** Chainable fake Graph client: records every call, answers via `respond`. */
function createFakeClient(respond: Responder) {
  const calls: Call[] = [];
  const api = (url: string) => {
    const headers: Record<string, string> = {};
    let query = "";
    const finish = (method: string, body?: unknown) => {
      const full = url + query;
      calls.push({ method, url: full, headers: { ...headers }, body });
      try {
        return Promise.resolve(respond(method, full, body));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const builder = {
      header(k: string, v: string) {
        headers[k] = v;
        return builder;
      },
      select(s: string) {
        query += `?$select=${s}`;
        return builder;
      },
      expand(e: string) {
        query += `&$expand=${e}`;
        return builder;
      },
      get: () => finish("GET"),
      post: (b: unknown) => finish("POST", b),
      patch: (b: unknown) => finish("PATCH", b),
    };
    return builder;
  };
  return { client: { api } as unknown as Client, calls };
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

function handlersFor(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _d: string, _s: unknown, h: ToolHandler) => handlers.set(name, h),
  } as unknown as McpServer;
  registerExcelTools(server, client, testConfig);
  return handlers;
}

function call(client: Client, tool: string, params: Record<string, unknown>): Promise<ToolResult> {
  const h = handlersFor(client).get(tool);
  if (!h) throw new Error(`${tool} not registered`);
  return h(params);
}

const textOf = (r: ToolResult): string => (r.content[0] as { text: string }).text;

/** Default workbook answers: session, headers, rows. Overridable per test. */
const DEFAULT_ANSWERS: [string, unknown][] = [
  ["/createSession", { id: "sess-1" }],
  ["/closeSession", {}],
  ["/headerRowRange", { values: [["Kunde", "POS", "Preis"]] }],
  ["/dataBodyRange?$select=address", { address: "Masterdata!A2:C3" }],
  ["/dataBodyRange", { values: [["Healthineers", "010", 1200]] }],
  ["/rows/add", { index: 1 }],
  ["/range(address=", { numberFormat: [["General", "General", "0.00"]] }],
  ["/worksheets?$select=name", { value: [{ name: "Stundenzettel" }] }],
  ["/tables/add", { id: "{T1}" }],
];

function workbook(overrides: Responder = () => undefined): Responder {
  return (method, url, body) =>
    overrides(method, url, body) ?? DEFAULT_ANSWERS.find(([part]) => url.includes(part))?.[1] ?? {};
}

const sessionClosed = (calls: Call[]) =>
  calls.some(
    (c) => c.url.endsWith("/closeSession") && c.headers["workbook-session-id"] === "sess-1",
  );

describe("write tools — confirmation", () => {
  it.each([
    ["create_excel_table", { worksheet: "Masterdata", name: "tblMasterdata", headers: ["Kunde"] }],
    ["add_excel_table_rows", { table: "tblMasterdata", rows: [["a", "b", 1]] }],
    ["update_excel_table_row", { table: "tblMasterdata", index: 0, values: ["a", "b", 1] }],
    ["write_excel_range", { worksheet: "Stundenzettel", address: "F2:G2", values: [[16, "RE-1"]] }],
  ])("%s without confirm returns a preview and makes no Graph call", async (tool, params) => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, tool, { file_id: "file-1", ...params });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain(tool);
    expect(calls).toHaveLength(0);
  });
});

describe("create_excel_table", () => {
  it("adds a missing worksheet, writes headers as text, creates and renames the table", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "create_excel_table", {
      file_id: "file-1",
      worksheet: "Masterdata",
      name: "tblMasterdata",
      headers: ["Kunde", "POS", "Preis"],
      confirm: true,
    });
    expect(result.isError).toBeUndefined();
    const seq = calls.map((c) => `${c.method} ${c.url.replace(WB, "")}`);
    expect(seq).toEqual([
      "POST /createSession",
      "GET /worksheets?$select=name",
      "POST /worksheets/add",
      "PATCH /worksheets/Masterdata/range(address='A1:C1')",
      "PATCH /worksheets/Masterdata/range(address='A1:C1')",
      "POST /tables/add",
      "PATCH /tables/%7BT1%7D",
      "POST /closeSession",
    ]);
    expect(calls[3]?.body).toEqual({ numberFormat: [["@", "@", "@"]] });
    expect(calls[4]?.body).toEqual({ values: [["Kunde", "POS", "Preis"]] });
    expect(calls[5]?.body).toEqual({ address: "'Masterdata'!A1:C1", hasHeaders: true });
    expect(calls[6]?.body).toEqual({ name: "tblMasterdata" });
    expect(calls.slice(1).every((c) => c.headers["workbook-session-id"] === "sess-1")).toBe(true);
    expect(JSON.parse(textOf(result))).toMatchObject({ worksheet_created: true });
  });

  it("does not add the worksheet when it already exists", async () => {
    const { client, calls } = createFakeClient(workbook());
    await call(client, "create_excel_table", {
      file_id: "file-1",
      worksheet: "Stundenzettel",
      name: "tblX",
      headers: ["A"],
      confirm: true,
    });
    expect(calls.some((c) => c.url.endsWith("/worksheets/add"))).toBe(false);
  });

  it("closes the session even when a step fails", async () => {
    const { client, calls } = createFakeClient(
      workbook((_m, url) => {
        if (url.endsWith("/tables/add")) throw new AuthError("denied", 403);
        return undefined;
      }),
    );
    const result = await call(client, "create_excel_table", {
      file_id: "file-1",
      worksheet: "Masterdata",
      name: "tblMasterdata",
      headers: ["Kunde"],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(sessionClosed(calls)).toBe(true);
  });
});

describe("add_excel_table_rows", () => {
  it("appends rows via rows/add when the table already has data", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["Healthineers", "020", 1200]],
      confirm: true,
    });
    expect(result.isError).toBeUndefined();
    const add = calls.find((c) => c.url.endsWith("/rows/add"));
    expect(add?.body).toEqual({ values: [["Healthineers", "020", 1200]] });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(JSON.parse(textOf(result))).toEqual({ table: "tblMasterdata", added: 1, indexes: [1] });
    expect(sessionClosed(calls)).toBe(true);
  });

  it("formats text columns as '@' before writing their values", async () => {
    const { client, calls } = createFakeClient(workbook());
    await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["Healthineers", "020", 1200]],
      text_columns: ["POS"],
      confirm: true,
    });
    const add = calls.find((c) => c.url.endsWith("/rows/add"));
    expect(add?.body).toEqual({ values: [["Healthineers", null, 1200]] });
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.url.replace(WB, ""))).toEqual([
      "/worksheets/Masterdata/range(address='A3:C3')",
      "/worksheets/Masterdata/range(address='A3:C3')",
    ]);
    expect(patches[0]?.body).toEqual({ numberFormat: [["General", "@", "0.00"]] });
    expect(patches[1]?.body).toEqual({ values: [["Healthineers", "020", 1200]] });
  });

  it("fills the single empty placeholder row of a fresh table instead of appending", async () => {
    const { client, calls } = createFakeClient(
      workbook((_m, url) =>
        url.includes("/dataBodyRange?$select=values") ? { values: [["", "", ""]] } : undefined,
      ),
    );
    const result = await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [
        ["Healthineers", "010", 1200],
        ["Healthineers", "020", 1200],
      ],
      confirm: true,
    });
    const patch = calls.filter((c) => c.method === "PATCH");
    expect(patch.map((c) => c.url.replace(WB, ""))).toEqual([
      "/worksheets/Masterdata/range(address='A2:C2')",
    ]);
    expect(patch[0]?.body).toEqual({ values: [["Healthineers", "010", 1200]] });
    expect(calls.filter((c) => c.url.endsWith("/rows/add"))).toHaveLength(1);
    expect(JSON.parse(textOf(result)).indexes).toEqual([0, 1]);
  });

  it("rejects rows whose width does not match the table", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["only", "two"]],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("3 values");
    expect(calls.some((c) => c.url.endsWith("/rows/add"))).toBe(false);
    expect(sessionClosed(calls)).toBe(true);
  });

  it("rejects an unknown text column", async () => {
    const { client } = createFakeClient(workbook());
    const result = await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["a", "b", 1]],
      text_columns: ["Nope"],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Nope");
  });

  it("rejects values that would become formulas, before any Graph call", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [['=HYPERLINK("x")', "b", 1]],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("returns the cached result for a repeated idempotency_key", async () => {
    const { client, calls } = createFakeClient(workbook());
    const params = {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["a", "b", 1]],
      confirm: true,
      idempotency_key: "masterdata-1",
    };
    const first = await call(client, "add_excel_table_rows", params);
    const n = calls.length;
    const second = await call(client, "add_excel_table_rows", params);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(n);
  });
});

describe("update_excel_table_row", () => {
  it("writes the row at the given index", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "update_excel_table_row", {
      file_id: "file-1",
      table: "tblMasterdata",
      index: 0,
      values: [null, null, 1300],
      confirm: true,
    });
    expect(result.isError).toBeUndefined();
    const patch = calls.filter((c) => c.method === "PATCH");
    expect(patch.map((c) => c.url.replace(WB, ""))).toEqual([
      "/worksheets/Masterdata/range(address='A2:C2')",
    ]);
    expect(patch[0]?.body).toEqual({ values: [[null, null, 1300]] });
  });

  it("refuses an index outside the table instead of writing below it", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "update_excel_table_row", {
      file_id: "file-1",
      table: "tblMasterdata",
      index: 2,
      values: ["a", "b", 1],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("outside the table");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(sessionClosed(calls)).toBe(true);
  });
});

describe("write_excel_range", () => {
  it("writes values into the range", async () => {
    const { client, calls } = createFakeClient(workbook());
    await call(client, "write_excel_range", {
      file_id: "file-1",
      worksheet: "Stundenzettel",
      address: "F700:G700",
      values: [[16, "RE-2611001"]],
      confirm: true,
    });
    const patch = calls.filter((c) => c.method === "PATCH");
    expect(patch.map((c) => c.url.replace(WB, ""))).toEqual([
      "/worksheets/Stundenzettel/range(address='F700:G700')",
    ]);
    expect(patch[0]?.body).toEqual({ values: [[16, "RE-2611001"]] });
    expect(sessionClosed(calls)).toBe(true);
  });

  it("with as_text sets the '@' format before the values", async () => {
    const { client, calls } = createFakeClient(workbook());
    await call(client, "write_excel_range", {
      file_id: "file-1",
      worksheet: "Masterdata",
      address: "D2:E2",
      values: [["0001", "010"]],
      as_text: true,
      confirm: true,
    });
    const patch = calls.filter((c) => c.method === "PATCH");
    expect(patch.map((c) => c.body)).toEqual([
      { numberFormat: [["@", "@"]] },
      { values: [["0001", "010"]] },
    ]);
  });

  it("rejects ragged values", async () => {
    const { client, calls } = createFakeClient(workbook());
    const result = await call(client, "write_excel_range", {
      file_id: "file-1",
      worksheet: "Masterdata",
      address: "A1:B2",
      values: [["a", "b"], ["c"]],
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid address in the schema", () => {
    expect(
      ReadExcelRangeParams.safeParse({ file_id: "f", worksheet: "S", address: "A1;B2" }).success,
    ).toBe(false);
  });
});

describe("read_excel_range", () => {
  it("reads a table as columns + rows", async () => {
    const { client, calls } = createFakeClient(
      workbook((_m, url) =>
        url.includes("/dataBodyRange")
          ? { address: "Masterdata!A2:C2", values: [["Healthineers", "010", 1200]] }
          : undefined,
      ),
    );
    const result = await call(client, "read_excel_range", {
      file_id: "file-1",
      table: "tblMasterdata",
    });
    expect(JSON.parse(textOf(result))).toEqual({
      address: "Masterdata!A2:C2",
      columns: ["Kunde", "POS", "Preis"],
      row_count: 1,
      rows: [["Healthineers", "010", 1200]],
    });
    expect(calls.some((c) => c.url.endsWith("/createSession"))).toBe(false);
  });

  it("reads the used range of a worksheet, as text on request", async () => {
    const { client, calls } = createFakeClient(() => ({
      address: "Stundenzettel!A1:B1",
      text: [["Datum", "h"]],
    }));
    const result = await call(client, "read_excel_range", {
      file_id: "file-1",
      worksheet: "Stundenzettel",
      as_text: true,
    });
    expect(calls[0]?.url).toBe(
      `${WB}/worksheets/Stundenzettel/usedRange(valuesOnly=true)?$select=address,text`,
    );
    expect(JSON.parse(textOf(result)).rows).toEqual([["Datum", "h"]]);
  });

  it("truncates beyond 500 rows with a hint", async () => {
    const many = Array.from({ length: 501 }, (_, i) => [i]);
    const { client } = createFakeClient(() => ({ address: "S!A1:A501", values: many }));
    const result = JSON.parse(
      textOf(
        await call(client, "read_excel_range", {
          file_id: "file-1",
          worksheet: "S",
          address: "A1:A501",
        }),
      ),
    );
    expect(result.rows).toHaveLength(500);
    expect(result.row_count).toBe(501);
    expect(result.truncated).toBe(true);
  });

  it("requires exactly one of table or worksheet", async () => {
    const { client, calls } = createFakeClient(workbook());
    const both = await call(client, "read_excel_range", {
      file_id: "f",
      table: "t",
      worksheet: "S",
    });
    const none = await call(client, "read_excel_range", { file_id: "f" });
    expect(both.isError).toBe(true);
    expect(none.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("persona capability", () => {
  const id = (personaKey: string): CallerIdentity => ({ personaKey, sub: personaKey });
  beforeAll(() => loadPersonaScopesFromFile("config/persona-scopes.json"));
  afterEach(() => resetLoadedPersonaScopes());

  it("drive:write persona (ferdinand) may write, drive:read persona (conny) may only read", () => {
    loadPersonaScopesFromFile("config/persona-scopes.json");
    expect(() => enforceToolCapability("write_excel_range", id("ferdinand"))).not.toThrow();
    expect(() => enforceToolCapability("add_excel_table_rows", id("conny"))).toThrow(AuthError);
    expect(() => enforceToolCapability("read_excel_range", id("conny"))).not.toThrow();
    expect(() => enforceToolCapability("read_excel_range", id("cora"))).toThrow(AuthError);
  });
});

describe("response cache", () => {
  it("every workbook GET bypasses the response cache (reads after writes must be fresh)", async () => {
    const { client, calls } = createFakeClient(workbook());
    await call(client, "add_excel_table_rows", {
      file_id: "file-1",
      table: "tblMasterdata",
      rows: [["a", "b", 1]],
      text_columns: ["POS"],
      confirm: true,
    });
    await call(client, "read_excel_range", { file_id: "file-1", table: "tblMasterdata" });
    await call(client, "list_excel_tables", { file_id: "file-1" });
    const gets = calls.filter((c) => c.method === "GET");
    expect(gets.length).toBeGreaterThanOrEqual(6);
    expect(gets.filter((c) => c.headers["Cache-Control"] !== "no-cache")).toEqual([]);
  });
});

describe("eventual consistency", () => {
  it("re-reads a table that 404s right after it was created", async () => {
    vi.useFakeTimers();
    try {
      let misses = 1;
      const { client, calls } = createFakeClient(
        workbook((_m, url) => {
          if (url.includes("/headerRowRange") && misses > 0) {
            misses--;
            throw new NotFoundError("table", "tblMasterdata");
          }
          return undefined;
        }),
      );
      const pending = call(client, "read_excel_range", {
        file_id: "file-1",
        table: "tblMasterdata",
      });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pending;
      expect(result.isError).toBeUndefined();
      expect(calls.filter((c) => c.url.includes("/headerRowRange"))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after the retries and reports the 404", async () => {
    vi.useFakeTimers();
    try {
      const { client, calls } = createFakeClient(
        workbook((_m, url) => {
          if (url.includes("/headerRowRange")) throw new NotFoundError("table", "tblNope");
          return undefined;
        }),
      );
      const pending = call(client, "read_excel_range", { file_id: "file-1", table: "tblNope" });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result.isError).toBe(true);
      expect(calls.filter((c) => c.url.includes("/headerRowRange"))).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
