// A reader's editor (read-only, no typing) still follows its room: the
// room's text coming in through yCollab is let through the read-only
// filter, while anything else is refused. Before, the filter refused
// everything and a reader's Edit view stayed the join-time snapshot
// ("# Untitled" while the reading view showed the whole note).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: 'export { readOnlyText } from "./src/leaves/text"; export { ySyncAnnotation } from "y-codemirror.next"; export { EditorState } from "@codemirror/state";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/readerLive.test-bundle.mjs",
  logLevel: "error",
});
const { readOnlyText, ySyncAnnotation, EditorState } = await import("./.bundles/readerLive.test-bundle.mjs");

test("a typed change is refused in a read-only text", () => {
  const s = EditorState.create({ doc: "# Untitled", extensions: [readOnlyText] });
  const next = s.update({ changes: { from: 10, insert: "x" } }).state;
  assert.equal(next.doc.toString(), "# Untitled");
});

test("the room's text coming in is applied in a read-only text", () => {
  const s = EditorState.create({ doc: "# Untitled", extensions: [readOnlyText] });
  const next = s.update({ changes: { from: 10, insert: "\nthe whole note" }, annotations: ySyncAnnotation.of({}) }).state;
  assert.equal(next.doc.toString(), "# Untitled\nthe whole note");
});
