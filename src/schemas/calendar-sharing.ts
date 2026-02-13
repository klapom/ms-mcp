import { z } from "zod";
import { WriteParams } from "./common.js";

/**
 * Parameters for share_calendar tool.
 */
export const ShareCalendarParams = WriteParams.extend({
  recipient_email: z.string().email().describe("Email of user to share calendar with"),
  role: z
    .enum([
      "freeBusyRead",
      "limitedRead",
      "read",
      "write",
      "delegateWithoutPrivateEventAccess",
      "delegateWithPrivateEventAccess",
    ])
    .describe("Permission level"),
  send_invitation: z.boolean().default(true).describe("Send email invitation to recipient"),
});

export type ShareCalendarParamsType = z.infer<typeof ShareCalendarParams>;
