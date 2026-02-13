import { describe, expect, it } from "vitest";
import {
  AddAttachmentParams,
  CreateDraftParams,
  SendDraftParams,
} from "../src/schemas/mail-extensions.js";

describe("CreateDraftParams schema", () => {
  it("should accept minimal params with defaults", () => {
    const result = CreateDraftParams.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body_type).toBe("text");
      expect(result.data.importance).toBe("normal");
      expect(result.data.save_to_sent_items).toBe(true);
      expect(result.data.confirm).toBe(false);
    }
  });

  it("should accept full draft params", () => {
    const result = CreateDraftParams.safeParse({
      subject: "Test Subject",
      body: "Test body content",
      body_type: "html",
      to: [{ address: "user1@example.com", name: "User One" }],
      cc: [{ address: "user2@example.com" }],
      bcc: [{ address: "user3@example.com", name: "User Three" }],
      importance: "high",
      save_to_sent_items: false,
      confirm: true,
      idempotency_key: "draft-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty recipients arrays", () => {
    const result = CreateDraftParams.safeParse({
      to: [],
      cc: [],
      bcc: [],
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid body_type", () => {
    const result = CreateDraftParams.safeParse({
      body_type: "markdown",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid importance", () => {
    const result = CreateDraftParams.safeParse({
      importance: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("should reject recipient without address", () => {
    const result = CreateDraftParams.safeParse({
      to: [{ name: "User" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty recipient address", () => {
    const result = CreateDraftParams.safeParse({
      to: [{ address: "" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("SendDraftParams schema", () => {
  it("should accept valid minimal params", () => {
    const result = SendDraftParams.safeParse({
      message_id: "draft-123",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with idempotency_key", () => {
    const result = SendDraftParams.safeParse({
      message_id: "draft-123",
      confirm: true,
      idempotency_key: "send-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept confirm: false for preview", () => {
    const result = SendDraftParams.safeParse({
      message_id: "draft-123",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing message_id", () => {
    const result = SendDraftParams.safeParse({
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty message_id", () => {
    const result = SendDraftParams.safeParse({
      message_id: "",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should apply default confirm: false", () => {
    const result = SendDraftParams.safeParse({
      message_id: "draft-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});

describe("AddAttachmentParams schema", () => {
  it("should accept valid minimal params", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "document.pdf",
      content_bytes: "SGVsbG8gV29ybGQ=",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with content_type", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "image.png",
      content_bytes: "iVBORw0KG...",
      content_type: "image/png",
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with is_inline", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "logo.png",
      content_bytes: "iVBORw0KG...",
      is_inline: true,
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with idempotency_key", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      content_bytes: "SGVsbG8=",
      confirm: true,
      idempotency_key: "attach-123",
    });
    expect(result.success).toBe(true);
  });

  it("should accept confirm: false for preview", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      content_bytes: "SGVsbG8=",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing message_id", () => {
    const result = AddAttachmentParams.safeParse({
      name: "file.txt",
      content_bytes: "SGVsbG8=",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty message_id", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "",
      name: "file.txt",
      content_bytes: "SGVsbG8=",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing name", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      content_bytes: "SGVsbG8=",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty name", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "",
      content_bytes: "SGVsbG8=",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing content_bytes", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty content_bytes", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      content_bytes: "",
      confirm: true,
    });
    expect(result.success).toBe(false);
  });

  it("should apply default is_inline: false", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      content_bytes: "SGVsbG8=",
      confirm: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_inline).toBe(false);
    }
  });

  it("should apply default confirm: false", () => {
    const result = AddAttachmentParams.safeParse({
      message_id: "draft-123",
      name: "file.txt",
      content_bytes: "SGVsbG8=",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});
