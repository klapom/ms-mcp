/**
 * Notification Service POC for MS-MCP
 *
 * Demonstrates all technically possible notification patterns with MCP SDK v1.26.0.
 * Run with: npx tsx notification-service-poc.ts
 *
 * NOTE: This is a standalone POC, not integrated into the main server yet.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

interface NotificationItem {
  id: string;
  type: "email" | "event" | "teams_message";
  title: string;
  from: string;
  receivedAt: string;
  read: boolean;
}

// ============================================================================
// In-Memory Notification Store (replace with Graph API Delta Query later)
// ============================================================================

const notificationStore: NotificationItem[] = [];
let lastCheckTimestamp = new Date().toISOString();

/**
 * Simulates checking for new notifications.
 * In production: replace with Graph API Delta Query.
 *
 * GET /me/mailFolders/inbox/messages/delta?$select=subject,from,receivedDateTime,isRead
 * GET /me/events/delta?$select=subject,start,end,organizer
 */
async function checkForNewNotifications(): Promise<NotificationItem[]> {
  // STUB: In production, call Graph API here
  // For testing, add fake notifications via the add_test_notification tool
  const unread = notificationStore.filter((n) => !n.read);
  return unread;
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer(
  { name: "ms-mcp-notifications-poc", version: "0.1.0" },
  {
    capabilities: {
      resources: { subscribe: true, listChanged: true },
      logging: {},
    },
  },
);

// ============================================================================
// Pattern 1: Tool-Based Polling (WORKS TODAY with Claude Code)
// ============================================================================

server.tool(
  "get_pending_notifications",
  "Returns all unread notifications (emails, events, teams messages). Call this to check for new activity.",
  {
    since: z.string().optional().describe("ISO timestamp to filter notifications after this time"),
    type: z
      .enum(["email", "event", "teams_message", "all"])
      .optional()
      .describe("Filter by notification type"),
    max_items: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of notifications to return (default: 10)"),
  },
  async (args) => {
    const notifications = await checkForNewNotifications();
    const maxItems = args.max_items ?? 10;

    let filtered = notifications;
    if (args.since) {
      filtered = filtered.filter((n) => n.receivedAt > args.since!);
    }
    if (args.type && args.type !== "all") {
      filtered = filtered.filter((n) => n.type === args.type);
    }
    filtered = filtered.slice(0, maxItems);

    if (filtered.length === 0) {
      return {
        content: [{ type: "text", text: "No pending notifications." }],
      };
    }

    const summary = filtered
      .map((n) => `[${n.type.toUpperCase()}] ${n.title} (from: ${n.from}, ${n.receivedAt})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `${filtered.length} pending notification(s):\n\n${summary}`,
        },
      ],
    };
  },
);

// ============================================================================
// Pattern 2: Prompt for Convenience (WORKS TODAY with Claude Code)
// ============================================================================

server.prompt(
  "check-inbox",
  "Quick inbox check - returns a prompt to check for new emails and upcoming events",
  async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Check my pending notifications using get_pending_notifications. Summarize any new emails, upcoming events, and teams messages. If nothing new, just say so briefly.",
        },
      },
    ],
  }),
);

// ============================================================================
// Pattern 3: Resource-Based Notifications (PARTIALLY works with Claude Code)
//
// Claude Code supports listChanged but NOT subscribe/updated.
// The resource will appear in @-mention autocomplete.
// ============================================================================

server.resource(
  "pending-notifications",
  "notification://inbox/pending",
  {
    description: "Current pending notifications summary",
    mimeType: "application/json",
  },
  async () => {
    const notifications = await checkForNewNotifications();
    return {
      contents: [
        {
          uri: "notification://inbox/pending",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              count: notifications.length,
              lastChecked: lastCheckTimestamp,
              items: notifications.slice(0, 10),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Pattern 4: Sampling-Ready (FUTURE - does not work with Claude Code yet)
//
// When Claude Code adds sampling support, this will enable proactive push.
// ============================================================================

async function tryProactivePush(summary: string): Promise<boolean> {
  const clientCaps = server.server.getClientCapabilities();

  if (clientCaps?.sampling) {
    // Client supports sampling -- push proactively!
    try {
      await server.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `New notification: ${summary}. Would you like me to show the details?`,
            },
          },
        ],
        maxTokens: 200,
      });
      return true;
    } catch (err) {
      // Sampling failed, fall through to logging
      await server.server.sendLoggingMessage({
        level: "warning",
        data: `Sampling failed: ${err instanceof Error ? err.message : "unknown"}`,
        logger: "notification-service",
      });
      return false;
    }
  }

  // Fallback: send as log message (visible in Claude Code debug logs)
  await server.server.sendLoggingMessage({
    level: "info",
    data: `[NOTIFICATION] ${summary}`,
    logger: "notification-service",
  });

  return false;
}

// ============================================================================
// Background Poller (starts after connection)
// ============================================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;

function startBackgroundPoller() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    try {
      const notifications = await checkForNewNotifications();
      lastCheckTimestamp = new Date().toISOString();

      if (notifications.length > 0) {
        const summary = `${notifications.length} unread: ${notifications.map((n) => n.title).join(", ")}`;

        // Try proactive push (works when sampling is supported)
        await tryProactivePush(summary);

        // Also signal resource change (works when subscriptions are supported)
        try {
          await server.server.sendResourceUpdated({
            uri: "notification://inbox/pending",
          });
        } catch {
          // Client doesn't support resource subscriptions -- expected with Claude Code
        }
      }
    } catch (err) {
      // Don't crash the polling loop
      await server.server.sendLoggingMessage({
        level: "error",
        data: `Polling error: ${err instanceof Error ? err.message : "unknown"}`,
        logger: "notification-service",
      });
    }
  }, 60_000); // Every 60 seconds
}

function stopBackgroundPoller() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============================================================================
// Test Helper Tool (for POC testing only)
// ============================================================================

server.tool(
  "add_test_notification",
  "[POC ONLY] Adds a fake notification for testing the notification service",
  {
    type: z.enum(["email", "event", "teams_message"]),
    title: z.string(),
    from: z.string(),
  },
  async (args) => {
    const notification: NotificationItem = {
      id: `test-${Date.now()}`,
      type: args.type,
      title: args.title,
      from: args.from,
      receivedAt: new Date().toISOString(),
      read: false,
    };
    notificationStore.push(notification);

    return {
      content: [
        {
          type: "text",
          text: `Added test notification: [${args.type}] "${args.title}" from ${args.from}`,
        },
      ],
    };
  },
);

// ============================================================================
// Server Lifecycle
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start background poller after connection
  server.server.oninitialized = () => {
    const clientCaps = server.server.getClientCapabilities();
    const hasSampling = Boolean(clientCaps?.sampling);
    const hasResourceSubscribe = Boolean(clientCaps?.resources?.subscribe);

    // Log capabilities for debugging
    server.server
      .sendLoggingMessage({
        level: "info",
        data: `Client capabilities: sampling=${hasSampling}, resourceSubscribe=${hasResourceSubscribe}`,
        logger: "notification-service",
      })
      .catch(() => {
        // Logging may fail before full init
      });

    startBackgroundPoller();
  };

  // Cleanup on exit
  process.on("SIGINT", () => {
    stopBackgroundPoller();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopBackgroundPoller();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
