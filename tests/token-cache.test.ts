import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock msal-node-extensions
const mockPersistence = {
  save: vi.fn(),
  load: vi.fn(),
  delete: vi.fn(),
  reloadNecessary: vi.fn(),
  getFilePath: vi.fn(),
  getLogger: vi.fn(),
  verifyPersistence: vi.fn(),
  createForPersistenceValidation: vi.fn(),
};

const mockPlugin = {
  beforeCacheAccess: vi.fn(),
  afterCacheAccess: vi.fn(),
};

vi.mock("@azure/msal-node-extensions", () => ({
  FilePersistence: {
    create: vi.fn().mockResolvedValue(mockPersistence),
  },
  PersistenceCachePlugin: vi.fn().mockReturnValue(mockPlugin),
}));

// Suppress pino log output during tests
vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

const { createCachePlugin } = await import("../src/auth/token-cache.js");
const { FilePersistence, PersistenceCachePlugin } = await import("@azure/msal-node-extensions");

let testDir: string;

describe("createCachePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDir = join(tmpdir(), `ms-mcp-test-${Date.now()}`);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
  });

  it("should create parent directories if they do not exist", async () => {
    const cachePath = join(testDir, "sub", "token-cache.json");

    await createCachePlugin(cachePath);

    expect(existsSync(join(testDir, "sub"))).toBe(true);
  });

  it("should call FilePersistence.create with the cache path", async () => {
    const cachePath = join(testDir, "token-cache.json");

    await createCachePlugin(cachePath);

    expect(FilePersistence.create).toHaveBeenCalledWith(cachePath);
  });

  it("should create PersistenceCachePlugin with the persistence", async () => {
    const cachePath = join(testDir, "token-cache.json");

    await createCachePlugin(cachePath);

    expect(PersistenceCachePlugin).toHaveBeenCalledWith(mockPersistence);
  });

  it("should return the cache plugin", async () => {
    const cachePath = join(testDir, "token-cache.json");

    const result = await createCachePlugin(cachePath);

    expect(result).toBe(mockPlugin);
  });

  it("should not fail when directory already exists", async () => {
    await mkdir(testDir, { recursive: true });
    const cachePath = join(testDir, "token-cache.json");

    const result = await createCachePlugin(cachePath);

    expect(result).toBe(mockPlugin);
  });

  it("should propagate error when FilePersistence.create fails", async () => {
    const cachePath = join(testDir, "token-cache.json");
    const persistenceError = new Error("EACCES: permission denied");

    (FilePersistence.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(persistenceError);

    await expect(createCachePlugin(cachePath)).rejects.toThrow("EACCES: permission denied");
  });
});
