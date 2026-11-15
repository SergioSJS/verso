#!/usr/bin/env node
// Versions and releases (ADR 0051, revised 2026-10-02). A version is cut
// only when the maintainer asks for one — by the maintainer, or by an agent
// on the maintainer's request — and reaches users with one merge:
//
//   node scripts/release.mjs prepare 0.3.0-beta.4
//     On the branch of the pull request that releases (never main): sets
//     the version (the workspace's Cargo.toml, which every crate and the
//     app read, app/ui's package.json and lockfile, both Cargo.lock files
//     and the server compose file's CasaOS card), moves the changelog's "Unreleased" entries under the version
//     in both languages, and commits with a sign-off. Nothing is pushed:
//     the commit travels in that pull request. Everything is checked before
//     anything is written, so a refusal leaves the checkout as it was.
//   Merging the pull request into main is the release:
//     .github/workflows/release.yml sees main carry a version with no tag
//     yet, builds the app, and publishes the release, which creates the tag
//     on that merge.
//   node scripts/release.mjs tag 0.3.0-beta.4
//     By hand, only when the workflow could not tag: tags the commit on main
//     that brought the version and pushes the tag, which starts the same
//     workflow.
//   node scripts/release.mjs notes 0.3.0-beta.4
//     Prints the release page (scripts/release-page.mjs): which file to
//     download and how to install it, then what is new and the version's
//     changelog, English then pt-BR. A production version also carries the
//     test releases that led to it.
//   node scripts/release.mjs preview 0.8.1-beta.1
//     The page the next version would get, from the changelog's
//     "Unreleased" entries: to read it before cutting the version.
//   node scripts/release.mjs verify v0.3.0-beta.4
//     The release workflow's first step: the tag names the version the
//     sources carry, in the shape of a version, with its changelog.
//   node scripts/release.mjs files 0.8.3-beta.1
//   node scripts/release.mjs assets 0.8.3-beta.1
//   node scripts/release.mjs per-file-signatures
//   node scripts/release.mjs ios-config
//     For the release workflow (ADR 0055, revised 2026-10-14): the files a
//     release's checksums list covers; every file it publishes, the list
//     and the signatures included; and whether each file still gets its
//     own `.sig` (`true` in the 0.8.3 bridge, then `false`: the switch is
//     PER_FILE_SIGNATURES in scripts/release-page.mjs).
//
// `--dry-run` shows what `prepare` or `tag` would do and changes nothing.
// A production version is X.Y.Z; a test release is X.Y.Z-beta.N.
// Dependency-free; Node 18 or later, with git and cargo on PATH.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PER_FILE_SIGNATURES, releaseAssets, releaseFiles, releasePage } from "./release-page.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, version, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
/** The fuzz crates, each outside the workspace with a lockfile of its own
 *  that names the workspace crate it fuzzes: its version moves with the
 *  workspace's (the dialect's parser and canvas reader; the server's inputs,
 *  ADR 0083 item 14). */
const FUZZ = [
  ["crates/verso-dialect/fuzz/Cargo.toml", "crates/verso-dialect/fuzz/Cargo.lock", "verso-dialect"],
  ["crates/verso-server/fuzz/Cargo.toml", "crates/verso-server/fuzz/Cargo.lock", "verso-server"],
];

const USAGE = "usage: release.mjs prepare|tag|notes|preview|files|assets X.Y.Z[-beta.N] [--dry-run] | verify vX.Y.Z[-beta.N] | per-file-signatures | ios-config";

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

const IOS_YML = "app/src-tauri/gen/apple/project.yml";
const IOS_PLIST = "app/src-tauri/gen/apple/verso-app_iOS/Info.plist";

/** The iOS bundle's two numbers for version `v` (ADR 0119 A16): the
 *  version's numbers alone, and a build number from them that a later
 *  version always exceeds — a test release `-beta.N` is N, the release
 *  itself 99, so `0.8.5-beta.1` is 80501 and `0.8.5` is 80599. */
function iosVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(v);
  if (!m) fail(`${v}: not a version iOS can be given`);
  const [maj, min, pat, beta] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 99 : Number(m[4])];
  if (min > 99 || pat > 99 || beta > 98 && m[4] !== undefined) fail(`${v}: too large for the iOS build number`);
  return { short: `${maj}.${min}.${pat}`, build: String(((maj * 100 + min) * 100 + pat) * 100 + beta) };
}

/** The `--config` JSON the iOS build is given (ADR 0119 A16): `tauri ios
 *  build` regenerates the bundle's Info.plist from Tauri's own config, which
 *  names no version (it said 1.0.0), so the release job passes the numbers
 *  from the workspace version, the one source. */
function iosConfig(v) {
  const ios = iosVersion(v);
  return JSON.stringify({ version: ios.short, bundle: { iOS: { bundleVersion: ios.build } } });
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
  const [en, pt] = CHANGELOGS.map(({ file }, i) => {
    const body = sectionsOf(texts[i], v);
    if (!body) fail(`${file} has no section for ${v}`);
    return body;
  });
  return releasePage({ version: v, en, pt });
}

/** The page version `v` would get from the "Unreleased" entries. */
function previewFrom(texts, v) {
  const [en, pt] = CHANGELOGS.map(({ file, unreleased, empty }, i) => {
    const s = section(texts[i], unreleased);
    const body = s && texts[i].slice(s.from, s.to).trim();
    if (!body || body === empty) fail(`${file}: nothing under "${unreleased}" to preview`);
    return body;
  });
  return releasePage({ version: v, en, pt });
}

function prepare(v) {
  if (run("git", ["status", "--porcelain"]) !== "") fail("the working tree is not clean");
  const branch = run("git", ["branch", "--show-current"]);
  if (branch === "" || branch === "main") fail("run prepare on the branch of the pull request that releases, not on main");
  run("git", ["fetch", "--quiet", "origin", "main"]);

  // Every input from this branch, every check before any write. The
  // version must be newer than main's — what was released — and than
  // this branch's, so that running prepare twice is refused.
  const cargo = readHere("Cargo.toml");
  const current = workspaceVersion(cargo);
  for (const [where, base] of [["main", workspaceVersion(onMain("Cargo.toml"))], [branch, current]]) {
    if (base !== "0.0.0" && !newer(parse(v), parse(base))) fail(`${v} is not newer than ${base}, the version on ${where}`);
  }
  const date = new Date().toISOString().slice(0, 10);
  const changed = CHANGELOGS.map(({ file, unreleased, empty }) => {
    const text = readHere(file);
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
  const pkg = JSON.parse(readHere("app/ui/package.json"));
  pkg.version = v;
  const lock = JSON.parse(readHere("app/ui/package-lock.json"));
  lock.version = v;
  if (lock.packages?.[""]) lock.packages[""].version = v;

  // The server's compose file names the version in its CasaOS block (the
  // app store's card): it follows.
  const compose = readHere("packaging/server/docker-compose.yml");
  const newCompose = compose.replace(/(\n  version: ")[^"]+(")/, `$1${v}$2`);
  if (newCompose === compose && !compose.includes(`version: "${v}"`)) fail("packaging/server/docker-compose.yml: no x-casaos version to set");

  // The iOS bundle's version (ADR 0119 A16, decided 2026-11-12): iOS takes
  // only numbers, so `0.8.5-beta.1` is `0.8.5` with a build number that
  // grows with every version, a test release's below the release's.
  const ios = iosVersion(v);
  const yml = readHere(IOS_YML);
  const newYml = yml
    .replace(/(\n\s+CFBundleShortVersionString: )\S+/, `$1${ios.short}`)
    .replace(/(\n\s+CFBundleVersion: )"?[^"\n]*"?/, `$1"${ios.build}"`);
  const plist = readHere(IOS_PLIST);
  const newPlist = plist
    .replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${ios.short}$2`)
    .replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${ios.build}$2`);
  if (!newYml.includes(`CFBundleVersion: "${ios.build}"`) || !newPlist.includes(`<string>${ios.build}</string>`)) fail("the iOS bundle's version could not be set");

  const writes = [
    ["Cargo.toml", `${newCargo.trimEnd()}\n`],
    [IOS_YML, newYml],
    [IOS_PLIST, newPlist],
    ["packaging/server/docker-compose.yml", newCompose],
    ["app/ui/package.json", `${JSON.stringify(pkg, null, 2)}\n`],
    ["app/ui/package-lock.json", `${JSON.stringify(lock, null, 2)}\n`],
    ...CHANGELOGS.map(({ file }, i) => [file, changed[i]]),
  ];
  if (dryRun) {
    console.log(`would set ${v} on ${branch} (now ${current}) and commit`);
    for (const [file] of writes) console.log(`would write ${file}`);
    console.log(`would update Cargo.lock and ${FUZZ.map(([, lock]) => lock).join(" and ")}`);
    console.log(`\nthe release notes would be:\n\n${notes}`);
    return;
  }

  for (const [file, text] of writes) writeFileSync(join(root, file), text);
  run("cargo", ["update", "--workspace", "--offline", "--quiet"]);
  for (const [manifest, lock, crate] of FUZZ) {
    try {
      run("cargo", ["update", "-p", crate, "--offline", "--quiet", "--manifest-path", manifest], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      console.error(`release: ${lock} was left as it was (its dependencies are not in the local cache)`);
    }
  }

  run("git", ["add", "Cargo.toml", "Cargo.lock", IOS_YML, IOS_PLIST, ...FUZZ.map(([, lock]) => lock), "app/ui/package.json", "app/ui/package-lock.json", "packaging/server/docker-compose.yml", ...CHANGELOGS.map((c) => c.file)]);
  run("git", ["commit", "--quiet", "-s", "-m", `release: v${v}`,
    "-m", `Sets the version to ${v} and moves the changelog's unreleased\nentries under it (ADR 0051).`,
    "-m", "Merging this commit into main releases it: the release workflow\nbuilds the app, publishes the release and creates the tag."]);
  console.log(`v${v} committed on ${branch}: push it; merging its pull request into main publishes the release`);
}

/** The commit on origin/main's first-parent line that brought `version =
 *  "v"` into Cargo.toml: the merge of the pull request that carried it. */
function releaseCommit(v) {
  const sha = run("git", ["log", "--first-parent", "--diff-merges=first-parent", `-Sversion = "${v}"`, "-1", "--format=%H", "--no-patch", "origin/main", "--", "Cargo.toml"]);
  if (!sha) fail(`no commit on main brought the version ${v}`);
  return sha;
}

function tag(v) {
  run("git", ["fetch", "--quiet", "--tags", "origin", "main"]);
  const current = workspaceVersion(onMain("Cargo.toml"));
  if (current !== v) fail(`main carries ${current}, not ${v}: merge the pull request that carries the version first`);
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
else if (command === "ios-config") console.log(iosConfig(workspaceVersion(readHere("Cargo.toml"))));
else if (command === "per-file-signatures") console.log(String(PER_FILE_SIGNATURES));
else if (!parse(version)) fail(USAGE);
else if (command === "files") console.log(Object.values(releaseFiles(version)).join("\n"));
else if (command === "assets") console.log(releaseAssets(version).join("\n"));
else if (command === "prepare") prepare(version);
else if (command === "tag") tag(version);
else if (command === "notes") process.stdout.write(notesFrom(CHANGELOGS.map(({ file }) => readHere(file)), version));
else if (command === "preview") process.stdout.write(previewFrom(CHANGELOGS.map(({ file }) => readHere(file)), version));
else fail(USAGE);
