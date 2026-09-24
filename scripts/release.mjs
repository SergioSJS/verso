#!/usr/bin/env node
// Versions and releases (ADR 0051). A version is cut only when the maintainer
// asks for one — by the maintainer, or by an agent on the maintainer's
// request — in two steps around a pull request, since `main` takes nothing
// but pull requests:
//
//   node scripts/release.mjs prepare 0.2.0-beta.1
//     From origin/main, on a branch release/v0.2.0-beta.1: sets the version
//     (the workspace's Cargo.toml, which every crate and the app read, and
//     app/ui's package.json and lockfile), moves the changelog's
//     "Unreleased" entries under the version in both languages, commits
//     with a sign-off, pushes and opens the pull request.
//   node scripts/release.mjs tag 0.2.0-beta.1
//     Once that pull request is merged: tags main's head, which must carry
//     the version, and pushes the tag. The tag starts
//     .github/workflows/release.yml, which builds the apps and publishes the
//     release — a pre-release for `-beta.N`.
//   node scripts/release.mjs notes 0.2.0-beta.1
//     Prints the version's changelog, English then pt-BR: the release notes
//     (the workflow calls it).
//
// `--dry-run` shows what `prepare` or `tag` would do and changes nothing.
// A production version is X.Y.Z; a test release is X.Y.Z-beta.N.
// Dependency-free; Node 18 or later, with git, cargo and gh on PATH.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, version, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");

const CHANGELOGS = [
  { file: "CHANGELOG.md", unreleased: "## Unreleased", empty: "Nothing yet." },
  { file: "docs/pt-BR/CHANGELOG.md", unreleased: "## Não lançado", empty: "Nada ainda." },
];

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options }).trim();
}

/** `[major, minor, patch, beta]`, beta = Infinity for a production version. */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(v ?? "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])];
}

function newer(a, b) {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

function write(file, text) {
  if (dryRun) console.log(`would write ${file}`);
  else writeFileSync(join(root, file), text);
}

/** The workspace's version, from `[workspace.package]` in Cargo.toml. */
function workspaceVersion(text) {
  const m = /\[workspace\.package\][^[]*?\nversion = "([^"]+)"/.exec(text);
  if (!m) fail("no version in Cargo.toml's [workspace.package]");
  return m[1];
}

/** The changelog section of `heading`, up to the next `## ` heading. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const from = start + heading.length + 2;
  const next = text.indexOf("\n## ", from);
  return { start: start + 1, from, to: next < 0 ? text.length : next + 1 };
}

function notes(v) {
  const parts = CHANGELOGS.map(({ file }) => {
    const text = read(file);
    const heading = text.split("\n").find((line) => line.startsWith(`## ${v} `) || line === `## ${v}`);
    if (!heading) fail(`${file} has no section for ${v}`);
    const s = section(text, heading);
    return text.slice(s.from, s.to).trim();
  });
  return `${parts[0]}\n\n---\n\n**Português (Brasil)**\n\n${parts[1]}\n`;
}

function prepare(v) {
  if (run("git", ["status", "--porcelain"]) !== "") fail("the working tree is not clean");
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const current = workspaceVersion(run("git", ["show", "origin/main:Cargo.toml"]));
  if (current !== "0.0.0" && !newer(parse(v), parse(current))) fail(`${v} is not newer than ${current}`);
  const branch = `release/v${v}`;
  if (dryRun) console.log(`would branch ${branch} from origin/main (now ${current})`);
  else run("git", ["switch", "--quiet", "-c", branch, "origin/main"]);

  // The version: Cargo.toml's workspace (the crates and the app inherit it),
  // then app/ui's package.json and lockfile, then Cargo.lock.
  const cargo = read("Cargo.toml").replace(
    /(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/,
    `$1${v}$2`,
  );
  write("Cargo.toml", cargo);
  const pkg = JSON.parse(read("app/ui/package.json"));
  pkg.version = v;
  write("app/ui/package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  const lock = JSON.parse(read("app/ui/package-lock.json"));
  lock.version = v;
  if (lock.packages?.[""]) lock.packages[""].version = v;
  write("app/ui/package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  if (dryRun) console.log("would run cargo update --workspace --offline");
  else run("cargo", ["update", "--workspace", "--offline", "--quiet"]);

  // The changelogs: what "Unreleased" holds goes under the version, dated.
  const date = new Date().toISOString().slice(0, 10);
  for (const { file, unreleased, empty } of CHANGELOGS) {
    const text = read(file);
    const s = section(text, unreleased);
    if (!s) fail(`${file} has no "${unreleased}" section`);
    const body = text.slice(s.from, s.to).trim();
    if (body === "" || body === empty) fail(`${file}: nothing under "${unreleased}" to release`);
    const released = `${unreleased}\n\n${empty}\n\n## ${v} — ${date}\n\n${body}\n\n`;
    write(file, text.slice(0, s.start) + released + text.slice(s.to));
  }
  if (dryRun) return;

  run("git", ["add", "Cargo.toml", "Cargo.lock", "app/ui/package.json", "app/ui/package-lock.json", ...CHANGELOGS.map((c) => c.file)]);
  run("git", ["commit", "--quiet", "-s", "-m", `release: v${v}`, "-m", `Sets the version to ${v} and moves the changelog's unreleased entries under it (ADR 0051). After the merge: node scripts/release.mjs tag ${v}`]);
  run("git", ["push", "--quiet", "-u", "origin", branch], { stdio: ["ignore", "pipe", "pipe"] });
  const body = [
    "## What",
    "",
    `Version ${v}: the version set in the workspace and the UI package, and the changelog's unreleased entries moved under it, in both languages.`,
    "",
    "## Why",
    "",
    "- ADR / section: [ADR 0051](docs/adr/0051-development-flow-and-releases.md) — a version, cut because the maintainer asked for one.",
    "- Roadmap phase: the current one; a release carries what is merged.",
    "",
    "## Discarded alternatives",
    "",
    "None considered.",
    "",
    "## How to verify",
    "",
    "```",
    `grep -n '^version = "${v}"' Cargo.toml`,
    `node scripts/release.mjs notes ${v}`,
    `# after the merge: node scripts/release.mjs tag ${v}`,
    "```",
    "",
    "## Rust concept used",
    "",
    "Not applicable: version fields and changelog text only.",
    "",
    "## Changelog",
    "",
    notes(v),
  ].join("\n");
  const url = run("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", `release: v${v}`, "--body", body]);
  console.log(url);
}

function tag(v) {
  run("git", ["fetch", "--quiet", "--tags", "origin", "main"]);
  const onMain = workspaceVersion(run("git", ["show", "origin/main:Cargo.toml"]));
  if (onMain !== v) fail(`main carries ${onMain}, not ${v}: merge the release pull request first`);
  if (run("git", ["tag", "--list", `v${v}`]) !== "") fail(`v${v} already exists; version tags are permanent`);
  const head = run("git", ["rev-parse", "--short", "origin/main"]);
  if (dryRun) {
    console.log(`would tag v${v} at origin/main (${head}) and push it`);
    return;
  }
  run("git", ["tag", "-a", `v${v}`, "-m", `Verso ${v}`, "origin/main"]);
  run("git", ["push", "--quiet", "origin", `v${v}`], { stdio: ["ignore", "pipe", "pipe"] });
  console.log(`v${v} at ${head}: the release workflow builds and publishes it`);
}

if (!parse(version)) fail("usage: release.mjs prepare|tag|notes X.Y.Z[-beta.N] [--dry-run]");
if (command === "prepare") prepare(version);
else if (command === "tag") tag(version);
else if (command === "notes") process.stdout.write(notes(version));
else fail("usage: release.mjs prepare|tag|notes X.Y.Z[-beta.N] [--dry-run]");
