import { z } from "zod";
import { ListParams } from "./common.js";

// ---------------------------------------------------------------------------
// list_team_members
// ---------------------------------------------------------------------------

export const ListTeamMembersParams = ListParams.extend({
  team_id: z.string().min(1).describe("Team ID"),
  role: z
    .enum(["owner", "member", "guest", "all"])
    .default("all")
    .describe("Filter by member role"),
});
export type ListTeamMembersParamsType = z.infer<typeof ListTeamMembersParams>;
