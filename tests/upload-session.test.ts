import type { Client } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadSession } from "../src/utils/upload-session.js";

const logSpies = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => logSpies,
  logger: logSpies,
}));

/** Spy Graph client whose `.api().post()` records calls but never hits the network. */
function createSpyGraphClient(uploadUrl: string) {
  const post = vi.fn().mockResolvedValue({
    uploadUrl,
    expirationDateTime: "2026-07-20T00:00:00Z",
  });
  const api = vi.fn().mockReturnValue({ post });
  return { client: { api } as unknown as Client, api, post };
}

describe("createUploadSession", () => {
  beforeEach(() => {
    logSpies.info.mockClear();
    logSpies.debug.mockClear();
  });

  it("rejects an unsafe fileName (defence in depth) before any Graph call", async () => {
    const { client, api } = createSpyGraphClient("https://upload.example/session");

    await expect(
      createUploadSession(client, "/me/drive", undefined, "x:y", "fail"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(api).not.toHaveBeenCalled();
  });

  it("creates a session for a safe fileName", async () => {
    const { client, api } = createSpyGraphClient("https://upload.example/session");

    const session = await createUploadSession(client, "/me/drive", undefined, "report.pdf", "fail");

    expect(session.uploadUrl).toBe("https://upload.example/session");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("never logs the pre-authenticated uploadUrl at info level", async () => {
    const preAuthUrl = "https://upload.example/session?token=PREAUTH-SECRET";
    const { client } = createSpyGraphClient(preAuthUrl);

    await createUploadSession(client, "/me/drive", undefined, "report.pdf", "fail");

    for (const call of logSpies.info.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(preAuthUrl);
    }
  });
});
