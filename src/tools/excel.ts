import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type {
  AddExcelTableRowsParamsType,
  CreateExcelTableParamsType,
  ListExcelTablesParamsType,
  ReadExcelRangeParamsType,
  UpdateExcelTableRowParamsType,
  WriteExcelRangeParamsType,
} from "../schemas/excel.js";
import {
  AddExcelTableRowsParams,
  CreateExcelTableParams,
  ListExcelTablesParams,
  ReadExcelRangeParams,
  UpdateExcelTableRowParams,
  WriteExcelRangeParams,
} from "../schemas/excel.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import {
  formatErrorForUser,
  McpToolError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:excel");

const SESSION_HEADER = "workbook-session-id";
const MAX_READ_ROWS = 500;
/** Waits before re-reading a table that is not yet visible right after a write (measured: 2 of 4 reads 404'd). */
const NOT_FOUND_RETRY_MS = [1500, 3000];

type Cell = string | number | boolean | null;
type FileLocation = { user_id?: string; site_id?: string; drive_id?: string; file_id: string };

function workbookBase(p: FileLocation): string {
  const drivePath = resolveDrivePath(p.user_id, p.site_id, p.drive_id);
  return `${drivePath}/items/${encodeGraphId(p.file_id)}/workbook`;
}

const seg = (name: string): string => encodeURIComponent(name);

/** Strings starting with '=' would be stored as formulas by Excel; refuse them. */
function assertNoFormulas(rows: Cell[][]): void {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === "string" && cell.startsWith("=")) {
        throw new ValidationError("Values must not start with '=' (would become a formula).");
      }
    }
  }
}

/** Splits a Graph range address like "'My Sheet'!A3:L3" into sheet and A1 part. */
function splitAddress(address: string): { sheet: string; a1: string } {
  const bang = address.lastIndexOf("!");
  const rawSheet = address.slice(0, bang);
  const sheet = rawSheet.startsWith("'") ? rawSheet.slice(1, -1).replace(/''/g, "'") : rawSheet;
  return { sheet, a1: address.slice(bang + 1) };
}

/**
 * GET that bypasses the response cache: a PATCH only invalidates its own path,
 * so a cached table/range read would show values from before a write.
 */
function getFresh<T>(client: Client, url: string, select: string, sid?: string): Promise<T> {
  const req = client.api(url).select(select).header("Cache-Control", "no-cache");
  return (sid ? req.header(SESSION_HEADER, sid) : req).get() as Promise<T>;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "NotFoundError")
  );
}

/** Graph is eventually consistent after closeSession: a just-created table can 404 for ~1-2 s. */
async function retryNotFound<T>(fn: () => Promise<T>): Promise<T> {
  for (const delay of NOT_FOUND_RETRY_MS) {
    try {
      return await fn();
    } catch (error) {
      if (!isNotFound(error)) throw error;
      logger.info({ delay_ms: delay }, "workbook resource not found yet, retrying");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return fn();
}

/** "A2:L5" → first/last column letters and row numbers. */
function parseA1(a1: string): {
  startCol: string;
  startRow: number;
  endCol: string;
  endRow: number;
} {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(a1);
  if (!m?.[1] || !m[2])
    throw new McpToolError(`Unexpected range address '${a1}'.`, "GRAPH_API_ERROR", 502);
  return {
    startCol: m[1],
    startRow: Number(m[2]),
    endCol: m[3] ?? m[1],
    endRow: Number(m[4] ?? m[2]),
  };
}

/**
 * Runs `fn` inside a persisted workbook session and always closes it. Writes in
 * one session are applied together and do not touch the cached values of other
 * formulas in the workbook (unlike re-saving the file with a library).
 */
async function withSession<T>(
  client: Client,
  base: string,
  fn: (sid: string) => Promise<T>,
): Promise<T> {
  const session = (await client.api(`${base}/createSession`).post({ persistChanges: true })) as {
    id?: string;
  };
  const sid = session.id;
  if (!sid)
    throw new McpToolError("Workbook session could not be created.", "GRAPH_API_ERROR", 502);
  try {
    return await fn(sid);
  } finally {
    try {
      await client.api(`${base}/closeSession`).header(SESSION_HEADER, sid).post({});
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.name : "unknown" }, "closeSession failed");
    }
  }
}

async function getTableHeaders(
  client: Client,
  base: string,
  table: string,
  sid: string,
): Promise<string[]> {
  const res = await retryNotFound(() =>
    getFresh<{ values?: Cell[][] }>(
      client,
      `${base}/tables/${seg(table)}/headerRowRange`,
      "values",
      sid,
    ),
  );
  return (res.values?.[0] ?? []).map((v) => String(v ?? ""));
}

function resolveTextColumns(headers: string[], textColumns: string[] | undefined): number[] {
  if (!textColumns?.length) return [];
  return textColumns.map((name) => {
    const idx = headers.indexOf(name);
    if (idx < 0) throw new ValidationError(`text_columns: unknown column '${name}'.`);
    return idx;
  });
}

function assertRowWidth(rows: Cell[][], width: number): void {
  for (const row of rows) {
    if (row.length !== width) {
      throw new ValidationError(
        `Each row needs ${width} values (table columns), got ${row.length}.`,
      );
    }
  }
}

/**
 * Writes `values` into one table row. The row address is derived from the
 * table's data body (Graph rejects GET rows/itemAt(...)/range with 400). Text
 * columns are formatted as text ('@') first and the values written afterwards,
 * so '0001' stays '0001'.
 */
async function writeTableRow(
  client: Client,
  base: string,
  table: string,
  index: number,
  values: Cell[],
  textIdx: number[],
  sid: string,
): Promise<void> {
  const body = await getFresh<{ address?: string }>(
    client,
    `${base}/tables/${seg(table)}/dataBodyRange`,
    "address",
    sid,
  );
  if (!body.address) throw new McpToolError("Table has no data range.", "GRAPH_API_ERROR", 502);
  const { sheet, a1 } = splitAddress(body.address);
  const r = parseA1(a1);
  const row = r.startRow + index;
  if (row > r.endRow) {
    throw new ValidationError(
      `Row index ${index} is outside the table (${r.endRow - r.startRow + 1} data rows).`,
    );
  }
  const rangeUrl = `${base}/worksheets/${seg(sheet)}/range(address='${r.startCol}${row}:${r.endCol}${row}')`;
  if (textIdx.length > 0) {
    const current = await getFresh<{ numberFormat?: string[][] }>(
      client,
      rangeUrl,
      "numberFormat",
      sid,
    );
    const formats = [...(current.numberFormat?.[0] ?? values.map(() => "General"))];
    for (const i of textIdx) formats[i] = "@";
    await client
      .api(rangeUrl)
      .header(SESSION_HEADER, sid)
      .patch({ numberFormat: [formats] });
  }
  await client
    .api(rangeUrl)
    .header(SESSION_HEADER, sid)
    .patch({ values: [values] });
}

function text(result: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

function errorResult(tool: string, error: McpToolError, startTime: number): ToolResult {
  logger.warn(
    { tool, status: error.httpStatus, code: error.code, duration_ms: Date.now() - startTime },
    `${tool} failed`,
  );
  return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
}

/** Shared confirm → idempotency → execute → cache flow of the write tools. */
async function runWrite(
  tool: string,
  parsed: { confirm: boolean; idempotency_key?: string; user_id?: string },
  preview: Record<string, unknown>,
  exec: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const check = checkConfirmation("destructive", parsed.confirm, formatPreview(tool, preview));
  if (check) return { content: [{ type: "text", text: check.message }] };
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get(tool, parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }
  const result = await exec();
  if (parsed.idempotency_key) {
    idempotencyCache.set(tool, parsed.idempotency_key, result, parsed.user_id);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function listTables(client: Client, p: ListExcelTablesParamsType): Promise<ToolResult> {
  const base = workbookBase(p);
  const sheets = await getFresh<{ value?: { name?: string }[] }>(
    client,
    `${base}/worksheets`,
    "name",
  );
  const tables = await getFresh<{ value?: { name?: string }[] }>(client, `${base}/tables`, "name");
  return text({
    worksheets: (sheets.value ?? []).map((s) => s.name),
    tables: (tables.value ?? []).map((t) => t.name),
  });
}

async function readRange(client: Client, p: ReadExcelRangeParamsType): Promise<ToolResult> {
  if ((p.table === undefined) === (p.worksheet === undefined)) {
    throw new ValidationError("Provide exactly one of 'table' or 'worksheet'.");
  }
  if (p.address !== undefined && p.worksheet === undefined) {
    throw new ValidationError("'address' is only valid together with 'worksheet'.");
  }
  const base = workbookBase(p);
  const field = p.as_text ? "text" : "values";
  let url: string;
  let columns: string[] | undefined;
  if (p.table !== undefined) {
    const table = p.table;
    const header = await retryNotFound(() =>
      getFresh<{ values?: Cell[][] }>(
        client,
        `${base}/tables/${seg(table)}/headerRowRange`,
        "values",
      ),
    );
    columns = (header.values?.[0] ?? []).map((v) => String(v ?? ""));
    url = `${base}/tables/${seg(table)}/dataBodyRange`;
  } else {
    const ws = `${base}/worksheets/${seg(p.worksheet ?? "")}`;
    url = p.address ? `${ws}/range(address='${p.address}')` : `${ws}/usedRange(valuesOnly=true)`;
  }
  const res = await retryNotFound(() =>
    getFresh<Record<string, unknown>>(client, url, `address,${field}`),
  );
  const all = (res[field] as Cell[][] | undefined) ?? [];
  const rows = all.slice(0, MAX_READ_ROWS);
  return text({
    address: res.address,
    ...(columns ? { columns } : {}),
    row_count: all.length,
    rows,
    ...(all.length > MAX_READ_ROWS
      ? { truncated: true, hint: `Only the first ${MAX_READ_ROWS} rows; pass a smaller 'address'.` }
      : {}),
  });
}

async function createTable(client: Client, p: CreateExcelTableParamsType): Promise<ToolResult> {
  assertNoFormulas([p.headers]);
  const base = workbookBase(p);
  return withSession(client, base, async (sid) => {
    const sheets = await getFresh<{ value?: { name?: string }[] }>(
      client,
      `${base}/worksheets`,
      "name",
      sid,
    );
    const exists = (sheets.value ?? []).some((s) => s.name === p.worksheet);
    if (!exists) {
      await client
        .api(`${base}/worksheets/add`)
        .header(SESSION_HEADER, sid)
        .post({ name: p.worksheet });
    }
    const lastCol = columnLetter(p.headers.length - 1);
    const headerRange = `A1:${lastCol}1`;
    const ws = `${base}/worksheets/${seg(p.worksheet)}`;
    const headerUrl = `${ws}/range(address='${headerRange}')`;
    await client
      .api(headerUrl)
      .header(SESSION_HEADER, sid)
      .patch({ numberFormat: [p.headers.map(() => "@")] });
    await client
      .api(headerUrl)
      .header(SESSION_HEADER, sid)
      .patch({ values: [p.headers] });
    const created = (await client
      .api(`${base}/tables/add`)
      .header(SESSION_HEADER, sid)
      .post({ address: `'${p.worksheet}'!${headerRange}`, hasHeaders: true })) as { id?: string };
    if (!created.id) throw new McpToolError("Table could not be created.", "GRAPH_API_ERROR", 502);
    await client
      .api(`${base}/tables/${seg(created.id)}`)
      .header(SESSION_HEADER, sid)
      .patch({ name: p.name });
    return text({
      table: p.name,
      worksheet: p.worksheet,
      worksheet_created: !exists,
      columns: p.headers,
    });
  });
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

async function addRows(client: Client, p: AddExcelTableRowsParamsType): Promise<ToolResult> {
  assertNoFormulas(p.rows);
  const base = workbookBase(p);
  return withSession(client, base, async (sid) => {
    const headers = await getTableHeaders(client, base, p.table, sid);
    assertRowWidth(p.rows, headers.length);
    const textIdx = resolveTextColumns(headers, p.text_columns);
    // A table created from a header-only range carries one empty data row;
    // the first new row fills it instead of being appended after it.
    const body = await getFresh<{ values?: Cell[][] }>(
      client,
      `${base}/tables/${seg(p.table)}/dataBodyRange`,
      "values",
      sid,
    );
    const bodyRows = body.values ?? [];
    let next = bodyRows.length;
    const placeholder =
      bodyRows.length === 1 && (bodyRows[0] ?? []).every((v) => v === "" || v === null);
    const indexes: number[] = [];
    for (const [i, row] of p.rows.entries()) {
      const fillPlaceholder = i === 0 && placeholder;
      let index: number;
      if (fillPlaceholder) {
        index = 0;
      } else {
        const blanked = row.map((v, c) => (textIdx.includes(c) ? null : v));
        const added = (await client
          .api(`${base}/tables/${seg(p.table)}/rows/add`)
          .header(SESSION_HEADER, sid)
          .post({ values: [blanked] })) as { index?: number };
        index = added.index ?? next;
        next = index + 1;
      }
      if (fillPlaceholder || textIdx.length > 0) {
        await writeTableRow(client, base, p.table, index, row, textIdx, sid);
      }
      indexes.push(index);
    }
    return text({ table: p.table, added: p.rows.length, indexes });
  });
}

async function updateRow(client: Client, p: UpdateExcelTableRowParamsType): Promise<ToolResult> {
  assertNoFormulas([p.values]);
  const base = workbookBase(p);
  return withSession(client, base, async (sid) => {
    const headers = await getTableHeaders(client, base, p.table, sid);
    assertRowWidth([p.values], headers.length);
    const textIdx = resolveTextColumns(headers, p.text_columns);
    await writeTableRow(client, base, p.table, p.index, p.values, textIdx, sid);
    return text({ table: p.table, updated_index: p.index });
  });
}

async function writeRange(client: Client, p: WriteExcelRangeParamsType): Promise<ToolResult> {
  assertNoFormulas(p.values);
  const width = p.values[0]?.length ?? 0;
  if (p.values.some((r) => r.length !== width)) {
    throw new ValidationError("All rows in 'values' must have the same length.");
  }
  const base = workbookBase(p);
  const url = `${base}/worksheets/${seg(p.worksheet)}/range(address='${p.address}')`;
  return withSession(client, base, async (sid) => {
    if (p.as_text) {
      await client
        .api(url)
        .header(SESSION_HEADER, sid)
        .patch({ numberFormat: p.values.map((r) => r.map(() => "@")) });
    }
    const res = (await client.api(url).header(SESSION_HEADER, sid).patch({ values: p.values })) as {
      address?: string;
    };
    return text({ written: res.address ?? `${p.worksheet}!${p.address}` });
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerExcelTools(server: McpServer, graphClient: Client, _config: Config): void {
  const wrap =
    <T>(tool: string, parse: (x: unknown) => T, run: (p: T) => Promise<ToolResult>) =>
    async (params: unknown): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const result = await run(parse(params));
        logger.info(
          { tool, status: 200, duration_ms: Date.now() - startTime },
          `${tool} completed`,
        );
        return result;
      } catch (error) {
        if (error instanceof McpToolError) return errorResult(tool, error, startTime);
        throw error;
      }
    };

  server.tool(
    "list_excel_tables",
    "List the worksheets and named tables of an .xlsx file in OneDrive/SharePoint.",
    ListExcelTablesParams.shape,
    wrap(
      "list_excel_tables",
      (x) => ListExcelTablesParams.parse(x),
      (p) => listTables(graphClient, p),
    ),
  );

  server.tool(
    "read_excel_range",
    "Read cell values of an .xlsx file: either a named table (columns + data rows, row position = index for update_excel_table_row) or a worksheet range (default: used range). Max 500 rows per call.",
    ReadExcelRangeParams.shape,
    wrap(
      "read_excel_range",
      (x) => ReadExcelRangeParams.parse(x),
      (p) => readRange(graphClient, p),
    ),
  );

  server.tool(
    "create_excel_table",
    "Create a named table with the given headers in row 1 of a worksheet (worksheet is created if missing). Writes in place through the Excel API, other sheets and formulas stay untouched. Requires confirm=true, otherwise returns a preview.",
    CreateExcelTableParams.shape,
    wrap(
      "create_excel_table",
      (x) => CreateExcelTableParams.parse(x),
      (p) =>
        runWrite(
          "create_excel_table",
          p,
          { File: p.file_id, Worksheet: p.worksheet, Table: p.name, Columns: p.headers.length },
          () => createTable(graphClient, p),
        ),
    ),
  );

  server.tool(
    "add_excel_table_rows",
    "Append rows to a named table in an .xlsx file. Use text_columns for codes with leading zeros. Values starting with '=' are rejected. Requires confirm=true, otherwise returns a preview.",
    AddExcelTableRowsParams.shape,
    wrap(
      "add_excel_table_rows",
      (x) => AddExcelTableRowsParams.parse(x),
      (p) =>
        runWrite(
          "add_excel_table_rows",
          p,
          { File: p.file_id, Table: p.table, Rows: p.rows.length },
          () => addRows(graphClient, p),
        ),
    ),
  );

  server.tool(
    "update_excel_table_row",
    "Overwrite one data row of a named table (0-based index; null keeps a cell). Values starting with '=' are rejected. Requires confirm=true, otherwise returns a preview.",
    UpdateExcelTableRowParams.shape,
    wrap(
      "update_excel_table_row",
      (x) => UpdateExcelTableRowParams.parse(x),
      (p) =>
        runWrite(
          "update_excel_table_row",
          p,
          { File: p.file_id, Table: p.table, Index: p.index },
          () => updateRow(graphClient, p),
        ),
    ),
  );

  server.tool(
    "write_excel_range",
    "Write values into a worksheet range of an .xlsx file in place (null keeps a cell; as_text keeps leading zeros). Values starting with '=' are rejected. Requires confirm=true, otherwise returns a preview.",
    WriteExcelRangeParams.shape,
    wrap(
      "write_excel_range",
      (x) => WriteExcelRangeParams.parse(x),
      (p) =>
        runWrite(
          "write_excel_range",
          p,
          { File: p.file_id, Worksheet: p.worksheet, Address: p.address },
          () => writeRange(graphClient, p),
        ),
    ),
  );
}
