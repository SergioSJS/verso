// A file the person opens while a folder's tabs are being brought back
// wins: it is opened after them, in front, not put behind them
// (layout/restoring.ts; seen in the server's end-to-end tests on macOS
// WebKit, 2026-10-13).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/layout/restoring";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/restoring.test-bundle.mjs",
  logLevel: "error",
});
const r = await import("./.bundles/restoring.test-bundle.mjs");

test("an open asked for while the tabs come back is made after them, in the order asked", () => {
  const shown = [];
  // The folder opens: its tabs start coming back.
  r.beginRestore();
  // The person clicks two files in the tree meanwhile.
  assert.equal(r.afterRestore(() => shown.push("Projetos.base")), true);
  assert.equal(r.afterRestore(() => shown.push("lista.txt")), true);
  // The saved tabs are put in place.
  shown.push("restored: Antiga.txt");
  r.endRestore();
  // What was clicked comes last: in front.
  assert.deepEqual(shown, ["restored: Antiga.txt", "Projetos.base", "lista.txt"]);
});

test("an open with nothing being brought back is made at once", () => {
  assert.equal(r.afterRestore(() => assert.fail("kept")), false);
});

test("two folders opening one inside the other open what waits only once both are done", () => {
  const shown = [];
  r.beginRestore();
  r.beginRestore();
  r.afterRestore(() => shown.push("nota"));
  r.endRestore();
  assert.deepEqual(shown, []);
  r.endRestore();
  assert.deepEqual(shown, ["nota"]);
  // An extra end does not go below nothing.
  r.endRestore();
  assert.equal(r.afterRestore(() => shown.push("x")), false);
});
