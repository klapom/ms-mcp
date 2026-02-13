import { describe, expect, it } from "vitest";
import { FlagEmailParams } from "../src/schemas/mail-extensions.js";

describe("FlagEmailParams schema", () => {
  it("should accept valid minimal params with flagged status", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept complete status", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "complete",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept notFlagged status", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "notFlagged",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with due_date", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      due_date: "2026-03-01T12:00:00",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with start_date", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      start_date: "2026-02-15T09:00:00",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with completion_date", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "complete",
      completion_date: "2026-02-14T14:30:00",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with all date fields", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      due_date: "2026-03-01T12:00:00",
      start_date: "2026-02-15T09:00:00",
      completion_date: "2026-02-20T14:30:00",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with user_id", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      user_id: "user@example.com",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with idempotency_key", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      confirm: true,
      idempotency_key: "flag-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept confirm: false for preview", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing message_id", () => {
    const result = FlagEmailParams.safeParse({
      flag_status: "flagged",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty message_id", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "",
      flag_status: "flagged",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing flag_status", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid flag_status", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "pending",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should apply default confirm: false", () => {
    const result = FlagEmailParams.safeParse({
      message_id: "msg-123",
      flag_status: "flagged",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});
