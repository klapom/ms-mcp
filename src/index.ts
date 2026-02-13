import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type GraphClientDeps, getGraphClient } from "./auth/graph-client.js";
import { MsalClient } from "./auth/msal-client.js";
import { createCachePlugin } from "./auth/token-cache.js";
import { type Config, loadConfig } from "./config.js";
import { registerCalendarAvailabilityTools } from "./tools/calendar-availability.js";
import { registerCalendarCreateTools } from "./tools/calendar-create.js";
import { registerCalendarDeleteTools } from "./tools/calendar-delete.js";
import { registerCalendarEventTools } from "./tools/calendar-events.js";
import { registerCalendarListTools } from "./tools/calendar-list.js";
import { registerCalendarRespondTools } from "./tools/calendar-respond.js";
import { registerCalendarUpdateTools } from "./tools/calendar-update.js";
import { registerCalendarViewTools } from "./tools/calendar-view.js";
import { registerContactsReadTools } from "./tools/contacts-read.js";
import { registerContactsSearchTools } from "./tools/contacts-search.js";
import { registerContactsWriteTools } from "./tools/contacts-write.js";
import { registerDriveCopyTools } from "./tools/drive-copy.js";
import { registerDriveDownloadTools } from "./tools/drive-download.js";
import { registerDriveFolderTools } from "./tools/drive-folder.js";
import { registerDriveListTools } from "./tools/drive-list.js";
import { registerDriveMetadataTools } from "./tools/drive-metadata.js";
import { registerDriveMoveTools } from "./tools/drive-move.js";
import { registerDriveSearchTools } from "./tools/drive-search.js";
import { registerDriveShareTools } from "./tools/drive-share.js";
import { registerDriveUploadTools } from "./tools/drive-upload.js";
import { registerMailAttachmentTools } from "./tools/mail-attachments.js";
import { registerMailFolderTools } from "./tools/mail-folders.js";
import { registerMailForwardTools } from "./tools/mail-forward.js";
import { registerMailMoveTools } from "./tools/mail-move.js";
import { registerMailReadTools } from "./tools/mail-read.js";
import { registerMailReplyTools } from "./tools/mail-reply.js";
import { registerMailSearchTools } from "./tools/mail-search.js";
import { registerMailSendTools } from "./tools/mail-send.js";
import { registerMailTools } from "./tools/mail.js";
import { registerSharePointListWriteTools } from "./tools/sharepoint-list-write.js";
import { registerSharePointListTools } from "./tools/sharepoint-lists.js";
import { registerSharePointSiteTools } from "./tools/sharepoint-sites.js";
import { registerTeamsChatMessageTools } from "./tools/teams-chat-messages.js";
import { registerTeamsChatsTools } from "./tools/teams-chats.js";
import { registerTeamsListTools } from "./tools/teams-list.js";
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
  registerCalendarListTools,
  registerCalendarEventTools,
  registerCalendarViewTools,
  registerCalendarCreateTools,
  registerCalendarUpdateTools,
  registerCalendarDeleteTools,
  registerCalendarRespondTools,
  registerCalendarAvailabilityTools,
  registerDriveListTools,
  registerDriveSearchTools,
  registerDriveMetadataTools,
  registerDriveDownloadTools,
  registerDriveUploadTools,
  registerDriveFolderTools,
  registerDriveMoveTools,
  registerDriveCopyTools,
  registerDriveShareTools,
  registerTeamsListTools,
  registerTeamsMessageTools,
  registerTeamsSendTools,
  registerTeamsChatsTools,
  registerTeamsChatMessageTools,
  registerSharePointSiteTools,
  registerSharePointListTools,
  registerSharePointListWriteTools,
  registerContactsReadTools,
  registerContactsSearchTools,
  registerContactsWriteTools,
  registerTodoListTools,
  registerTodoTaskTools,
  registerTodoTaskWriteTools,
  registerUserProfileTools,
  registerUserSearchTools,
  registerUserOrgTools,
  registerUserPhotoTools,
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
