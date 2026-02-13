import { z } from "zod";
import { ListParams } from "./common.js";

// ---------------------------------------------------------------------------
// list_activity_feed
// ---------------------------------------------------------------------------

export const ListActivityFeedParams = ListParams.extend({
  activity_type: z
    .enum(["mention", "reply", "reaction", "channelActivity", "all"])
    .default("all")
    .describe("Filter by activity type"),
  unread_only: z.boolean().default(false).describe("Show only unread notifications"),
});
export type ListActivityFeedParamsType = z.infer<typeof ListActivityFeedParams>;

// ---------------------------------------------------------------------------
// list_mentions
// ---------------------------------------------------------------------------

export const ListMentionsParams = ListParams.extend({
  source: z
    .enum(["channels", "chats", "all"])
    .default("all")
    .describe("Search mentions in channels, chats, or both"),
  unread_only: z.boolean().default(false).describe("Show only unread mentions"),
});
export type ListMentionsParamsType = z.infer<typeof ListMentionsParams>;
