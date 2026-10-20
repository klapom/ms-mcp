/**
 * House style for outgoing mail bodies: always HTML, Aptos 11pt, black —
 * the same font stack new Outlook writes into its own HTML mails.
 */
export const MAIL_FONT_STYLE =
  "font-family: Aptos, Aptos_EmbeddedFont, Aptos_MSFontService, Calibri, Helvetica, sans-serif; font-size: 11pt; color: rgb(0, 0, 0);";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Plain text → HTML, keeping line breaks. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>");
}

/**
 * Build a Graph `body` that is always HTML in the house style.
 * `bodyType` describes the input: "text" is escaped, "html" is wrapped as-is.
 * A full HTML document gets the wrapper inside its <body> element.
 */
export function toStyledHtmlBody(
  body: string,
  bodyType: "text" | "html",
): { contentType: "HTML"; content: string } {
  const inner = bodyType === "html" ? body : textToHtml(body);
  const open = `<div style="${MAIL_FONT_STYLE}">`;

  const bodyOpen = /<body\b[^>]*>/i.exec(inner);
  const bodyCloseIndex = inner.search(/<\/body\s*>/i);
  if (bodyOpen && bodyCloseIndex > bodyOpen.index) {
    const start = bodyOpen.index + bodyOpen[0].length;
    const content = `${inner.slice(0, start)}${open}${inner.slice(start, bodyCloseIndex)}</div>${inner.slice(bodyCloseIndex)}`;
    return { contentType: "HTML", content };
  }
  return { contentType: "HTML", content: `${open}${inner}</div>` };
}
