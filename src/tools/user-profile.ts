import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { GetManagerParams, GetMyProfileParams, GetUserParams } from "../schemas/user.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:user-profile");

function formatPhoneLines(user: Record<string, unknown>, lines: string[]): void {
  if (user.mobilePhone || (Array.isArray(user.businessPhones) && user.businessPhones.length > 0)) {
    const phones: string[] = [];
    if (user.mobilePhone) phones.push(`Mobile: ${user.mobilePhone}`);
    if (Array.isArray(user.businessPhones) && user.businessPhones.length > 0) {
      phones.push(`Business: ${user.businessPhones.join(", ")}`);
    }
    lines.push(phones.join(" | "));
  }
}

function formatLocationLine(user: Record<string, unknown>, lines: string[]): void {
  if (user.city || user.state || user.country) {
    const location: string[] = [];
    if (user.city) location.push(String(user.city));
    if (user.state) location.push(String(user.state));
    if (user.country) location.push(String(user.country));
    lines.push(`Location: ${location.join(", ")}`);
  }
}

function formatUserProfile(user: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Name: ${user.displayName ?? "(no name)"}`);
  if (user.mail) lines.push(`Email: ${user.mail}`);
  if (user.userPrincipalName) lines.push(`UPN: ${user.userPrincipalName}`);
  if (user.jobTitle) lines.push(`Job Title: ${user.jobTitle}`);
  if (user.department) lines.push(`Department: ${user.department}`);
  if (user.officeLocation) lines.push(`Office: ${user.officeLocation}`);
  if (user.companyName) lines.push(`Company: ${user.companyName}`);

  formatPhoneLines(user, lines);
  formatLocationLine(user, lines);

  if (user.preferredLanguage) lines.push(`Language: ${user.preferredLanguage}`);
  if (user.employeeId) lines.push(`Employee ID: ${user.employeeId}`);
  if (typeof user.accountEnabled === "boolean") {
    lines.push(`Account Status: ${user.accountEnabled ? "Enabled" : "Disabled"}`);
  }

  lines.push(`ID: ${user.id ?? ""}`);
  return lines.join("\n");
}

function formatUserSummary(user: Record<string, unknown>): string {
  const name = String(user.displayName ?? "(no name)");
  const email = user.mail ? ` (${user.mail})` : "";
  const title = user.jobTitle ? ` - ${user.jobTitle}` : "";
  const dept = user.department ? ` [${user.department}]` : "";
  const id = String(user.id ?? "");
  return `${name}${email}${title}${dept}\n  ID: ${id}`;
}

export function registerUserProfileTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "get_my_profile",
    "Get the current user's full profile including contact info, job title, department, and location.",
    GetMyProfileParams.shape,
    async (params) => {
      try {
        const parsed = GetMyProfileParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const user = (await graphClient
          .api(userPath)
          .select(buildSelectParam(DEFAULT_SELECT.userDetail))
          .get()) as Record<string, unknown>;

        const text = formatUserProfile(user);
        logger.info({ tool: "get_my_profile" }, "get_my_profile completed");
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
    "get_user",
    "Get detailed profile information for a specific user by ID or email (UPN). Returns job title, department, contact info, and location.",
    GetUserParams.shape,
    async (params) => {
      try {
        const parsed = GetUserParams.parse(params);
        const encodedUserId = encodeGraphId(parsed.user_id);
        const url = `/users/${encodedUserId}`;

        const user = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.userDetail))
          .get()) as Record<string, unknown>;

        const text = formatUserProfile(user);
        logger.info({ tool: "get_user" }, "get_user completed");
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
    "get_manager",
    "Get the manager of a user. Returns manager's name, email, job title, and department.",
    GetManagerParams.shape,
    async (params) => {
      try {
        const parsed = GetManagerParams.parse(params);
        const basePath = parsed.user_id
          ? `/users/${encodeGraphId(parsed.user_id)}`
          : resolveUserPath(undefined);
        const url = `${basePath}/manager`;

        const manager = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.user))
          .get()) as Record<string, unknown>;

        const text = formatUserSummary(manager);
        logger.info({ tool: "get_manager" }, "get_manager completed");
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
