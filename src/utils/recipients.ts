/**
 * Converts an array of email addresses to the Graph API recipient format.
 */
export function toRecipients(emails: string[]): Array<{ emailAddress: { address: string } }> {
  return emails.map((address) => ({ emailAddress: { address } }));
}

/**
 * Converts recipient inputs to the Graph API recipient format, keeping display names.
 */
export function toNamedRecipients(
  recipients: Array<{ address: string; name?: string }>,
): Array<{ emailAddress: { address: string; name?: string } }> {
  return recipients.map((r) => ({
    emailAddress:
      r.name === undefined ? { address: r.address } : { address: r.address, name: r.name },
  }));
}

interface AttendeeInput {
  email: string;
  name?: string;
  type?: string;
}

/**
 * Converts an array of attendee inputs to the Graph API attendee format.
 */
export function toAttendees(
  attendees: AttendeeInput[],
): Array<{ emailAddress: { address: string; name?: string }; type: string }> {
  return attendees.map((a) => ({
    emailAddress: { address: a.email, name: a.name },
    type: a.type ?? "required",
  }));
}
