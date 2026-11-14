// Tests of the release page (scripts/release-page.mjs): `node --test scripts/*.test.mjs`.
// The files the page names are the files the release workflow builds and
// uploads — read from .github/workflows/release.yml itself, so a renamed
// file or a new platform fails here before a release ships a page that
// links to nothing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PAGE_LIMIT, PER_FILE_SIGNATURES, absoluteLinks, checksumsList, highlights, releaseAssets, releaseFiles, releasePage } from "./release-page.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");

/** The workflow's job `name`, up to the next job. */
function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `release.yml has no job ${name}`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

/** The files the workflow names for version `v`: each `<prefix>-$VERSION-…`
 *  it writes, its variables filled in from the jobs' matrix and loops. */
function workflowFiles(v) {
  const slug = (v.includes("-beta.") ? "Verso Beta" : "Verso").replace(/ /g, "-");
  const linux = job("linux");
  const archs = [...linux.matchAll(/- arch: (\S+)[\s\S]*?\n\s+deb: (\S+)/g)].map((m) => ({ ARCH: m[1], DEB: m[2] }));
  assert.ok(archs.length > 0, "no Linux matrix entry found");
  const loop = /for entry in ([^;]+); do/.exec(job("server"));
  assert.ok(loop, "no architecture loop in the server job");
  const servers = loop[1].trim().split(/\s+/).map((e) => {
    const [arch, goarch] = e.split(":");
    return { arch, goarch };
  });
  const dir = /dir="(universo-\$VERSION-[^"]+)"/.exec(workflow);
  assert.ok(dir && workflow.includes('tar -czf "$dir.tar.gz"'), "the server archive's name changed shape");
  const templates = [...workflow.matchAll(/(?:\$slug|verso-cli|universo)-\$VERSION-[^"\s]*/g)]
    .map((m) => m[0])
    .filter((t) => /\.[A-Za-z]+$/.test(t))
    .concat(`${dir[1]}.tar.gz`);
  const out = new Set();
  for (const t of templates) {
    const base = t.replaceAll("$slug", slug).replaceAll("$VERSION", v);
    if (/\$(ARCH|DEB)\b/.test(base)) {
      for (const a of archs) out.add(base.replaceAll("$ARCH", a.ARCH).replaceAll("$DEB", a.DEB));
    } else if (/\$(arch|goarch)\b/.test(base)) {
      for (const s of servers) out.add(base.replaceAll("$goarch", s.goarch).replaceAll("$arch", s.arch));
    } else {
      out.add(base);
    }
  }
  return [...out].sort();
}

/** The upload globs of the jobs whose artifacts `publish` takes (`release-*`). */
function uploadGlobs() {
  const globs = [];
  for (const m of workflow.matchAll(/name: release-[^\n]+\n(?:\s+if-no-files-found: [^\n]+\n)?\s+path: \|\n((?:\s+\.\/[^\n]+\n)+)/g)) {
    for (const line of m[1].trim().split("\n")) globs.push(line.trim());
  }
  return globs;
}

const globRe = (g) => new RegExp(`^${g.replace(/^\.\//, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);

for (const v of ["0.8.1-beta.1", "1.0.0"]) {
  test(`the files of ${v} are the ones the workflow builds`, () => {
    assert.deepEqual(Object.values(releaseFiles(v)).sort(), workflowFiles(v));
  });
}

// ADR 0055, revised 2026-10-14: one signed checksums list in place of a
// `.sig` per file, with 0.8.3 the bridge that publishes both.
test("a release publishes its sixteen files and the signed list; the bridge, each file's .sig too", () => {
  const v = "0.8.3-beta.1";
  const after = releaseAssets(v, false);
  assert.equal(after.length, 18);
  assert.ok(after.includes("verso-0.8.3-beta.1-SHA256SUMS") && after.includes("verso-0.8.3-beta.1-SHA256SUMS.sig"));
  assert.equal(after.filter((a) => a.endsWith(".sig")).length, 1, "after the bridge, the list's .sig alone");
  const bridge = releaseAssets(v, true);
  assert.equal(bridge.length, 34);
  for (const f of Object.values(releaseFiles(v))) assert.ok(bridge.includes(`${f}.sig`), `${f}.sig in the bridge`);
  assert.deepEqual(releaseAssets(v), releaseAssets(v, PER_FILE_SIGNATURES));
});

test("the publish job publishes exactly the files release.mjs names", () => {
  const publish = job("publish");
  assert.match(publish, /node scripts\/release\.mjs assets "\$version"/);
  assert.match(publish, /needs: \[[^\]]*\bchecksums\b[^\]]*\]/, "publish waits for the checksums list");
  assert.doesNotMatch(publish, /-ne \d+/, "no count of its own beside the names");
});

test("the checksums job lists the files release.mjs names, under the list's name, and checks the signed comment", () => {
  const sums = job("checksums");
  assert.match(sums, /node scripts\/release\.mjs files "\$VERSION"/);
  // Its count of the files is release.mjs's: the Android APK came without
  // it (14 against 15, found 2026-11-14).
  const count = /-ne (\d+) \]/.exec(sums);
  assert.ok(count, "the checksums job counts no files");
  assert.equal(Number(count[1]), Object.keys(releaseFiles("0.8.5-beta.1")).length, "the checksums job's count is not release.mjs's");
  const name = /list="(verso-\$VERSION-SHA256SUMS)"/.exec(sums);
  assert.ok(name, "the list's name is not set in the checksums job");
  for (const v of ["0.8.3-beta.1", "1.0.0"]) assert.equal(name[1].replace("$VERSION", v), checksumsList(v));
  assert.match(sums, /tauri signer sign "verso-\$VERSION-SHA256SUMS"/);
  assert.match(sums, /grep -qxF "file:\$list"/);
  assert.match(sums, /sha256sum --check --strict/);
});

test("each file is signed on its own only while release.mjs says so", () => {
  for (const name of ["macos", "windows", "linux", "server"]) {
    const j = job(name);
    assert.match(j, /echo "sigs=\$\(node scripts\/release\.mjs per-file-signatures\)" >> "\$GITHUB_OUTPUT"/, `${name} does not ask`);
    const steps = [...j.matchAll(/- name: (sign the release's files|verify the signatures with the app's key)\n\s+if: steps\.version\.outputs\.sigs == 'true'\n/g)];
    assert.equal(steps.length, 2, `${name}: its signing and verifying steps do not follow the switch`);
  }
});

test("every file is uploaded by one of the workflow's globs, and every glob uploads one", () => {
  const globs = uploadGlobs();
  assert.ok(globs.length >= 8, `too few upload globs found: ${globs}`);
  // The bridge's files are the most there are; after it, a subset.
  for (const perFile of [true, false]) {
    for (const a of releaseAssets("0.8.1-beta.1", perFile)) assert.ok(globs.some((g) => globRe(g).test(a)), `${a} matches no upload glob`);
  }
  const bridge = releaseAssets("0.8.1-beta.1", true);
  for (const g of globs) assert.ok(bridge.some((a) => globRe(g).test(a)), `${g} uploads none of the files`);
});

const changelog = (n, prefix) =>
  ["### Added", "", ...Array.from({ length: n }, (_, i) => `- **${prefix} added ${i}** ([ADR 0001](docs/adr/0001-x.md)): more.`), "", "### Fixed", "", "- **A fix**: done.", "- A fix with no bold lead. And more."].join("\n");

for (const v of ["0.8.1-beta.1", "1.0.0"]) {
  test(`the page of ${v} links each file once per language, at the tag`, () => {
    const page = releasePage({ version: v, en: changelog(3, "en"), pt: changelog(3, "pt") });
    const links = [...page.matchAll(/\]\((https:\/\/github\.com\/SergioSJS\/verso\/releases\/download\/[^)]+)\)/g)].map((m) => m[1]);
    for (const link of links) assert.ok(link.startsWith(`https://github.com/SergioSJS/verso/releases/download/v${v}/`), link);
    const named = links.map((l) => l.split("/").pop());
    const files = Object.values(releaseFiles(v));
    assert.deepEqual([...new Set(named)].sort(), [...files].sort());
    for (const f of files) assert.equal(named.filter((n) => n === f).length, 2, `${f} once in each language`);
    assert.ok(!page.includes(".sig]") && !page.includes("SHA256SUMS]"), "no signature or list is offered for download");
    for (const m of page.matchAll(/https:\/\/github\.com\/SergioSJS\/verso\/blob\/([^/]+)\/(\S+?)\)/g)) {
      if (m[2].endsWith("reference/server-hands-on.md")) assert.equal(m[1], "main");
      else assert.equal(m[1], `v${v}`, m[0]);
    }
  });
}

test("the page says the checksums list and the .sig files can be ignored, as the release publishes them", () => {
  const bridge = releasePage({ version: "0.8.3-beta.1", en: changelog(1, "en"), pt: changelog(1, "pt"), perFileSignatures: true });
  assert.match(bridge, /You can ignore `verso-0\.8\.3-beta\.1-SHA256SUMS` and the `\.sig` files\./);
  assert.match(bridge, /Pode ignorar o `verso-0\.8\.3-beta\.1-SHA256SUMS` e os arquivos `\.sig`\./);
  const after = releasePage({ version: "0.8.4-beta.1", en: changelog(1, "en"), pt: changelog(1, "pt"), perFileSignatures: false });
  assert.match(after, /You can ignore `verso-0\.8\.4-beta\.1-SHA256SUMS` and the `\.sig` file\./);
  assert.match(after, /Pode ignorar o `verso-0\.8\.4-beta\.1-SHA256SUMS` e o arquivo `\.sig`\./);
});

test("a test release says it is one; a production version does not", () => {
  const beta = releasePage({ version: "0.8.1-beta.1", en: changelog(1, "en"), pt: changelog(1, "pt") });
  assert.match(beta, /test version \(beta\)/);
  assert.match(beta, /versão de teste \(beta\)/);
  assert.match(beta, /Verso-Beta-0\.8\.1-beta\.1-macos-arm64\.zip/);
  const prod = releasePage({ version: "1.0.0", en: changelog(1, "en"), pt: changelog(1, "pt") });
  assert.doesNotMatch(prod, /beta/i);
  assert.match(prod, /\[Verso-1\.0\.0-macos-arm64\.zip\]/);
});

test("the English guide comes first, the Portuguese one right after, each with its own changelog", () => {
  const page = releasePage({ version: "0.8.1-beta.1", en: changelog(1, "en"), pt: changelog(1, "pt") });
  const order = ["## Which file do I download?", "## How to install", "## What's new in", "en added 0", "## Qual arquivo baixar?", "## Como instalar", "## Novidades da", "pt added 0"].map((s) => page.indexOf(s));
  assert.ok(order.every((i) => i >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(page, /#qual-arquivo-baixar/);
});

test("what's new: at most twelve leads, taken in turn from each section, and how many more", () => {
  const h = highlights(changelog(20, "en"));
  assert.deepEqual(h.groups.map((g) => [g.name, g.items.length]), [["Added", 10], ["Fixed", 2]]);
  assert.equal(h.groups[0].items[0], "en added 0");
  assert.deepEqual(h.groups[1].items, ["A fix", "A fix with no bold lead"]);
  assert.equal(h.more, 10);
});

test("what's new of a production version merges the test releases' sections", () => {
  const body = ["### Added", "", "- **One**: x.", "", "### 1.0.0-beta.2", "", "#### Added", "", "- **Two**: y.", "", "#### Fixed", "", "- **Three**: z."].join("\n");
  assert.deepEqual(highlights(body).groups, [{ name: "Added", items: ["One", "Two"] }, { name: "Fixed", items: ["Three"] }]);
});

test("the changelog's relative links point into the repository at the tag", () => {
  assert.equal(absoluteLinks("[a](docs/adr/0001-x.md) [b](https://x.org) [c](#h)", "v1.0.0", ""), "[a](https://github.com/SergioSJS/verso/blob/v1.0.0/docs/adr/0001-x.md) [b](https://x.org) [c](#h)");
  assert.equal(absoluteLinks("[a](adr/0001-x.md) [b](../../README.md)", "v1.0.0", "docs/pt-BR/"), "[a](https://github.com/SergioSJS/verso/blob/v1.0.0/docs/pt-BR/adr/0001-x.md) [b](https://github.com/SergioSJS/verso/blob/v1.0.0/README.md)");
});

test("a changelog too long for GitHub is linked instead of folded in", () => {
  const page = releasePage({ version: "1.0.0", en: changelog(400, "en".repeat(80)), pt: changelog(400, "pt".repeat(80)) });
  assert.ok(page.length <= PAGE_LIMIT, String(page.length));
  assert.doesNotMatch(page, /<details>/);
  assert.match(page, /blob\/v1\.0\.0\/CHANGELOG\.md/);
  assert.match(page, /blob\/v1\.0\.0\/docs\/pt-BR\/CHANGELOG\.md/);
});

test("each language's news is marked for the app's update panel, before its folded changelog", () => {
  const page = releasePage({ version: "0.8.1-beta.1", en: changelog(3, "en"), pt: changelog(3, "pt") });
  for (const lang of ["en", "pt-BR"]) {
    const start = page.indexOf(`<!-- verso:news:${lang} -->`);
    assert.ok(start >= 0, `no news marker for ${lang}`);
    assert.equal(page.indexOf(`<!-- verso:news:${lang} -->`, start + 1), -1, `one news marker for ${lang}`);
    const end = page.indexOf("<!-- verso:news:end -->", start);
    assert.ok(end > start, `the news of ${lang} is closed`);
    const block = page.slice(start, end);
    assert.match(block, new RegExp(`${lang === "en" ? "en" : "pt"} added 0`));
    assert.doesNotMatch(block, /<details>|\| ---/);
  }
});

test("the Portuguese guide has an explicit anchor the header links to", () => {
  const page = releasePage({ version: "0.8.1-beta.1", en: changelog(1, "en"), pt: changelog(1, "pt") });
  assert.match(page, /<a id="qual-arquivo-baixar"><\/a>\n\n## Qual arquivo baixar\?/);
  assert.match(page, /\]\(#qual-arquivo-baixar\)/);
});
