/**
 * Converts an array of email addresses to the Graph API recipient format.
 */
export function toRecipients(emails: string[]): Array<{ emailAddress: { address: string } }> {
  return emails.map((address) => ({ emailAddress: { address } }));
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
