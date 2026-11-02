#!/usr/bin/env node
// `unsafe` in the declared files and nowhere else (ADR 0029, revision of
// 2026-10-15; the audio_share files added with ADR 0116 Q9, decided (a)
// 2026-10-31: Core Audio / WASAPI / PipeWire capture, each block with a
// SAFETY comment). The workspace forbids `unsafe_code`; the one exception, the
// maintainer's decision of 2026-10-15 ("A e B juntos"), is the native
// clipping of an embedded page, which needs the platform's own views:
// app/src-tauri/src/web_clip/macos.rs and windows.rs. A `forbid` cannot be
// allowed in a file, so verso-app writes the workspace's lints out with
// `unsafe_code = "deny"`, and this script is what keeps the exception that
// narrow. It fails when:
//
// - a Rust file of the repository outside those two writes `unsafe` as
//   code (a block, a function, an impl, a trait, an extern block, an
//   attribute) or names the `unsafe_code` lint (an `allow`, an `expect`,
//   a `warn`); comments and strings are not code;
// - the workspace's `unsafe_code` is not `forbid`;
// - verso-app's lint table is not the workspace's, with `unsafe_code` at
//   `deny`, and every unsafe block documented and alone
//   (`undocumented_unsafe_blocks`, `multiple_unsafe_ops_per_block`);
// - another member does not inherit the workspace's lints;
// - a Cargo configuration turns the lint off (`unsafe_code` in rustflags,
//   `--cap-lints`).
//
// Node and git only. Tests: scripts/check-unsafe.test.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ALLOWED = /^app\/src-tauri\/src\/(web_clip\/(macos|windows)|audio_share\/(macos|windows|linux))\.rs$/;
const APP = "app/src-tauri/Cargo.toml";
const ROOT = "Cargo.toml";
const WHY = "ADR 0029, revision of 2026-10-15";

/** The text of a Rust line with its strings emptied and its comments
 *  removed (`//…` and `/*…*\/` on the line): what is left is code. Block
 *  comments across lines are followed by `inBlock`. */
function codeOf(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      if (end < 0) return out;
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    const rest = line.slice(i);
    if (rest.startsWith("//")) return out;
    if (rest.startsWith("/*")) {
      state.inBlock = true;
      i += 2;
      continue;
    }
    const raw = /^b?r(#*)"/.exec(rest);
    if (raw) {
      const close = `"${raw[1]}`;
      const end = line.indexOf(close, i + raw[0].length);
      out += '""';
      i = end < 0 ? line.length : end + close.length;
      continue;
    }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
      out += '""';
      i = j + 1;
      continue;
    }
    // A char literal holding a quote, so that it does not open a string.
    if (rest.startsWith("'\"'")) {
      out += "' '";
      i += 3;
      continue;
    }
    out += line[i];
    i += 1;
  }
  return out;
}

const UNSAFE = /\bunsafe\b/;
const LINT = /\bunsafe_code\b/;

/** Each `unsafe` or `unsafe_code` written as code outside the two files. */
export function rustProblems(files) {
  const problems = [];
  for (const { path, text } of files) {
    if (ALLOWED.test(path)) continue;
    const state = { inBlock: false };
    text.split("\n").forEach((line, n) => {
      const code = codeOf(line, state);
      if (UNSAFE.test(code) || LINT.test(code)) {
        problems.push(`${path}:${n + 1}: unsafe outside app/src-tauri/src/web_clip/{macos,windows}.rs and audio_share/{macos,windows,linux}.rs (${WHY}): ${line.trim()}`);
      }
    });
  }
  return problems;
}

/** A manifest's tables: `{ "[lints.rust]": { unsafe_code: "deny" }, … }`. */
function tables(text) {
  const out = {};
  let at = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const head = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (head) {
      at = head[1];
      out[at] ??= {};
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (kv && at) out[at][kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

/** Whether `path` is a member's manifest (the fuzz harnesses are not
 *  members: the workspace excludes them). */
const member = (path) => path === APP || /^crates\/[^/]+\/Cargo\.toml$/.test(path);

export function manifestProblems(files) {
  const problems = [];
  const root = files.find((f) => f.path === ROOT);
  const ws = root ? tables(root.text) : {};
  const wsRust = ws["workspace.lints.rust"] ?? {};
  const wsClippy = ws["workspace.lints.clippy"] ?? {};
  if (wsRust["unsafe_code"] !== "forbid") problems.push(`${ROOT}: [workspace.lints.rust] unsafe_code is not "forbid" (${WHY})`);
  for (const { path, text } of files) {
    if (/(^|\/)\.cargo\/config(\.toml)?$/.test(path)) {
      if (/unsafe_code|cap-lints/.test(text)) problems.push(`${path}: turns lints off (${WHY})`);
      continue;
    }
    if (!member(path)) continue;
    const t = tables(text);
    if (path === APP) {
      if (t["lints"]?.["workspace"] === "true") problems.push(`${path}: inherits the workspace's lints, which forbid the exception (${WHY})`);
      if (t["lints.rust"]?.["unsafe_code"] !== "deny") problems.push(`${path}: [lints.rust] unsafe_code is not "deny" (${WHY})`);
      const clippy = t["lints.clippy"] ?? {};
      const want = { ...wsClippy, undocumented_unsafe_blocks: "forbid", multiple_unsafe_ops_per_block: "forbid" };
      for (const [lint, level] of Object.entries(want)) {
        if (clippy[lint] !== level) problems.push(`${path}: [lints.clippy] ${lint} is not "${level}", as the workspace's (${WHY})`);
      }
    } else if (t["lints"]?.["workspace"] !== "true" || t["lints.rust"] || t["lints.clippy"]) {
      problems.push(`${path}: does not inherit the workspace's lints alone ([lints] workspace = true) (${WHY})`);
    }
  }
  return problems;
}

/** The working tree as git sees it: tracked files and new ones it does
 *  not ignore, so that a file not yet added is checked too. */
export function scan() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((p) => p && existsSync(new URL(`../${p}`, import.meta.url)));
  const read = (path) => ({ path, text: readFileSync(new URL(`../${path}`, import.meta.url), "utf8") });
  const rust = tracked.filter((p) => p.endsWith(".rs")).map(read);
  const manifests = tracked.filter((p) => p.endsWith("Cargo.toml") || /(^|\/)\.cargo\/config(\.toml)?$/.test(p)).map(read);
  return [...rustProblems(rust), ...manifestProblems(manifests)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = scan();
  if (problems.length > 0) {
    for (const p of problems) console.log(p);
    process.exit(1);
  }
  console.log("unsafe: only in web_clip/{macos,windows}.rs and audio_share/{macos,windows,linux}.rs, the workspace still forbids it");
}
