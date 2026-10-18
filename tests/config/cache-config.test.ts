/**
 * Tests for cache TTL configuration
 */

import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS, getTtlForResource } from "../../src/config/cache-config.js";

describe("getTtlForResource", () => {
  describe("user profile", () => {
    it("should return userProfile TTL for /me/profile", () => {
      expect(getTtlForResource("/me/profile")).toBe(CACHE_TTL_MS.userProfile);
    });

    it("should return userProfile TTL for /users/{id}/profile", () => {
      expect(getTtlForResource("/users/user123/profile")).toBe(CACHE_TTL_MS.userProfile);
    });
  });

  describe("drive listings (issue #36)", () => {
    it("uses the short driveListing TTL for children/recent/search", () => {
      const ttl = CACHE_TTL_MS.driveListing;
      expect(ttl).toBeLessThanOrEqual(30 * 1000);
      expect(
        getTtlForResource(
          "/users/klaus.pommer%40pommerconsulting.de/drive/root:/02. X/03. Dokumente/Belege/2026_10:/children?$top=200",
        ),
      ).toBe(ttl);
      expect(getTtlForResource("/me/drive/items/ABC/children")).toBe(ttl);
      expect(getTtlForResource("/me/drive/recent")).toBe(ttl);
      expect(getTtlForResource("/me/drive/root/search(q='rechnung')")).toBe(ttl);
      expect(getTtlForResource("/sites/s1/drive/root/children")).toBe(ttl);
    });

    it("is not hijacked by resource words inside the folder path", () => {
      expect(getTtlForResource("/me/drive/root:/Teams/Calendar/Sites:/children")).toBe(
        CACHE_TTL_MS.driveListing,
      );
    });

    it("keeps the long default for other drive reads (item metadata)", () => {
      expect(getTtlForResource("/me/drive/items/ABC")).toBe(CACHE_TTL_MS.default);
    });
  });

  describe("calendars", () => {
    it("should return calendars TTL for calendar endpoints", () => {
      expect(getTtlForResource("/me/calendar")).toBe(CACHE_TTL_MS.calendars);
      expect(getTtlForResource("/me/calendars")).toBe(CACHE_TTL_MS.calendars);
      expect(getTtlForResource("/me/calendar/events")).toBe(CACHE_TTL_MS.calendars);
    });
  });

  describe("todo lists", () => {
    it("should return todoLists TTL for todo endpoints", () => {
      expect(getTtlForResource("/me/todo/lists")).toBe(CACHE_TTL_MS.todoLists);
      expect(getTtlForResource("/me/todo/lists/123")).toBe(CACHE_TTL_MS.todoLists);
    });
  });

  describe("mail folders", () => {
    it("should return mailFolders TTL for mail folder endpoints", () => {
      expect(getTtlForResource("/me/mailFolders")).toBe(CACHE_TTL_MS.mailFolders);
      expect(getTtlForResource("/me/mailFolders/inbox")).toBe(CACHE_TTL_MS.mailFolders);
    });
  });

  describe("notebooks", () => {
    it("should return notebooks TTL for OneNote endpoints", () => {
      expect(getTtlForResource("/me/onenote/notebooks")).toBe(CACHE_TTL_MS.notebooks);
      expect(getTtlForResource("/me/onenote/notebooks/123")).toBe(CACHE_TTL_MS.notebooks);
    });
  });

  describe("presence", () => {
    it("should return presence TTL for presence endpoints", () => {
      expect(getTtlForResource("/me/presence")).toBe(CACHE_TTL_MS.presence);
      expect(getTtlForResource("/users/user123/presence")).toBe(CACHE_TTL_MS.presence);
    });
  });

  describe("teams", () => {
    it("should return teams TTL for Teams endpoints", () => {
      expect(getTtlForResource("/me/teams")).toBe(CACHE_TTL_MS.teams);
      expect(getTtlForResource("/me/joinedTeams")).toBe(CACHE_TTL_MS.teams);
      expect(getTtlForResource("/teams/team123")).toBe(CACHE_TTL_MS.teams);
    });
  });

  describe("sites", () => {
    it("should return sites TTL for SharePoint endpoints", () => {
      expect(getTtlForResource("/sites")).toBe(CACHE_TTL_MS.sites);
      expect(getTtlForResource("/sites/site123")).toBe(CACHE_TTL_MS.sites);
    });
  });

  describe("contact folders", () => {
    it("should return contactFolders TTL for contact folder endpoints", () => {
      expect(getTtlForResource("/me/contactFolders")).toBe(CACHE_TTL_MS.contactFolders);
      expect(getTtlForResource("/me/contactFolders/folder123")).toBe(CACHE_TTL_MS.contactFolders);
    });
  });

  describe("default TTL", () => {
    it("should return default TTL for other endpoints", () => {
      expect(getTtlForResource("/me/messages")).toBe(CACHE_TTL_MS.default);
      expect(getTtlForResource("/me/events")).toBe(CACHE_TTL_MS.default);
      expect(getTtlForResource("/me/drive/items")).toBe(CACHE_TTL_MS.default);
      expect(getTtlForResource("/me/contacts")).toBe(CACHE_TTL_MS.default);
      expect(getTtlForResource("/unknown/endpoint")).toBe(CACHE_TTL_MS.default);
    });
  });

  describe("TTL values", () => {
    it("should have correct TTL durations", () => {
      expect(CACHE_TTL_MS.userProfile).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.calendars).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.todoLists).toBe(30 * 60 * 1000); // 30 minutes
      expect(CACHE_TTL_MS.mailFolders).toBe(30 * 60 * 1000); // 30 minutes
      expect(CACHE_TTL_MS.notebooks).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.presence).toBe(5 * 60 * 1000); // 5 minutes
      expect(CACHE_TTL_MS.teams).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.sites).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.contactFolders).toBe(60 * 60 * 1000); // 1 hour
      expect(CACHE_TTL_MS.default).toBe(10 * 60 * 1000); // 10 minutes
    });
  });
});
