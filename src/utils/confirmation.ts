import { createLogger } from "../utils/logger.js";

const log = createLogger("confirmation");

export type ToolClassification = "safe" | "moderate" | "destructive";

/**
 * Checks if a destructive operation should proceed.
 * Returns a preview response if confirm is false,
 * or null if the operation should proceed.
 */
export function checkConfirmation(
  classification: ToolClassification,
  confirm: boolean,
  previewMessage: string,
): { isPreview: true; message: string } | null {
  if (classification === "safe") {
    return null;
  }

  if (classification === "moderate" && confirm) {
    return null;
  }

  if (classification === "destructive" && confirm) {
    log.info("Destructive operation confirmed by user");
    return null;
  }

  log.debug({ classification, confirm }, "Operation requires confirmation");
  return { isPreview: true, message: previewMessage };
}

/**
 * Formats a confirmation preview for destructive operations.
 */
export function formatPreview(action: string, details: Record<string, unknown>): string {
  const detailLines = Object.entries(details)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `  - ${key}: ${String(value)}`);

  const lines = [
    `Preview: ${action}`,
    "",
    ...detailLines,
    "",
    "Confirm with confirm: true to execute this action.",
  ];

  return lines.join("\n");
}
