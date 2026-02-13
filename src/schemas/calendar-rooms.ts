import { z } from "zod";
import { DateTimeTimeZone } from "./calendar-write.js";
import { BaseParams, ListParams } from "./common.js";

/**
 * Parameters for list_meeting_rooms tool.
 */
export const ListMeetingRoomsParams = ListParams.extend({
  building: z.string().optional().describe("Filter by building name"),
  floor: z.string().optional().describe("Filter by floor"),
  min_capacity: z.number().int().min(1).optional().describe("Minimum room capacity"),
});

export type ListMeetingRoomsParamsType = z.infer<typeof ListMeetingRoomsParams>;

/**
 * Parameters for find_available_rooms tool.
 */
export const FindAvailableRoomsParams = BaseParams.extend({
  start: DateTimeTimeZone.describe("Meeting start date/time"),
  end: DateTimeTimeZone.describe("Meeting end date/time"),
  min_capacity: z.number().int().min(1).optional().describe("Minimum room capacity"),
  building: z.string().optional().describe("Filter by building"),
  equipment: z
    .array(z.enum(["projector", "phone", "videoConferencing", "whiteboard"]))
    .optional()
    .describe("Required equipment"),
});

export type FindAvailableRoomsParamsType = z.infer<typeof FindAvailableRoomsParams>;
