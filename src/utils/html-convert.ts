import { convert as htmlToText } from "html-to-text";
import { truncateBody } from "./response-shaper.js";

/**
 * Converts HTML content to LLM-optimized plain text.
 * Strips images, collapses redundant link text, removes dangerous javascript: URLs,
 * and truncates to maxLength.
 *
 * Shared by read_email and get_event (event body).
 */
export function convertHtmlToText(html: string, maxLength: number): string {
  let text = htmlToText(html, {
    wordwrap: 120,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  });
  // Strip dangerous protocol URLs that html-to-text renders as text in link brackets
  text = text.replace(/\[javascript:[^\]]*\]/gi, "");
  return truncateBody(text, maxLength);
}
