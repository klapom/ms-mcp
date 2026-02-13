import { z } from "zod";
import { BaseParams } from "./common.js";

/**
 * Parameters for track_file_changes (GET /me/drive/root/delta).
 */
export const TrackFileChangesParams = BaseParams.extend({
  folder_id: z.string().optional().describe("Track changes in a specific folder (default: root)"),
  delta_token: z
    .string()
    .optional()
    .describe(
      "Token from a previous delta request for incremental sync. Omit for initial full sync.",
    ),
});

export type TrackFileChangesParamsType = z.infer<typeof TrackFileChangesParams>;
