import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type GraphClientDeps, getGraphClient } from "./auth/graph-client.js";
import { MsalClient } from "./auth/msal-client.js";
import { createCachePlugin } from "./auth/token-cache.js";
import { type Config, loadConfig } from "./config.js";
import { logMemoryStatus } from "./middleware/memory-monitor.js";
import { registerBatchCalendarTools } from "./tools/batch-calendar.js";
import { registerBatchFilesTools } from "./tools/batch-files.js";
import { registerBatchMailTools } from "./tools/batch-mail.js";
import { registerCalendarAttachEmailTools } from "./tools/calendar-attach-email.js";
import { registerCalendarAvailabilityTools } from "./tools/calendar-availability.js";
import { registerCalendarCreateTools } from "./tools/calendar-create.js";
import { registerCalendarDeleteTools } from "./tools/calendar-delete.js";
import { registerCalendarEventTools } from "./tools/calendar-events.js";
import { registerCalendarInstancesTools } from "./tools/calendar-instances.js";
import { registerCalendarListTools } from "./tools/calendar-list.js";
import { registerCalendarRecurringTools } from "./tools/calendar-recurring.js";
import { registerCalendarRespondTools } from "./tools/calendar-respond.js";
import { registerCalendarRoomTools } from "./tools/calendar-rooms.js";
import { registerCalendarSharingTools } from "./tools/calendar-sharing.js";
import { registerCalendarUpdateTools } from "./tools/calendar-update.js";
import { registerCalendarViewTools } from "./tools/calendar-view.js";
import { registerContactsReadTools } from "./tools/contacts-read.js";
import { registerContactsSearchTools } from "./tools/contacts-search.js";
import { registerContactsWriteTools } from "./tools/contacts-write.js";
import { registerDriveCopyStatusTools } from "./tools/drive-copy-status.js";
import { registerDriveCopyTools } from "./tools/drive-copy.js";
import { registerDriveDownloadTools } from "./tools/drive-download.js";
import { registerDriveFolderTools } from "./tools/drive-folder.js";
import { registerDriveListTools } from "./tools/drive-list.js";
import { registerDriveMetadataTools } from "./tools/drive-metadata.js";
import { registerDriveMoveTools } from "./tools/drive-move.js";
import { registerDriveSearchTools } from "./tools/drive-search.js";
import { registerDriveShareTools } from "./tools/drive-share.js";
import { registerDriveUploadLargeTools } from "./tools/drive-upload-large.js";
import { registerDriveUploadTools } from "./tools/drive-upload.js";
import { registerFilesDeltaTools } from "./tools/files-delta.js";
import { registerMailAttachItemTools } from "./tools/mail-attach-item.js";
import { registerMailAttachReferenceTools } from "./tools/mail-attach-reference.js";
import { registerMailAttachmentTools } from "./tools/mail-attachments.js";
import { registerMailDeleteTools } from "./tools/mail-delete.js";
import { registerMailDraftTools } from "./tools/mail-drafts.js";
import { registerMailFlagTools } from "./tools/mail-flag.js";
import { registerMailFolderCreateTools } from "./tools/mail-folder-create.js";
import { registerMailFolderTools } from "./tools/mail-folders.js";
import { registerMailForwardTools } from "./tools/mail-forward.js";
import { registerMailMoveTools } from "./tools/mail-move.js";
import { registerMailReadTools } from "./tools/mail-read.js";
import { registerMailReplyTools } from "./tools/mail-reply.js";
import { registerMailRulesListTools } from "./tools/mail-rules-list.js";
import { registerMailSearchTools } from "./tools/mail-search.js";
import { registerMailSendTools } from "./tools/mail-send.js";
import { registerMailTools } from "./tools/mail.js";
import { registerOneNoteCreateTools } from "./tools/onenote-create.js";
import { registerOneNoteNotebooksTools } from "./tools/onenote-notebooks.js";
import { registerOneNotePagesTools } from "./tools/onenote-pages.js";
import { registerOneNoteSearchTools } from "./tools/onenote-search.js";
import { registerOneNoteSectionsTools } from "./tools/onenote-sections.js";
import { registerPresenceTools } from "./tools/presence.js";
import { registerSearchAllTools } from "./tools/search-all.js";
import { registerAdvancedSearchContactsTools } from "./tools/search-contacts-advanced.js";
import { registerAdvancedSearchEmailsTools } from "./tools/search-emails-advanced.js";
import { registerSearchEventsTools } from "./tools/search-events.js";
import { registerSearchTeamsMessagesTools } from "./tools/search-teams-messages.js";
import { registerSharePointListWriteTools } from "./tools/sharepoint-list-write.js";
import { registerSharePointListTools } from "./tools/sharepoint-lists.js";
import { registerSharePointSiteTools } from "./tools/sharepoint-sites.js";
import { registerTeamsActivityTools } from "./tools/teams-activity.js";
import { registerTeamsChannelsWriteTools } from "./tools/teams-channels-write.js";
import { registerTeamsChatMessageTools } from "./tools/teams-chat-messages.js";
import { registerTeamsChatsTools } from "./tools/teams-chats.js";
import { registerTeamsListTools } from "./tools/teams-list.js";
import { registerTeamsMeetingsTools } from "./tools/teams-meetings.js";
import { registerTeamsMembersTools } from "./tools/teams-members.js";
import { registerTeamsMessageTools } from "./tools/teams-messages.js";
import { registerTeamsSendTools } from "./tools/teams-send.js";
import { registerTodoListTools } from "./tools/todo-lists.js";
import { registerTodoTaskWriteTools } from "./tools/todo-tasks-write.js";
import { registerTodoTaskTools } from "./tools/todo-tasks.js";
import { registerUserOrgTools } from "./tools/user-org.js";
import { registerUserPhotoTools } from "./tools/user-photo.js";
import { registerUserProfileTools } from "./tools/user-profile.js";
import { registerUserSearchTools } from "./tools/user-search.js";
import type { ToolRegistrationFn } from "./types/tools.js";
import { CacheManager } from "./utils/cache.js";
import { createLogger } from "./utils/logger.js";
import { resolveTildePath } from "./utils/path.js";

const logger = createLogger("server");

const VERSION = "0.0.1";

const server = new McpServer({
  name: "pommer-m365-mcp",
  version: VERSION,
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

// Module groups — filter via MS365_MODULES env var (comma-separated).
// Example: MS365_MODULES=mail,calendar  →  only 33 tools instead of 108.
// Omitting MS365_MODULES loads all modules (default / backwards-compatible).
const MODULE_GROUPS: Record<string, ToolRegistrationFn[]> = {
  mail: [
    registerMailTools,
    registerMailReadTools,
    registerMailFolderTools,
    registerMailSearchTools,
    registerMailSendTools,
    registerMailReplyTools,
    registerMailForwardTools,
    registerMailMoveTools,
    registerMailAttachmentTools,
    registerMailAttachItemTools,
    registerMailAttachReferenceTools,
    registerMailDeleteTools,
    registerMailDraftTools,
    registerMailFolderCreateTools,
    registerMailFlagTools,
    registerMailRulesListTools,
    registerAdvancedSearchEmailsTools,
    registerBatchMailTools,
  ],
  calendar: [
    registerCalendarListTools,
    registerCalendarEventTools,
    registerCalendarViewTools,
    registerCalendarCreateTools,
    registerCalendarAttachEmailTools,
    registerCalendarUpdateTools,
    registerCalendarDeleteTools,
    registerCalendarRespondTools,
    registerCalendarAvailabilityTools,
    registerCalendarRecurringTools,
    registerCalendarInstancesTools,
    registerCalendarRoomTools,
    registerCalendarSharingTools,
    registerSearchEventsTools,
    registerBatchCalendarTools,
  ],
  drive: [
    registerDriveListTools,
    registerDriveSearchTools,
    registerDriveMetadataTools,
    registerDriveDownloadTools,
    registerDriveUploadTools,
    registerDriveUploadLargeTools,
    registerDriveFolderTools,
    registerDriveMoveTools,
    registerDriveCopyTools,
    registerDriveCopyStatusTools,
    registerDriveShareTools,
    registerFilesDeltaTools,
    registerBatchFilesTools,
  ],
  teams: [
    registerTeamsListTools,
    registerTeamsMessageTools,
    registerTeamsSendTools,
    registerTeamsChatsTools,
    registerTeamsChatMessageTools,
    registerTeamsActivityTools,
    registerTeamsChannelsWriteTools,
    registerTeamsMembersTools,
    registerTeamsMeetingsTools,
  ],
  sharepoint: [
    registerSharePointSiteTools,
    registerSharePointListTools,
    registerSharePointListWriteTools,
  ],
  contacts: [
    registerContactsReadTools,
    registerContactsSearchTools,
    registerContactsWriteTools,
    registerAdvancedSearchContactsTools,
  ],
  todo: [registerTodoListTools, registerTodoTaskTools, registerTodoTaskWriteTools],
  onenote: [
    registerOneNoteCreateTools,
    registerOneNoteNotebooksTools,
    registerOneNotePagesTools,
    registerOneNoteSearchTools,
    registerOneNoteSectionsTools,
  ],
  presence: [registerPresenceTools],
  users: [
    registerUserProfileTools,
    registerUserSearchTools,
    registerUserOrgTools,
    registerUserPhotoTools,
  ],
  search: [registerSearchTeamsMessagesTools, registerSearchAllTools],
};

const ALL_MODULES = Object.keys(MODULE_GROUPS);

const enabledModules = process.env.MS365_MODULES
  ? process.env.MS365_MODULES.split(",")
      .map((m) => m.trim())
      .filter(Boolean)
  : ALL_MODULES;

const unknownModules = enabledModules.filter((m) => !(m in MODULE_GROUPS));
if (unknownModules.length > 0) {
  console.error(
    `[ms-mcp] Unknown MS365_MODULES: ${unknownModules.join(", ")}. Valid: ${ALL_MODULES.join(", ")}`,
  );
  process.exit(1);
}

const registrations: ToolRegistrationFn[] = enabledModules.flatMap((m) => MODULE_GROUPS[m]);

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

  // Warn if AZURE_CLIENT_SECRET is set (Device Code Flow doesn't use it)
  if (config.azure.clientSecret) {
    logger.warn(
      "AZURE_CLIENT_SECRET is set but will not be used. Device Code Flow (default auth method) does not require client secret. Remove from environment to avoid accidental exposure.",
    );
  }

  const authDeps = await createDefaultAuthDeps(config);

  // Fail-fast: check for cached token before starting MCP server.
  // In MCP mode (subprocess), Device Code Flow cannot work because
  // stderr is not visible to the user. Exit with clear instructions.
  try {
    const silentToken = await authDeps.getAccessTokenSilentOnly?.();
    if (!silentToken) {
      process.stderr.write("\n[ms-mcp] Not authenticated. Run first:\n\n  pnpm auth login\n\n");
      process.exit(1);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n[ms-mcp] Authentication failed:\n\n${msg}\n`);
    process.exit(1);
  }

  // Initialize response cache for performance optimization
  const cache = new CacheManager();
  logger.info("Response cache initialized");

  const graphClient = getGraphClient(authDeps, cache);

  for (const register of registrations) {
    register(server, graphClient, config, authDeps);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(
    {
      version: VERSION,
      tools: registrations.length,
      modules: enabledModules.join(","),
      config: {
        logLevel: config.server.logLevel,
        toolPreset: config.server.toolPreset,
        maxItems: config.limits.maxItems,
        maxBodyLength: config.limits.maxBodyLength,
        tokenCachePath: config.cache.tokenCachePath,
      },
    },
    "pommer-m365-mcp server started",
  );

  // Periodic health metrics logging (every 5 minutes)
  const metricsInterval = setInterval(
    () => {
      const cacheMetrics = cache.getMetrics();
      logger.info(
        {
          cache: {
            size: cacheMetrics.size,
            hitRate: cacheMetrics.hitRate.toFixed(2),
            hits: cacheMetrics.hits,
            misses: cacheMetrics.misses,
          },
        },
        "Cache metrics",
      );
      logMemoryStatus(logger);
    },
    5 * 60 * 1000,
  ); // 5 minutes

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
    clearInterval(metricsInterval);

    try {
      await server.close();
      logger.info("Server closed");
    } catch (error) {
      logger.error({ error }, "Error during server shutdown");
    }

    // Flush pino logs before exit
    logger.flush();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ error }, "Fatal error starting server");
  process.exit(1);
});

export { server };
