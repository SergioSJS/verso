// The writes a live note gets from something other than the keyboard —
// the properties panel, a PDF's quote — go through its room, as typing
// does; a note that is not live is written as before (ADR 0082, decided
// 2026-10-12).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/roomWrites"; export { propertyChange } from "./src/props";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/roomWrites.test-bundle.mjs",
  logLevel: "error",
});
const { throughRoom, applyChange, appendLines, propertyChange } = await import("./.bundles/roomWrites.test-bundle.mjs");

/** A tab holding its note live: its text, and every edit it was given. */
function holder(text) {
  const h = {
    now: text,
    edits: [],
    text: () => h.now,
    edit: (c) => {
      h.edits.push(c);
      h.now = applyChange(h.now, c);
    },
  };
  return h;
}

/** What the properties panel does when a value is set in it. */
const panelSet = (key, value) => (text) => {
  const r = propertyChange(text, key, { op: "set", value });
  return "refused" in r ? null : applyChange(text, r.change);
};

/** What a PDF's quote does to its companion note. */
const quoted = (lines) => (was) => appendLines(was, lines);

const NOTE = "---\nstatus: draft\ntags:\n  - a\n---\n# Receita\n\nFarinha e ovos.\n";

describe("The properties panel, on a live note", () => {
  test("goes through the room as one edit of the key's line", () => {
    const h = holder(NOTE);
    assert.equal(throughRoom(h, panelSet("status", { kind: "text", value: "done" })), "room");
    assert.equal(h.edits.length, 1);
    assert.equal(h.now, NOTE.replace("status: draft", "status: done"));
    // Only what differs: the rest of the note is never rewritten.
    const e = h.edits[0];
    assert.ok(e.from >= NOTE.indexOf("status: ") && e.to <= NOTE.indexOf("\ntags:"), JSON.stringify(e));
  });

  test("a change that changes nothing makes no edit", () => {
    const h = holder(NOTE);
    assert.equal(throughRoom(h, panelSet("status", { kind: "text", value: "draft" })), "same");
    assert.equal(h.edits.length, 0);
  });

  test("a refused change makes no edit, and says so", () => {
    const h = holder(NOTE);
    assert.equal(throughRoom(h, () => null), "refused");
    assert.equal(h.edits.length, 0);
  });

  test("a note that is not live is the caller's to write, as before", () => {
    let asked = false;
    assert.equal(throughRoom(null, (t) => ((asked = true), t)), "disk");
    assert.equal(asked, false);
  });
});

describe("A PDF's quote, into a live companion note", () => {
  const lines = ["> [!quote] [[Livro.pdf#page=3&selection=1,2,3,4|Livro, página 3]]", "> Um trecho."];

  test("goes through the room, appended after a blank line", () => {
    const h = holder("# Anotações — Livro\n\n![[Livro.pdf]]\n");
    assert.equal(throughRoom(h, quoted(lines)), "room");
    assert.equal(h.now, `# Anotações — Livro\n\n![[Livro.pdf]]\n\n${lines.join("\n")}\n`);
    // An insertion at the end, nothing before it touched.
    assert.equal(h.edits[0].from, h.edits[0].to);
  });

  test("the room's text ends its lines with \\n: a file's \\r\\n never goes in", () => {
    const h = holder("a\n");
    assert.equal(throughRoom(h, () => "a\r\nb\r\n"), "room");
    assert.equal(h.now, "a\nb\n");
  });

  test("written to the file, the quote keeps the note's own line ends", () => {
    assert.equal(appendLines("a\r\nb\r\n", ["> q"]), "a\r\nb\r\n\r\n> q\r\n");
    assert.equal(appendLines("a", ["> q"]), "a\n\n> q\n");
    assert.equal(appendLines("", ["> q"]), "\n> q\n");
  });
});

describe("In the room, a write merges with what someone else types meanwhile", () => {
  test("a property set here and a sentence typed there both stay, with no conflict", () => {
    // Two windows in one room: each its own Yjs document, kept in step by
    // the updates the room relays.
    const here = new Y.Doc();
    const there = new Y.Doc();
    here.getText("verso").insert(0, NOTE);
    Y.applyUpdate(there, Y.encodeStateAsUpdate(here));
    const text = here.getText("verso");
    const live = {
      text: () => text.toString(),
      edit: (c) =>
        here.transact(() => {
          if (c.to > c.from) text.delete(c.from, c.to - c.from);
          if (c.insert) text.insert(c.from, c.insert);
        }),
    };
    // At the same moment: the panel here, a keystroke there.
    assert.equal(throughRoom(live, panelSet("status", { kind: "text", value: "done" })), "room");
    const body = there.getText("verso");
    body.insert(body.toString().length, "Açúcar.\n");
    Y.applyUpdate(there, Y.encodeStateAsUpdate(here));
    Y.applyUpdate(here, Y.encodeStateAsUpdate(there));
    const want = NOTE.replace("status: draft", "status: done") + "Açúcar.\n";
    assert.equal(here.getText("verso").toString(), want);
    assert.equal(there.getText("verso").toString(), want);
  });

  test("a quote appended here while a word is typed there: both stay", () => {
    const here = new Y.Doc();
    const there = new Y.Doc();
    here.getText("verso").insert(0, "# Anotações\n\nPrimeira ideia.\n");
    Y.applyUpdate(there, Y.encodeStateAsUpdate(here));
    const text = here.getText("verso");
    const live = {
      text: () => text.toString(),
      edit: (c) =>
        here.transact(() => {
          if (c.to > c.from) text.delete(c.from, c.to - c.from);
          if (c.insert) text.insert(c.from, c.insert);
        }),
    };
    assert.equal(throughRoom(live, quoted(["> Um trecho."])), "room");
    there.getText("verso").insert("# Anotações\n\nPrimeira".length, " boa");
    Y.applyUpdate(there, Y.encodeStateAsUpdate(here));
    Y.applyUpdate(here, Y.encodeStateAsUpdate(there));
    const want = "# Anotações\n\nPrimeira boa ideia.\n\n> Um trecho.\n";
    assert.equal(here.getText("verso").toString(), want);
    assert.equal(there.getText("verso").toString(), want);
  });
});
