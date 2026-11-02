// Share audio on the Mac (ADR 0116 item 17, S7): the host's two refusals about capture are told in the person's words
// (a macOS too old; System Audio Recording not allowed, with where to allow it), and nothing else is mistaken for them.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/shareWords";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareHost.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareHost.test-bundle.mjs");

test("the host's capture refusals become sentences that say what to do", () => {
  assert.match(m.hostWhy(m.HOST_NEEDS_MAC), /14\.4/);
  const denied = m.hostWhy(m.HOST_DENIED);
  assert.match(denied, /System Audio Recording|Gravação de Áudio do Sistema/);
  assert.match(denied, /Privacy|Privacidade/);
});

test("another message is not one of them", () => {
  assert.equal(m.hostWhy("no such source to share"), null);
  assert.equal(m.hostWhy(""), null);
});
