// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The soundboard is a note (ADR 0116 item 15, Q5 a): any link or embed of
// an audio file gets a play button; the heading above a list of such links
// names a scene, and that list is what next and previous walk. No syntax of
// our own: a list of links, as Obsidian shows it. Pure: the note's text in,
// the scenes out; the resolver says which file a link names.

/** The names a sound file ends with (what the server accepts, `table_sound.rs`). */
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/** Whether a path or a link's target names a sound file. */
export function isAudio(target: string): boolean {
  return AUDIO.test(target.split("#")[0]!.split("|")[0]!.trim());
}

/** A scene: the heading's text (`""` for the links above the first
 *  heading) and the files its links name, in order, each once. */
export type Scene = { name: string; tracks: string[] };

const WIKI = /!?\[\[([^\]\n]+)\]\]/g;
const MD = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** The sound files a line links or embeds, as written, in order. */
export function audioTargets(line: string): string[] {
  const clean = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
  const found: { at: number; target: string }[] = [];
  for (const m of clean.matchAll(WIKI)) {
    const target = (m[1] ?? "").split("|")[0]!.split("#")[0]!.trim();
    if (isAudio(target)) found.push({ at: m.index ?? 0, target });
  }
  for (const m of clean.matchAll(MD)) {
    let target = (m[1] ?? "").trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    try {
      target = decodeURI(target);
    } catch {
      // Written as it is.
    }
    if (isAudio(target)) found.push({ at: m.index ?? 0, target });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.target);
}

/** The scenes of a note: each heading starts one, and the sound files its
 *  section links or embeds are its tracks. `resolve` names the file a
 *  target leads to (null: none). A fenced code block is not read. Scenes
 *  with no track are left out. */
export function scenesOf(text: string, resolve: (target: string) => string | null): Scene[] {
  const out: Scene[] = [];
  let current: Scene = { name: "", tracks: [] };
  let fence: string | null = null;
  const close = () => {
    if (current.tracks.length > 0) out.push(current);
  };
  for (const line of text.split(/\r?\n/)) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const head = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (head) {
      close();
      current = { name: head[2] ?? "", tracks: [] };
      continue;
    }
    for (const target of audioTargets(line)) {
      const path = resolve(target);
      if (path && !current.tracks.includes(path)) current.tracks.push(path);
    }
  }
  close();
  return out;
}

/** The scene a play button stands in: the first scene that holds the file
 *  (a file linked twice plays from where it was first). */
export function sceneWith(scenes: readonly Scene[], path: string): Scene | null {
  return scenes.find((s) => s.tracks.includes(path)) ?? null;
}

/** The scene of a play button under the heading `heading` (its text; null:
 *  above every heading): the scene of that name that holds the file, else
 *  the first that does — a file linked in two scenes plays in the one its
 *  button is in. */
export function sceneUnder(scenes: readonly Scene[], path: string, heading: string | null): Scene | null {
  return scenes.find((s) => s.name === (heading ?? "") && s.tracks.includes(path)) ?? sceneWith(scenes, path);
}

/** The text of the heading above offset `at` of a note's text, or null. */
export function headingBefore(text: string, at: number): string | null {
  const lines = text.slice(0, Math.max(0, at)).split(/\r?\n/);
  let fence: string | null = null;
  let found: string | null = null;
  for (const line of lines) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const head = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (head) found = head[2] ?? "";
  }
  return found;
}

/** The track after `path` in the scene; with `wrap`, the first after the
 *  last; null at the end, or when the scene does not hold it. */
export function nextIn(scene: Scene | null, path: string, wrap = false): string | null {
  if (!scene) return null;
  const i = scene.tracks.indexOf(path);
  if (i < 0) return null;
  if (i + 1 < scene.tracks.length) return scene.tracks[i + 1]!;
  return wrap && scene.tracks.length > 1 ? scene.tracks[0]! : null;
}

/** The track before `path` in the scene; with `wrap`, the last before the first. */
export function previousIn(scene: Scene | null, path: string, wrap = false): string | null {
  if (!scene) return null;
  const i = scene.tracks.indexOf(path);
  if (i < 0) return null;
  if (i > 0) return scene.tracks[i - 1]!;
  return wrap && scene.tracks.length > 1 ? scene.tracks[scene.tracks.length - 1]! : null;
}

/** The track's name as the strip shows it: the file's name without its extension. */
export function trackName(path: string): string {
  const leaf = path.split("/").pop() ?? path;
  return leaf.replace(AUDIO, "");
}
