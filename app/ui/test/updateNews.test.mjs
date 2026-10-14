// The update panel shows what is new, not the release page (ADR 0051,
// revised 2026-10-14): the page a release publishes opens with a guide to
// downloading — tables, links, folded changelogs — and marks each
// language's "what's new" for the app; the panel shows that part, in the
// window's language, as plain lines. An older release's body (the raw
// changelog) still shows its first items, never its markup.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { releasePage } from "../../../scripts/release-page.mjs";

await esbuild.build({
  stdin: { contents: 'export * from "./src/updateNews";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/updateNews.test-bundle.mjs",
  logLevel: "error",
});
const { updateNews } = await import("./.bundles/updateNews.test-bundle.mjs");

const changelog = (word) =>
  [
    "### Added",
    "",
    `- **${word} one, with \`code\` and [a link](docs/adr/0001-x.md)** ([ADR 0001](docs/adr/0001-x.md)): the rest | of it.`,
    `- **${word} two**: more.`,
    "",
    "### Fixed",
    "",
    `- **${word} fixed**: done.`,
  ].join("\n");

const page = releasePage({ version: "0.8.1-beta.1", en: changelog("English"), pt: changelog("Português") });

/** No markup a reader would see as noise. */
function plain(text) {
  assert.ok(text.trim().length > 0, "something is shown");
  assert.doesNotMatch(text, /\|/, "no table");
  assert.doesNotMatch(text, /<details>|<summary>|<!--|<a /, "no HTML");
  assert.doesNotMatch(text, /#/, "no heading marker");
  assert.doesNotMatch(text, /\*\*|`|\]\(/, "no bold, code or link markers");
}

test("a release page shows only its news, in English", () => {
  const news = updateNews(page, "en");
  plain(news);
  assert.equal(news, ["Added", "• English one, with code and a link", "• English two", "", "Fixed", "• English fixed"].join("\n"));
});

test("a release page shows only its news, in Portuguese", () => {
  const news = updateNews(page, "pt-BR");
  plain(news);
  assert.match(news, /^Acrescentado|^Added/);
  assert.match(news, /• Português one/);
  assert.doesNotMatch(news, /English/);
});

test("a page with one language's news falls back to it", () => {
  const onlyEn = page.replace(/<!-- verso:news:pt-BR -->[\s\S]*?<!-- verso:news:end -->/, "");
  assert.match(updateNews(onlyEn, "pt-BR"), /• English one/);
});

test("an older release's raw changelog shows its first items' leads, in the window's language", () => {
  const old = `${changelog("Old")}\n\n---\n\n**Português (Brasil)**\n\n${changelog("Antigo")}\n`;
  const en = updateNews(old, "en");
  plain(en);
  assert.equal(en, ["Added", "• Old one, with code and a link", "• Old two", "", "Fixed", "• Old fixed"].join("\n"));
  const pt = updateNews(old, "pt-BR");
  plain(pt);
  assert.match(pt, /^Added\n• Antigo one/);
});

test("a long body is cut to twenty lines, with no table even when it has one", () => {
  const long = ["| a | b |", "| --- | --- |", ...Array.from({ length: 40 }, (_, i) => `- **Item ${i}**: text.`)].join("\n");
  const shown = updateNews(long, "en");
  plain(shown);
  assert.equal(shown.split("\n").length, 20);
  assert.match(shown, /^• Item 0\n/);
});

test("an empty body shows nothing", () => {
  assert.equal(updateNews("", "en"), "");
});
