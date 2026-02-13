import type { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "./logger.js";

const logger = createLogger("utils:upload-session");

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB (Graph API recommends 5-10 MB)
const MAX_CHUNK_SIZE = 60 * 1024 * 1024; // 60 MB (Graph API limit)
const MAX_RETRIES = 3;

interface UploadSessionResponse {
  uploadUrl: string;
  expirationDateTime: string;
}

interface ChunkUploadResponse {
  expirationDateTime?: string;
  nextExpectedRanges?: string[];
  // On final chunk, Graph returns driveItem
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
}

interface DriveItem {
  id: string;
  name: string;
  size: number;
  webUrl: string;
}

/**
 * Creates an upload session for resumable file upload.
 *
 * @param graphClient - Authenticated Graph API client
 * @param drivePath - Base drive path (e.g., "/me/drive" or "/drives/{id}")
 * @param folderId - Target folder ID (if undefined, uses root)
 * @param fileName - Name of file to create
 * @param conflictBehavior - How to handle existing file: "fail", "replace", "rename"
 * @returns Upload session URL and expiration time
 */
export async function createUploadSession(
  graphClient: Client,
  drivePath: string,
  folderId: string | undefined,
  fileName: string,
  conflictBehavior: "fail" | "replace" | "rename",
): Promise<UploadSessionResponse> {
  const basePath = folderId ? `${drivePath}/items/${folderId}` : `${drivePath}/root`;
  const url = `${basePath}:/${fileName}:/createUploadSession`;

  // Map conflict behavior to Graph API property
  const conflictBehaviorMap = {
    fail: "fail",
    replace: "replace",
    rename: "rename",
  };

  const requestBody = {
    item: {
      "@microsoft.graph.conflictBehavior": conflictBehaviorMap[conflictBehavior],
    },
  };

  logger.debug({ url, fileName, conflictBehavior }, "Creating upload session");

  const response = (await graphClient.api(url).post(requestBody)) as UploadSessionResponse;

  logger.info({ fileName, uploadUrl: response.uploadUrl }, "Upload session created");

  return response;
}

/**
 * Uploads a single chunk to the upload session URL.
 *
 * @param uploadUrl - Upload session URL from createUploadSession
 * @param chunk - Chunk data (Buffer)
 * @param chunkIndex - Zero-based chunk index
 * @param totalSize - Total file size in bytes
 * @param chunkSize - Size of each chunk (used to calculate range)
 * @returns Upload status and driveItem on completion
 */
export async function uploadChunk(
  uploadUrl: string,
  chunk: Buffer,
  chunkIndex: number,
  totalSize: number,
  chunkSize: number,
): Promise<{ completed: boolean; driveItem?: DriveItem }> {
  const startByte = chunkIndex * chunkSize;
  const endByte = Math.min(startByte + chunk.length - 1, totalSize - 1);
  const contentRange = `bytes ${startByte}-${endByte}/${totalSize}`;

  logger.debug({ chunkIndex, contentRange }, "Uploading chunk");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(chunk.length),
      "Content-Range": contentRange,
    },
    body: chunk,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, chunkIndex, errorText }, "Chunk upload failed");
    throw new Error(`Chunk upload failed with status ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as ChunkUploadResponse;

  // Check if upload completed (Graph returns driveItem on final chunk)
  if (result.id && result.name) {
    logger.info({ fileId: result.id, fileName: result.name }, "Upload completed");
    return {
      completed: true,
      driveItem: {
        id: result.id,
        name: result.name,
        size: result.size ?? 0,
        webUrl: result.webUrl ?? "",
      },
    };
  }

  logger.debug({ chunkIndex, nextExpectedRanges: result.nextExpectedRanges }, "Chunk uploaded");

  return { completed: false };
}

/**
 * Uploads a chunk with automatic retry logic.
 *
 * @param uploadUrl - Upload session URL
 * @param chunk - Chunk data
 * @param chunkIndex - Zero-based chunk index
 * @param totalSize - Total file size
 * @param chunkSize - Chunk size
 * @returns Upload status and driveItem on completion
 */
async function uploadChunkWithRetry(
  uploadUrl: string,
  chunk: Buffer,
  chunkIndex: number,
  totalSize: number,
  chunkSize: number,
): Promise<{ completed: boolean; driveItem?: DriveItem }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await uploadChunk(uploadUrl, chunk, chunkIndex, totalSize, chunkSize);
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        logger.error({ chunkIndex, attempt, error }, "Chunk upload failed after retries");
        throw error;
      }

      const delayMs = 2 ** attempt * 1000; // Exponential backoff
      logger.warn({ chunkIndex, attempt, delayMs }, "Chunk upload failed, retrying...");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Upload chunk retry logic failed unexpectedly");
}

/**
 * Splits base64-encoded content into fixed-size chunks.
 *
 * @param base64Content - Base64-encoded file content
 * @param chunkSize - Size of each chunk in bytes (default: 10 MB)
 * @returns Array of Buffer chunks
 */
export function chunkBuffer(
  base64Content: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Buffer[] {
  // Validate chunk size
  if (chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`Chunk size ${chunkSize} exceeds maximum allowed size ${MAX_CHUNK_SIZE}`);
  }

  const buffer = Buffer.from(base64Content, "base64");
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, buffer.length);
    chunks.push(buffer.subarray(offset, end));
  }

  logger.debug(
    { totalSize: buffer.length, chunkSize, chunkCount: chunks.length },
    "Buffer chunked",
  );

  return chunks;
}

/**
 * Uploads all chunks sequentially with retry logic.
 *
 * @param uploadUrl - Upload session URL
 * @param chunks - Array of Buffer chunks
 * @param totalSize - Total file size in bytes
 * @param chunkSize - Size of each chunk
 * @returns Final driveItem after successful upload
 */
export async function uploadAllChunks(
  uploadUrl: string,
  chunks: Buffer[],
  totalSize: number,
  chunkSize: number,
): Promise<DriveItem> {
  logger.info({ chunkCount: chunks.length, totalSize }, "Starting chunked upload");

  let driveItem: DriveItem | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const result = await uploadChunkWithRetry(uploadUrl, chunks[i], i, totalSize, chunkSize);

    if (result.completed) {
      driveItem = result.driveItem;
      break;
    }
  }

  if (!driveItem) {
    throw new Error("Upload completed but no driveItem returned");
  }

  return driveItem;
}
