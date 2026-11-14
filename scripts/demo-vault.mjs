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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Board } from "./demo-vault/canvas.mjs";
import { NAMES, english, shared } from "./demo-vault/names.mjs";
import { translator } from "./demo-vault/translate.mjs";
import { tour } from "./demo-vault/tour.mjs";
import { treino } from "./demo-vault/treino.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
/** The two vaults (ADR 0058, point 15). Portuguese is the source and the
 *  English one its twin: every file has its English path in `names.mjs`,
 *  except the shared ones (`assets/`), which are kept once, in the
 *  Portuguese folder, and embedded by both. */
const LANGS = {
  pt: {
    dir: "demo-vault",
    embed: "app/ui/src/demoVault.ts",
    list: "DEMO_VAULT_FILES",
    welcome: "00 - Bem-vindo ao Verso.md",
    tour: "Tour do Verso.canvas",
    boards: { "Tour do Verso.canvas": tour, "Treino do Board.canvas": treino },
  },
  en: {
    dir: "demo-vault-en",
    embed: "app/ui/src/demoVaultEn.ts",
    list: "DEMO_VAULT_EN_FILES",
    welcome: "00 - Welcome to Verso.md",
    tour: "Verso Tour.canvas",
    boards: { "Verso Tour.canvas": tour, "Board Training.canvas": treino },
  },
};
const DIRS = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, join(root, v.dir)]));
/** Links the tutorial leaves missing on purpose: note 02 shows a link that
 *  creates its note when it is followed. */
const MEANT_MISSING = new Set(["nova ideia de projeto", "new project idea"]);

/** The folder's files git tracks, relative to it: what the app embeds. A
 *  file left in the folder by a test (a daily note made in the app) is not
 *  the tutorial until it is added (review `board.md`, reading 5,
 *  finding 16); `untracked` names those. */
function ownFiles(lang, which = "--cached") {
  const dir = LANGS[lang].dir;
  const flags = which === "--cached" ? ["--cached"] : ["--others", "--exclude-standard"];
  const out = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z", ...flags, "--", dir], { cwd: root });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.slice(`${dir}/`.length));
}
/** The files a vault holds as the app sees it: its own, and for the English
 *  one the shared ones, which live in the Portuguese folder. */
function vaultFiles(lang, which = "--cached") {
  if (lang === "pt" || which !== "--cached") return ownFiles(lang, which);
  return [...ownFiles(lang), ...ownFiles("pt").filter(shared)];
}
/** Where a file of a vault is on disk. */
const diskPath = (lang, p) => join(DIRS[lang === "en" && shared(p) ? "pt" : lang], p);
const untracked = (lang) => ownFiles(lang, "--others");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The SHA-256 of every version of `demo-vault/<p>` git has ever had,
 *  renames followed, by the path it had then (`Map` path -> hashes): what
 *  the import compares a file already in the folder with, to tell a
 *  person's untouched copy of an older tutorial from the person's own edit
 *  (ADR 0058). */
/** Lessons merged into another: old path → the lesson that holds it now. */
const MERGED = {
  pt: {
    "17 - Terminal, CLI e Agentes.md": "35 - Terminal, CLI e Agentes de IA.md",
    "35 - Terminal e Agentes de IA.md": "35 - Terminal, CLI e Agentes de IA.md",
  },
  en: {
    "17 - Terminal, CLI and Agents.md": "35 - Terminal, CLI and AI Agents.md",
    "35 - Terminal and AI Agents.md": "35 - Terminal, CLI and AI Agents.md",
  },
};

function historyHashes(lang, p) {
  const dir = LANGS[lang === "en" && shared(p) ? "pt" : lang].dir;
  const log = execFileSync("git", ["-c", "core.quotepath=off", "log", "--follow", "--name-only", "--format=@%H", "--", `${dir}/${p}`], { cwd: root, maxBuffer: 1 << 28 })
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
    const name = (specs[spec++] ?? "").replace(/^[^:]*:/, "").replace(`${dir}/`, "");
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
function embedText(lang) {
  const embedPath = join(root, LANGS[lang].embed);
  const start = `export const ${LANGS[lang].list}: DemoVaultFile[] = [`;
  const src = existsSync(embedPath) ? readFileSync(embedPath, "utf8") : EN_HEAD + start;
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
  // The English embed holds only the files of its own folder: the shared
  // ones are the Portuguese embed's, and the window joins the two.
  const files = new Set(ownFiles(lang));
  const order = [...listed.filter((p) => files.has(p)), ...[...files].filter((p) => !listed.includes(p)).sort()];
  // A path the demo had and no longer has, that git follows to a file it
  // has now (a rename): the import moves the person's untouched copy of it
  // to the trash when it writes the current one.
  const retired = new Map(retiredBefore);
  const items = order.map((p) => {
    const bytes = readFileSync(join(DIRS[lang], p));
    const now = sha256(bytes);
    const history = historyHashes(lang, p);
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
  // Two lessons merged into one (2026-11-04: the terminal's 17 and 35):
  // git follows neither to the new file, so the import is told here, and
  // an older name that led to either now leads to the merged lesson.
  for (const [was, to] of Object.entries(MERGED[lang] ?? {})) {
    if (!files.has(to)) continue;
    const past = new Set(retired.get(was)?.past ?? []);
    for (const hashes of historyHashes(lang, was).values()) for (const h of hashes) past.add(h);
    retired.set(was, { to, past: [...past] });
    for (const [name, r] of retired) if (r.to === was) retired.set(name, { ...r, to });
  }
  const gone = [...retired].filter(([name]) => !files.has(name)).sort(([a], [b]) => (a < b ? -1 : 1));
  if (lang === "en") return `${head}${items.join(",\n")}\n];\n`;
  const old = gone.length === 0
    ? "export const DEMO_RETIRED: DemoRetired[] = [];\n"
    : `export const DEMO_RETIRED: DemoRetired[] = [\n${gone
        .map(([name, r]) => `  {\n    "path": ${JSON.stringify(name)},\n    "to": ${JSON.stringify(r.to)},\n    "past": [\n${[...r.past].sort().map((h) => `      "${h}"`).join(",\n")}\n    ]\n  }`)
        .join(",\n")}\n];\n`;
  return `${head}${items.join(",\n")}\n];\n\n${old}`;
}

/** The text a new English embed starts from; the Portuguese one is always there. */
const EN_HEAD = `// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The English demo vault (ADR 0058, point 15), embedded apart from the
 *  Portuguese one so that the window loads it only when it is imported.
 *  Its shared files (\`assets/\`) are \`demoVault.ts\`'s. */
import type { DemoVaultFile } from "./demoVault";

`;

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

function problems(lang) {
  const { welcome: WELCOME, tour: TOUR } = LANGS[lang];
  const files = vaultFiles(lang);
  const said = [];
  if (lang === "en") twinProblems(said);
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
    if (!text.has(p)) text.set(p, readFileSync(diskPath(lang, p), "utf8"));
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
  // window's names in the vault's language.
  const main = readFileSync(join(root, "app/ui/src/strings.ts"), "utf8");
  const ptStrings = main.slice(main.indexOf("const pt: Strings = {"), main.indexOf("const en: Strings = {"));
  const enStrings = main.slice(main.indexOf("const en: Strings = {"));
  const ofLang = lang === "en" ? enStrings : ptStrings;
  const daily = /dailyName: "([^"]+)"/.exec(ofLang)?.[1];
  const templates = /templatesName: "([^"]+)"/.exec(ofLang)?.[1];
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

/** The two vaults are twins (ADR 0058, point 15): every Portuguese file has
 *  an English path in the manifest, no English file lacks one, and a shared
 *  file is kept once. */
function twinProblems(said) {
  const pt = new Set(ownFiles("pt"));
  const en = new Set(ownFiles("en"));
  const named = new Set(Object.values(NAMES));
  for (const p of pt) {
    if (shared(p)) continue;
    const to = NAMES[p];
    if (to === undefined) said.push(`demo-vault/${p} has no English twin in scripts/demo-vault/names.mjs`);
    else if (!en.has(to)) said.push(`demo-vault/${p}: its English twin demo-vault-en/${to} does not exist`);
  }
  for (const p of Object.keys(NAMES)) if (!pt.has(p)) said.push(`names.mjs: ${p} is not a file of demo-vault/ any more`);
  for (const p of en) {
    if (shared(p)) said.push(`demo-vault-en/${p}: a shared file is kept once, in demo-vault/`);
    else if (!named.has(p)) said.push(`demo-vault-en/${p} is the twin of no file in scripts/demo-vault/names.mjs`);
  }
}

/** The boards of a vault, built: their text now, and what their words lack
 *  or hold over. The boards' modules are written in Portuguese; an English
 *  board is the same drawing said by `scripts/demo-vault/en-boards.mjs`,
 *  one translator for both so that a pair used by either is used. */
function boardsOf(lang) {
  const t = translator(lang);
  const made = Object.entries(LANGS[lang].boards).map(([name, make]) => {
    const text = make(new Board(t.tr, t.name)).toString();
    JSON.parse(text);
    return { name, text };
  });
  const said = [];
  for (const m of t.missing()) said.push(`scripts/demo-vault/en-boards.mjs: no English for ${JSON.stringify(m)}`);
  for (const u of t.unused()) said.push(`scripts/demo-vault/en-boards.mjs: ${JSON.stringify(u)} is said by no board`);
  return { made, said };
}

const [command, only] = process.argv.slice(2);
const langs = only === undefined ? ["pt", "en"] : [only];
if (command === "build") {
  for (const lang of langs) {
    const { made, said: words } = boardsOf(lang);
    for (const m of words) console.error(m);
    for (const b of made) writeFileSync(join(DIRS[lang], b.name), b.text);
    writeFileSync(join(root, LANGS[lang].embed), embedText(lang));
    console.log(`demo vault (${lang}): ${made.length} boards written, ${ownFiles(lang).length} files embedded`);
    const left = untracked(lang);
    if (left.length > 0) console.error(`Not embedded, not tracked by git (add them to make them part of the tutorial): ${left.join(", ")}`);
    const said = problems(lang);
    if (said.length > 0) console.error(`The ${lang} vault does not hold together yet (check will refuse it):\n  ${said.join("\n  ")}`);
  }
} else if (command === "check") {
  let failed = false;
  for (const lang of langs) {
    const stale = [];
    const { made, said: words } = boardsOf(lang);
    for (const b of made) {
      const have = existsSync(join(DIRS[lang], b.name)) ? readFileSync(join(DIRS[lang], b.name), "utf8") : null;
      if (have !== b.text) stale.push(`${LANGS[lang].dir}/${b.name}`);
    }
    const embedPath = join(root, LANGS[lang].embed);
    if (!existsSync(embedPath) || readFileSync(embedPath, "utf8") !== embedText(lang)) stale.push(LANGS[lang].embed);
    const said = [...words, ...problems(lang)];
    if (stale.length > 0) console.error(`Not built from the demo vault's sources (ADR 0058): ${stale.join(", ")}\nRun: node scripts/demo-vault.mjs build`);
    if (said.length > 0) console.error(`The ${lang} demo vault does not hold together (ADR 0058):\n  ${said.join("\n  ")}`);
    if (stale.length > 0 || said.length > 0) failed = true;
    else console.log(`demo vault (${lang}): boards and embed up to date; ${vaultFiles(lang).length} files hold together`);
  }
  if (failed) process.exit(1);
} else if (command === "links") {
  // The quick look while the English notes are being written: the vault
  // holding together, without the boards or the embed.
  const said = problems(only ?? "en");
  for (const line of said) console.error(line);
  console.log(`${said.length} problems`);
} else {
  console.error("usage: node scripts/demo-vault.mjs build|check|links [pt|en]");
  process.exit(2);
}
