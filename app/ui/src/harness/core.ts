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
import type {
  AppInfo,
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
  NoteText,
  Renamed,
  Tag,
  TextFile,
  Trashed,
  UpdateInfo,
  WebNote,
  Written,
} from "../bindings";
import { blocksOf, headingsOf, propertiesOf, propertyList, readableLines, renderMarkdown } from "./markdown";

export type Seed = { path: string; b64: string };

type Stored = { bytes: Uint8Array; revision: number; modified: number };

/** A link as written, found in a text: where, and what it names. */
type Found = { raw: string; target: string; anchor: string; alias: string | null; embed: boolean; line: number; col: number };

const encoder = new TextEncoder();
const strict = new TextDecoder("utf-8", { fatal: true });
const lossy = new TextDecoder("utf-8");

/** A contract error, thrown: the window's typed command answers it as one. */
/** Arguments a handler takes and has no use for: windows, web views, the
 *  menu and the system are the host's, and do nothing in a browser. Named,
 *  so that `e2e/harness.spec.mjs` tells them from an argument the core
 *  renamed, which a handler would read as `undefined`. */
export const UNUSED_ARGS: Record<string, string[]> = {
  reopen_folder: ["key"],
  open_window: ["path"],
  return_to_main: ["path"],
  open_url: ["url"],
  fetch_file: ["path"],
  web_open: ["x", "y", "w", "h"],
  web_bounds: ["label", "x", "y", "w", "h"],
  web_visible: ["label", "visible"],
  web_nav: ["action"],
  reveal: ["path"],
  copy_full_path: ["path"],
  set_embed_origins: ["origins"],
  set_walk_rules: ["builtinIgnores", "gitignore"],
  set_menu_language: ["language"],
  install_cli: ["replace"],
};

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A name as a link compares it: NFC, any case. */
const fold = (s: string): string => s.normalize("NFC").toLowerCase();
/** A word as the search compares it: no accents, any case. */
const plain = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const stripMd = (p: string): string => p.replace(/\.md$/i, "");
const hidden = (p: string): boolean => p.split("/").some((s) => s.startsWith("."));
const isNote = (p: string): boolean => /\.md$/i.test(p);

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

/** A canvas laid out as Verso writes one (verso-core canvas.rs): a
 *  container holding only scalars on one line, any other one entry per
 *  line, tabs, no final newline. */
export function canvasLayout(value: unknown, depth = 0): string {
  const scalar = (v: unknown): boolean => v === null || typeof v !== "object";
  const tab = (n: number): string => "\t".repeat(n);
  if (Array.isArray(value)) {
    if (value.every(scalar)) return `[${value.map((v) => canvasLayout(v, depth + 1)).join(",")}]`;
    return `[\n${value.map((v) => tab(depth + 1) + canvasLayout(v, depth + 1)).join(",\n")}\n${tab(depth)}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.every(([, v]) => scalar(v))) return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canvasLayout(v, depth + 1)}`).join(",")}}`;
    return `{\n${entries.map(([k, v]) => `${tab(depth + 1)}${JSON.stringify(k)}:${canvasLayout(v, depth + 1)}`).join(",\n")}\n${tab(depth)}}`;
  }
  return JSON.stringify(value);
}

export class Core {
  readonly files = new Map<string, Stored>();
  readonly folders = new Set<string>();
  /** Every command asked for, in order: what a test looks at. */
  readonly calls: { cmd: string; args: unknown }[] = [];
  /** What the window wrote into the app's log (`log_write`). */
  readonly log: { level: string; message: string }[] = [];
  private clock = 1_790_000_000;
  private revision = 1;
  private webViews = new Map<string, string>();

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

  /** Write over the revision that was read (invariant 11). */
  private writeOver(path: string, text: string, revision: string): Stored {
    const was = this.stored(path);
    if (String(was.revision) !== revision) refuse("changed", `changed on disk: ${path}`);
    return this.put(path, encoder.encode(text));
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
    const tags = new Set<string>(Array.isArray(fm) ? fm.map(String) : typeof fm === "string" ? fm.split(/[\s,]+/).filter(Boolean) : []);
    for (const line of readableLines(text)) {
      if (/^#{1,6}\s/.test(line)) continue;
      for (const m of line.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) if (m[1] && !/^\d+$/.test(m[1])) tags.add(m[1]);
    }
    return [...tags].map((t) => t.replace(/^#/, ""));
  }

  folderInfo(): FolderInfo {
    return { name: this.name, key: "harness", index: this.summary() };
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
    const plans = new Map<string, string>();
    const movedNow = this.files.has(from) ? [[from, to] as [string, string]] : [...this.files.keys()].filter((p) => p.startsWith(`${from}/`)).map((p): [string, string] => [p, `${to}${p.slice(from.length)}`]);
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
    this.move(from, to);
    const rewrites: LinkRewrite[] = [...plans].map(([path, after]) => ({ path, revision: String(this.stored(path).revision), before: this.text(path), after }));
    return { path: to, rewrites, skipped: [], warnings: [] };
  }

  private trash(pathIn: string): Trashed {
    const path = this.confine(pathIn);
    if (!this.files.has(path) && !this.folders.has(path)) refuse("not_found", `no such entry: ${path}`);
    const to = this.free(`.trash/${path}`);
    this.move(path, to);
    this.folders.delete(path);
    return { path: to, warnings: [] };
  }

  private search(words: string, limit: number): Hit[] {
    const terms = words.split(/\s+/).filter(Boolean);
    const tag = terms.filter((t) => t.startsWith("tag:")).map((t) => fold(t.slice(4).replace(/^#/, "")));
    const path = terms.filter((t) => t.startsWith("path:")).map((t) => fold(t.slice(5)));
    const file = terms.filter((t) => t.startsWith("file:")).map((t) => fold(t.slice(5)));
    const plainWords = terms.filter((t) => !/^(tag|path|file):/.test(t)).map(plain);
    const hits: Hit[] = [];
    for (const p of this.notes()) {
      if (path.some((x) => !fold(p).includes(x)) || file.some((x) => !fold(baseOf(p)).includes(x))) continue;
      if (tag.length > 0) {
        const own = this.tagsOf(p).map(fold);
        if (tag.some((x) => !own.some((t) => t === x || t.startsWith(`${x}/`)))) continue;
      }
      const text = plain(this.text(p));
      const whole = (w: string): boolean => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);
      if (!plainWords.every(whole)) continue;
      const first = plainWords[0];
      const line = (first ? this.text(p).split("\n").find((l) => plain(l).includes(first)) : undefined) ?? this.text(p).split("\n")[0] ?? "";
      hits.push({ path: p, snippet: first ? line.replace(new RegExp(`(${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "iu"), "[$1]") : line });
      if (hits.length >= limit) break;
    }
    return hits;
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

  private cell(path: string, id: string): BaseCell {
    if (id === "file.name") return { kind: "text", value: stripMd(baseOf(path)) };
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
      return { views: [], view: null, columns: [], groups: [], total: 0, problems: [{ kind: "notABase", detail: "" }], properties: [] };
    }
    const views = (Array.isArray(base["views"]) ? base["views"] : []) as Record<string, unknown>[];
    const at = q.view === null ? 0 : Math.max(0, views.findIndex((v) => v["name"] === q.view));
    const view = views[at];
    const props = (base["properties"] ?? {}) as Record<string, { displayName?: string }>;
    const order = Array.isArray(view?.["order"]) ? (view["order"] as unknown[]).map(String) : ["file.name"];
    const ids = [...new Set([...order, ...q.extra])];
    const columns: BaseColumn[] = ids.map((id) => ({ id, name: props[id]?.displayName ?? null }));
    const paths = [...this.notes(), ...this.others()].filter((p) => this.passes(base["filters"], p) && this.passes(view?.["filters"], p));
    const rows: BaseRow[] = paths.map((p) => ({ path: p, note: isNote(p), cells: ids.map((id) => this.cell(p, id)) }));
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
  readonly handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
    pick_folder: () => this.folderInfo(),
    reopen_folder: () => this.folderInfo(),
    open_initial: () => this.folderInfo(),
    current_folder: () => this.folderInfo(),
    list_notes: () => this.notes(),
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
      const path = this.confine(String(a["path"]));
      if (this.files.has(path) || this.folders.has(path)) refuse("exists", `already there: ${path}`);
      this.put(path, fromBase64(String(a["base64"])));
      return path;
    },
    create_folder: (a) => {
      const path = this.confine(String(a["path"]));
      if (this.files.has(path) || this.folders.has(path)) refuse("exists", `already there: ${path}`);
      for (let d = path; d !== ""; d = dirOf(d)) this.folders.add(d);
      return path;
    },
    delete_note: (a) => this.trash(String(a["path"])),
    delete_entry: (a) => this.trash(String(a["path"])),
    rename_note: (a) => this.rename(String(a["from"]), String(a["to"])),
    rename_entry: (a) => this.rename(String(a["from"]), String(a["to"])),
    resolve_attachment: (a) => {
      const found = this.resolve(String(a["target"]), String(a["source"]));
      return found && !isNote(found) ? found : null;
    },
    list_files: () => this.others(),
    list_folders: () => [...this.folders].filter((d) => !hidden(d)).sort(),
    list_tags: (): Tag[] => {
      const by = new Map<string, string[]>();
      for (const p of this.notes()) for (const t of this.tagsOf(p)) by.set(t, [...(by.get(t) ?? []), p]);
      return [...by].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, notes]) => ({ name, notes }));
    },
    read_file_text: (a) => lossy.decode(this.stored(this.confine(String(a["path"]))).bytes),
    list_entries: (): FileEntry[] => {
      const labelFor = (p: string): EntryLabel | null => {
        if (!isNote(p)) return null;
        try {
          const props = propertiesOf(this.text(p));
          const sticker = typeof props["sticker"] === "string" && props["sticker"].trim() ? props["sticker"].trim() : null;
          const color = typeof props["color"] === "string" && props["color"].trim() ? props["color"].trim() : null;
          let alias: string | null = null;
          if (typeof props["alias"] === "string" && props["alias"].trim()) {
            alias = props["alias"].trim();
          } else if (Array.isArray(props["aliases"]) && props["aliases"].length > 0 && typeof props["aliases"][0] === "string" && props["aliases"][0].trim()) {
            alias = props["aliases"][0].trim();
          }
          if (!sticker && !color && !alias) return null;
          return { sticker, color, alias };
        } catch {
          return null;
        }
      };
      const folderLabel = (d: string): EntryLabel | null => {
        const seg = d.split("/").filter(Boolean).pop();
        const cand1 = seg ? `${d}/${seg}.md` : "";
        const cand2 = `${d}.md`;
        if (cand1 && this.files.has(cand1)) return labelFor(cand1);
        if (this.files.has(cand2)) return labelFor(cand2);
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
    graph: (): Edge[] => {
      const seen = new Set<string>();
      const out: Edge[] = [];
      for (const from of this.linkSources()) {
        for (const l of this.linksOf(from)) {
          const to = this.resolve(l.target, from);
          if (!to || to === from || seen.has(`${from}\n${to}`)) continue;
          seen.add(`${from}\n${to}`);
          out.push({ from, to });
        }
      }
      return out;
    },
    app_info: (): AppInfo => ({ version: "0.0.0-harness", commit: "harness" }),
    open_window: () => null,
    popout_target: () => null,
    return_to_main: () => null,
    open_url: () => null,
    fetch_file: () => false,
    open_devtools: () => null,
    web_open: (a) => {
      const label = `web-${this.webViews.size + 1}`;
      this.webViews.set(label, String(a["url"]));
      return label;
    },
    web_bounds: () => null,
    web_visible: () => null,
    web_close: (a) => void this.webViews.delete(String(a["label"])),
    web_nav: (a) => {
      if (typeof a["url"] === "string") this.webViews.set(String(a["label"]), a["url"]);
      return null;
    },
    web_url: (a) => this.webViews.get(String(a["label"])) ?? "",
    read_text: (a) => this.textFile(this.confine(String(a["path"]))),
    write_text: (a): TextFile => {
      const path = this.confine(String(a["path"]));
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
    reveal: () => null,
    copy_full_path: () => null,
    set_embed_origins: () => null,
    set_walk_rules: () => null,
    log_write: (a) => {
      this.log.push({ level: String(a["level"]), message: String(a["message"]) });
      return null;
    },
    log_read: () => this.log.map((l) => `${l.level} ${l.message}`).join("\n"),
    set_menu_language: () => null,
    reindex: () => this.summary(),
    query_base: (a) => this.queryBase(a["query"] as BaseQuery),
    new_window: () => null,
    cli_status: (): CliState => "missing",
    install_cli: (): CliState => "ours",
    uninstall_cli: (): CliState => "missing",
    mcp_status: (): McpStatus => ({ server: "verso-harness", claude: "absent" }),
    mcp_add_claude: (): McpAdded => ({ server: "verso-harness", replaced: false, backup: null, warnings: [] }),
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
}
