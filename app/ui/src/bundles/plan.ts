// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A Template Bundle's plan (ADR 0098 items 4 and 5): what instantiating
 *  it would make, computed before anything is written, so the window can
 *  show it and refuse it whole. Pure — the moment, the ids and the words
 *  are handed in. The core confines every path to the folder and refuses
 *  to write over a file (ADR 0044, 0048); this is the same rule said
 *  earlier, in words the person and the AI can act on. */

import { stringify } from "yaml";
import { formatDate, type Lang, type When } from "../periodic/format";
import type { TemplateBundle } from "./types";
import type { BundleWords } from "./words";

/** ADR 0098 item 5's bounds. */
export const LIMITS = { folders: 200, files: 500, fileBytes: 256 * 1024, totalBytes: 4 * 1024 * 1024, depth: 8 } as const;

/** The files a bundle may make that are not notes. */
const OTHER_FILES = /\.(canvas|base)$/i;

export interface PlannedFile {
  path: string;
  text: string;
  /** A note (`.md`, made by `createNote`) or another file (`.base`,
   *  `.canvas`, made by `createFile`). */
  note: boolean;
}

export interface Plan {
  /** Every folder to make, parents before children, the project's own first. */
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
  words: BundleWords;
  /** The language of `{{date:MMMM}}` and the like; English when absent. */
  lang?: Lang;
}

const DEVICE = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/i;
const FORBIDDEN = /[:*"<>?|\\\x00-\x1f]/;

/** Why a path segment cannot be made on every OS (ADR 0070 item 3), or
 *  inside the folder's own directories; null when it can. */
export function segmentProblem(seg: string, w: BundleWords): string | null {
  if (seg === "") return w.plan.empty;
  if (seg === "." || seg === "..") return w.plan.notAllowed(seg);
  if (seg.startsWith(".")) return w.plan.hidden(seg);
  if (FORBIDDEN.test(seg)) return w.plan.forbidden(seg);
  if (/[. ]$/.test(seg)) return w.plan.trailing(seg);
  if (DEVICE.test((seg.split(".")[0] ?? "").trimEnd())) return w.plan.device(seg);
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
 *  `{{time}}` (HH:mm), `{{uuid}}`, and `{{date:FORMAT}}` / `{{time:FORMAT}}`
 *  (Moment tokens, month and day names in `lang`) filled in one pass, so a
 *  title that holds a tag is not filled again; any other tag, or a format
 *  with a token Verso does not read, stays as written (ADR 0098 item 7). */
export function fill(text: string, title: string, now: Date, uuid: () => string, lang: Lang = "en"): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const when: When = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), h: now.getHours(), mi: now.getMinutes(), s: now.getSeconds() };
  return text.replace(/\{\{(?:(title|date|time|uuid)|(?:date|time):([^{}]+))\}\}/g, (all, tag: string | undefined, format: string | undefined) => {
    if (format !== undefined) return formatDate(when, format, { weekStart: 0, lang }, true) ?? all;
    return tag === "title" ? title : tag === "date" ? date : tag === "time" ? time : uuid();
  });
}

/** Frontmatter as Obsidian's properties read it: a YAML library writes it,
 *  so `[[links]]`, `#tags`, `yes`, numbers and colons are quoted as YAML
 *  needs, never by hand. */
export function frontmatter(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return "";
  return `---\n${stringify(props, { lineWidth: 0 }).trimEnd()}\n---\n`;
}

function relPath(raw: string, at: string, problems: Plan["problems"], w: BundleWords): string | null {
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    problems.push({ at, message: w.plan.relative });
    return null;
  }
  const segs = raw.split("/");
  if (segs.length > LIMITS.depth) {
    problems.push({ at, message: w.plan.deep(LIMITS.depth) });
    return null;
  }
  for (const s of segs) {
    const why = segmentProblem(s, w);
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

function fillValue(v: unknown, title: string, input: PlanInput): unknown {
  if (typeof v === "string") return fill(v, title, input.now, input.uuid, input.lang);
  if (Array.isArray(v)) return v.map((x) => fillValue(x, title, input));
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillValue(x, title, input)]));
  return v;
}

/** The plan: the project's folder, then every folder and file, filled,
 *  checked, deduplicated. */
export function planBundle(bundle: TemplateBundle, input: PlanInput): Plan {
  const w = input.words;
  const problems: Plan["problems"] = [];
  const title = input.title.trim();
  const pathTitle = titleForPath(title);
  if (!pathTitle) problems.push({ at: "/title", message: w.plan.emptyName });
  else {
    const why = segmentProblem(pathTitle, w);
    if (why) problems.push({ at: "/title", message: why });
  }
  if (bundle.folders.length > LIMITS.folders) problems.push({ at: "/folders", message: w.plan.moreFolders(LIMITS.folders) });
  if (bundle.files.length > LIMITS.files) problems.push({ at: "/files", message: w.plan.moreFiles(LIMITS.files) });

  const target = input.target.trim().replace(/^\/+|\/+$/g, "");
  if (target) for (const s of target.split("/")) {
    const why = segmentProblem(s, w);
    if (why) problems.push({ at: "/target", message: why });
  }
  // Everything the bundle makes lives in a folder named for the project.
  const base = join(target, pathTitle);

  const folders = new Set<string>();
  // The target is the person's own, and stands; the project's folder is new.
  if (pathTitle) folders.add(base);
  // Past the limit the plan is refused anyway: the loops stop there instead of reading on.
  bundle.folders.slice(0, LIMITS.folders).forEach((raw, i) => {
    const rel = relPath(fill(raw, pathTitle, input.now, input.uuid, input.lang), `/folders/${i}`, problems, w);
    if (!rel) return;
    const segs = rel.split("/");
    for (let n = 1; n <= segs.length; n++) folders.add(join(base, segs.slice(0, n).join("/")));
  });

  const files: PlannedFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  bundle.files.slice(0, LIMITS.files).forEach((def, i) => {
    let rel = relPath(fill(def.path, pathTitle, input.now, input.uuid, input.lang), `/files/${i}/path`, problems, w);
    if (!rel) return;
    const note = !OTHER_FILES.test(rel);
    if (note && !/\.md$/i.test(rel)) rel = `${rel}.md`;
    const path = join(base, rel);
    if (seen.has(path.toLowerCase())) {
      problems.push({ at: `/files/${i}/path`, message: w.plan.twice(rel) });
      return;
    }
    seen.add(path.toLowerCase());
    const dir = rel.split("/").slice(0, -1);
    for (let n = 1; n <= dir.length; n++) folders.add(join(base, dir.slice(0, n).join("/")));
    const props = def.frontmatter ? (fillValue(def.frontmatter, title, input) as Record<string, unknown>) : undefined;
    if (props && Object.keys(props).length > 0 && !note) problems.push({ at: `/files/${i}/frontmatter`, message: w.plan.onlyNotes });
    let head = "";
    if (note) {
      try {
        head = frontmatter(props);
      } catch {
        problems.push({ at: `/files/${i}/frontmatter`, message: w.plan.badFrontmatter });
      }
    }
    const text = head + fill(def.content ?? "", title, input.now, input.uuid, input.lang);
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > LIMITS.fileBytes) problems.push({ at: `/files/${i}/content`, message: w.plan.bigFile(LIMITS.fileBytes / 1024) });
    total += bytes;
    files.push({ path, text, note });
  });
  if (total > LIMITS.totalBytes) problems.push({ at: "/files", message: w.plan.bigTotal(LIMITS.totalBytes / 1024 / 1024) });
  if (folders.size > LIMITS.folders) problems.push({ at: "/folders", message: w.plan.moreFolders(LIMITS.folders) });

  const ordered = [...folders].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return { folders: ordered, files, problems };
}

/** The problems of a plan the person edited (renamed or thinned out) in
 *  the confirmation: every path again checked as a bundle's own are. */
export function checkEdited(plan: Plan, w: BundleWords): Plan["problems"] {
  const problems: Plan["problems"] = [];
  const check = (path: string, at: string): void => {
    if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return void problems.push({ at, message: w.plan.relative });
    for (const seg of path.split("/")) {
      const why = segmentProblem(seg, w);
      if (why) return void problems.push({ at, message: why });
    }
  };
  const seen = new Set<string>();
  const once = (path: string, at: string): void => {
    const key = path.toLowerCase();
    if (seen.has(key)) problems.push({ at, message: w.plan.twice(path) });
    seen.add(key);
  };
  plan.folders.forEach((f, i) => {
    check(f, `/folders/${i}`);
    once(f, `/folders/${i}`);
  });
  plan.files.forEach((f, i) => {
    check(f.path, `/files/${i}/path`);
    once(f.path, `/files/${i}/path`);
  });
  return problems;
}
