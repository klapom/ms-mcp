import { describe, expect, it } from "vitest";
import { CreateMailFolderParams } from "../src/schemas/mail-extensions.js";

describe("CreateMailFolderParams schema", () => {
  it("should accept valid minimal params", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "New Folder",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with parent_folder_id", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "Subfolder",
      parent_folder_id: "parent-123",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with user_id", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "New Folder",
      user_id: "user@example.com",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with idempotency_key", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "New Folder",
      confirm: true,
      idempotency_key: "folder-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept confirm: false for preview", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "New Folder",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing display_name", () => {
    const result = CreateMailFolderParams.safeParse({
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty display_name", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty parent_folder_id", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "Subfolder",
      parent_folder_id: "",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should apply default confirm: false", () => {
    const result = CreateMailFolderParams.safeParse({
      display_name: "New Folder",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});
