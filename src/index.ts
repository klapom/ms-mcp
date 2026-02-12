import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type GraphClientDeps, getGraphClient } from "./auth/graph-client.js";
import { MsalClient } from "./auth/msal-client.js";
import { createCachePlugin } from "./auth/token-cache.js";
import { type Config, loadConfig } from "./config.js";
import { registerMailAttachmentTools } from "./tools/mail-attachments.js";
import { registerMailFolderTools } from "./tools/mail-folders.js";
import { registerMailForwardTools } from "./tools/mail-forward.js";
import { registerMailMoveTools } from "./tools/mail-move.js";
import { registerMailReadTools } from "./tools/mail-read.js";
import { registerMailReplyTools } from "./tools/mail-reply.js";
import { registerMailSearchTools } from "./tools/mail-search.js";
import { registerMailSendTools } from "./tools/mail-send.js";
import { registerMailTools } from "./tools/mail.js";
import type { ToolRegistrationFn } from "./types/tools.js";
import { createLogger } from "./utils/logger.js";
import { resolveTildePath } from "./utils/path.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "pommer-m365-mcp",
  version: "0.0.1",
});

/**
 * Creates the default GraphClientDeps using MSAL Device Code Flow
 * with persistent token cache for cross-restart auth persistence.
 */
async function createDefaultAuthDeps(config: Config): Promise<GraphClientDeps> {
  const cachePath = resolveTildePath(config.cache.tokenCachePath);
  const cachePlugin = await createCachePlugin(cachePath);
  const msalClient = new MsalClient(
    config.azure.tenantId,
    config.azure.clientId,
    undefined,
    cachePlugin,
  );
  return msalClient;
}

const registrations: ToolRegistrationFn[] = [
  registerMailTools,
  registerMailReadTools,
  registerMailFolderTools,
  registerMailSearchTools,
  registerMailSendTools,
  registerMailReplyTools,
  registerMailForwardTools,
  registerMailMoveTools,
  registerMailAttachmentTools,
];

async function main() {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    logger.error(
      { error },
      "Failed to load config. Ensure AZURE_TENANT_ID and AZURE_CLIENT_ID are set.",
    );
    process.exit(1);
  }

  const authDeps = await createDefaultAuthDeps(config);

  // Fail-fast: check for cached token before starting MCP server.
  // In MCP mode (subprocess), Device Code Flow cannot work because
  // stderr is not visible to the user. Exit with clear instructions.
  const silentToken = await authDeps.getAccessTokenSilentOnly?.();
  if (!silentToken) {
    process.stderr.write("\n[ms-mcp] Not authenticated. Run first:\n\n  pnpm auth login\n\n");
    process.exit(1);
  }

  const graphClient = getGraphClient(authDeps);

  for (const register of registrations) {
    register(server, graphClient, config);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("pommer-m365-mcp server started");
}

main().catch((error) => {
  logger.error({ error }, "Fatal error starting server");
  process.exit(1);
});

export { server };
