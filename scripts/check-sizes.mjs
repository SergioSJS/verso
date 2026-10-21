#!/usr/bin/env node
// Source files stay under 1500 lines (ADR 0067). Counts every line of each
// tracked .rs, .ts, .tsx, .js, .mjs and .css under crates/, app/ and
// scripts/, tests included; generated files are left out. A file may pass
// the limit only by a line in scripts/size-exceptions.txt —
// `<path> <lines> <why>` — and then may not grow past those lines; a listed
// file back under the limit fails too, until its line is removed: the list
// only shrinks.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LIMIT = 1500;
const GENERATED = /^app\/ui\/src\/(bindings|demoVault|demoVaultEn)\.ts$/;
const SOURCE = /\.(rs|ts|tsx|js|mjs|css)$/;
const EXCEPTIONS = "scripts/size-exceptions.txt";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const allowed = new Map();
if (existsSync(EXCEPTIONS)) {
  for (const line of readFileSync(EXCEPTIONS, "utf8").split("\n")) {
    const [path, lines] = line.trim().split(/\s+/);
    if (!path || path.startsWith("#")) continue;
    allowed.set(path, Number(lines));
  }
}

const files = execFileSync("git", ["ls-files", "-z", "--", "crates", "app", "scripts"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => SOURCE.test(f) && !GENERATED.test(f));

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const n = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  const max = allowed.get(file);
  allowed.delete(file);
  if (max !== undefined) {
    if (n > max) problems.push(`${file}: ${n} lines, more than the ${max} its exception allows`);
    else if (n <= LIMIT) problems.push(`${file}: ${n} lines, under the limit: remove its line from ${EXCEPTIONS}`);
  } else if (n > LIMIT) {
    problems.push(`${file}: ${n} lines, more than ${LIMIT}: split it by area`);
  }
}
for (const gone of allowed.keys()) problems.push(`${EXCEPTIONS} names ${gone}, which is not a tracked source file`);

if (problems.length > 0) {
  for (const p of problems) console.log(`${p} (ADR 0067)`);
  process.exit(1);
}
console.log(`file sizes: ok, ${files.length} files under ${LIMIT} lines`);
