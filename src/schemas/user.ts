import { z } from "zod";
import { BaseParams, ListParams } from "./common.js";

/**
 * Schema for getting the current user's profile.
 */
export const GetMyProfileParams = BaseParams;

/**
 * Schema for searching users in the directory.
 * Requires ConsistencyLevel: eventual header.
 */
export const SearchUsersParams = ListParams.extend({
  query: z.string().min(1).max(200).describe("Search query (name, email, job title)"),
});

/**
 * Schema for getting a single user by ID or UPN.
 */
export const GetUserParams = BaseParams.extend({
  user_id: z.string().min(1).describe("User ID (GUID) or User Principal Name (email address)"),
});

/**
 * Schema for getting a user's manager.
 */
export const GetManagerParams = BaseParams.extend({
  user_id: z.string().optional().describe("User ID or UPN. Defaults to current user (/me)"),
});

/**
 * Schema for listing a user's direct reports.
 */
export const ListDirectReportsParams = BaseParams.extend({
  user_id: z.string().optional().describe("User ID or UPN. Defaults to current user (/me)"),
  top: z.number().int().positive().max(999).optional().describe("Maximum number of results"),
  skip: z.number().int().nonnegative().optional().describe("Number of results to skip"),
});

/**
 * Schema for listing a user's group memberships.
 */
export const ListUserGroupsParams = BaseParams.extend({
  user_id: z.string().optional().describe("User ID or UPN. Defaults to current user (/me)"),
  top: z.number().int().positive().max(999).optional().describe("Maximum number of results"),
  skip: z.number().int().nonnegative().optional().describe("Number of results to skip"),
});

/**
 * Schema for getting a user's profile photo.
 */
export const GetUserPhotoParams = BaseParams.extend({
  user_id: z.string().min(1).describe("User ID (GUID) or User Principal Name (email address)"),
  size: z
    .enum([
      "48x48",
      "64x64",
      "96x96",
      "120x120",
      "240x240",
      "360x360",
      "432x432",
      "504x504",
      "648x648",
    ])
    .optional()
    .describe("Photo size. Defaults to 240x240 if not specified"),
});
