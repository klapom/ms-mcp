import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

const fileLocationFields = {
  file_id: z.string().min(1).describe("ID of the .xlsx file in OneDrive/SharePoint."),
  site_id: z
    .string()
    .min(1)
    .optional()
    .describe("SharePoint site ID. Use with drive_id to access a SharePoint document library."),
  drive_id: z
    .string()
    .min(1)
    .optional()
    .describe("Drive ID within a SharePoint site. Use with site_id."),
};

/** A single cell value. `null` in a write leaves the existing cell unchanged (Graph semantics). */
const CellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const CellRow = z.array(CellValue).min(1);

/** A1 range without sheet prefix, e.g. 'A1:L3' or 'F12'. */
const A1Address = z
  .string()
  .regex(
    /^\$?[A-Z]{1,3}\$?[0-9]{1,7}(:\$?[A-Z]{1,3}\$?[0-9]{1,7})?$/,
    "Expected an A1 address like 'A1:C3'.",
  );

/** Excel table names: letter/underscore first, then letters, digits, underscores, dots. */
const TableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]{0,254}$/, "Invalid Excel table name.");

const WorksheetName = z
  .string()
  .min(1)
  .max(31)
  .regex(/^[^\\/?*[\]:']+$/, "Invalid worksheet name.");

const textColumnsField = z
  .array(z.string().min(1))
  .optional()
  .describe(
    "Table column names whose cells must be stored as text (e.g. order line '0001', item '010'). " +
      "Without this, Excel turns '0001' into the number 1.",
  );

// ---------------------------------------------------------------------------
// list_excel_tables
// ---------------------------------------------------------------------------

export const ListExcelTablesParams = BaseParams.extend({ ...fileLocationFields });
export type ListExcelTablesParamsType = z.infer<typeof ListExcelTablesParams>;

// ---------------------------------------------------------------------------
// read_excel_range
// ---------------------------------------------------------------------------

export const ReadExcelRangeParams = BaseParams.extend({
  ...fileLocationFields,
  table: TableName.optional().describe(
    "Table to read (header + data rows). Mutually exclusive with worksheet.",
  ),
  worksheet: WorksheetName.optional().describe("Worksheet to read. Mutually exclusive with table."),
  address: A1Address.optional().describe(
    "Range within the worksheet (e.g. 'A1:I200'). Default: the used range. Only with worksheet.",
  ),
  as_text: z
    .boolean()
    .default(false)
    .describe(
      "Return the displayed text instead of raw values (dates then read '01.10.2026' instead of 46296).",
    ),
});
// table/worksheet exclusivity is checked in the handler (a .refine() would hide `.shape`).
export type ReadExcelRangeParamsType = z.infer<typeof ReadExcelRangeParams>;

// ---------------------------------------------------------------------------
// create_excel_table
// ---------------------------------------------------------------------------

export const CreateExcelTableParams = WriteParams.extend({
  ...fileLocationFields,
  worksheet: WorksheetName.describe("Worksheet for the table. Created if it does not exist."),
  name: TableName.describe("Name of the new table (e.g. 'tblMasterdata')."),
  headers: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe("Column headers, written to row 1 from column A."),
});
export type CreateExcelTableParamsType = z.infer<typeof CreateExcelTableParams>;

// ---------------------------------------------------------------------------
// add_excel_table_rows
// ---------------------------------------------------------------------------

export const AddExcelTableRowsParams = WriteParams.extend({
  ...fileLocationFields,
  table: TableName.describe("Table to append to."),
  rows: z
    .array(CellRow)
    .min(1)
    .max(50)
    .describe("Rows to append; each row must have one value per table column."),
  text_columns: textColumnsField,
});
export type AddExcelTableRowsParamsType = z.infer<typeof AddExcelTableRowsParams>;

// ---------------------------------------------------------------------------
// update_excel_table_row
// ---------------------------------------------------------------------------

export const UpdateExcelTableRowParams = WriteParams.extend({
  ...fileLocationFields,
  table: TableName.describe("Table containing the row."),
  index: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based data row index (as returned by read_excel_range)."),
  values: CellRow.describe("One value per table column; null leaves that cell unchanged."),
  text_columns: textColumnsField,
});
export type UpdateExcelTableRowParamsType = z.infer<typeof UpdateExcelTableRowParams>;

// ---------------------------------------------------------------------------
// write_excel_range
// ---------------------------------------------------------------------------

export const WriteExcelRangeParams = WriteParams.extend({
  ...fileLocationFields,
  worksheet: WorksheetName.describe("Worksheet to write to."),
  address: A1Address.describe("Target range (e.g. 'F120:G120'); must match the shape of values."),
  values: z.array(CellRow).min(1).max(200).describe("2-D values; null leaves that cell unchanged."),
  as_text: z
    .boolean()
    .default(false)
    .describe("Format the whole range as text before writing (keeps leading zeros)."),
});
export type WriteExcelRangeParamsType = z.infer<typeof WriteExcelRangeParams>;
