// What is typed while a note shows before its room is joined goes into the
// room once the room joins: nothing lost, nothing twice.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

await esbuild.build({
  stdin: { contents: 'export * from "./src/roomHandover"; export * from "./src/slowOps";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/roomHandover.test-bundle.mjs",
  logLevel: "error",
});
const { edited, applyToRoom, Stopwatch } = await import("./.bundles/roomHandover.test-bundle.mjs");

function room(text) {
  const doc = new Y.Doc();
  const t = doc.getText("verso");
  t.insert(0, text);
  return t;
}

describe("the edit made before the room joined", () => {
  test("nothing typed is no edit", () => assert.equal(edited("abc", "abc"), null));
  test("an insertion at the end", () => assert.deepEqual(edited("um\n", "um\n+x"), { from: 3, to: 3, insert: "+x" }));
  test("a replacement in the middle", () => assert.deepEqual(edited("abcdef", "abXYef"), { from: 2, to: 4, insert: "XY" }));
  test("a deletion", () => assert.deepEqual(edited("abcdef", "abef"), { from: 2, to: 4, insert: "" }));

  test("lands as made where the room holds the text shown", () => {
    const t = room("um\n");
    applyToRoom(t, "um\n", edited("um\n", "um\nnovo"));
    assert.equal(t.toString(), "um\nnovo");
  });
  test("with the room changed meanwhile, the deleted part is found where it moved", () => {
    const t = room("antes\num\n");
    applyToRoom(t, "um\n", edited("um\n", "dois\n"));
    assert.equal(t.toString(), "antes\ndois\n");
  });
  test("a deletion the room no longer holds drops only the deletion, never the typing", () => {
    const t = room("outra coisa");
    applyToRoom(t, "um\n", edited("um\n", "dois\n"));
    assert.ok(t.toString().includes("dois"));
  });
});

describe("the slow-operation line", () => {
  test("silent under the limit", () => assert.equal(new Stopwatch().line("open a.md", 10_000), null));
  test("names the steps over it", async () => {
    const w = new Stopwatch();
    await new Promise((r) => setTimeout(r, 30));
    w.step("read");
    w.step("room join");
    const line = w.line("open a.md", 10);
    assert.match(line, /^slow open a\.md: \d+ ms \(read \d+ ms, room join \d+ ms\)$/);
  });
});
