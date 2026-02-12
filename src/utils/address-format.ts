import { isRecordObject } from "./type-guards.js";

/**
 * Extracts a formatted address string from a Graph API address object.
 * Returns "Name <email>" if name is present, or just "email", or "(unknown)".
 */
export function extractAddress(addressObj: unknown): string {
  if (!isRecordObject(addressObj)) return "(unknown)";
  if (!isRecordObject(addressObj.emailAddress)) return "(unknown)";
  const name = typeof addressObj.emailAddress.name === "string" ? addressObj.emailAddress.name : "";
  const address =
    typeof addressObj.emailAddress.address === "string" ? addressObj.emailAddress.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}

/**
 * Extracts and joins a list of address objects into a comma-separated string.
 */
export function extractAddressList(recipients: unknown): string {
  if (!Array.isArray(recipients)) return "";
  return recipients.map((r: unknown) => extractAddress(r)).join(", ");
}

/**
 * Same as extractAddressList but filters out "(unknown)" entries.
 * Used by read_email for cleaner display.
 */
export function extractAddressListFiltered(recipients: unknown): string {
  if (!Array.isArray(recipients)) return "";
  return recipients
    .map((r: unknown) => extractAddress(r))
    .filter((a) => a !== "(unknown)")
    .join(", ");
}
