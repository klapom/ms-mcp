import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";

/** Signature for tool registration functions. */
export type ToolRegistrationFn = (server: McpServer, graphClient: Client, config: Config) => void;
