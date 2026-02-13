/**
 * VTT (WebVTT) parser for Microsoft Teams meeting transcripts.
 *
 * Teams transcripts use the <v Speaker>Text</v> format for speaker identification.
 */

export interface VttCue {
  startTime: string; // "00:01:23.456"
  endTime: string;
  speaker: string; // Extracted from <v> tag or previous cue
  text: string; // Clean cue text without speaker prefix
}

export interface ParsedTranscript {
  cues: VttCue[];
  language?: string;
  duration?: string;
}

const TIMESTAMP_REGEX = /^\s*(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
const SPEAKER_REGEX = /<v\s+([^>]+)>(.+?)<\/v>/;

/**
 * Parses VTT content into structured cues with speaker information.
 */
export function parseVtt(vttContent: string): ParsedTranscript {
  const lines = vttContent.split("\n");
  const cues: VttCue[] = [];
  let currentSpeaker = "Unknown";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WEBVTT header, NOTE lines, and empty lines
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE")) {
      continue;
    }

    // Check for timestamp line
    const timestampMatch = line.match(TIMESTAMP_REGEX);
    if (timestampMatch) {
      const startTime = timestampMatch[1];
      const endTime = timestampMatch[2];
      const textLine = lines[i + 1]?.trim() ?? "";

      if (!textLine) {
        i++;
        continue;
      }

      // Extract speaker and text from <v Speaker>Text</v>
      const speakerMatch = textLine.match(SPEAKER_REGEX);
      if (speakerMatch) {
        currentSpeaker = speakerMatch[1];
        cues.push({ startTime, endTime, speaker: currentSpeaker, text: speakerMatch[2] });
      } else {
        // No speaker tag, use previous speaker
        cues.push({ startTime, endTime, speaker: currentSpeaker, text: textLine });
      }

      i++; // Skip text line
    }
  }

  return { cues };
}

/**
 * Formats parsed transcript into human-readable text.
 * Output: [HH:MM:SS] Speaker: text
 */
export function formatTranscriptText(parsed: ParsedTranscript): string {
  return parsed.cues
    .map((cue) => `[${cue.startTime.substring(0, 8)}] ${cue.speaker}: ${cue.text}`)
    .join("\n");
}
