import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type {
  CreateContactParamsType,
  DeleteContactParamsType,
  UpdateContactParamsType,
} from "../schemas/contacts.js";
import {
  CreateContactParams,
  DeleteContactParams,
  UpdateContactParams,
} from "../schemas/contacts.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:contacts-write");

const UPDATABLE_FIELDS = [
  "given_name",
  "surname",
  "display_name",
  "email_addresses",
  "business_phones",
  "mobile_phone",
  "company_name",
  "job_title",
  "department",
  "office_location",
  "business_address",
  "home_address",
  "birthday",
  "personal_notes",
  "categories",
] as const;

function buildContactBody(
  parsed: CreateContactParamsType | UpdateContactParamsType,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (parsed.given_name !== undefined) body.givenName = parsed.given_name;
  if (parsed.surname !== undefined) body.surname = parsed.surname;
  if (parsed.display_name !== undefined) body.displayName = parsed.display_name;
  if (parsed.email_addresses !== undefined) {
    body.emailAddresses = parsed.email_addresses.map((e) => ({
      name: e.name ?? e.address,
      address: e.address,
    }));
  }
  if (parsed.business_phones !== undefined) body.businessPhones = parsed.business_phones;
  if (parsed.mobile_phone !== undefined) body.mobilePhone = parsed.mobile_phone;
  if (parsed.company_name !== undefined) body.companyName = parsed.company_name;
  if (parsed.job_title !== undefined) body.jobTitle = parsed.job_title;
  if (parsed.department !== undefined) body.department = parsed.department;
  if (parsed.office_location !== undefined) body.officeLocation = parsed.office_location;
  if (parsed.business_address !== undefined) body.businessAddress = parsed.business_address;
  if (parsed.home_address !== undefined) body.homeAddress = parsed.home_address;
  if (parsed.birthday !== undefined) body.birthday = parsed.birthday;
  if (parsed.personal_notes !== undefined) body.personalNotes = parsed.personal_notes;
  if (parsed.categories !== undefined) body.categories = parsed.categories;
  return body;
}

function buildCreatePreview(parsed: CreateContactParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create contact", {
      "Display name": parsed.display_name,
      "Given name": parsed.given_name,
      Surname: parsed.surname,
      Email: parsed.email_addresses?.map((e) => e.address).join(", "),
      Company: parsed.company_name,
      "Job title": parsed.job_title,
    }),
  );
  if (preview) return { content: [{ type: "text", text: preview.message }] };
  return null;
}

async function executeCreate(
  graphClient: Client,
  parsed: CreateContactParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/contacts`;
  const requestBody = buildContactBody(parsed);

  const result = (await graphClient.api(url).post(requestBody)) as Record<string, unknown>;

  logger.info(
    { tool: "create_contact", status: 201, duration_ms: Date.now() - startTime },
    "create_contact completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Contact created successfully.\n\nID: ${result.id}\nDisplay name: ${result.displayName ?? "(none)"}`,
      },
    ],
  };
}

async function buildUpdatePreview(
  graphClient: Client,
  parsed: UpdateContactParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = `${userPath}/contacts/${encodeGraphId(parsed.contact_id)}`;
  const current = (await graphClient
    .api(url)
    .select(buildSelectParam(DEFAULT_SELECT.contact))
    .get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    "Contact ID": parsed.contact_id,
    "Current name": current.displayName,
  };
  if (parsed.display_name !== undefined) details["New display name"] = parsed.display_name;
  if (parsed.given_name !== undefined) details["New given name"] = parsed.given_name;
  if (parsed.surname !== undefined) details["New surname"] = parsed.surname;
  if (parsed.email_addresses !== undefined)
    details["New emails"] = parsed.email_addresses.map((e) => e.address).join(", ");
  if (parsed.company_name !== undefined) details["New company"] = parsed.company_name;
  if (parsed.job_title !== undefined) details["New job title"] = parsed.job_title;

  return { content: [{ type: "text", text: formatPreview("Update contact", details) }] };
}

async function executeUpdate(
  graphClient: Client,
  parsed: UpdateContactParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = `${userPath}/contacts/${encodeGraphId(parsed.contact_id)}`;
  const patchBody = buildContactBody(parsed);

  const result = (await graphClient.api(url).patch(patchBody)) as Record<string, unknown>;

  logger.info(
    {
      tool: "update_contact",
      fieldCount: Object.keys(patchBody).length,
      status: 200,
      duration_ms: Date.now() - startTime,
    },
    "update_contact completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Contact updated successfully.\n\nDisplay name: ${result.displayName ?? "(none)"}\nFields changed: ${Object.keys(patchBody).length}`,
      },
    ],
  };
}

async function buildDeletePreview(
  graphClient: Client,
  parsed: DeleteContactParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = `${userPath}/contacts/${encodeGraphId(parsed.contact_id)}`;
  const current = (await graphClient
    .api(url)
    .select(buildSelectParam(DEFAULT_SELECT.contact))
    .get()) as Record<string, unknown>;

  const emails = Array.isArray(current.emailAddresses)
    ? current.emailAddresses
        .filter(isRecordObject)
        .map((e) => String(e.address ?? ""))
        .filter(Boolean)
        .join(", ")
    : "";

  return {
    content: [
      {
        type: "text",
        text: formatPreview("Delete contact", {
          "Display name": current.displayName,
          Email: emails || undefined,
        }),
      },
    ],
  };
}

async function executeDelete(
  graphClient: Client,
  parsed: DeleteContactParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = `${userPath}/contacts/${encodeGraphId(parsed.contact_id)}`;
  await graphClient.api(url).delete();

  logger.info(
    { tool: "delete_contact", status: 204, duration_ms: Date.now() - startTime },
    "delete_contact completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Contact deleted successfully.\n\nContact ID: ${parsed.contact_id}\nTimestamp: ${new Date().toISOString()}`,
      },
    ],
  };
}

async function handleUpdateConfirmed(
  graphClient: Client,
  parsed: UpdateContactParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("update_contact", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeUpdate(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("update_contact", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

async function handleDeleteConfirmed(
  graphClient: Client,
  parsed: DeleteContactParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("delete_contact", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeDelete(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("delete_contact", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

export function registerContactsWriteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_contact",
    "Create a new Outlook contact. Requires confirm=true to actually create — without it, returns a preview. Supports name, email, phone, company, address, and more. Use idempotency_key to prevent duplicate creates.",
    CreateContactParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateContactParams.parse(params);

        const previewResult = buildCreatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_contact",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_contact", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_contact",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_contact failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "update_contact",
    "Update an existing Outlook contact. Requires confirm=true to actually update — without it, fetches the current contact and returns a preview. At least one updatable field must be provided. Use idempotency_key to prevent duplicate updates.",
    UpdateContactParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateContactParams.parse(params);

        if (!UPDATABLE_FIELDS.some((f) => parsed[f] !== undefined)) {
          throw new ValidationError("At least one updatable field must be provided.");
        }

        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildUpdatePreview(graphClient, parsed, userPath);
        }

        return await handleUpdateConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "update_contact",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "update_contact failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "delete_contact",
    "Delete an Outlook contact. Requires confirm=true to actually delete — without it, fetches the contact and returns a preview. Use idempotency_key to prevent duplicate deletes.",
    DeleteContactParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = DeleteContactParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildDeletePreview(graphClient, parsed, userPath);
        }

        return await handleDeleteConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "delete_contact",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "delete_contact failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );
}
