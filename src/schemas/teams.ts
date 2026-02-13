import { z } from "zod";
import { ListParams, WriteParams } from "./common.js";

// ---------------------------------------------------------------------------
// list_teams
// ---------------------------------------------------------------------------

export const ListTeamsParams = ListParams;
export type ListTeamsParamsType = z.infer<typeof ListTeamsParams>;

// ---------------------------------------------------------------------------
// list_channels
// ---------------------------------------------------------------------------

export const ListChannelsParams = ListParams.extend({
  team_id: z.string().min(1).describe("The ID of the team."),
});
export type ListChannelsParamsType = z.infer<typeof ListChannelsParams>;

// ---------------------------------------------------------------------------
// list_channel_messages
// ---------------------------------------------------------------------------

export const ListChannelMessagesParams = ListParams.extend({
  team_id: z.string().min(1).describe("The ID of the team."),
  channel_id: z.string().min(1).describe("The ID of the channel."),
});
export type ListChannelMessagesParamsType = z.infer<typeof ListChannelMessagesParams>;

// ---------------------------------------------------------------------------
// send_channel_message
// ---------------------------------------------------------------------------

export const SendChannelMessageParams = WriteParams.extend({
  team_id: z.string().min(1).describe("The ID of the team."),
  channel_id: z.string().min(1).describe("The ID of the channel."),
  content: z.string().min(1).describe("Message content (text or HTML)."),
  content_type: z
    .enum(["html", "text"])
    .default("html")
    .describe("Content type: 'html' (default) or 'text'."),
  importance: z
    .enum(["normal", "high", "urgent"])
    .default("normal")
    .describe("Message importance level."),
});
export type SendChannelMessageParamsType = z.infer<typeof SendChannelMessageParams>;

// ---------------------------------------------------------------------------
// reply_to_channel_message
// ---------------------------------------------------------------------------

export const ReplyToChannelMessageParams = WriteParams.extend({
  team_id: z.string().min(1).describe("The ID of the team."),
  channel_id: z.string().min(1).describe("The ID of the channel."),
  message_id: z.string().min(1).describe("The ID of the message to reply to."),
  content: z.string().min(1).describe("Reply content (text or HTML)."),
  content_type: z
    .enum(["html", "text"])
    .default("html")
    .describe("Content type: 'html' (default) or 'text'."),
});
export type ReplyToChannelMessageParamsType = z.infer<typeof ReplyToChannelMessageParams>;

// ---------------------------------------------------------------------------
// list_chats
// ---------------------------------------------------------------------------

export const ListChatsParams = ListParams.extend({
  chat_type: z
    .enum(["oneOnOne", "group", "meeting"])
    .optional()
    .describe("Filter by chat type: oneOnOne, group, or meeting."),
});
export type ListChatsParamsType = z.infer<typeof ListChatsParams>;

// ---------------------------------------------------------------------------
// list_chat_messages
// ---------------------------------------------------------------------------

export const ListChatMessagesParams = ListParams.extend({
  chat_id: z.string().min(1).describe("The ID of the chat."),
});
export type ListChatMessagesParamsType = z.infer<typeof ListChatMessagesParams>;

// ---------------------------------------------------------------------------
// send_chat_message
// ---------------------------------------------------------------------------

export const SendChatMessageParams = WriteParams.extend({
  chat_id: z.string().min(1).describe("The ID of the chat."),
  content: z.string().min(1).describe("Message content (text or HTML)."),
  content_type: z
    .enum(["html", "text"])
    .default("text")
    .describe("Content type: 'text' (default) or 'html'."),
});
export type SendChatMessageParamsType = z.infer<typeof SendChatMessageParams>;
