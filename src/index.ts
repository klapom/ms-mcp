import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MsalClient } from "./auth/msal-client.js";
import { type Config, loadConfig } from "./config.js";
import { registerMailTools } from "./tools/mail.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "pommer-m365-mcp",
  version: "0.0.1",
});

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

  const msalClient = new MsalClient(config.azure.tenantId, config.azure.clientId);

  registerMailTools(server, msalClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("pommer-m365-mcp server started");
}

main().catch((error) => {
  logger.error({ error }, "Fatal error starting server");
  process.exit(1);
});

export { server };
