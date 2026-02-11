import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "pommer-m365-mcp",
  version: "0.0.1",
});

// Tools will be registered here as they are implemented
// Example: registerMailTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("pommer-m365-mcp server started");
}

main().catch((error) => {
  logger.error({ error }, "Fatal error starting server");
  process.exit(1);
});

export { server };
