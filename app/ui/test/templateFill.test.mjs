// The tags of a plain note template: Obsidian's core Templates plugin's
// {{title}} {{date}} {{time}} and {{date:FORMAT}} / {{time:FORMAT}}.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/templateFill.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/templateFill.test-bundle.mjs", logLevel: "error" });
const { fillTemplate } = await import("./.bundles/templateFill.test-bundle.mjs");

const now = new Date(2026, 9, 21, 7, 5, 9); // Wednesday, 21 October 2026, 07:05:09

test("the plain tags", () => {
  assert.equal(fillTemplate("{{title}} {{date}} {{time}}", "Nota", now), "Nota 2026-10-21 07:05");
});

test("{{date:FORMAT}} and {{time:FORMAT}} in Moment tokens", () => {
  assert.equal(fillTemplate("{{date:DD/MM/YYYY}}", "x", now), "21/10/2026");
  assert.equal(fillTemplate("{{time:HH:mm:ss}}", "x", now), "07:05:09");
  assert.equal(fillTemplate("{{date:YYYY-MM-DD HH:mm}}", "x", now), "2026-10-21 07:05");
  assert.equal(fillTemplate("{{date:dddd, MMMM Do}}", "x", now, "en"), "Wednesday, October 21st");
  assert.equal(fillTemplate("{{date:D [de] MMMM}}", "x", now, "pt-BR"), "21 de outubro");
});

test("one pass: a title that holds a tag is not filled again", () => {
  assert.equal(fillTemplate("# {{title}}", "{{date}}", now), "# {{date}}");
});

test("other tags and unreadable formats stay as written", () => {
  assert.equal(fillTemplate("{{uuid}} {{foo}} {{date:YYYY ZZ}}", "x", now), "{{uuid}} {{foo}} {{date:YYYY ZZ}}");
});
