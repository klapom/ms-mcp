import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";

/** Signature for tool registration functions. */
export type ToolRegistrationFn = (server: McpServer, graphClient: Client, config: Config) => void;

/** Standard MCP tool result shape returned by all tool handlers. */
export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
