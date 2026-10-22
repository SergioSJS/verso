#!/usr/bin/env node
// npm advisory gate (ADR 0083 item 13, finding F7 of
// docs/reference/security-review-2026-10-13.md): `cargo deny` holds the
// Rust tree to the advisories, this holds the window's npm tree to them.
// It runs `npm audit --json` over app/ui's lockfile and fails on any
// advisory of severity high or critical that is not excepted in
// app/ui/audit-exceptions.json.
//
// The exception policy is deny.toml's (ADR 0029): an exception names the
// advisory's id (GHSA-xxxx-xxxx-xxxx, as npm reports it), a reason with a
// link, and an expiry date (YYYY-MM-DD); an expired exception fails, so
// that CI is red again until someone looks. An exception enters only with
// a justification in the PR that adds it (ADR 0033). Low and moderate
// advisories are listed, not failed.
//
// A new advisory turns this red with no PR to blame, as `cargo deny` does
// (ADR 0083, Consequences). It reads the lockfile only
// (`--package-lock-only`): no node_modules needed, but the registry is
// asked, so it needs the network.
//
// Usage: node scripts/check-npm-audit.mjs [directory]   (default app/ui)
// Dependency-free, Node 18 or later.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FAILING = new Set(["high", "critical"]);
const dir = process.argv[2] ?? fileURLToPath(new URL("../app/ui", import.meta.url));
const exceptionsFile = join(dir, "audit-exceptions.json");
const today = new Date().toISOString().slice(0, 10);
const problems = [];

// The exceptions, each checked for its three fields.
const excepted = new Map();
if (existsSync(exceptionsFile)) {
  let list;
  try {
    list = JSON.parse(readFileSync(exceptionsFile, "utf8")).exceptions ?? [];
  } catch (e) {
    console.error(`${exceptionsFile}: not JSON (${e.message})`);
    process.exit(1);
  }
  for (const x of list) {
    const id = typeof x.id === "string" ? x.id : "";
    if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(id)) {
      problems.push(`exception ${JSON.stringify(x.id)}: the id is not an advisory id (GHSA-xxxx-xxxx-xxxx)`);
      continue;
    }
    if (typeof x.reason !== "string" || !/https:\/\/\S+/.test(x.reason)) {
      problems.push(`exception ${id}: the reason must say why, with a link`);
    }
    if (typeof x.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.expires) || Number.isNaN(Date.parse(x.expires))) {
      problems.push(`exception ${id}: no expiry date (YYYY-MM-DD)`);
    } else if (x.expires < today) {
      problems.push(`exception ${id}: expired on ${x.expires} — look at the advisory again, then remove or renew it`);
    }
    excepted.set(id, x);
  }
}

// The registry's audit endpoint fails now and then with an empty error
// (seen twice in a night on 2026-10-22): asked up to three times, 20 s
// apart, before the run is red. A registry that stays down still fails it.
const ATTEMPTS = 3;
let report;
let failure = "";
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const run = spawnSync("npm", ["audit", "--json", "--package-lock-only"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  report = undefined;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    failure = `npm audit gave no report (exit ${run.status}):\n${run.stderr || run.stdout}`;
  }
  if (report?.error) failure = `npm audit failed: ${report.error.summary || JSON.stringify(report.error)}`;
  if (report && !report.error) break;
  if (attempt < ATTEMPTS) {
    console.error(`${failure.split("\n")[0]} — asking again in 20 s (${attempt}/${ATTEMPTS})`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000);
  }
}
if (!report || report.error) {
  console.error(failure);
  process.exit(1);
}

// Each advisory once, with the packages it is found in. A package whose
// `via` names only other packages carries no advisory of its own.
const advisories = new Map();
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== "object" || via === null) continue;
    const id = String(via.url ?? "").match(/GHSA(-[0-9a-z]{4}){3}/)?.[0] ?? `npm-${via.source}`;
    const a = advisories.get(id) ?? { id, severity: via.severity, title: via.title, url: via.url, packages: new Set(), fix: v.fixAvailable };
    a.packages.add(`${name} ${via.range ?? ""}`.trim());
    advisories.set(id, a);
  }
}

const used = new Set();
const failing = [];
const listed = [];
for (const a of [...advisories.values()].sort((x, y) => x.id.localeCompare(y.id))) {
  const fix = a.fix === true ? "fix: npm audit fix" : a.fix ? `fix: ${a.fix.name}@${a.fix.version}${a.fix.isSemVerMajor ? " (major)" : ""}` : "no fix";
  const line = `${a.id} [${a.severity}] ${a.title} — ${[...a.packages].join(", ")} — ${fix} — ${a.url}`;
  if (!FAILING.has(a.severity)) listed.push(line);
  else if (excepted.has(a.id)) {
    used.add(a.id);
    listed.push(`${line} (excepted until ${excepted.get(a.id).expires})`);
  } else failing.push(line);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(`npm audit of ${dir}: ${Object.keys(report.vulnerabilities ?? {}).length} packages affected (critical ${counts.critical ?? 0}, high ${counts.high ?? 0}, moderate ${counts.moderate ?? 0}, low ${counts.low ?? 0})`);
for (const line of listed) console.log(`  ${line}`);
for (const id of excepted.keys()) {
  if (!used.has(id)) console.log(`  note: the exception ${id} matches no advisory today; it can go`);
}
if (failing.length > 0) {
  console.error(`advisories of severity high or critical with no exception (${failing.length}):`);
  for (const line of failing) console.error(`  ${line}`);
}
for (const p of problems) console.error(`  ${p}`);
if (failing.length > 0 || problems.length > 0) process.exit(1);
console.log("npm advisories: none high or critical without a current exception");
