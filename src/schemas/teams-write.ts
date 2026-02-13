import { z } from "zod";
import { WriteParams } from "./common.js";

// ---------------------------------------------------------------------------
// create_channel
// ---------------------------------------------------------------------------

export const CreateChannelParams = WriteParams.extend({
  team_id: z.string().min(1).describe("Team ID where channel will be created"),
  display_name: z.string().min(1).max(50).describe("Channel name"),
  description: z.string().max(1024).optional().describe("Channel description"),
  membership_type: z
    .enum(["standard", "private"])
    .default("standard")
    .describe("Channel membership type"),
  owner_user_id: z
    .string()
    .optional()
    .describe("User ID of channel owner (required for private channels)"),
});
export type CreateChannelParamsType = z.infer<typeof CreateChannelParams>;
