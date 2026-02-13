import { describe, expect, it } from "vitest";
import { ListMailRulesParams } from "../src/schemas/mail-extensions.js";

describe("ListMailRulesParams schema", () => {
  it("should accept minimal params with defaults", () => {
    const result = ListMailRulesParams.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept params with top", () => {
    const result = ListMailRulesParams.safeParse({
      top: 10,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with skip", () => {
    const result = ListMailRulesParams.safeParse({
      skip: 5,
    });
    expect(result.success).toBe(true);
  });

  it("should accept params with user_id", () => {
    const result = ListMailRulesParams.safeParse({
      user_id: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should accept all params together", () => {
    const result = ListMailRulesParams.safeParse({
      top: 20,
      skip: 10,
      user_id: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should reject negative top", () => {
    const result = ListMailRulesParams.safeParse({
      top: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject zero top", () => {
    const result = ListMailRulesParams.safeParse({
      top: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject top exceeding max", () => {
    const result = ListMailRulesParams.safeParse({
      top: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative skip", () => {
    const result = ListMailRulesParams.safeParse({
      skip: -1,
    });
    expect(result.success).toBe(false);
  });
});
