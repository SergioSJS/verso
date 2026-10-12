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
const { throughRoom, writeLive, applyChange, appendLines, propertyChange } = await import("./.bundles/roomWrites.test-bundle.mjs");

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

/** The side that keeps the rooms, as a test plays it: whether someone is
 *  in the note, and the visit a write makes — what it was asked, logged. */
function side({ present = false, visit = true, sends = true, text = NOTE } = {}) {
  const s = {
    asked: [],
    visited: null,
    sent: 0,
    left: 0,
    present: async (path) => {
      s.asked.push(path);
      if (present instanceof Error) throw present;
      return present;
    },
    visit: async () => {
      if (!visit) return null;
      const h = holder(text);
      s.visited = h;
      return {
        ...h,
        send: async () => {
          s.sent++;
          return sends;
        },
        leave: async () => {
          s.left++;
        },
      };
    },
  };
  return s;
}

describe("A write to a note live only elsewhere joins its room (ADR 0082)", () => {
  test("held live in a tab here: through the tab, the side never asked", async () => {
    const h = holder(NOTE);
    const room = side({ present: true });
    assert.equal(await writeLive("Receita.md", h, quoted(["> q"]), room), "room");
    assert.equal(h.edits.length, 1);
    assert.deepEqual(room.asked, []);
  });

  test("in a room elsewhere: joined, the edit made there, the room asked to write, and left", async () => {
    const room = side({ present: true });
    const set = panelSet("status", { kind: "text", value: "done" });
    assert.equal(await writeLive("Receita.md", null, set, room), "room");
    assert.deepEqual(room.asked, ["Receita.md"]);
    assert.equal(room.visited.edits.length, 1);
    assert.equal(room.visited.now, NOTE.replace("status: draft", "status: done"));
    assert.equal(room.sent, 1);
    assert.equal(room.left, 1);
  });

  test("the edit is made on the room's text, not the file's", async () => {
    // Someone typed in the room; the file has not been written yet.
    const typed = `${NOTE}Açúcar.\n`;
    const room = side({ present: true, text: typed });
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), room), "room");
    assert.equal(room.visited.now, `${typed}\n> q\n`);
  });

  test("in no room: the file, as before — no visit", async () => {
    const room = side({ present: false });
    let visits = 0;
    const counted = { ...room, visit: async (p) => (visits++, room.visit(p)) };
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), counted), "disk");
    assert.equal(visits, 0);
  });

  test("no side that keeps rooms (a folder of this computer alone): the file", async () => {
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), null), "disk");
  });

  test("the question failing (the link down) is no room: the file", async () => {
    const room = side({ present: new Error("unavailable") });
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), room), "disk");
  });

  test("the visit refused (mixed line ends, the link dropped): the file", async () => {
    const room = side({ present: true, visit: false });
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), room), "disk");
  });

  test("the room took nothing (the person only reads): left, and the file as before", async () => {
    const room = side({ present: true, sends: false });
    assert.equal(await writeLive("Receita.md", null, quoted(["> q"]), room), "disk");
    assert.equal(room.left, 1);
  });

  test("a change that changes nothing, or is refused: nothing sent, and left", async () => {
    const same = side({ present: true });
    assert.equal(await writeLive("Receita.md", null, (t) => t, same), "same");
    assert.equal(same.sent, 0);
    assert.equal(same.left, 1);
    const refused = side({ present: true });
    assert.equal(await writeLive("Receita.md", null, () => null, refused), "refused");
    assert.equal(refused.sent, 0);
    assert.equal(refused.left, 1);
  });

  test("the visited room's edit merges with what the others type meanwhile", async () => {
    // The room as the others have it, and the copy the visit joins with.
    const others = new Y.Doc();
    others.getText("verso").insert(0, NOTE);
    const visit = new Y.Doc();
    Y.applyUpdate(visit, Y.encodeStateAsUpdate(others));
    const before = Y.encodeStateVector(visit);
    const text = visit.getText("verso");
    let update = null;
    const room = {
      present: async () => true,
      visit: async () => ({
        text: () => text.toString(),
        edit: (c) =>
          visit.transact(() => {
            if (c.to > c.from) text.delete(c.from, c.to - c.from);
            if (c.insert) text.insert(c.from, c.insert);
          }),
        send: async () => {
          update = Y.encodeStateAsUpdate(visit, before);
          return true;
        },
        leave: async () => undefined,
      }),
    };
    // Someone types at the end while the write is made at the top.
    others.getText("verso").insert(NOTE.length, "Açúcar.\n");
    const set = panelSet("status", { kind: "text", value: "done" });
    assert.equal(await writeLive("Receita.md", null, set, room), "room");
    Y.applyUpdate(others, update);
    assert.equal(others.getText("verso").toString(), NOTE.replace("status: draft", "status: done") + "Açúcar.\n");
  });
});
