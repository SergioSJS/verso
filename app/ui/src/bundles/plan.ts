// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A Template Bundle's plan (ADR 0098 items 4 and 5): what instantiating
 *  it would make, computed before anything is written, so the window can
 *  show it and refuse it whole. Pure — the moment and the ids are handed
 *  in. The core confines every path to the folder and refuses to write
 *  over a file (ADR 0044, 0048); this is the same rule said earlier, in
 *  words the person and the AI can act on. */

import { stringify } from "yaml";
import type { TemplateBundle } from "./types";

/** ADR 0098 item 5's bounds. */
export const LIMITS = { folders: 200, files: 500, fileBytes: 256 * 1024, totalBytes: 4 * 1024 * 1024, depth: 8 } as const;

export interface PlannedFile {
  path: string;
  text: string;
  /** A note (`.md`, made by `createNote`) or another file (`.base`,
   *  `.canvas`, made by `createFile`). */
  note: boolean;
}

export interface Plan {
  folders: string[];
  files: PlannedFile[];
  /** Each problem, with the bundle's field it comes from (`/files/3/path`). */
  problems: { at: string; message: string }[];
}

export interface PlanInput {
  target: string;
  title: string;
  now: Date;
  /** A fresh id per `{{uuid}}`; `crypto.randomUUID` in the window. */
  uuid: () => string;
}

const DEVICE = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/i;
const FORBIDDEN = /[:*"<>?|\\\x00-\x1f]/;

/** Why a path segment cannot be made on every OS (ADR 0070 item 3), or
 *  inside the folder's own directories; null when it can. */
export function segmentProblem(seg: string): string | null {
  if (seg === "" ) return "empty segment";
  if (seg === "." || seg === "..") return `"${seg}" is not allowed`;
  if (seg.startsWith(".")) return `hidden name "${seg}" is not allowed`;
  if (FORBIDDEN.test(seg)) return `"${seg}" holds a character Windows refuses (: * " < > ? | \\)`;
  if (/[. ]$/.test(seg)) return `"${seg}" ends with a dot or a space`;
  if (DEVICE.test((seg.split(".")[0] ?? "").trimEnd())) return `"${seg}" is a reserved device name`;
  return null;
}

/** The title as a path segment: what Windows refuses becomes a dash, the
 *  end trimmed of dots and spaces. In text the title stays as typed. */
export function titleForPath(title: string): string {
  return title.replace(/[/\\:*"<>?|\x00-\x1f]/g, "-").replace(/[. ]+$/, "").trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `{{title}}`, `{{date}}` (YYYY-MM-DD, as the core Templates plugin),
 *  `{{time}}` (HH:mm) and `{{uuid}}` filled; any other tag stays as
 *  written. */
export function fill(text: string, title: string, now: Date, uuid: () => string): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return text
    .replaceAll("{{title}}", title)
    .replaceAll("{{date}}", date)
    .replaceAll("{{time}}", time)
    .replace(/\{\{uuid\}\}/g, () => uuid());
}

/** Frontmatter as Obsidian's properties read it: a YAML library writes it,
 *  so `[[links]]`, `#tags`, `yes`, dates and colons are quoted as YAML
 *  needs, never by hand. */
export function frontmatter(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return "";
  return `---\n${stringify(props, { lineWidth: 0 }).trimEnd()}\n---\n`;
}

function relPath(raw: string, at: string, problems: Plan["problems"]): string | null {
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    problems.push({ at, message: "path must be relative to the new project's folder" });
    return null;
  }
  const segs = raw.split("/");
  if (segs.length > LIMITS.depth) {
    problems.push({ at, message: `path is deeper than ${LIMITS.depth} folders` });
    return null;
  }
  for (const s of segs) {
    const why = segmentProblem(s);
    if (why) {
      problems.push({ at, message: why });
      return null;
    }
  }
  return segs.join("/");
}

function join(base: string, sub: string): string {
  const b = base.trim().replace(/^\/+|\/+$/g, "");
  return b ? `${b}/${sub}` : sub;
}

/** The plan: every folder and file, filled, checked, deduplicated. */
export function planBundle(bundle: TemplateBundle, input: PlanInput): Plan {
  const problems: Plan["problems"] = [];
  const title = input.title.trim();
  const pathTitle = titleForPath(title);
  if (!pathTitle) problems.push({ at: "/title", message: "the name is empty once characters Windows refuses are removed" });
  if (bundle.folders.length > LIMITS.folders) problems.push({ at: "/folders", message: `more than ${LIMITS.folders} folders` });
  if (bundle.files.length > LIMITS.files) problems.push({ at: "/files", message: `more than ${LIMITS.files} files` });

  const target = input.target.trim().replace(/^\/+|\/+$/g, "");
  if (target) for (const s of target.split("/")) {
    const why = segmentProblem(s);
    if (why) problems.push({ at: "/target", message: why });
  }

  const folders = new Set<string>();
  bundle.folders.forEach((raw, i) => {
    const rel = relPath(fill(raw, pathTitle, input.now, input.uuid), `/folders/${i}`, problems);
    if (rel) folders.add(join(target, rel));
  });

  const files: PlannedFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  bundle.files.forEach((def, i) => {
    let rel = relPath(fill(def.path, pathTitle, input.now, input.uuid), `/files/${i}/path`, problems);
    if (!rel) return;
    const last = rel.split("/").pop() ?? rel;
    const note = !/\.[A-Za-z0-9]+$/.test(last) || last.endsWith(".md");
    if (note && !rel.endsWith(".md")) rel = `${rel}.md`;
    const path = join(target, rel);
    if (seen.has(path)) {
      problems.push({ at: `/files/${i}/path`, message: `"${rel}" appears twice` });
      return;
    }
    seen.add(path);
    const props = def.frontmatter
      ? Object.fromEntries(Object.entries(def.frontmatter).map(([k, v]) => [k, typeof v === "string" ? fill(v, title, input.now, input.uuid) : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? fill(x, title, input.now, input.uuid) : x)) : v]))
      : undefined;
    if (props && !note) problems.push({ at: `/files/${i}/frontmatter`, message: "only a Markdown note has frontmatter" });
    const text = (note ? frontmatter(props) : "") + fill(def.content ?? "", title, input.now, input.uuid);
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > LIMITS.fileBytes) problems.push({ at: `/files/${i}/content`, message: `larger than ${LIMITS.fileBytes / 1024} KB` });
    total += bytes;
    files.push({ path, text, note });
  });
  if (total > LIMITS.totalBytes) problems.push({ at: "/files", message: `more than ${LIMITS.totalBytes / 1024 / 1024} MB in all` });

  return { folders: [...folders], files, problems };
}
