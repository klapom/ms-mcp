import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { GetMeetingTranscriptParams } from "../schemas/teams-meetings.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { formatTranscriptText, parseVtt } from "../utils/vtt-parser.js";

const logger = createLogger("tools:teams-meetings");

interface TranscriptMeta {
  id: string;
  language?: string;
  createdDateTime?: string;
}

function formatTranscriptList(transcripts: TranscriptMeta[]): string {
  return transcripts
    .map((t, i) => {
      const lang = t.language ? ` (${t.language})` : "";
      const date = t.createdDateTime ? ` — ${t.createdDateTime}` : "";
      return `${i + 1}. ${t.id}${lang}${date}`;
    })
    .join("\n");
}

async function fetchTranscriptContent(
  graphClient: Client,
  userPath: string,
  meetingId: string,
  transcriptId: string,
): Promise<string> {
  const url = `${userPath}/onlineMeetings/${encodeGraphId(meetingId)}/transcripts/${encodeGraphId(transcriptId)}/content`;
  const response = (await graphClient.api(url).get()) as string;
  return response;
}

async function fetchFirstTranscriptId(
  graphClient: Client,
  userPath: string,
  meetingId: string,
): Promise<TranscriptMeta[] | null> {
  const url = `${userPath}/onlineMeetings/${encodeGraphId(meetingId)}/transcripts`;
  const response = (await graphClient.api(url).get()) as Record<string, unknown>;
  const value = response?.value;
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  return value as TranscriptMeta[];
}

export function registerTeamsMeetingsTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "get_meeting_transcript",
    "Retrieve a meeting transcript. Returns parsed text with speakers and timestamps, or raw VTT format. Transcripts may not be available immediately after a meeting (processing delay).",
    GetMeetingTranscriptParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = GetMeetingTranscriptParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        let targetTranscriptId = parsed.transcript_id;

        // If no transcript_id, list available transcripts and use the first
        if (!targetTranscriptId) {
          const transcripts = await fetchFirstTranscriptId(
            graphClient,
            userPath,
            parsed.meeting_id,
          );
          if (!transcripts) {
            return {
              content: [
                {
                  type: "text",
                  text: "No transcripts available for this meeting. Transcripts may take 1-2 hours to process after a meeting ends.",
                },
              ],
            };
          }

          if (transcripts.length > 1) {
            const list = formatTranscriptList(transcripts);
            targetTranscriptId = transcripts[0].id;
            const header = `Found ${transcripts.length} transcripts. Using first:\n${list}\n\n---\n\n`;
            const content = await fetchAndFormat(
              graphClient,
              userPath,
              parsed.meeting_id,
              targetTranscriptId,
              parsed.format,
            );
            logger.info(
              { tool: "get_meeting_transcript", duration_ms: Date.now() - startTime },
              "get_meeting_transcript completed",
            );
            return { content: [{ type: "text", text: header + content }] };
          }

          targetTranscriptId = transcripts[0].id;
        }

        const content = await fetchAndFormat(
          graphClient,
          userPath,
          parsed.meeting_id,
          targetTranscriptId,
          parsed.format,
        );

        logger.info(
          { tool: "get_meeting_transcript", duration_ms: Date.now() - startTime },
          "get_meeting_transcript completed",
        );

        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "get_meeting_transcript",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "get_meeting_transcript failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );
}

async function fetchAndFormat(
  graphClient: Client,
  userPath: string,
  meetingId: string,
  transcriptId: string,
  format: "text" | "vtt",
): Promise<string> {
  const vttContent = await fetchTranscriptContent(graphClient, userPath, meetingId, transcriptId);

  if (format === "vtt") {
    return vttContent;
  }

  const parsed = parseVtt(vttContent);
  if (parsed.cues.length === 0) {
    return "Transcript is empty or could not be parsed.";
  }
  return formatTranscriptText(parsed);
}
