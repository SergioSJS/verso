#!/usr/bin/env node
// The demo vault (ADR 0058): `demo-vault/` is what "Import the demo
// content" writes into a folder, and the product's tutorial. Two of its
// files are generated here, and one file of the app is made from it:
//
//   demo-vault/Tour do Verso.canvas    the platform, stop by stop
//                                      (scripts/demo-vault/tour.mjs)
//   demo-vault/Treino do Board.canvas  the board itself, lesson by lesson
//                                      (scripts/demo-vault/treino.mjs)
//   app/ui/src/demoVault.ts            the folder, embedded in the app, with
//                                      the hash of every past version of each
//                                      file (git history) so the import can
//                                      update an untouched old copy
//
//   node scripts/demo-vault.mjs build
//     Writes the two boards, then embeds the folder: the files the embed
//     already lists keep their order, a new file goes at the end, a file
//     no longer in the folder leaves it. What `check` would refuse in the
//     vault itself is said, not refused: the author fixes it next.
//   node scripts/demo-vault.mjs check
//     Nothing to build — the boards are their modules' and the embed is the
//     folder's — and the vault holds together (`problems`): every link of
//     its notes and of its boards leads to a file of the folder, a #heading
//     to a heading of its note; the daily notes and the templates are where
//     the app looks by default; every numbered note is in the welcome
//     note's map, on the tour, and links to the next one.
//     scripts/check.sh and CI run it.
//
// The boards' modules are their source: a board is changed there and
// built, never edited in the app and committed. The folder's files are the
// ones git sees (tracked, or new and not ignored). The steps followed in
// the app are docs/reference/demo-vault-walkthrough.md.
// Dependency-free; Node 18 or later, with git on PATH.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tour } from "./demo-vault/tour.mjs";
import { treino } from "./demo-vault/treino.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const vault = join(root, "demo-vault");
const embedPath = join(root, "app/ui/src/demoVault.ts");
const boards = { "Tour do Verso.canvas": tour, "Treino do Board.canvas": treino };
const WELCOME = "00 - Bem-vindo ao Verso.md";
const TOUR = "Tour do Verso.canvas";
/** Links the tutorial leaves missing on purpose: note 02 shows a link that
 *  creates its note when it is followed. */
const MEANT_MISSING = new Set(["nova ideia de projeto"]);

/** The folder's files git tracks, relative to it: what the app embeds. A
 *  file left in the folder by a test (a daily note made in the app) is not
 *  the tutorial until it is added (review `board.md`, reading 5,
 *  finding 16); `untracked` names those. */
function vaultFiles(which = "--cached") {
  const flags = which === "--cached" ? ["--cached"] : ["--others", "--exclude-standard"];
  const out = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z", ...flags, "--", "demo-vault"], { cwd: root });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.slice("demo-vault/".length));
}
const untracked = () => vaultFiles("--others");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The SHA-256 of every version of `demo-vault/<p>` git has ever had,
 *  renames followed, by the path it had then (`Map` path -> hashes): what
 *  the import compares a file already in the folder with, to tell a
 *  person's untouched copy of an older tutorial from the person's own edit
 *  (ADR 0058). */
function historyHashes(p) {
  const log = execFileSync("git", ["-c", "core.quotepath=off", "log", "--follow", "--name-only", "--format=@%H", "--", `demo-vault/${p}`], { cwd: root, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\n");
  const specs = [];
  let rev = "";
  for (const line of log) {
    if (line.startsWith("@")) rev = line.slice(1);
    else if (line !== "" && rev) specs.push(`${rev}:${line}`);
  }
  const byPath = new Map();
  if (specs.length === 0) return byPath;
  const out = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: specs.join("\n") + "\n", maxBuffer: 1 << 30 });
  let at = 0;
  let spec = 0;
  while (at < out.length) {
    const eol = out.indexOf(0x0a, at);
    if (eol < 0) break;
    const header = out.subarray(at, eol).toString("utf8");
    at = eol + 1;
    const name = (specs[spec++] ?? "").replace(/^[^:]*:/, "").replace(/^demo-vault\//, "");
    const m = /^\S+ blob (\d+)$/.exec(header);
    if (!m) continue; // "<spec> missing": the file was deleted at that commit
    const size = Number(m[1]);
    byPath.set(name, new Set([...(byPath.get(name) ?? []), sha256(out.subarray(at, at + size))]));
    at += size + 1;
  }
  return byPath;
}

/** The embed for the folder as it is now. Beside each file, `past`: the
 *  hashes of its earlier versions — git's history joined with the ones the
 *  embed already lists, so that a clone with a shallow history rebuilds the
 *  same text (the list only grows). */
function embedText() {
  const src = readFileSync(embedPath, "utf8");
  const start = "export const DEMO_VAULT_FILES: DemoVaultFile[] = [";
  const at = src.indexOf(start);
  if (at < 0) throw new Error(`${embedPath}: no "${start}"`);
  const head = src.slice(0, at + start.length) + "\n";
  const listed = [...src.matchAll(/"path": ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]));
  const before = new Map();
  for (const m of src.matchAll(/"path": ("(?:[^"\\]|\\.)*"),\s*(?:"past": \[([^\]]*)\],\s*)?"b64"/g)) {
    before.set(JSON.parse(m[1]), [...(m[2] ?? "").matchAll(/"([0-9a-f]{64})"/g)].map((h) => h[1]));
  }
  const retiredBefore = new Map();
  for (const m of src.matchAll(/"path": ("(?:[^"\\]|\\.)*"),\s*"to": ("(?:[^"\\]|\\.)*"),\s*"past": \[([^\]]*)\]/g)) {
    retiredBefore.set(JSON.parse(m[1]), { to: JSON.parse(m[2]), past: [...m[3].matchAll(/"([0-9a-f]{64})"/g)].map((h) => h[1]) });
  }
  const files = new Set(vaultFiles());
  const order = [...listed.filter((p) => files.has(p)), ...[...files].filter((p) => !listed.includes(p)).sort()];
  // A path the demo had and no longer has, that git follows to a file it
  // has now (a rename): the import moves the person's untouched copy of it
  // to the trash when it writes the current one.
  const retired = new Map(retiredBefore);
  const items = order.map((p) => {
    const bytes = readFileSync(join(vault, p));
    const now = sha256(bytes);
    const history = historyHashes(p);
    const all = new Set(before.get(p) ?? []);
    for (const [name, hashes] of history) {
      for (const h of hashes) all.add(h);
      // Not a rename that only changes case or Unicode form: on a disk that
      // does not tell them apart it is the same file, and trashing "the old
      // one" would trash the new.
      if (name !== p && !files.has(name) && fold(name) !== fold(p)) {
        const was = retired.get(name);
        retired.set(name, { to: p, past: [...new Set([...(was?.past ?? []), ...hashes])] });
      }
    }
    const past = [...all].filter((h) => h !== now).sort();
    const list = past.length === 0 ? "" : `    "past": [\n${past.map((h) => `      "${h}"`).join(",\n")}\n    ],\n`;
    return `  {\n    "path": ${JSON.stringify(p)},\n${list}    "b64": "${bytes.toString("base64")}"\n  }`;
  });
  const gone = [...retired].filter(([name]) => !files.has(name)).sort(([a], [b]) => (a < b ? -1 : 1));
  const old = gone.length === 0
    ? "export const DEMO_RETIRED: DemoRetired[] = [];\n"
    : `export const DEMO_RETIRED: DemoRetired[] = [\n${gone
        .map(([name, r]) => `  {\n    "path": ${JSON.stringify(name)},\n    "to": ${JSON.stringify(r.to)},\n    "past": [\n${[...r.past].sort().map((h) => `      "${h}"`).join(",\n")}\n    ]\n  }`)
        .join(",\n")}\n];\n`;
  return `${head}${items.join(",\n")}\n];\n\n${old}`;
}

/** A board's text, read back as JSON before anything is written. */
function boardText(make) {
  const text = make().toString();
  JSON.parse(text);
  return text;
}

// ---- The vault holding together ----------------------------------------

/** A name as a link compares it: NFC (a disk may keep NFD), any case. */
const fold = (s) => s.normalize("NFC").toLowerCase();
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1);

/** Markdown with what is not read as Markdown taken out — fenced code,
 *  code spans, comments: a link written there is an example. */
function readable(text) {
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/(`+)[\s\S]*?\1/g, "")
    .replace(/%%[\s\S]*?%%/g, "");
}

/** The links of a text: wikilinks and embeds, and Markdown links to a
 *  path of the folder. `name` is what the link names, `anchor` what
 *  follows its `#`. */
function linksOf(text) {
  const out = [];
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const target = (m[1] ?? "").split("|")[0] ?? "";
    const hash = target.indexOf("#");
    out.push({ raw: m[0], name: (hash < 0 ? target : target.slice(0, hash)).trim(), anchor: hash < 0 ? "" : target.slice(hash + 1).trim() });
  }
  for (const m of text.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    let name = target.split("#")[0] ?? "";
    try {
      name = decodeURIComponent(name);
    } catch {
      // Left as written.
    }
    out.push({ raw: m[0], name, anchor: "" });
  }
  return out;
}

/** What `check` refuses in the vault itself, one line each. */
/** Whether a name is one not every OS can keep — Windows would not keep it
 *  as written (ADR 0070): the tutorial is imported into folders synced to
 *  Windows, and the core refuses such a name when the import makes it. The
 *  same rule as crates/verso-fs/src/confine.rs and app/ui/src/files.ts. */
function unportable(name) {
  const stem = (name.split(".")[0] ?? "").trimEnd().toUpperCase();
  const device = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/.test(stem);
  return device || /[. ]$/.test(name) || /[:*"<>?|\\\x00-\x1f]/.test(name);
}

function problems() {
  const files = vaultFiles();
  const said = [];
  // The tutorial carries no folder settings (ADR 0070): imported, it is
  // the person's folder, and its `.verso/` is made by their first change.
  for (const p of files.filter((f) => f === ".verso" || f.startsWith(".verso/"))) {
    said.push(`${p}: the tutorial carries no folder settings — only a change made in the app writes them (ADR 0070)`);
  }
  for (const p of files) {
    for (const part of p.replace(/^demo-vault\//, "").split("/")) {
      if (unportable(part)) said.push(`${p}: "${part}" is a name not every system can keep (ADR 0070)`);
    }
  }
  const byPath = new Map(files.map((p) => [fold(p), p]));
  const byName = new Map();
  for (const p of files) byName.set(fold(baseOf(p)), [...(byName.get(fold(baseOf(p))) ?? []), p]);
  const text = new Map();
  const read = (p) => {
    if (!text.has(p)) text.set(p, readFileSync(join(vault, p), "utf8"));
    return text.get(p);
  };
  const headings = (p) => new Set([...readable(read(p)).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map((m) => fold(m[1] ?? "")));

  // A link is resolved as Obsidian resolves one, seen from outside: the
  // path from the folder's root or from the note's folder, as written or
  // with `.md`; else a file of that name anywhere.
  const resolve = (name, from) => {
    const n = fold(name);
    const tries = [n, `${n}.md`];
    const dir = fold(dirOf(from));
    for (const t of tries) if (byPath.has(t)) return byPath.get(t);
    if (dir) for (const t of tries) if (byPath.has(`${dir}/${t}`)) return byPath.get(`${dir}/${t}`);
    for (const t of tries) if (byName.has(t)) return byName.get(t)[0];
    return null;
  };
  const resolveAll = (from, body) => {
    const found = [];
    for (const l of linksOf(readable(body))) {
      const to = l.name === "" ? from : resolve(l.name, from);
      if (!to) {
        if (!MEANT_MISSING.has(fold(l.name))) said.push(`${from}: ${l.raw} leads to no file of the vault`);
        continue;
      }
      found.push(to);
      if (l.anchor && !l.anchor.startsWith("^") && to.endsWith(".md") && !headings(to).has(fold(l.anchor))) {
        said.push(`${from}: ${l.raw} names no heading of ${to}`);
      }
    }
    return found;
  };

  const linked = new Map();
  for (const p of files) {
    if (p.endsWith(".md")) linked.set(p, resolveAll(p, read(p)));
    else if (p.endsWith(".canvas")) {
      let doc;
      try {
        doc = JSON.parse(read(p));
      } catch (e) {
        said.push(`${p}: not JSON (${e.message})`);
        continue;
      }
      const to = [];
      for (const n of Array.isArray(doc.nodes) ? doc.nodes : []) {
        if (n.type === "file" && typeof n.file === "string") {
          if (byPath.has(fold(n.file))) to.push(byPath.get(fold(n.file)));
          else said.push(`${p}: the card "${n.id}" names ${n.file}, not a file of the vault`);
        } else if (n.type === "text" && typeof n.text === "string") to.push(...resolveAll(p, n.text));
      }
      linked.set(p, to);
    }
  }

  // The daily notes and the templates where the app looks by default: the
  // window's pt-BR names (the demo vault is in Portuguese).
  const main = readFileSync(join(root, "app/ui/src/strings.ts"), "utf8");
  const ptStrings = main.slice(main.indexOf("const pt: Strings = {"), main.indexOf("const en: Strings = {"));
  const daily = /dailyName: "([^"]+)"/.exec(ptStrings)?.[1];
  const templates = /templatesName: "([^"]+)"/.exec(ptStrings)?.[1];
  if (!daily || !templates) said.push("app/ui/src/strings.ts: the default folders of the daily notes and the templates were not found");
  else {
    if (!files.some((p) => new RegExp(`^${daily}/\\d{4}-\\d{2}-\\d{2}\\.md$`).test(p.normalize("NFC")))) said.push(`no daily note in ${daily}/, where the app looks for them`);
    if (!byPath.has(fold(`${templates}/${daily}.md`))) said.push(`no ${templates}/${daily}.md: the app makes a daily note from the template named as its folder`);
  }

  // Every numbered note in the welcome note's map, on the tour, and
  // pointing to the next one.
  const numbered = files.filter((p) => /^\d{2} - .+\.md$/.test(p)).sort();
  const fromWelcome = new Set(linked.get(WELCOME) ?? []);
  const onTour = new Set(linked.get(TOUR) ?? []);
  numbered.forEach((p, i) => {
    if (p !== WELCOME && !fromWelcome.has(p)) said.push(`${WELCOME} does not link to ${p}`);
    if (!onTour.has(p)) said.push(`${TOUR} has no card for ${p}`);
    const next = numbered[i + 1];
    if (next && !(linked.get(p) ?? []).includes(next)) said.push(`${p} does not link to the next note, ${next}`);
  });
  return said;
}

const [command] = process.argv.slice(2);
if (command === "build") {
  for (const [name, make] of Object.entries(boards)) writeFileSync(join(vault, name), boardText(make));
  writeFileSync(embedPath, embedText());
  console.log(`demo vault: ${Object.keys(boards).length} boards written, ${vaultFiles().length} files embedded`);
  const left = untracked();
  if (left.length > 0) console.error(`Not embedded, not tracked by git (add them to make them part of the tutorial): ${left.join(", ")}`);
  const said = problems();
  if (said.length > 0) console.error(`The vault does not hold together yet (check will refuse it):\n  ${said.join("\n  ")}`);
} else if (command === "check") {
  const stale = [];
  for (const [name, make] of Object.entries(boards)) {
    if (readFileSync(join(vault, name), "utf8") !== boardText(make)) stale.push(`demo-vault/${name}`);
  }
  if (readFileSync(embedPath, "utf8") !== embedText()) stale.push("app/ui/src/demoVault.ts");
  const said = problems();
  if (stale.length > 0) console.error(`Not built from the demo vault's sources (ADR 0058): ${stale.join(", ")}\nRun: node scripts/demo-vault.mjs build`);
  if (said.length > 0) console.error(`The demo vault does not hold together (ADR 0058):\n  ${said.join("\n  ")}`);
  if (stale.length > 0 || said.length > 0) process.exit(1);
  console.log(`demo vault: boards and embed up to date; ${vaultFiles().length} files hold together`);
} else {
  console.error("usage: node scripts/demo-vault.mjs build|check");
  process.exit(2);
}
