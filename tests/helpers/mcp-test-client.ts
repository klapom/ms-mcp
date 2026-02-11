/**
 * Helper for testing MCP tools in isolation.
 *
 * Usage in tests:
 *   const result = await callTool("list_emails", { top: 5 });
 *   expect(result.content).toBeDefined();
 *
 * TODO (Phase 1): Implement proper MCP test client that:
 * - Creates an in-memory MCP server
 * - Calls tools via the MCP protocol
 * - Returns typed ToolResult objects
 */
export async function callTool(
  _toolName: string,
  _params: Record<string, unknown>,
): Promise<{ content: unknown[] }> {
  throw new Error("MCP test client not yet implemented");
}
