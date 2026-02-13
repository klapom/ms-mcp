import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import {
  FindAvailableRoomsParams,
  type FindAvailableRoomsParamsType,
  ListMeetingRoomsParams,
} from "../schemas/calendar-rooms.js";
import { resolveUserPath } from "../schemas/common.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-rooms");

const ROOM_SELECT = [
  "id",
  "displayName",
  "emailAddress",
  "capacity",
  "building",
  "floorNumber",
  "audioDeviceName",
  "videoDeviceName",
  "displayDeviceName",
];

const MAX_SCHEDULE_ROOMS = 20;

// ---------------------------------------------------------------------------
// list_meeting_rooms helpers
// ---------------------------------------------------------------------------

function getEquipmentList(room: Record<string, unknown>): string[] {
  const equipment: string[] = [];
  if (typeof room.audioDeviceName === "string" && room.audioDeviceName) {
    equipment.push(room.audioDeviceName);
  }
  if (typeof room.videoDeviceName === "string" && room.videoDeviceName) {
    equipment.push(room.videoDeviceName);
  }
  if (typeof room.displayDeviceName === "string" && room.displayDeviceName) {
    equipment.push(room.displayDeviceName);
  }
  return equipment;
}

function formatRoom(room: Record<string, unknown>): string {
  const name = String(room.displayName ?? "(unnamed)");
  const email = typeof room.emailAddress === "string" ? room.emailAddress : "";
  const capacity = typeof room.capacity === "number" ? room.capacity : 0;
  const building = typeof room.building === "string" ? room.building : "";
  const floor =
    room.floorNumber !== undefined && room.floorNumber !== null ? String(room.floorNumber) : "";
  const equipment = getEquipmentList(room);
  const id = typeof room.id === "string" ? room.id : "";

  const parts = [`Room: ${name}`];
  if (building || floor) {
    const loc = [building, floor ? `Floor ${floor}` : ""].filter(Boolean).join(", ");
    parts.push(loc);
  }
  parts.push(`Capacity: ${capacity}`);
  if (equipment.length > 0) parts.push(`Equipment: ${equipment.join(", ")}`);
  if (email) parts.push(`Email: ${email}`);
  if (id) parts.push(`ID: ${id}`);

  return parts.join(" | ");
}

function applyClientFilters(
  rooms: Record<string, unknown>[],
  building?: string,
  floor?: string,
  minCapacity?: number,
): Record<string, unknown>[] {
  let filtered = rooms;
  if (building) {
    filtered = filtered.filter(
      (r) => typeof r.building === "string" && r.building.toLowerCase() === building.toLowerCase(),
    );
  }
  if (floor) {
    filtered = filtered.filter(
      (r) => r.floorNumber !== undefined && String(r.floorNumber) === floor,
    );
  }
  if (minCapacity !== undefined) {
    filtered = filtered.filter((r) => typeof r.capacity === "number" && r.capacity >= minCapacity);
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// find_available_rooms helpers
// ---------------------------------------------------------------------------

function hasEquipment(room: Record<string, unknown>, required: string[]): boolean {
  const equipment = getEquipmentList(room).map((e) => e.toLowerCase());
  return required.every((req) => equipment.some((e) => e.includes(req.toLowerCase())));
}

function isRoomFree(availabilityView: string): boolean {
  if (!availabilityView) return true;
  return [...availabilityView].every((c) => c === "0");
}

function filterCandidateRooms(
  rooms: Record<string, unknown>[],
  parsed: FindAvailableRoomsParamsType,
): Record<string, unknown>[] {
  let candidates = rooms;
  if (parsed.building) {
    candidates = candidates.filter(
      (r) =>
        typeof r.building === "string" &&
        r.building.toLowerCase() === parsed.building?.toLowerCase(),
    );
  }
  if (parsed.min_capacity !== undefined) {
    candidates = candidates.filter(
      (r) => typeof r.capacity === "number" && r.capacity >= (parsed.min_capacity ?? 0),
    );
  }
  if (parsed.equipment && parsed.equipment.length > 0) {
    candidates = candidates.filter((r) => hasEquipment(r, parsed.equipment ?? []));
  }
  return candidates;
}

function extractFreeEmails(scheduleItems: unknown[]): Set<string> {
  const freeEmails = new Set<string>();
  for (const item of scheduleItems) {
    if (!isRecordObject(item)) continue;
    const email = typeof item.scheduleId === "string" ? item.scheduleId : "";
    const view = typeof item.availabilityView === "string" ? item.availabilityView : "";
    if (email && isRoomFree(view)) {
      freeEmails.add(email.toLowerCase());
    }
  }
  return freeEmails;
}

async function findAvailableRooms(
  graphClient: Client,
  parsed: FindAvailableRoomsParamsType,
): Promise<{ rooms: Record<string, unknown>[]; checkedCount: number }> {
  const roomPage = await fetchPage<Record<string, unknown>>(
    graphClient,
    "/places/microsoft.graph.room",
    { top: 100, select: buildSelectParam(ROOM_SELECT) },
  );

  const candidateRooms = filterCandidateRooms(roomPage.items, parsed);
  const roomsToCheck = candidateRooms.slice(0, MAX_SCHEDULE_ROOMS);
  if (roomsToCheck.length === 0) {
    return { rooms: [], checkedCount: 0 };
  }

  const schedules = roomsToCheck
    .map((r) => (typeof r.emailAddress === "string" ? r.emailAddress : ""))
    .filter(Boolean);

  if (schedules.length === 0) {
    return { rooms: [], checkedCount: 0 };
  }

  const userPath = resolveUserPath(parsed.user_id);
  const tz = await getUserTimezone(graphClient);
  const scheduleResult = (await graphClient
    .api(`${userPath}/calendar/getSchedule`)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .post({
      schedules,
      startTime: parsed.start,
      endTime: parsed.end,
      availabilityViewInterval: 15,
    })) as Record<string, unknown>;

  const scheduleItems = Array.isArray(scheduleResult.value) ? scheduleResult.value : [];
  const freeEmails = extractFreeEmails(scheduleItems);

  const availableRooms = roomsToCheck.filter((r) => {
    const email = typeof r.emailAddress === "string" ? r.emailAddress.toLowerCase() : "";
    return freeEmails.has(email);
  });

  const target = parsed.min_capacity ?? 0;
  availableRooms.sort((a, b) => {
    const capA = typeof a.capacity === "number" ? a.capacity : 0;
    const capB = typeof b.capacity === "number" ? b.capacity : 0;
    return Math.abs(capA - target) - Math.abs(capB - target);
  });

  return { rooms: availableRooms, checkedCount: roomsToCheck.length };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCalendarRoomTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_meeting_rooms",
    "List all meeting rooms in the organization. Filter by building, floor, or minimum capacity. Returns room name, email, capacity, building, floor, and equipment. Safe operation — no confirmation required.",
    ListMeetingRoomsParams.shape,
    async (params) => {
      try {
        const parsed = ListMeetingRoomsParams.parse(params);

        const page = await fetchPage<Record<string, unknown>>(
          graphClient,
          "/places/microsoft.graph.room",
          {
            top: parsed.top ?? config.limits.maxItems,
            skip: parsed.skip,
            select: buildSelectParam(ROOM_SELECT),
          },
        );

        // Client-side filtering (Graph /places doesn't fully support $filter)
        const filtered = applyClientFilters(
          page.items,
          parsed.building,
          parsed.floor,
          parsed.min_capacity,
        );

        const { items, paginationHint } = shapeListResponse(filtered, filtered.length, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No meeting rooms found."
            : [...items.map((r) => formatRoom(r)), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_meeting_rooms", roomCount: items.length },
          "list_meeting_rooms completed",
        );

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "list_meeting_rooms",
              status: error.httpStatus,
              code: error.code,
            },
            "list_meeting_rooms failed",
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

  server.tool(
    "find_available_rooms",
    "Find meeting rooms available for a specific time slot. Lists rooms, checks their availability via getSchedule, and returns only free rooms. Filter by capacity, building, or required equipment. Safe operation — no confirmation required.",
    FindAvailableRoomsParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = FindAvailableRoomsParams.parse(params);

        const { rooms, checkedCount } = await findAvailableRooms(graphClient, parsed);

        const endTime = Date.now();
        logger.info(
          {
            tool: "find_available_rooms",
            availableCount: rooms.length,
            checkedCount,
            duration_ms: endTime - startTime,
          },
          "find_available_rooms completed",
        );

        const text =
          rooms.length === 0
            ? `No available rooms found (checked ${checkedCount} rooms).`
            : [
                `Found ${rooms.length} available room(s) (checked ${checkedCount}):`,
                "",
                ...rooms.map((r) => `Available: ${formatRoom(r)}`),
              ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "find_available_rooms",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "find_available_rooms failed",
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
