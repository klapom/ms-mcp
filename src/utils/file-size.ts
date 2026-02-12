/**
 * File size formatting and text content detection utilities.
 */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const TEXT_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/csv",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".csv",
  ".json",
  ".md",
  ".xml",
  ".html",
  ".log",
  ".yml",
  ".yaml",
  ".ts",
  ".js",
  ".py",
]);

export function isTextContent(contentType: string, fileName: string): boolean {
  if (contentType.startsWith("text/")) return true;
  if (TEXT_CONTENT_TYPES.has(contentType)) return true;
  if (contentType === "application/octet-stream") {
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex === -1) return false;
    const ext = fileName.slice(dotIndex).toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
  }
  return false;
}
