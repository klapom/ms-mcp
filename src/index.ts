import type { Client } from "@microsoft/microsoft-graph-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { GraphClientDeps } from "./auth/graph-client.js";
import { getGraphClient } from "./auth/graph-client.js";
import { MsalClient } from "./auth/msal-client.js";
import { type Config, loadConfig } from "./config.js";
import { registerMailFolderTools } from "./tools/mail-folders.js";
import { registerMailReadTools } from "./tools/mail-read.js";
import { registerMailSearchTools } from "./tools/mail-search.js";
import { registerMailTools } from "./tools/mail.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "pommer-m365-mcp",
  version: "0.0.1",
});

/**
 * Creates the default GraphClientDeps using MSAL Device Code Flow.
 * Override this factory for testing or alternative auth flows (Phase 5+).
 */
function createDefaultAuthDeps(config: Config): GraphClientDeps {
  const msalClient = new MsalClient(config.azure.tenantId, config.azure.clientId);
  return msalClient;
}

/** Tool registration functions — each receives the shared server, graph client, and config. */
const registrations: Array<(server: McpServer, graphClient: Client, config: Config) => void> = [
  registerMailTools,
  registerMailReadTools,
  registerMailFolderTools,
  registerMailSearchTools,
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

  const authDeps = createDefaultAuthDeps(config);
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
