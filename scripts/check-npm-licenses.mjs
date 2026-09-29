#!/usr/bin/env node
// npm license gate (ADR 0029, Phase 2 guardrail): every package in the
// window's lockfile, app/ui/package-lock.json, declares a license on the
// allowlist below. cargo-deny holds the Rust tree to deny.toml; nothing
// held the npm tree until the maintainer asked for this gate on 2026-09-23
// (docs/review/phase-2.md §6, item 7).
//
// The allowlist is deny.toml's, plus OFL-1.1: the license of the fonts the
// window bundles (@fontsource), which is for fonts and has no Rust crate
// to appear under. Anything else enters only with a justification in the
// PR that adds the package (ADR 0033), as in deny.toml.
//
// Every package is checked, the dev tools too (esbuild, TypeScript): they
// are not shipped, but a tool that changes its license is a question to
// ask, not to find out later. The lockfile (version 2 or 3) records the
// license each package declared in its package.json; nothing is fetched.
// A license is an SPDX expression: `A OR B` passes when one side does,
// `A AND B` when both do; `A WITH exception` is one entry of the list.
// Grouping with parentheses is read as if there were none, which is exact
// for a flat OR or AND and refuses, rather than passes, anything subtler.
// A package with no license, or with a file reference ("SEE LICENSE IN
// …"), fails: a human reads it and decides.
//
// Usage: node scripts/check-npm-licenses.mjs [lockfile]
// Dependency-free, Node 18 or later.

import { readFileSync } from "node:fs";

const ALLOW = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Zlib",
  "MPL-2.0",
  "Unicode-3.0",
  "CC0-1.0",
  "Apache-2.0 WITH LLVM-exception",
  "OFL-1.1",
  // Unlicense (public domain dedication): robust-predicates, in Mermaid's
  // tree. deny.toml already takes it on the Rust side through dual
  // Unlicense/MIT crates; the dedication asks nothing of the shipper.
  // Entered with Mermaid (2026-09-29), for the maintainer's eye in the PR.
  "Unlicense",
  // EPL-2.0 (Eclipse Public License 2.0): elkjs, Mermaid's layout engine.
  // Weak, file-level copyleft: its obligations reach elkjs itself, whose
  // source is public and unmodified here; the app around it is untouched.
  // Entered with Mermaid (2026-09-29), for the maintainer's eye in the PR.
  "EPL-2.0",
]);

// A package whose package.json omits the license field, taken by hand: the
// license was read in its repository instead. Each entry says where.
const EXCEPTIONS = new Map([
  // MIT: the `license` file at fabiospampinato/khroma (read 2026-09-29);
  // the package.json simply lacks the field. In Mermaid's tree.
  ["khroma", "MIT"],
]);

const file = process.argv[2] ?? new URL("../app/ui/package-lock.json", import.meta.url);
const lock = JSON.parse(readFileSync(file, "utf8"));
if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
  console.error(`lockfile version ${lock.lockfileVersion}: only 2 and 3 record each package's license`);
  process.exit(1);
}

function passes(expression) {
  const flat = expression.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (flat === "") return false;
  const alternatives = flat.split(" OR ");
  if (alternatives.length > 1 && flat.includes(" AND ")) return false;
  return alternatives.some((alt) => alt.split(" AND ").every((part) => ALLOW.has(part.trim())));
}

const refused = [];
let count = 0;
for (const [where, pkg] of Object.entries(lock.packages ?? {})) {
  if (where === "") continue; // the window itself
  count += 1;
  const name = where.replace(/^node_modules\//, "");
  const license = typeof pkg.license === "string" && pkg.license !== "" ? pkg.license : (EXCEPTIONS.get(name) ?? "");
  if (!passes(license)) refused.push(`${name}: ${license || "no license declared"}`);
}

if (refused.length > 0) {
  console.error(`npm licenses not on the allowlist (${refused.length} of ${count} packages):`);
  for (const line of refused) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`npm licenses: ${count} packages, all on the allowlist`);
