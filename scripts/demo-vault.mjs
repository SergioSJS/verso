#!/usr/bin/env node
// The demo vault (ADR 0058): `demo-vault/` is what "Import the demo
// content" writes into a folder, and the product's tutorial. Two of its
// files are generated here, and one file of the app is made from it:
//
//   demo-vault/Tour do Verso.canvas    the platform, stop by stop
//                                      (scripts/demo-vault/tour.mjs)
//   demo-vault/Treino do Board.canvas  the board itself, lesson by lesson
//                                      (scripts/demo-vault/treino.mjs)
//   app/ui/src/demoVault.ts            the folder, embedded in the app
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

/** The embed for the folder as it is now. */
function embedText() {
  const src = readFileSync(embedPath, "utf8");
  const start = "export const DEMO_VAULT_FILES: DemoVaultFile[] = [";
  const at = src.indexOf(start);
  if (at < 0) throw new Error(`${embedPath}: no "${start}"`);
  const head = src.slice(0, at + start.length) + "\n";
  const listed = [...src.matchAll(/"path": ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]));
  const files = new Set(vaultFiles());
  const order = [...listed.filter((p) => files.has(p)), ...[...files].filter((p) => !listed.includes(p)).sort()];
  const items = order.map((p) => `  {\n    "path": ${JSON.stringify(p)},\n    "b64": "${readFileSync(join(vault, p)).toString("base64")}"\n  }`);
  return `${head}${items.join(",\n")}\n];\n`;
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
