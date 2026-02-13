import { describe, expect, it } from "vitest";
import { formatTranscriptText, parseVtt } from "../src/utils/vtt-parser.js";

describe("VTT Parser", () => {
  it("should parse a simple VTT with a single cue", () => {
    const vtt = `WEBVTT

00:00:15.000 --> 00:00:32.000
<v John Doe>Hello everyone.</v>`;

    const result = parseVtt(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0].startTime).toBe("00:00:15.000");
    expect(result.cues[0].endTime).toBe("00:00:32.000");
    expect(result.cues[0].speaker).toBe("John Doe");
    expect(result.cues[0].text).toBe("Hello everyone.");
  });

  it("should parse multiple cues with speaker changes", () => {
    const vtt = `WEBVTT

00:00:15.000 --> 00:00:32.000
<v John Doe>Welcome everyone.</v>

00:00:32.000 --> 00:01:05.000
<v Jane Smith>Thanks for joining.</v>

00:01:05.000 --> 00:01:42.000
<v John Doe>Let's start.</v>`;

    const result = parseVtt(vtt);
    expect(result.cues).toHaveLength(3);
    expect(result.cues[0].speaker).toBe("John Doe");
    expect(result.cues[1].speaker).toBe("Jane Smith");
    expect(result.cues[2].speaker).toBe("John Doe");
  });

  it("should extract speaker from <v Speaker>Text</v> tags", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:10.000
<v Alice Cooper>Some text here.</v>`;

    const result = parseVtt(vtt);
    expect(result.cues[0].speaker).toBe("Alice Cooper");
    expect(result.cues[0].text).toBe("Some text here.");
  });

  it("should use previous speaker when no speaker tag present", () => {
    const vtt = `WEBVTT

00:00:15.000 --> 00:00:32.000
<v John Doe>First line.</v>

00:00:32.000 --> 00:01:05.000
Continued speaking without tag.`;

    const result = parseVtt(vtt);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[1].speaker).toBe("John Doe");
    expect(result.cues[1].text).toBe("Continued speaking without tag.");
  });

  it("should format transcript text as [timestamp] Speaker: text", () => {
    const vtt = `WEBVTT

00:00:15.000 --> 00:00:32.000
<v John Doe>Welcome everyone.</v>

00:00:32.000 --> 00:01:05.000
<v Jane Smith>Thanks for joining.</v>`;

    const parsed = parseVtt(vtt);
    const text = formatTranscriptText(parsed);
    expect(text).toBe(
      "[00:00:15] John Doe: Welcome everyone.\n[00:00:32] Jane Smith: Thanks for joining.",
    );
  });

  it("should handle empty VTT", () => {
    const vtt = "WEBVTT\n\n";
    const result = parseVtt(vtt);
    expect(result.cues).toHaveLength(0);
  });

  it("should handle malformed VTT by skipping invalid lines", () => {
    const vtt = `WEBVTT

NOTE Some note

This is not a valid cue

00:00:15.000 --> 00:00:32.000
<v John Doe>Valid cue here.</v>

random garbage line`;

    const result = parseVtt(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0].text).toBe("Valid cue here.");
  });
});
