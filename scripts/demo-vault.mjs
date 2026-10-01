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
//     no longer in the folder leaves it.
//   node scripts/demo-vault.mjs check
//     Nothing to build: the boards are their modules' and the embed is the
//     folder's (scripts/check.sh and CI run it).
//
// The boards' modules are their source: a board is changed there and
// built, never edited in the app and committed. The folder's files are the
// ones git sees (tracked, or new and not ignored).
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

/** The folder's files, as git sees them, relative to it. */
function vaultFiles() {
  const out = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "demo-vault"], { cwd: root });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.slice("demo-vault/".length));
}

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

const [command] = process.argv.slice(2);
/** A board's text, read back as JSON before anything is written. */
function boardText(make) {
  const text = make().toString();
  JSON.parse(text);
  return text;
}

if (command === "build") {
  for (const [name, make] of Object.entries(boards)) writeFileSync(join(vault, name), boardText(make));
  writeFileSync(embedPath, embedText());
  console.log(`demo vault: ${Object.keys(boards).length} boards written, ${vaultFiles().length} files embedded`);
} else if (command === "check") {
  const stale = [];
  for (const [name, make] of Object.entries(boards)) {
    if (readFileSync(join(vault, name), "utf8") !== boardText(make)) stale.push(`demo-vault/${name}`);
  }
  if (readFileSync(embedPath, "utf8") !== embedText()) stale.push("app/ui/src/demoVault.ts");
  if (stale.length > 0) {
    console.error(`Not built from the demo vault's sources (ADR 0058): ${stale.join(", ")}\nRun: node scripts/demo-vault.mjs build`);
    process.exit(1);
  }
  console.log("demo vault: boards and embed up to date");
} else {
  console.error("usage: node scripts/demo-vault.mjs build|check");
  process.exit(2);
}
