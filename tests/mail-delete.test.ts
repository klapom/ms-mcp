import { describe, expect, it } from "vitest";
import { DeleteEmailParams } from "../src/schemas/mail-extensions.js";

describe("DeleteEmailParams schema", () => {
  it("should accept valid minimal params", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "msg-123",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with optional user_id", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "msg-123",
      user_id: "user@example.com",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with idempotency_key", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "msg-123",
      confirm: true,
      idempotency_key: "delete-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept confirm: false for preview", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "msg-123",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing message_id", () => {
    const result = DeleteEmailParams.safeParse({
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty message_id", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should apply default confirm: false", () => {
    const result = DeleteEmailParams.safeParse({
      message_id: "msg-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});
