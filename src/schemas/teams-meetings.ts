import { z } from "zod";
import { BaseParams } from "./common.js";

// ---------------------------------------------------------------------------
// get_meeting_transcript
// ---------------------------------------------------------------------------

export const GetMeetingTranscriptParams = BaseParams.extend({
  meeting_id: z.string().min(1).describe("Online meeting ID or joinWebUrl"),
  transcript_id: z.string().optional().describe("Specific transcript ID (if multiple available)"),
  format: z
    .enum(["text", "vtt"])
    .default("text")
    .describe("Output format: text (parsed) or vtt (raw file)"),
});
export type GetMeetingTranscriptParamsType = z.infer<typeof GetMeetingTranscriptParams>;
