#!/usr/bin/env node
// Versions and releases (ADR 0051). A version is cut only when the maintainer
// asks for one — by the maintainer, or by an agent on the maintainer's
// request — in two steps around a pull request, since `main` takes nothing
// but pull requests:
//
//   node scripts/release.mjs prepare 0.2.0-beta.1
//     From origin/main, on a branch release/v0.2.0-beta.1: sets the version
//     (the workspace's Cargo.toml, which every crate and the app read,
//     app/ui's package.json and lockfile, and both Cargo.lock files), moves
//     the changelog's "Unreleased" entries under the version in both
//     languages, commits with a sign-off, pushes and opens the pull request.
//     Everything is read from origin/main and checked before anything is
//     written, so a refusal leaves the checkout as it was.
//   node scripts/release.mjs tag 0.2.0-beta.1
//     Once that pull request is merged: tags the commit on main that brought
//     the version — the release pull request's merge, not whatever merged
//     after it — and pushes the tag, which starts
//     .github/workflows/release.yml. Checked first, as the workflow checks
//     it again: the version, its changelog in both languages.
//   node scripts/release.mjs notes 0.2.0-beta.1
//     Prints the version's changelog, English then pt-BR: the release notes.
//     A production version also carries the test releases that led to it.
//   node scripts/release.mjs verify v0.2.0-beta.1
//     The release workflow's first step: the tag names the version the
//     sources carry, in the shape of a version, with its changelog.
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
const USAGE = "usage: release.mjs prepare|tag|notes X.Y.Z[-beta.N] [--dry-run] | verify vX.Y.Z[-beta.N]";

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

/** `[major, minor, patch, beta]`, beta = Infinity for a production version;
 *  `null` for anything else — leading zeros included, which Cargo refuses. */
function parse(v) {
  const n = "(0|[1-9]\\d*)";
  const m = new RegExp(`^${n}\\.${n}\\.${n}(?:-beta\\.${n})?$`).exec(v ?? "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])];
}

function newer(a, b) {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** A file as it stands on origin/main — what a release starts from. */
function onMain(file) {
  return run("git", ["show", `origin/main:${file}`], { stdio: ["ignore", "pipe", "pipe"] });
}

function readHere(file) {
  return readFileSync(join(root, file), "utf8");
}

/** The workspace's version, from `[workspace.package]` in Cargo.toml. */
function workspaceVersion(text) {
  const m = /\[workspace\.package\][^[]*?\nversion = "([^"]+)"/.exec(text);
  if (!m) fail("no version in Cargo.toml's [workspace.package]");
  return m[1];
}

/** The section under `heading`, up to the next `## ` heading. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const from = start + heading.length + 2;
  const next = text.indexOf("\n## ", from);
  return { start: start + 1, from, to: next < 0 ? text.length : next + 1 };
}

/** The body of the version's section, and of its test releases when `v` is
 *  a production version; `null` when the version has no section. */
function sectionsOf(text, v) {
  const lines = text.split("\n");
  const own = lines.find((line) => line.startsWith(`## ${v} `) || line === `## ${v}`);
  if (!own) return null;
  const body = (heading) => {
    const s = section(text, heading);
    return text.slice(s.from, s.to).trim();
  };
  const parts = [body(own)];
  if (parse(v)[3] === Infinity) {
    for (const line of lines.filter((l) => l.startsWith(`## ${v}-beta.`))) {
      parts.push(`### ${line.slice(3)}\n\n${body(line).replace(/^### /gm, "#### ")}`);
    }
  }
  return parts.join("\n\n");
}

function notesFrom(texts, v) {
  const parts = CHANGELOGS.map(({ file }, i) => {
    const body = sectionsOf(texts[i], v);
    if (!body) fail(`${file} has no section for ${v}`);
    return body;
  });
  return `${parts[0]}\n\n---\n\n**Português (Brasil)**\n\n${parts[1]}\n`;
}

function prepare(v) {
  if (run("git", ["status", "--porcelain"]) !== "") fail("the working tree is not clean");
  run("git", ["fetch", "--quiet", "origin", "main"]);

  // Every input from origin/main, every check before any write.
  const cargo = onMain("Cargo.toml");
  const current = workspaceVersion(cargo);
  if (current !== "0.0.0" && !newer(parse(v), parse(current))) fail(`${v} is not newer than ${current}`);
  const date = new Date().toISOString().slice(0, 10);
  const changed = CHANGELOGS.map(({ file, unreleased, empty }) => {
    let text;
    try {
      text = onMain(file);
    } catch {
      fail(`origin/main has no ${file}`);
    }
    const s = section(text, unreleased);
    if (!s) fail(`${file} has no "${unreleased}" section`);
    // The placeholder a release leaves behind is not an entry.
    const body = text
      .slice(s.from, s.to)
      .split("\n")
      .filter((line) => line.trim() !== empty)
      .join("\n")
      .trim();
    if (body === "") fail(`${file}: nothing under "${unreleased}" to release`);
    const released = `${unreleased}\n\n${empty}\n\n## ${v} — ${date}\n\n${body}\n\n`;
    return `${(text.slice(0, s.start) + released + text.slice(s.to)).trimEnd()}\n`;
  });
  const notes = notesFrom(changed, v);
  const newCargo = cargo.replace(/(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/, `$1${v}$2`);
  const pkg = JSON.parse(onMain("app/ui/package.json"));
  pkg.version = v;
  const lock = JSON.parse(onMain("app/ui/package-lock.json"));
  lock.version = v;
  if (lock.packages?.[""]) lock.packages[""].version = v;

  const branch = `release/v${v}`;
  const writes = [
    ["Cargo.toml", `${newCargo.trimEnd()}\n`],
    ["app/ui/package.json", `${JSON.stringify(pkg, null, 2)}\n`],
    ["app/ui/package-lock.json", `${JSON.stringify(lock, null, 2)}\n`],
    ...CHANGELOGS.map(({ file }, i) => [file, changed[i]]),
  ];
  if (dryRun) {
    console.log(`would branch ${branch} from origin/main (now ${current})`);
    for (const [file] of writes) console.log(`would write ${file}`);
    console.log("would update Cargo.lock and crates/verso-dialect/fuzz/Cargo.lock");
    console.log(`\nthe release notes would be:\n\n${notes}`);
    return;
  }

  run("git", ["switch", "--quiet", "-c", branch, "origin/main"]);
  for (const [file, text] of writes) writeFileSync(join(root, file), text);
  run("cargo", ["update", "--workspace", "--offline", "--quiet"]);
  const fuzz = ["crates/verso-dialect/fuzz/Cargo.toml", "crates/verso-dialect/fuzz/Cargo.lock"];
  try {
    run("cargo", ["update", "-p", "verso-dialect", "--offline", "--quiet", "--manifest-path", fuzz[0]], { stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    console.error("release: the fuzz lockfile was left as it was (its dependencies are not in the local cache)");
  }

  run("git", ["add", "Cargo.toml", "Cargo.lock", fuzz[1], "app/ui/package.json", "app/ui/package-lock.json", ...CHANGELOGS.map((c) => c.file)]);
  run("git", ["commit", "--quiet", "-s", "-m", `release: v${v}`,
    "-m", `Sets the version to ${v} and moves the changelog's unreleased\nentries under it (ADR 0051).`,
    "-m", `After the merge: node scripts/release.mjs tag ${v}`]);
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
    notes,
  ].join("\n");
  console.log(run("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", `release: v${v}`, "--body", body]));
}

/** The commit on origin/main's first-parent line that brought `version =
 *  "v"` into Cargo.toml: the release pull request's merge. */
function releaseCommit(v) {
  const sha = run("git", ["log", "--first-parent", "--diff-merges=first-parent", `-Sversion = "${v}"`, "-1", "--format=%H", "--no-patch", "origin/main", "--", "Cargo.toml"]);
  if (!sha) fail(`no commit on main brought the version ${v}`);
  return sha;
}

function tag(v) {
  run("git", ["fetch", "--quiet", "--tags", "origin", "main"]);
  const current = workspaceVersion(onMain("Cargo.toml"));
  if (current !== v) fail(`main carries ${current}, not ${v}: merge the release pull request first`);
  if (run("git", ["tag", "--list", `v${v}`]) !== "") fail(`v${v} already exists; version tags are not moved`);
  const sha = releaseCommit(v);
  // What the workflow will check, checked before the tag exists.
  notesFrom(CHANGELOGS.map(({ file }) => run("git", ["show", `${sha}:${file}`])), v);
  const short = sha.slice(0, 7);
  if (dryRun) {
    console.log(`would tag v${v} at ${short}, the commit on main that brought the version, and push it`);
    return;
  }
  run("git", ["tag", "-a", `v${v}`, "-m", `Verso ${v}`, sha]);
  run("git", ["push", "--quiet", "origin", `v${v}`], { stdio: ["ignore", "pipe", "pipe"] });
  console.log(`v${v} at ${short}: the release workflow builds and publishes it`);
}

/** For the workflow: the tag, the sources and the changelog agree. */
function verify(tagName) {
  if (!tagName?.startsWith("v") || !parse(tagName.slice(1))) fail(`${tagName} is not a version tag (vX.Y.Z or vX.Y.Z-beta.N)`);
  const v = tagName.slice(1);
  if (v === "0.0.0") fail("0.0.0 is not a version to release");
  const carried = workspaceVersion(readHere("Cargo.toml"));
  if (carried !== v) fail(`${tagName} does not match the workspace version, ${carried}`);
  notesFrom(CHANGELOGS.map(({ file }) => readHere(file)), v);
}

if (command === "verify") verify(version);
else if (!parse(version)) fail(USAGE);
else if (command === "prepare") prepare(version);
else if (command === "tag") tag(version);
else if (command === "notes") process.stdout.write(notesFrom(CHANGELOGS.map(({ file }) => readHere(file)), version));
else fail(USAGE);
