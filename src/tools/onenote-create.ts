import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { CreatePageParamsType } from "../schemas/onenote.js";
import { CreatePageParams } from "../schemas/onenote.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:onenote-create");

function buildPageHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
  </head>
  <body>
    ${content}
  </body>
</html>`;
}

function buildPagePreview(parsed: CreatePageParamsType): ToolResult | null {
  const contentPreview = parsed.content.slice(0, 100) + (parsed.content.length > 100 ? "…" : "");
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create OneNote page", {
      "Section ID": parsed.section_id,
      Title: parsed.title,
      "Content excerpt": contentPreview,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function handleCreatePage(
  graphClient: Client,
  parsed: CreatePageParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/onenote/sections/${encodeGraphId(parsed.section_id)}/pages`;

  const pageHtml = buildPageHtml(parsed.title, parsed.content);

  const result = (await graphClient
    .api(url)
    .header("Content-Type", "text/html")
    .post(pageHtml)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "create_page",
      sectionId: parsed.section_id,
      status: 201,
      duration_ms: endTime - startTime,
    },
    "create_page completed",
  );

  const pageId = String(result.id ?? "");
  const contentUrl = String(result.contentUrl ?? "");
  const resultTitle = String(result.title ?? parsed.title);

  return {
    content: [
      {
        type: "text",
        text: `OneNote page created successfully.\n\nPage ID: ${pageId}\nTitle: ${resultTitle}\nContent URL: ${contentUrl}`,
      },
    ],
  };
}

export function registerOneNoteCreateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_page",
    "Create a new OneNote page in a section. Requires confirm=true to actually create — without it, returns a preview. Content will be wrapped in proper OneNote HTML structure. Use idempotency_key to prevent duplicate creates.",
    CreatePageParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreatePageParams.parse(params);

        const previewResult = buildPagePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_page",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await handleCreatePage(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_page", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_page",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_page failed",
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
