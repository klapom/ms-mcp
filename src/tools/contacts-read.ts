import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import {
  GetContactParams,
  ListContactFoldersParams,
  ListContactsParams,
} from "../schemas/contacts.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:contacts-read");

function formatContactSummary(c: Record<string, unknown>): string {
  const name = String(c.displayName ?? "(unnamed)");
  const company = typeof c.companyName === "string" && c.companyName ? ` | ${c.companyName}` : "";
  const phones =
    Array.isArray(c.businessPhones) && c.businessPhones.length > 0
      ? ` | ${c.businessPhones[0]}`
      : "";
  const emails = formatEmailList(c.emailAddresses);
  const emailStr = emails ? ` | ${emails}` : "";
  const id = String(c.id ?? "");
  return `${name}${emailStr}${company}${phones}\n  ID: ${id}`;
}

function formatEmailList(addresses: unknown): string {
  if (!Array.isArray(addresses)) return "";
  return addresses
    .filter(isRecordObject)
    .map((e) => String(e.address ?? ""))
    .filter(Boolean)
    .join(", ");
}

function formatContactPhones(c: Record<string, unknown>, lines: string[]): void {
  if (Array.isArray(c.businessPhones) && c.businessPhones.length > 0)
    lines.push(`Business phones: ${c.businessPhones.join(", ")}`);
  if (Array.isArray(c.homePhones) && c.homePhones.length > 0)
    lines.push(`Home phones: ${c.homePhones.join(", ")}`);
  if (c.mobilePhone) lines.push(`Mobile: ${c.mobilePhone}`);
}

function formatContactWork(c: Record<string, unknown>, lines: string[]): void {
  if (c.companyName) lines.push(`Company: ${c.companyName}`);
  if (c.jobTitle) lines.push(`Job title: ${c.jobTitle}`);
  if (c.department) lines.push(`Department: ${c.department}`);
  if (c.officeLocation) lines.push(`Office: ${c.officeLocation}`);
}

function formatContactDetail(c: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Name: ${String(c.displayName ?? "(unnamed)")}`);
  if (c.givenName) lines.push(`First name: ${c.givenName}`);
  if (c.surname) lines.push(`Last name: ${c.surname}`);

  const emails = formatEmailList(c.emailAddresses);
  if (emails) lines.push(`Email: ${emails}`);

  formatContactPhones(c, lines);
  formatContactWork(c, lines);

  const bizAddr = formatAddress(c.businessAddress);
  if (bizAddr) lines.push(`Business address: ${bizAddr}`);
  const homeAddr = formatAddress(c.homeAddress);
  if (homeAddr) lines.push(`Home address: ${homeAddr}`);

  if (c.birthday) lines.push(`Birthday: ${c.birthday}`);
  if (Array.isArray(c.categories) && c.categories.length > 0)
    lines.push(`Categories: ${c.categories.join(", ")}`);
  if (c.personalNotes) lines.push(`Notes: ${c.personalNotes}`);

  lines.push(`ID: ${String(c.id ?? "")}`);
  return lines.join("\n");
}

function formatAddress(addr: unknown): string {
  if (!isRecordObject(addr)) return "";
  const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.countryOrRegion]
    .filter((p) => typeof p === "string" && p)
    .join(", ");
  return parts;
}

function formatFolderSummary(f: Record<string, unknown>): string {
  const name = String(f.displayName ?? "(unnamed)");
  const id = String(f.id ?? "");
  return `${name} | ID: ${id}`;
}

export function registerContactsReadTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_contacts",
    "List contacts from Outlook. Returns name, email, phone, and company. Supports $filter, $orderby, and pagination. Use folder_id for a specific contact folder.",
    ListContactsParams.shape,
    async (params) => {
      try {
        const parsed = ListContactsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = parsed.folder_id
          ? `${userPath}/contactFolders/${encodeGraphId(parsed.folder_id)}/contacts`
          : `${userPath}/contacts`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.contact),
          filter: parsed.filter,
          orderby: parsed.orderby,
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No contacts found."
            : [...items.map(formatContactSummary), "", paginationHint].join("\n");

        logger.info({ tool: "list_contacts", count: items.length }, "list_contacts completed");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
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
    "get_contact",
    "Get full details of a single contact including all addresses, phones, notes, and categories.",
    GetContactParams.shape,
    async (params) => {
      try {
        const parsed = GetContactParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/contacts/${encodeGraphId(parsed.contact_id)}`;

        const contact = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.contactDetail))
          .get()) as Record<string, unknown>;

        const text = formatContactDetail(contact);
        logger.info({ tool: "get_contact" }, "get_contact completed");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
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
    "list_contact_folders",
    "List all contact folders in the mailbox. Returns folder name and ID.",
    ListContactFoldersParams.shape,
    async (params) => {
      try {
        const parsed = ListContactFoldersParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/contactFolders`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.contactFolder),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No contact folders found."
            : [...items.map(formatFolderSummary), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_contact_folders", count: items.length },
          "list_contact_folders completed",
        );
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
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
