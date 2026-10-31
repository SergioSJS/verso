// The window finds the frontmatter where the core does (spec Q24 a): a byte
// order mark before the opening `---` is accepted.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/frontmatter";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/frontmatterBom.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/frontmatterBom.test-bundle.mjs");

const close = (text) => {
  const lines = text.split("\n");
  return m.frontmatterClose((i) => lines[i]);
};

test("a byte order mark before the fence still opens the frontmatter", () => {
  assert.equal(close("---\ntags: [x]\n---\ncorpo"), 2);
  assert.equal(close("﻿---\ntags: [x]\n---\ncorpo"), 2);
  assert.equal(close("﻿--\ntags: [x]\n---\n"), -1);
  assert.equal(close("x﻿---\ntags: [x]\n---\n"), -1);
});
