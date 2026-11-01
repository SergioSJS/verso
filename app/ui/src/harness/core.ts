// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The browser harness's core (ADR 0058): every command the window asks the
// Rust core for (`../bindings.ts`), answered from a folder held in memory.
// The answers have the contract's shapes; what they compute is an
// approximation of the core's — links resolved as a link written in the
// note would be, a search that wants every word, a base filtered by folder,
// tag and link — enough for the window to behave as it does in the app.
// The core's own rules are tested in the core.
//
// A command the window may call and the harness does not answer is an
// error on the console, which fails a test: the harness grows with the
// contract (e2e/harness.spec.mjs checks that every command of bindings.ts
// has an answer).

import YAML from "yaml";
import { menuSections } from "./menu";
import { rewriteOrder } from "./order";
import { FOLDER_CAN } from "../folderCan";
import type {
  Capabilities,
  FolderSpace,
  AppInfo,
  DeviceName,
  DeviceRenamed,
  Backlink,
  BaseCell,
  BaseColumn,
  BaseGroup,
  BaseQuery,
  BaseResult,
  BaseRow,
  CliState,
  ContractError,
  Edge,
  EntryLabel,
  ErrorKind,
  FileEntry,
  FolderInfo,
  Hit,
  IndexSummary,
  Link,
  LinkRewrite,
  McpAdded,
  McpStatus,
  MovedEntries,
  NoteText,
  NoteType,
  Renamed,
  Tag,
  TextFile,
  Trashed,
  UpdateInfo,
  MissingLink,
  WebNote,
  Written,
  Focus,
  FocusesSummary,
  FolderDataKind,
  FolderLayer,
  FolderSettings, FolderBlocks, BlockKind,
  SyncStatus,
  FileAccess,
  LooseFileInfo,
  Opened,
  RecentFile,
} from "../bindings";
import { Bin } from "./trash";
import { Clouds } from "./cloud";
import { CloudFiles } from "./cloudFiles";
import { LocalServerHarness } from "./localServer";
import { Maps } from "./maps";
import { applyPeriodic, obsidianPeriodic, readPeriodic, sortedDeep } from "./periodic";
import { applyOracle, applyTheme, checkOracle, FolderData, oracleProblems, readOracle, readTheme, writeGuard } from "./folderData";
import { blocksOf, fitsKind, headingsOf, propertiesOf, propertyList, readableLines, renderMarkdown, schemaBlocksOf } from "./markdown";
import { folderBlocks } from "./blockList";
import { projectSecrets } from "./secret";
import { graphEdges, missingLinks } from "./graph";
import { unlinkedMentions } from "./mentions";

export type Seed = { path: string; b64: string };

type Stored = { bytes: Uint8Array; revision: number; modified: number };

/** A link as written, found in a text: where, and what it names. */
type Found = { raw: string; target: string; anchor: string; alias: string | null; embed: boolean; line: number; col: number };

const encoder = new TextEncoder();
const strict = new TextDecoder("utf-8", { fatal: true });
const lossy = new TextDecoder("utf-8");

/** A contract error, thrown: the window's typed command answers it as one. */
function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

export { fromBase64, toBase64 };

/** A name as a link compares it: NFC, any case. */
const fold = (s: string): string => s.normalize("NFC").toLowerCase();
/** A word as the search compares it: no accents, any case. */
const plain = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const stripMd = (p: string): string => p.replace(/\.md$/i, "");
const hidden = (p: string): boolean => p.split("/").some((s) => s.startsWith("."));
const isNote = (p: string): boolean => /\.md$/i.test(p);

/** The folder's settings file (ADR 0070 items 1–2). */
const SETTINGS_FILE = ".verso/settings.json";
/** A path a bookmark may keep: relative, `/`-joined, no `..`, no `.`. */
const plainPath = (p: string): boolean => p !== "" && !p.startsWith("/") && !p.endsWith("/") && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
/** The core's `set_folder_note_name`: a plain file name, or empty. */
const folderNoteSetting = (name: string): string => {
  const n = name.trim().replace(/\.md$/i, "");
  return /[/\\]/.test(n) || n === "." || n === ".." ? "" : n;
};
/** The core's `folder_note_candidates` (ADR 0060 D3, D12). */
function folderNoteCandidates(folder: string, configured: string, rootName = ""): string[] {
  const out: string[] = [];
  if (folder === "") {
    // The core's `root_note_candidates`.
    if (configured && fold(configured) !== fold(rootName)) out.push(`${configured}.md`);
    if (rootName) out.push(`${rootName}.md`);
    return out;
  }
  const name = baseOf(folder);
  if (configured && fold(configured) !== fold(name)) out.push(`${folder}/${configured}.md`);
  out.push(`${folder}/${name}.md`, `${folder}.md`);
  return out;
}
/** The core's `folders_of_note`: the folders a note is the folder note of,
 *  by its path alone. */
function foldersOfNote(note: string, configured: string, rootName = ""): string[] {
  if (!isNote(note)) return [];
  const parent = dirOf(note);
  const stem = stripMd(baseOf(note));
  const out: string[] = [];
  const own = parent ? baseOf(parent) : rootName;
  if ((own && fold(stem) === fold(own)) || (configured && fold(stem) === fold(configured))) out.push(parent);
  out.push(parent ? `${parent}/${stem}` : stem);
  return out;
}

/** The links written in a text, outside code: wikilinks and embeds. */
function linksIn(text: string): Found[] {
  const out: Found[] = [];
  readableLines(text).forEach((line, i) => {
    for (const m of line.matchAll(/(!?)\[\[([^\]\n]+?)\]\]/g)) {
      const inner = m[2] ?? "";
      const bar = inner.indexOf("|");
      const target = bar < 0 ? inner : inner.slice(0, bar);
      const hash = target.indexOf("#");
      out.push({
        raw: m[0],
        target: (hash < 0 ? target : target.slice(0, hash)).trim(),
        anchor: hash < 0 ? "" : target.slice(hash + 1).trim(),
        alias: bar < 0 ? null : inner.slice(bar + 1),
        embed: m[1] === "!",
        line: i + 1,
        col: (m.index ?? 0) + 1,
      });
    }
  });
  return out;
}

import { canvasLayout } from "./canvas";
import { fromBase64, toBase64 } from "./base64";
export { canvasLayout };

export class Core {
  readonly files = new Map<string, Stored>();
  readonly folders = new Set<string>();
  /** The folder's trash and what is known of it (ADR 0080). */
  readonly bin = new Bin(this);
  readonly localServer = new LocalServerHarness();
  /** A large picture's tiles and a reader's board (ADR 0090). */
  readonly maps = new Maps();
  /** This machine's folder note name setting (`set_folder_note_name`):
   *  what applies while the folder has no `.verso/settings.json`. */
  private machineNoteName = "";
  /** The folder note name that applies: the folder's settings file's when
   *  it has a usable one (ADR 0070), else this machine's. */
  private get folderNoteName(): string {
    const layer = this.folderLayer();
    if (layer.exists && !layer.problem) return folderNoteSetting(layer.settings.folder_note_name ?? "");
    return this.machineNoteName;
  }
  private syncFocuses = false;
  /** Every command asked for, in order: what a test looks at. */
  readonly calls: { cmd: string; args: unknown }[] = [];
  /** What the window wrote into the app's log (`log_write`). */
  readonly log: { level: string; message: string }[] = [];
  private clock = 1_790_000_000;
  private revision = 1;
  private webViews = new Map<string, string>();
  /** The folder's sync (ADR 0079), as a test sets it: the harness has no
   *  server, so what crosses is whatever a test says (`sync-status`). */
  sync: SyncStatus = Core.syncOff();
  readonly clouds = new Clouds(this, () => Core.syncOff()); // ADR 0104
  readonly cloudFiles = new CloudFiles(() => this.sync, (st) => (this.sync = st)); // ADR 0043
  /** This computer's name as the person set it in Settings › Servers;
   *  null, the system's ("Mac de Teste"). */
  deviceName: string | null = null;

  static syncOff(): SyncStatus {
    return { key: "harness", on: false, server: "", folder: "", folder_name: "", role: "", state: "off", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: null, message: null, problem: null, versions: null, revoked: null, cloud: null };
  }

  constructor(
    seed: readonly Seed[],
    readonly name: string,
  ) {
    for (const f of seed) this.put(f.path, fromBase64(f.b64));
  }

  // ---- The folder in memory ---------------------------------------------

  private put(path: string, bytes: Uint8Array): Stored {
    const stored = { bytes, revision: this.revision++, modified: this.clock++ };
    this.files.set(path, stored);
    for (let d = dirOf(path); d !== ""; d = dirOf(d)) this.folders.add(d);
    return stored;
  }

  /** A path the window may name: relative, no `..`, nothing hidden. */
  private confine(path: string): string {
    const p = path.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (p === "" || p.startsWith("/") || p.split("/").some((s) => s === ".." || s === "") || hidden(p)) refuse("refused", `not a path of the folder: ${path}`);
    return p;
  }

  /** The canvas the window sent, or `not_canvas`. */
  private boardJson(path: string, json: string): unknown {
    try {
      return JSON.parse(json);
    } catch {
      return refuse("not_canvas", `not JSON: ${path}`);
    }
  }

  private stored(path: string): Stored {
    const f = this.files.get(path);
    if (!f) refuse("not_found", `no such file: ${path}`);
    return f;
  }

  private text(path: string): string {
    try {
      return strict.decode(this.stored(path).bytes);
    } catch (e) {
      if (e instanceof TypeError) refuse("not_text", `not UTF-8: ${path}`);
      throw e;
    }
  }

  /** Whether `given` names the file as the caller read it: the stored
   *  revision. The window kept offline (ADR 0092; src/web/offline/core.ts)
   *  also knows revisions a server gave a note before the connection
   *  dropped. */
  protected accepts(_path: string, was: Stored, given: string): boolean {
    return String(was.revision) === given;
  }

  /** Write over the revision that was read (invariant 11). */
  private writeOver(path: string, text: string, revision: string): Stored {
    const was = this.stored(path);
    if (!this.accepts(path, was, revision)) refuse("changed", `changed on disk: ${path}`);
    return this.put(path, encoder.encode(text));
  }

  /** The folder's layer of settings, `.verso/settings.json` (ADR 0070
   *  items 1–2), as the core reads it. */
  private folderLayer(): FolderLayer {
    const stored = this.files.get(SETTINGS_FILE);
    const empty: FolderSettings = { bookmarks: null, folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null, periodic: null, oracle: null, recommended_theme: null };
    if (!stored) return { exists: false, problem: null, revision: null, settings: empty, warnings: [] };
    const revision = String(stored.revision);
    let obj: unknown;
    try {
      obj = JSON.parse(strict.decode(stored.bytes));
    } catch {
      obj = null;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { exists: true, problem: "invalid", revision, settings: empty, warnings: [] };
    const o = obj as Record<string, unknown>;
    const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
    return {
      exists: true,
      problem: null,
      revision,
      settings: {
        bookmarks: Array.isArray(o["bookmarks"]) ? o["bookmarks"].filter((p): p is string => typeof p === "string" && plainPath(p)) : null,
        folder_note_name: typeof o["folderNoteName"] === "string" ? folderNoteSetting(o["folderNoteName"]) : null,
        ignore_build_dirs: bool(o["ignoreBuildDirs"]),
        respect_gitignore: bool(o["respectGitignore"]),
        periodic: readPeriodic(o),
        oracle: readOracle(o),
        recommended_theme: readTheme(o),
      },
      warnings: oracleProblems(o),
    };
  }

  /** A change of the folder's settings: created when there is no file
   *  (`exists` when there is), else written over the revision read. */
  private setFolderLayer(change: FolderSettings, revision: string | null): FolderLayer {
    if (change.oracle) checkOracle(change.oracle); // before anything is read, as the core does
    const stored = this.files.get(SETTINGS_FILE);
    let obj: Record<string, unknown> = {};
    if (revision === null) {
      if (stored) refuse("exists", `already there: ${SETTINGS_FILE}`);
    } else {
      if (!stored) refuse("not_found", `no such file: ${SETTINGS_FILE}`);
      if (!this.accepts(SETTINGS_FILE, stored, revision)) refuse("changed", `changed on disk: ${SETTINGS_FILE}`);
      const parsed: unknown = JSON.parse(strict.decode(stored.bytes));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) refuse("refused", "the folder's settings file is not a JSON object");
      obj = parsed as Record<string, unknown>;
    }
    if (change.bookmarks) {
      const bad = change.bookmarks.find((p) => !plainPath(p));
      if (bad !== undefined) refuse("refused", `not a path of the folder: ${bad}`);
      obj["bookmarks"] = change.bookmarks;
    }
    if (change.folder_note_name !== null && change.folder_note_name !== undefined) obj["folderNoteName"] = folderNoteSetting(change.folder_note_name);
    if (change.ignore_build_dirs !== null && change.ignore_build_dirs !== undefined) obj["ignoreBuildDirs"] = change.ignore_build_dirs;
    if (change.respect_gitignore !== null && change.respect_gitignore !== undefined) obj["respectGitignore"] = change.respect_gitignore;
    if (change.periodic) applyPeriodic(obj, change.periodic);
    if (change.oracle) applyOracle(obj, change.oracle);
    applyTheme(obj, change.recommended_theme);
    this.put(SETTINGS_FILE, encoder.encode(`${JSON.stringify(sortedDeep(obj), null, 2)}\n`));
    return this.folderLayer();
  }

  private getFocuses(): FocusesSummary {
    const stored = this.files.get(".space/waypoints.json");
    if (!stored) {
      if (this.files.has(".space/.waypoints.json.icloud")) {
        return {
          focuses: [],
          has_file: true,
          format_known: false,
          read_only_reason: "file in cloud (iCloud) not yet downloaded",
          read_only_code: "cloud_placeholder",
          stamp: null,
        };
      }
      return {
        focuses: [],
        has_file: false,
        format_known: false,
        read_only_reason: null,
        read_only_code: null,
        stamp: null,
      };
    }
    try {
      const text = strict.decode(stored.bytes);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return {
          focuses: [],
          has_file: true,
          format_known: false,
          read_only_reason: "expected JSON array",
          read_only_code: "unknown_format",
          stamp: String(stored.revision),
        };
      }
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return {
            focuses: [],
            has_file: true,
            format_known: false,
            read_only_reason: `element ${i} is not an object`,
            read_only_code: "unknown_format",
            stamp: String(stored.revision),
          };
        }
        const keys = Object.keys(item);
        if (keys.some((k) => k !== "name" && k !== "paths" && k !== "sticker")) {
          return {
            focuses: [],
            has_file: true,
            format_known: false,
            read_only_reason: `unknown key in element ${i}`,
            read_only_code: "unknown_format",
            stamp: String(stored.revision),
          };
        }
        if (typeof item.name !== "string" || !Array.isArray(item.paths)) {
          return {
            focuses: [],
            has_file: true,
            format_known: false,
            read_only_reason: `element ${i} missing name or paths`,
            read_only_code: "unknown_format",
            stamp: String(stored.revision),
          };
        }
        for (let pi = 0; pi < item.paths.length; pi++) {
          const p = item.paths[pi];
          if (typeof p !== "string" || (p !== "/" && (p === "" || p.startsWith("/") || p.split("/").some((s: string) => s === "..")))) {
            return {
              focuses: [],
              has_file: true,
              format_known: false,
              read_only_reason: `invalid path in element ${i}`,
              read_only_code: "unknown_format",
              stamp: String(stored.revision),
            };
          }
        }
        if (item.sticker !== undefined && typeof item.sticker !== "string") {
          return {
            focuses: [],
            has_file: true,
            format_known: false,
            read_only_reason: `element ${i} sticker is not string`,
            read_only_code: "unknown_format",
            stamp: String(stored.revision),
          };
        }
      }
      return {
        focuses: parsed.map((item: any) => ({
          name: item.name,
          paths: item.paths,
          sticker: item.sticker ?? null,
        })),
        has_file: true,
        format_known: true,
        read_only_reason: null,
        read_only_code: null,
        stamp: String(stored.revision),
      };
    } catch (e) {
      return {
        focuses: [],
        has_file: true,
        format_known: false,
        read_only_reason: String(e),
        read_only_code: "invalid_json",
        stamp: String(stored.revision),
      };
    }
  }

  notes(): string[] {
    return [...this.files.keys()].filter((p) => isNote(p) && !hidden(p)).sort();
  }

  private others(): string[] {
    return [...this.files.keys()].filter((p) => !isNote(p) && !hidden(p)).sort();
  }

  /** What a link written in `source` names: a path from the root (as
   *  written, then with `.md`), then from the source's folder, then a name
   *  — the shallowest, then by path. */
  resolve(target: string, source: string): string | null {
    if (target === "") return source;
    const t = fold(target);
    const all = [...this.files.keys()].filter((p) => !hidden(p));
    const byPath = new Map(all.map((p) => [fold(p), p] as const));
    const tries = [t, `${t}.md`];
    for (const k of tries) if (byPath.has(k)) return byPath.get(k) ?? null;
    const dir = fold(dirOf(source));
    if (dir) for (const k of tries) if (byPath.has(`${dir}/${k}`)) return byPath.get(`${dir}/${k}`) ?? null;
    const named = all
      .filter((p) => tries.includes(fold(baseOf(p))))
      .sort((a, b) => a.split("/").length - b.split("/").length || (a < b ? -1 : 1));
    return named[0] ?? null;
  }

  /** The links a note or a board makes: a board's file cards, and the
   *  links of its text cards, as the index counts them (ADR 0057). */
  private linksOf(path: string): Found[] {
    const text = this.text(path);
    if (!path.endsWith(".canvas")) return linksIn(text);
    const out: Found[] = [];
    const lines = text.split("\n");
    let doc: { nodes?: { id?: unknown; type?: unknown; file?: unknown; text?: unknown }[] };
    try {
      doc = JSON.parse(text) as typeof doc;
    } catch {
      return out;
    }
    for (const n of doc.nodes ?? []) {
      const at = Math.max(0, lines.findIndex((l) => l.includes(`"id":${JSON.stringify(n.id)}`)));
      if (n.type === "file" && typeof n.file === "string") {
        out.push({ raw: n.file, target: n.file, anchor: "", alias: null, embed: true, line: at + 1, col: 1 });
      } else if (n.type === "text" && typeof n.text === "string") {
        for (const l of linksIn(n.text)) out.push({ ...l, line: at + 1 });
      }
    }
    return out;
  }

  private linkSources(): string[] {
    return [...this.notes(), ...this.others().filter((p) => p.endsWith(".canvas"))];
  }

  backlinksOf(path: string): Backlink[] {
    const out: Backlink[] = [];
    for (const from of this.linkSources()) {
      if (from === path) continue;
      for (const l of this.linksOf(from)) {
        if (this.resolve(l.target, from) === path) out.push({ from, target: l.target, embed: l.embed, line: l.line, col: l.col });
      }
    }
    return out;
  }

  private tagsOf(path: string): string[] {
    const text = this.text(path);
    const props = propertiesOf(text);
    const fm = props["tags"];
    const tags = new Set<string>(Array.isArray(fm) ? fm.filter((x) => typeof x === "string" || (Number.isInteger(x) && x >= 0)).map(String) : typeof fm === "string" ? fm.split(/[\s,]+/).filter(Boolean) : []);
    for (const line of readableLines(text)) {
      if (/^#{1,6}\s/.test(line)) continue;
      for (const m of line.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) if (m[1] && !/^\d+$/.test(m[1])) tags.add(m[1]);
    }
    return [...tags].map((t) => t.replace(/^#/, ""));
  }

  folderInfo(): FolderInfo {
    return { name: this.name, key: "harness", index: this.summary(), late_outside_changes: null };
  }

  private summary(): IndexSummary {
    return { indexed: this.notes().length, unchanged: 0, removed: 0, placeholders: 0, problems: [], unwatched: null, unindexed: null };
  }

  private noteText(path: string): NoteText {
    const stored = this.stored(path);
    const text = this.text(path);
    return {
      path,
      lines: text.split("\n").map((l) => l.replace(/\r$/, "")),
      html: renderMarkdown(text),
      properties: propertyList(text),
      text,
      revision: String(stored.revision),
      headings: headingsOf(text),
      blocks: blocksOf(text),
      stale: false,
      unverified: false,
      note_type: this.noteType(path),
      schema_blocks: schemaBlocksOf(text).map((b) => ({ line: b.line, name: b.name, nested: b.nested, error: b.error })),
    };
  }

  /** A type's name folded as the core folds it: NFC, case ignored. */
  private typeKey(name: string): string {
    return name.trim().normalize("NFC").toLowerCase();
  }

  /** The `type:` of a note, when it holds one text. */
  private writtenType(path: string): string | null {
    const t = propertiesOf(this.text(path))["type"];
    return typeof t === "string" && t.trim() !== "" ? t : null;
  }

  /** A note's type, as the core types it at query time (ADR 0052). */
  private noteType(path: string): NoteType | null {
    const written = this.writtenType(path);
    if (written === null) return null;
    const key = this.typeKey(written);
    const named = this.notes().flatMap((p) => schemaBlocksOf(this.text(p)).filter((b) => !b.nested && b.name !== null && this.typeKey(b.name) === key).map((b) => ({ path: p, b })));
    if (named.length === 0) return null;
    if (named.length > 1) return { written, state: { kind: "conflict", schemas: named.map((n) => n.path).sort() } };
    const { path: schema, b } = named[0]!;
    if (b.error) return { written, state: { kind: "invalid", schema, error: b.error } };
    const props = propertiesOf(this.text(path));
    const labels = (l: [string, string][]) => l.map(([lang, text]) => ({ lang, text }));
    return {
      written,
      state: {
        kind: "typed",
        schema,
        name: b.name ?? written,
        labels: labels(b.labels),
        properties: b.properties.map((p) => {
          const present = Object.hasOwn(props, p.key);
          const v = props[p.key];
          return { key: p.key, kind: p.kind, labels: labels(p.labels), present, fits: present && (v === null || v === "" || fitsKind(p.kind, v)) };
        }),
        layout: b.layout,
      },
    };
  }

  private textFile(path: string): TextFile {
    return { path, text: this.text(path), revision: String(this.stored(path).revision), warnings: [] };
  }

  /** `to` free for what moves there: a name taken gets " (2)", " (3)". */
  private free(to: string): string {
    if (!this.files.has(to) && !this.folders.has(to)) return to;
    const dot = to.lastIndexOf(".");
    const [stem, ext] = dot > to.lastIndexOf("/") ? [to.slice(0, dot), to.slice(dot)] : [to, ""];
    for (let n = 2; ; n++) if (!this.files.has(`${stem} (${n})${ext}`)) return `${stem} (${n})${ext}`;
  }

  /** Move a file or a folder with what is under it. */
  private move(from: string, to: string): [string, string][] {
    const moved: [string, string][] = [];
    if (this.files.has(from)) moved.push([from, to]);
    else {
      for (const p of [...this.files.keys()]) if (p.startsWith(`${from}/`)) moved.push([p, `${to}${p.slice(from.length)}`]);
      for (const d of [...this.folders]) {
        if (d === from || d.startsWith(`${from}/`)) {
          this.folders.delete(d);
          this.folders.add(`${to}${d.slice(from.length)}`);
        }
      }
    }
    for (const [a, b] of moved) {
      const f = this.stored(a);
      this.files.delete(a);
      this.put(b, f.bytes);
    }
    return moved;
  }

  /** Rename or move, with the rewrites of the notes and boards whose links
   *  reached what moved (ADR 0048, option (b)): a link keeps its form — by
   *  name, or by path — its heading and its alias. */
  private rename(fromPath: string, toPath: string): Renamed {
    const from = this.confine(fromPath);
    let to = this.confine(toPath);
    if (!this.files.has(from) && !this.folders.has(from)) refuse("not_found", `no such entry: ${from}`);
    if (isNote(from) && !isNote(to)) to = `${to}.md`;
    if (this.files.has(to) || this.folders.has(to)) refuse("exists", `already there: ${to}`);
    const done = this.moveMany([[from, to]]);
    return { path: to, rewrites: done.rewrites, skipped: [], warnings: [], also: done.also };
  }

  /** Several entries into `folder` at once, as the core's `move_entries`
   *  (ADR 0048, revised 2026-10-07): one plan over where everything ended;
   *  an entry inside a folder also given goes with it; one already there
   *  stays; a name taken there is refused, and the others move. */
  private moveEntries(paths: string[], folderIn: string): MovedEntries {
    const dest = folderIn === "" ? "" : this.confine(folderIn);
    const keys = [...new Set(paths.map((p) => this.confine(p)))];
    const dirs = keys.filter((k) => this.folders.has(k));
    const pairs: [string, string][] = [];
    const refused: MovedEntries["refused"] = [];
    for (const k of keys) {
      if (dirs.some((d) => k.startsWith(`${d}/`)) || dirOf(k) === dest) continue;
      if (!this.files.has(k) && !this.folders.has(k)) {
        refused.push({ path: k, error: { kind: "not_found", message: `no such entry: ${k}` } });
        continue;
      }
      const to = dest ? `${dest}/${baseOf(k)}` : baseOf(k);
      if (this.files.has(to) || this.folders.has(to) || to === k || dest === k || dest.startsWith(`${k}/`)) {
        refused.push({ path: k, error: { kind: this.files.has(to) || this.folders.has(to) ? "exists" : "refused", message: `cannot move ${k} to ${to}` } });
        continue;
      }
      pairs.push([k, to]);
    }
    if (pairs.length === 0) return { moved: [], refused, rewrites: [], skipped: [], warnings: [], also: [] };
    const done = this.moveMany(pairs);
    return { moved: pairs.map(([from, to]) => ({ from, to })), refused, rewrites: done.rewrites, skipped: [], warnings: [], also: done.also };
  }

  /** The moves `pairs` (each checked), with the rewrites of the notes and
   *  boards whose links reached what moved, planned once over all of them. */
  private moveMany(pairs: [string, string][]): { rewrites: LinkRewrite[]; also: { from: string; to: string }[] } {
    const plans = new Map<string, string>();
    const movedNow: [string, string][] = [];
    // The core's `folder_note_follows`: a folder's note takes the folder's
    // new name, inside it or beside it, unless that name is taken.
    const then: [string, string][] = [];
    const also: { from: string; to: string }[] = [];
    const movedFolders: [string, string][] = [];
    for (const [from, to] of pairs) {
      const mine = this.files.has(from) ? [[from, to] as [string, string]] : [...this.files.keys()].filter((p) => p.startsWith(`${from}/`)).map((p): [string, string] => [p, `${to}${p.slice(from.length)}`]);
      if (this.folders.has(from)) {
        const taken = (p: string, own: string) => this.notes().some((n) => fold(n) === fold(p) && fold(n) !== fold(own));
        const [oldName, newName] = [baseOf(from), baseOf(to)];
        const inside = mine.find(([a]) => fold(a) === fold(`${from}/${oldName}.md`));
        if (oldName !== newName && inside && !taken(`${from}/${newName}.md`, inside[0])) {
          const wanted = `${to}/${newName}.md`;
          then.push([inside[1], wanted]);
          also.push({ from: inside[0], to: wanted });
          inside[1] = wanted;
        }
        const beside = this.notes().find((n) => fold(n) === fold(`${from}.md`));
        if (beside && !taken(`${to}.md`, beside)) {
          then.push([beside, `${to}.md`]);
          also.push({ from: beside, to: `${to}.md` });
          mine.push([beside, `${to}.md`]);
        }
        for (const d of this.folders) if (d === from || d.startsWith(`${from}/`)) movedFolders.push([d, `${to}${d.slice(from.length)}`]);
      }
      movedNow.push(...mine);
    }
    const target = new Map(movedNow);
    for (const source of this.linkSources()) {
      if (target.has(source)) continue;
      const before = this.text(source);
      let after = before.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (raw, bang: string, inner: string) => {
        const bar = inner.indexOf("|");
        const t = bar < 0 ? inner : inner.slice(0, bar);
        const hash = t.indexOf("#");
        const name = (hash < 0 ? t : t.slice(0, hash)).trim();
        const now = target.get(this.resolve(name, source) ?? "");
        if (!now) return raw;
        const written = name.includes("/") ? (isNote(now) ? stripMd(now) : now) : isNote(now) ? stripMd(baseOf(now)) : baseOf(now);
        return `${bang}[[${written}${hash < 0 ? "" : t.slice(hash)}${bar < 0 ? "" : inner.slice(bar)}]]`;
      });
      if (source.endsWith(".canvas")) for (const [a, b] of target) after = after.split(`"file":${JSON.stringify(a)}`).join(`"file":${JSON.stringify(b)}`);
      if (after !== before) plans.set(source, after);
    }
    // The `order:` of the folder notes of the folders things leave and
    // enter (ADR 0060, D4), as the core rewrites it.
    const moved: [string, string, boolean][] = [
      ...movedNow.map(([a, b]): [string, string, boolean] => [a, b, isNote(a)]),
      ...movedFolders.map(([a, b]): [string, string, boolean] => [a, b, false]),
    ];
    const movedTo = (p: string): string => {
      const own = target.get(p);
      if (own) return own;
      const hit = movedFolders.filter(([a]) => p === a || p.startsWith(`${a}/`)).sort(([a], [b]) => b.length - a.length)[0];
      return hit ? `${hit[1]}${p.slice(hit[0].length)}` : p;
    };
    const byFold = new Map(this.notes().map((n) => [fold(n), n]));
    const folderNotes = new Set<string>();
    for (const [a, b] of moved) for (const dir of [dirOf(a), dirOf(b)]) for (const c of folderNoteCandidates(dir, this.folderNoteName, this.name)) {
      const found = byFold.get(fold(c));
      if (found) folderNotes.add(found);
    }
    for (const fnPath of folderNotes) {
      const folder = foldersOfNote(fnPath, this.folderNoteName, this.name).map((f) => (f === "" ? "" : [...this.folders].find((d) => fold(d) === fold(f)))).find((d): d is string => d !== undefined);
      if (folder === undefined) continue;
      const after = rewriteOrder(plans.get(fnPath) ?? this.text(fnPath), folder, movedTo(folder), moved);
      if (after !== null) plans.set(fnPath, after);
    }
    for (const [from, to] of pairs) this.move(from, to);
    for (const [a, b] of then) this.move(a, b);
    const rewrites: LinkRewrite[] = [...plans].map(([source, after]) => {
      const path = movedTo(source);
      return { path, revision: String(this.stored(path).revision), before: this.text(path), after };
    });
    return { rewrites, also };
  }

  private trash(pathIn: string): Trashed {
    const path = this.confine(pathIn);
    if (!this.files.has(path) && !this.folders.has(path)) refuse("not_found", `no such entry: ${path}`);
    const to = this.free(`.trash/${path}`);
    const folder = !this.files.has(path);
    this.move(path, to);
    this.folders.delete(path);
    this.bin.record(to, path, folder);
    return { path: to, warnings: [] };
  }

  /** As the core's search (verso-index): the notes whose file name holds
   *  every word first — the whole name, its start, the start of its
   *  words, anywhere; shorter first — then those whose text holds them. */
  private search(words: string, limit: number): Hit[] {
    const terms = words.split(/\s+/).filter(Boolean);
    const tag = terms.filter((t) => t.startsWith("tag:")).map((t) => fold(t.slice(4).replace(/^#/, "")));
    const path = terms.filter((t) => t.startsWith("path:")).map((t) => fold(t.slice(5)));
    const file = terms.filter((t) => t.startsWith("file:")).map((t) => fold(t.slice(5)));
    const plainWords = terms.filter((t) => !/^(tag|path|file):/.test(t)).map(plain);
    const named: { rank: number; len: number; hit: Hit }[] = [];
    const byText: Hit[] = [];
    for (const p of this.notes()) {
      if (path.some((x) => !fold(p).includes(x)) || file.some((x) => !fold(baseOf(p)).includes(x))) continue;
      if (tag.length > 0) {
        const own = this.tagsOf(p).map(fold);
        if (tag.some((x) => !own.some((t) => t === x || t.startsWith(`${x}/`)))) continue;
      }
      const text = plain(this.text(p));
      const whole = (w: string): boolean => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);
      const inText = plainWords.every(whole);
      const name = plain(baseOf(p).replace(/\.[^.]*$/, ""));
      const inName = plainWords.length > 0 && plainWords.every((w) => name.includes(w));
      if (!inText && !inName) continue;
      const first = plainWords[0];
      const line = (first ? this.text(p).split("\n").find((l) => plain(l).includes(first)) : undefined) ?? this.text(p).split("\n")[0] ?? "";
      const snippet = !inText ? "" : first ? line.replace(new RegExp(`(${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "iu"), "[$1]") : line;
      if (inName) {
        const all = plainWords.join(" ");
        const starts = plainWords.every((w) => name.split(/[^\p{L}\p{N}]/u).some((part) => part.startsWith(w)));
        const rank = name === all ? 0 : name.startsWith(all) ? 1 : starts ? 2 : 3;
        named.push({ rank, len: [...name].length, hit: { path: p, snippet } });
      } else byText.push({ path: p, snippet });
    }
    named.sort((a, b) => a.rank - b.rank || a.len - b.len || (a.hit.path < b.hit.path ? -1 : 1));
    return [...named.map((n) => n.hit), ...byText].slice(0, limit);
  }

  // ---- Bases, roughly (ADR 0053) -----------------------------------------

  private passes(filter: unknown, path: string): boolean {
    if (filter === null || filter === undefined) return true;
    if (Array.isArray(filter)) return filter.every((f) => this.passes(f, path));
    if (typeof filter === "object") {
      const f = filter as Record<string, unknown>;
      if (Array.isArray(f["and"])) return f["and"].every((x) => this.passes(x, path));
      if (Array.isArray(f["or"])) return f["or"].some((x) => this.passes(x, path));
      if (Array.isArray(f["not"])) return !f["not"].some((x) => this.passes(x, path));
      return true;
    }
    if (typeof filter !== "string") return true;
    const call = /^file\.(inFolder|hasTag|hasLink)\("([^"]*)"\)$/.exec(filter.trim());
    if (!call) return true;
    const arg = call[2] ?? "";
    if (call[1] === "inFolder") return arg === "" || path.startsWith(`${arg.replace(/\/+$/, "")}/`);
    if (call[1] === "hasTag") return isNote(path) && this.tagsOf(path).some((t) => fold(t) === fold(arg) || fold(t).startsWith(`${fold(arg)}/`));
    return isNote(path) && linksIn(this.text(path)).some((l) => this.resolve(l.target, path) === this.resolve(arg, path));
  }

  private cell(path: string, id: string, formulas: Record<string, unknown> = {}): BaseCell {
    if (id === "file.name") return { kind: "text", value: stripMd(baseOf(path)) };
    // The one formula the harness evaluates: `html("…")`, a literal, as
    // the core gives it (ADR 0094 item 12); any other is left empty.
    if (id.startsWith("formula.")) {
      const f = formulas[id.slice(8)];
      const m = typeof f === "string" ? /^html\((["'])([\s\S]*)\1\)$/.exec(f.trim()) : null;
      return m ? { kind: "html", value: m[2] ?? "" } : { kind: "empty" };
    }
    if (id === "file.path") return { kind: "text", value: path };
    if (id === "file.folder") return { kind: "text", value: dirOf(path) };
    if (!isNote(path)) return { kind: "empty" };
    const v = propertiesOf(this.text(path))[id.replace(/^note\./, "")];
    const one = (x: unknown): BaseCell => {
      if (x === null || x === undefined) return { kind: "empty" };
      if (typeof x === "number") return { kind: "number", value: x };
      if (typeof x === "boolean") return { kind: "bool", value: x };
      if (x instanceof Date) return { kind: "date", value: { ms: x.getTime(), time: false } };
      const s = String(x);
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (d) return { kind: "date", value: { ms: Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])), time: false } };
      return { kind: "text", value: s };
    };
    return Array.isArray(v) ? { kind: "list", value: v.map(one) } : one(v);
  }

  private queryBase(q: BaseQuery): BaseResult {
    const text = q.text ?? (q.path ? this.text(q.path) : "");
    let base: Record<string, unknown> = {};
    try {
      const parsed: unknown = YAML.parse(text);
      if (parsed !== null && typeof parsed === "object") base = parsed as Record<string, unknown>;
    } catch {
      return { views: [], view: null, columns: [], groups: [], total: 0, problems: [{ kind: "notABase", detail: "", error: null }], properties: [] };
    }
    const views = (Array.isArray(base["views"]) ? base["views"] : []) as Record<string, unknown>[];
    const at = q.view === null ? 0 : Math.max(0, views.findIndex((v) => v["name"] === q.view));
    const view = views[at];
    const props = (base["properties"] ?? {}) as Record<string, { displayName?: string }>;
    const order = Array.isArray(view?.["order"]) ? (view["order"] as unknown[]).map(String) : ["file.name"];
    const ids = [...new Set([...order, ...q.extra])];
    const columns: BaseColumn[] = ids.map((id) => ({ id, name: props[id]?.displayName ?? null }));
    const paths = [...this.notes(), ...this.others()].filter((p) => this.passes(base["filters"], p) && this.passes(view?.["filters"], p));
    const formulas = (base["formulas"] ?? {}) as Record<string, unknown>;
    const rows: BaseRow[] = paths.map((p) => ({ path: p, note: isNote(p), cells: ids.map((id) => this.cell(p, id, formulas)) }));
    const by = view?.["groupBy"];
    const groupBy = typeof by === "string" ? by : by !== null && typeof by === "object" ? String((by as Record<string, unknown>)["property"] ?? "") : "";
    let groups: BaseGroup[] = [{ key: null, rows, summaries: ids.map(() => null) }];
    if (groupBy) {
      const keyed = new Map<string, { key: BaseCell; rows: BaseRow[] }>();
      for (const r of rows) {
        const key = this.cell(r.path, groupBy);
        const k = JSON.stringify(key);
        keyed.set(k, { key, rows: [...(keyed.get(k)?.rows ?? []), r] });
      }
      groups = [...keyed.values()].map((g) => ({ key: g.key, rows: g.rows, summaries: ids.map(() => null) }));
    }
    const properties = [...new Set(this.notes().flatMap((p) => Object.keys(propertiesOf(this.text(p)))))].sort();
    return {
      views: views.map((v) => ({ name: String(v["name"] ?? ""), kind: String(v["type"] ?? "table") })),
      view: view ? at : null,
      columns,
      groups,
      total: rows.length,
      problems: [],
      properties,
    };
  }

  // ---- The commands ------------------------------------------------------

  /** The answer to every command of the contract, by its name. */
  /** The folder's mark for the server of all of Verso (ADR 0054 point 4). */
  agentVisible = false;
  /** The folder's layouts and bundles (ADR 0099 item 2, ADR 0098 item 2). */
  private readonly data = new FolderData({ files: this.files, put: (p, b) => this.put(p, b), accepts: (p, w, g) => this.accepts(p, w, g), trash: (p) => { const to = this.free(`.trash/${p}`); this.move(p, to); this.bin.record(to, p, false); return to; } });
  readonly handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
    pick_folder: () => this.folderInfo(),
    reopen_folder: () => this.folderInfo(),
    open_initial: (): Opened => ({ kind: "folder", info: this.folderInfo() }),
    current_folder: () => this.folderInfo(),
    // A file opened without its folder (ADR 0114): none in a folder's
    // window; `?loose=1` (src/harness.ts) stands for that window.
    loose_files: (): LooseFileInfo[] => [],
    loose_close: () => null,
    open_folder_of_file: () => null,
    open_sibling: () => refuse("not_found", "no such note beside this file"),
    loose_save_again: () => refuse("refused", "not a file opened without its folder"),
    loose_save_copy: () => false,
    pick_file: () => null,
    recent_files: (): RecentFile[] => [],
    open_recent_file: () => null,
    open_default_apps: () => refuse("refused", "the default app for .md is set in the system, not from here"),
    list_notes: () => this.notes(),
    notes_of_type: (a) => {
      const key = this.typeKey(String(a["name"]));
      return this.notes().filter((p) => {
        const t = this.writtenType(p);
        return t !== null && this.typeKey(t) === key;
      });
    },
    read_note: (a) => {
      const p = String(a["path"]);
      return this.noteText(this.files.has(p) || isNote(p) ? p : `${p}.md`);
    },
    search: (a) => this.search(String(a["words"]), Number(a["limit"] ?? 50)),
    links: (a): Link[] => {
      const path = String(a["path"]);
      if (!this.files.has(path)) return [];
      return this.linksOf(path).map((l) => {
        const block = l.anchor.startsWith("^") ? l.anchor.slice(1) : null;
        return { target: l.target, resolved: this.resolve(l.target, path), embed: l.embed, heading: l.anchor && !block ? l.anchor : null, block, alias: l.alias, line: l.line, col: l.col };
      });
    },
    backlinks: (a) => this.backlinksOf(String(a["path"])),
    unlinked_mentions: (a) => unlinkedMentions(String(a["path"]), this.notes(), (p) => (this.files.has(p) ? this.text(p) : null)),
    write_note: (a): Written => {
      const path = this.confine(String(a["path"]));
      this.writeOver(path, String(a["text"]), String(a["revision"]));
      return { note: this.noteText(path), warnings: [] };
    },
    create_note: (a) => {
      const name = this.confine(String(a["name"]));
      const path = isNote(name) ? name : `${name}.md`;
      if (this.files.has(path)) refuse("exists", `already there: ${path}`);
      this.put(path, encoder.encode(String(a["text"])));
      return this.noteText(path);
    },
    create_file: (a) => {
      const path = writeGuard(this.confine(String(a["path"])));
      if (this.files.has(path) || this.folders.has(path)) refuse("exists", `already there: ${path}`);
      this.put(path, fromBase64(String(a["base64"])));
      return path;
    },
    create_folder: (a) => {
      const path = writeGuard(this.confine(String(a["path"])));
      if (this.files.has(path) || this.folders.has(path)) refuse("exists", `already there: ${path}`);
      for (let d = path; d !== ""; d = dirOf(d)) this.folders.add(d);
      return path;
    },
    delete_note: (a) => this.trash(String(a["path"])),
    delete_entry: (a) => this.trash(String(a["path"])),
    rename_note: (a) => this.rename(String(a["from"]), String(a["to"])),
    rename_entry: (a) => this.rename(String(a["from"]), String(a["to"])),
    move_entries: (a) => this.moveEntries((a["paths"] as unknown[]).map(String), String(a["folder"] ?? "")),
    resolve_attachment: (a) => {
      const found = this.resolve(String(a["target"]), String(a["source"]));
      return found && !isNote(found) ? found : null;
    },
    list_files: () => this.others(),
    list_folders: () => [...this.folders].filter((d) => !hidden(d)).sort(),
    list_block_ids: (a): FolderBlocks => folderBlocks(this.notes(), (p) => this.text(p), (a["kinds"] ?? []) as BlockKind[]),
    list_tags: (): Tag[] => {
      const by = new Map<string, string[]>();
      for (const p of this.notes()) for (const t of this.tagsOf(p)) by.set(t, [...(by.get(t) ?? []), p]);
      return [...by].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, notes]) => ({ name, notes }));
    },
    read_file_text: (a) => lossy.decode(this.stored(this.confine(String(a["path"]))).bytes),
    list_entries: (): FileEntry[] => {
      // As the index reads them (verso-index, `string_of`, `strings_of`):
      // a scalar as text, numbers and booleans included; the first alias.
      const scalar = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null);
      const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(scalar).filter((x): x is string => x !== null) : [scalar(v)].filter((x): x is string => x !== null));
      const labelFor = (p: string): EntryLabel | null => {
        if (!isNote(p)) return null;
        try {
          const props = propertiesOf(this.text(p));
          const sticker = scalar(props["sticker"]);
          const color = scalar(props["color"]);
          const aliases = strings(props["aliases"]);
          const alias = aliases[0] ?? null;
          const orderList = strings(props["order"]);
          const pinnedList = strings(props["pinned"]);
          const order = orderList.length > 0 ? orderList : null;
          const pinned = pinnedList.length > 0 ? pinnedList : null;
          if (sticker === null && color === null && alias === null && !order && !pinned) return null;
          return { sticker, color, alias, ...(aliases.length > 0 ? { aliases } : {}), order, pinned };
        } catch {
          return null;
        }
      };
      const byFold = new Map(this.notes().map((n) => [fold(n), n]));
      const folderLabel = (d: string): EntryLabel | null => {
        for (const c of folderNoteCandidates(d, this.folderNoteName)) {
          const found = byFold.get(fold(c));
          if (found) return labelFor(found);
        }
        return null;
      };
      return [
        ...[...this.folders].filter((d) => !hidden(d)).map((d): FileEntry => ({ path: d, kind: "folder", size: 0, modified: this.clock, label: folderLabel(d) })),
        ...[...this.files].filter(([p]) => !hidden(p)).map(([p, f]): FileEntry => ({ path: p, kind: isNote(p) ? "note" : "file", size: f.bytes.length, modified: f.modified, label: labelFor(p) })),
      ];
    },
    list_web_notes: (): WebNote[] =>
      this.notes().flatMap((p) => {
        const url = propertiesOf(this.text(p))["url"];
        return typeof url === "string" && /^https?:\/\//.test(url) ? [{ path: p, url }] : [];
      }),
    graph: (): Edge[] => graphEdges(this.linkSources(), (p) => this.linksOf(p), (t, from) => this.resolve(t, from)),
    // Links no note and no file answers to (spec Q14).
    graph_unresolved: (): MissingLink[] => missingLinks(this.linkSources(), (p) => this.linksOf(p), (t, from) => this.resolve(t, from)),
    app_info: (): AppInfo => ({ version: "0.0.0-harness", commit: "harness", device: this.deviceName ?? "Mac de Teste" }),
    // This computer's name (ADR 0079 item 8): no server to tell here.
    device_name: (): DeviceName => ({ name: this.deviceName ?? "Mac de Teste", system: "Mac de Teste", custom: this.deviceName !== null }),
    set_device_name: (a): DeviceRenamed => {
      const name = String(a["name"] ?? "").replace(/\p{Cc}/gu, " ").trim().slice(0, 60).trim();
      this.deviceName = name && name !== "Mac de Teste" ? name : null;
      return { device: { name: this.deviceName ?? "Mac de Teste", system: "Mac de Teste", custom: this.deviceName !== null }, unreached: [] };
    },
    open_window: () => null,
    popout_target: () => null,
    return_to_main: () => null,
    open_url: () => null,
    open_devtools: () => null,
    web_open: (a) => {
      const label = `web-${this.webViews.size + 1}`;
      this.webViews.set(label, String(a["url"]));
      return label;
    },
    web_bounds: () => null,
    web_visible: () => null,
    // A site that refuses framing is one whose address says so.
    embed_frameable: (a) => !/frames-no/.test(String(a["url"])),
    web_close: (a) => void this.webViews.delete(String(a["label"])),
    web_nav: (a) => {
      if (typeof a["url"] === "string") this.webViews.set(String(a["label"]), a["url"]);
      return null;
    },
    web_url: (a) => this.webViews.get(String(a["label"])) ?? "",
    read_text: (a) => this.textFile(this.confine(String(a["path"]))),
    write_text: (a): TextFile => {
      const path = writeGuard(this.confine(String(a["path"])));
      this.writeOver(path, String(a["text"]), String(a["revision"]));
      return this.textFile(path);
    },
    write_board: (a): TextFile => {
      const path = this.confine(String(a["path"]));
      this.writeOver(path, canvasLayout(this.boardJson(path, String(a["json"]))), String(a["revision"]));
      return this.textFile(path);
    },
    // What `write_board` would write, writing nothing. The core lays the
    // window's canvas over the file as read, keeping each unchanged
    // value's token; the window sends back every value it read, so the
    // layout alone gives the same text but for how a number was written.
    board_preview: (a) => {
      const path = this.confine(String(a["path"]));
      this.text(path);
      return canvasLayout(this.boardJson(path, String(a["json"])));
    },
    board_text: (a) => canvasLayout(JSON.parse(String(a["json"]))),
    render_markdown: (a) => renderMarkdown(String(a["text"])),
    project_secrets: (a) => projectSecrets(String(a["text"])),
    reveal: () => null,
    copy_full_path: () => null,
    set_embed_origins: () => null,
    set_walk_rules: () => null,
    set_folder_note_name: (a) => {
      this.machineNoteName = folderNoteSetting(String(a["name"] ?? ""));
      return null;
    },
    get_focuses: () => this.getFocuses(),
    get_folder_settings: () => this.folderLayer(),
    get_obsidian_periodic: () => obsidianPeriodic(this.files),
    note_made_from_template: () => null,
    ...this.data.handlers,
    set_folder_settings: (a) => this.setFolderLayer(a["change"] as FolderSettings, (a["revision"] as string | null | undefined) ?? null),
    can_sync_focuses: () => {
      const summary = this.getFocuses();
      return summary.has_file && summary.format_known;
    },
    set_sync_focuses: (a) => {
      this.syncFocuses = Boolean(a["enabled"]);
      return null;
    },
    set_focuses: (a): FocusesSummary => {
      if (!this.syncFocuses) {
        refuse("failed", "synchronization of focuses with make.md is disabled");
      }
      const focuses = a["focuses"] as Focus[];
      const stamp = a["stamp"] as string | null;
      if (!stamp) {
        refuse("changed", "expected stamp required");
      }
      const stored = this.files.get(".space/waypoints.json");
      if (!stored) {
        refuse("failed", "no .space/waypoints.json file in folder");
      }
      const currentSummary = this.getFocuses();
      if (!currentSummary.format_known) {
        refuse("failed", "cannot write focuses: current file format is not known");
      }
      for (let i = 0; i < focuses.length; i++) {
        const f = focuses[i];
        if (!f || typeof f.name !== "string" || !Array.isArray(f.paths)) {
          refuse("failed", `invalid focus at index ${i}`);
        }
        for (const p of f.paths) {
          if (typeof p !== "string" || (p !== "/" && (p === "" || p.startsWith("/") || p.split("/").some((s) => s === "..")))) {
            refuse("failed", `invalid path '${p}' in focus '${f.name}'`);
          }
        }
      }
      const clean = focuses.map((f) => {
        const obj: any = { name: f.name, paths: f.paths };
        if (f.sticker != null && f.sticker !== "") {
          obj.sticker = f.sticker;
        }
        return obj;
      });

      let finalFocuses = clean;
      if (!this.accepts(".space/waypoints.json", stored, stamp)) {
        // Concurrent modification on disk: attempt merge (ADR 0062 D7)
        const baseFocuses = a["baseFocuses"] as Focus[] | null;
        if (!baseFocuses) {
          refuse("changed", "the file on disk changed since it was read");
        }
        const diskFocuses = currentSummary.focuses;
        const oldFocuses = baseFocuses;
        const newFocuses = clean;

        // Compute deltas by position:
        if (oldFocuses.length === newFocuses.length) {
          const isReorder = JSON.stringify([...oldFocuses].sort((a, b) => a.name.localeCompare(b.name))) ===
            JSON.stringify([...newFocuses].sort((a, b) => a.name.localeCompare(b.name)));
          if (isReorder) {
            if (diskFocuses.length >= oldFocuses.length && JSON.stringify(diskFocuses.slice(0, oldFocuses.length)) === JSON.stringify(oldFocuses)) {
              finalFocuses = [...newFocuses, ...diskFocuses.slice(oldFocuses.length)];
            } else {
              refuse("changed", "conflict in reorder");
            }
          } else {
            const merged = [...diskFocuses];
            for (let i = 0; i < oldFocuses.length; i++) {
              if (JSON.stringify(oldFocuses[i]) !== JSON.stringify(newFocuses[i])) {
                if (i >= diskFocuses.length || JSON.stringify(diskFocuses[i]) !== JSON.stringify(oldFocuses[i])) {
                  refuse("changed", "conflict: focus modified concurrently on disk");
                }
                merged[i] = newFocuses[i];
              }
            }
            finalFocuses = merged;
          }
        } else if (newFocuses.length + 1 === oldFocuses.length) {
          let delIdx = -1;
          for (let i = 0; i < oldFocuses.length; i++) {
            const cand = [...oldFocuses];
            cand.splice(i, 1);
            if (JSON.stringify(cand) === JSON.stringify(newFocuses)) {
              delIdx = i;
              break;
            }
          }
          if (delIdx >= 0 && delIdx < diskFocuses.length && JSON.stringify(diskFocuses[delIdx]) === JSON.stringify(oldFocuses[delIdx])) {
            const merged = [...diskFocuses];
            merged.splice(delIdx, 1);
            finalFocuses = merged;
          } else {
            refuse("changed", "conflict: delete mismatch");
          }
        } else if (newFocuses.length === oldFocuses.length + 1) {
          let insIdx = -1;
          for (let i = 0; i < newFocuses.length; i++) {
            const cand = [...newFocuses];
            cand.splice(i, 1);
            if (JSON.stringify(cand) === JSON.stringify(oldFocuses)) {
              insIdx = i;
              break;
            }
          }
          if (insIdx >= 0) {
            const merged = [...diskFocuses];
            if (insIdx >= oldFocuses.length) {
              merged.push(newFocuses[insIdx]);
            } else if (diskFocuses.length >= oldFocuses.length && JSON.stringify(diskFocuses.slice(0, oldFocuses.length)) === JSON.stringify(oldFocuses)) {
              merged.splice(insIdx, 0, newFocuses[insIdx]);
            } else {
              refuse("changed", "conflict: insert mismatch");
            }
            finalFocuses = merged;
          } else {
            refuse("changed", "conflict");
          }
        } else if (newFocuses.length > oldFocuses.length && JSON.stringify(newFocuses.slice(0, oldFocuses.length)) === JSON.stringify(oldFocuses)) {
          const added = newFocuses.slice(oldFocuses.length);
          if (diskFocuses.length >= oldFocuses.length && JSON.stringify(diskFocuses.slice(0, oldFocuses.length)) === JSON.stringify(oldFocuses)) {
            finalFocuses = [...diskFocuses, ...added];
          } else {
            refuse("changed", "conflict");
          }
        } else {
          refuse("changed", "conflict");
        }
      }

      // Format-preserving serialization matching verso-core
      const oldText = strict.decode(stored.bytes);
      let newText: string;
      try {
        const parsed = JSON.parse(oldText);
        if (Array.isArray(parsed)) {
          const items: any[] = [];
          const usedIndices = new Set<number>();
          for (const f of finalFocuses) {
            let foundIdx = parsed.findIndex((p: any, idx: number) => !usedIndices.has(idx) && p && JSON.stringify(p) === JSON.stringify(f));
            if (foundIdx < 0) {
              foundIdx = parsed.findIndex((p: any, idx: number) => !usedIndices.has(idx) && p && p.name === f.name);
            }
            if (foundIdx >= 0) {
              usedIndices.add(foundIdx);
              const old = parsed[foundIdx];
              if (JSON.stringify(old) === JSON.stringify(f)) {
                items.push(old);
              } else {
                const obj: any = {};
                for (const k of Object.keys(old)) {
                  if (k in f) obj[k] = (f as any)[k];
                }
                if (!("name" in obj)) obj.name = f.name;
                if (!("paths" in obj)) obj.paths = f.paths;
                if (f.sticker && !("sticker" in obj)) obj.sticker = f.sticker;
                items.push(obj);
              }
            } else {
              items.push(f);
            }
          }
          newText = JSON.stringify(items, null, oldText.includes("\n") ? 2 : 0);
        } else {
          newText = JSON.stringify(finalFocuses);
        }
      } catch {
        newText = JSON.stringify(finalFocuses);
      }

      const newBytes = encoder.encode(newText);
      const newStored = this.put(".space/waypoints.json", newBytes);
      return {
        focuses: finalFocuses,
        has_file: true,
        format_known: true,
        read_only_reason: null,
        read_only_code: null,
        stamp: String(newStored.revision),
      };
    },
    log_write: (a) => {
      this.log.push({ level: String(a["level"]), message: String(a["message"]) });
      return null;
    },
    log_read: () => this.log.map((l) => `${l.level} ${l.message}`).join("\n"),
    set_menu_language: () => null,
    set_menu_commands: () => null,
    set_menu_enabled: () => null,
    menu_sections: (a) => menuSections(String(a["language"]), a["features"] as string[]),
    quit_app: () => null,
    reindex: () => this.summary(),
    query_base: (a) => this.queryBase(a["query"] as BaseQuery),
    new_window: () => null,
    cli_status: (): CliState => "ours",
    install_cli: (): CliState => "ours",
    uninstall_cli: (): CliState => "missing",
    mcp_status: (a): McpStatus => ({ server: a["all"] ? "verso" : "verso-harness", claude: "absent", command: "/usr/local/bin/verso" }),
    agent_visible: (): boolean => this.agentVisible,
    set_agent_visible: (a): boolean => (this.agentVisible = Boolean(a["visible"])),
    open_claude_download: (): null => null,
    mcp_add_claude: (a): McpAdded => ({ server: a["all"] ? "verso" : "verso-harness", replaced: false, backup: "claude_desktop_config.verso-backup-1.json", warnings: [] }),
    check_for_updates: (): UpdateInfo => ({
      current_version: "0.0.0-harness",
      latest_version: "0.0.0-harness",
      has_update: false,
      release_name: "",
      release_notes: "",
      download_url: null,
      asset_url: null,
      asset_name: null,
      asset_size: null,
      published_at: null,
    }),
    download_and_install_update: () => refuse("failed", "no updates in the harness"),
    restart_app: () => null,
    // Simultaneous editing is a server's: the desktop app, and so the
    // harness, refuses it (ADR 0073 item 7).
    collab_join: () => refuse("refused", "simultaneous editing is a server's"),
    collab_update: () => refuse("refused", "simultaneous editing is a server's"),
    collab_awareness: () => refuse("refused", "simultaneous editing is a server's"),
    collab_leave: () => refuse("refused", "simultaneous editing is a server's"),
    collab_save: () => refuse("refused", "simultaneous editing is a server's"),
    collab_resolve: () => refuse("refused", "simultaneous editing is a server's"),
    collab_present: () => refuse("refused", "simultaneous editing is a server's"),
    collab_canvas: () => refuse("refused", "simultaneous editing is a server's"),
    collab_roll: () => refuse("refused", "simultaneous editing is a server's"),
    collab_oracle: () => refuse("refused", "simultaneous editing is a server's"),
    ...this.localServer.handlers, // ADR 0096
    // No server signed in to from the harness (ADR 0073 item 2).
    server_accounts: () => [],
    server_sign_in: () => refuse("unavailable", "no server in the harness"),
    server_sign_in_page: () => refuse("refused", "no server's page waits to be opened"),
    server_sign_out: () => null,
    server_folders: () => ({ folders: [], may_create: false }),
    server_create_folder: () => refuse("unavailable", "no server in the harness"),
    server_open: () => refuse("unavailable", "no server in the harness"),
    server_retry: () => null,
    // The harness is a folder of "this computer": no server's address.
    window_server: () => null,
    // The servers announced on the network (ADR 0097): none, until a test
    // sets `discover_servers_list` to some.
    discover_servers_start: () => null,
    discover_servers_list: () => [],
    discover_servers_stop: () => null,
    share_list: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    share_grant: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    share_revoke: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    share_attachments: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    // Read links are a server's (ADR 0105): a test answers them as one.
    read_link_list: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    read_link_secrets: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    read_link_create: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    read_link_revoke: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    server_prove: () => refuse("refused", "this folder is not on a server: sync it with one first"),
    // The folder switcher's "On this computer" (ADR 0081 item 5): the
    // demo vault, opened before.
    recent_folders: () => [
      { key: "harness", name: this.name, place: "~/Documents" },
      { key: "mundo", name: "Mundo antigo", place: "~/…/Dropbox/antigo" },
      { key: "mesa", name: "Mesa de testes", place: "~/Documents" },
    ],
    // The folder's sync (ADR 0079): turned on against the server a test
    // signs in to (`server_accounts`), synced at once — nothing to cross.
    folder_sync: (): SyncStatus => this.sync,
    folder_sync_start: (a): SyncStatus => {
      const folder = (a["folder"] as string | null) ?? "nova";
      const name = (a["name"] as string | null) ?? folder;
      this.sync = { ...Core.syncOff(), on: true, server: a["url"] as string, folder, folder_name: name, role: "owner", state: "synced", last: "2026-10-10T12:00:00Z" };
      return this.sync;
    },
    folder_sync_stop: (): SyncStatus => {
      this.sync = Core.syncOff();
      return this.sync;
    },
    folder_sync_pause: (a) => {
      this.sync = { ...this.sync, state: a["paused"] ? "paused" : "synced", deletions: null };
      return null;
    },
    folder_sync_confirm: () => {
      this.sync = { ...this.sync, state: "synced", deletions: null };
      return null;
    },
    folder_sync_now: () => null,
    // The synced desktop's last answer of what the server lets the person
    // change (ADR 0113 S8). Like the host, it answers only the paths it holds
    // an answer for; the harness's folder is its own, so it holds none.
    sync_rights: (a) => {
      const held = new Map<string, FileAccess>();
      const files = (a["paths"] as string[]).flatMap((path) => {
        const access = held.get(path);
        return access ? [{ path, access }] : [];
      });
      return { fresh: true, files };
    },
    ...this.clouds.handlers(),
    ...this.cloudFiles.handlers(), // ADR 0043
    // The focuses file named without a path (a hidden entry never crosses
    // the contract): the harness keeps the content in the `.icloud` stand-in.
    fetch_focuses_file: () => {
      const standIn = ".space/.waypoints.json.icloud";
      const held = this.files.get(standIn);
      if (!held) return false;
      this.files.delete(standIn);
      this.put(".space/waypoints.json", held.bytes);
      return true;
    },
    ...this.bin.handlers(),
    ...this.maps.handlers(),
    // The harness stands in for the desktop app (ADR 0058).
    capabilities: (): Capabilities => ({
      host: "desktop",
      can: ["write", "reveal", "copy_path", "windows", "web_views", "agents", "updates", "devtools", "local_folders", ...FOLDER_CAN, "terminal", "audio_share"],
      latency_ms: null,
    }),
    folder_space: (): FolderSpace => {
      let notes = 0;
      let attachments = 0;
      for (const [path, f] of this.files) {
        if (path.endsWith(".md")) notes += f.bytes.length;
        else attachments += f.bytes.length;
      }
      return { total: notes + attachments, notes, attachments, files: this.files.size, index: 0 };
    },
  };

  /** A command of the window, answered; a plugin's (the window's own
   *  Tauri calls) answers nothing. */
  invoke(cmd: string, args: unknown): unknown {
    const a = (args ?? {}) as Record<string, unknown>;
    this.calls.push({ cmd, args: a });
    if (cmd.startsWith("plugin:")) return null;
    const handler = this.handlers[cmd];
    if (!handler) {
      console.error(`harness: the command ${cmd} has no answer (src/harness/core.ts)`);
      refuse("failed", `harness: ${cmd} has no answer`);
    }
    return handler(a);
  }

  // ---- For the tests -----------------------------------------------------

  /** A file's text, or null. */
  read(path: string): string | null {
    const f = this.files.get(path);
    return f ? lossy.decode(f.bytes) : null;
  }

  /** A file's bytes as base64, or null. */
  bytes(path: string): string | null {
    const f = this.files.get(path);
    return f ? toBase64(f.bytes) : null;
  }

  /** Write a file as another program would. */
  writeOutside(path: string, text: string): void {
    this.put(path, encoder.encode(text));
  }

  /** Delete a file as another program would — or sync, for another
   *  device. */
  removeOutside(path: string): void {
    this.files.delete(path);
  }
}
