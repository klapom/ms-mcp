/**
 * Converts an array of email addresses to the Graph API recipient format.
 */
export function toRecipients(emails: string[]): Array<{ emailAddress: { address: string } }> {
  return emails.map((address) => ({ emailAddress: { address } }));
}
