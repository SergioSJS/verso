// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What each window can play (ADR 0116 item 13, Q2 a): no transcoding
// anywhere. A window asks its own engine; one that refuses says so to the
// game master. MP3 or AAC is the advice for a table with phones; a large
// WAV or FLAC is said once, since every listener downloads it.

/** The type an engine is asked about, by the file's extension. */
export function mimeOf(path: string): string | null {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "opus":
      return 'audio/ogg; codecs="opus"';
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    default:
      return null;
  }
}

/** Whether this window's engine says it may play the file: `canPlayType`'s
 *  "maybe" and "probably" are a yes, "" a no. */
export function canPlay(path: string, ask: (mime: string) => string): boolean {
  const mime = mimeOf(path);
  if (!mime) return false;
  try {
    return ask(mime) !== "";
  } catch {
    return false;
  }
}

/** Past this, a WAV or FLAC is "large": every listener downloads it. */
export const LARGE_BYTES = 30 * 1024 * 1024;

/** Whether the strip warns about the file once (item 13): an uncompressed
 *  or lossless file over 30 MB. */
export function large(path: string, bytes: number | null): boolean {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  return (ext === "wav" || ext === "flac") && bytes !== null && bytes > LARGE_BYTES;
}
