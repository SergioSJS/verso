// `monster:` and `extends:` (ADR 0099 item 1, 0099.1 = A): the plugin's
// merge rules (override, extends order, traits by name with +, - and ~),
// cycles and depth that stop with a message, a missing base said on the
// card, where a name is looked up in notes (ties broken the same way every
// time), and a card drawn again in place when its base changes.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&") };
globalThis.HTMLElement = win.HTMLElement;
globalThis.CustomEvent = win.CustomEvent;
globalThis.localStorage = win.localStorage;

await esbuild.build({
  stdin: {
    contents: `export { compose, refsOf, MAX_DEPTH } from "./src/statblock/inherit";
export { Bestiary, entryOf, setBestiaryIO, refreshBestiary } from "./src/statblock/bestiary";
export { readSheet } from "./src/statblock/sheet";
export { renderStatblock } from "./src/statblock/render";
export { resetStoreForTests } from "./src/statblock/store";
export { setStatblockLang } from "./src/statblock/strings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockInherit.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblockInherit.test-bundle.mjs");

const sheet = (o) => Object.assign(Object.create(null), o);
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const traitsOnly = () => new Set(["traits", "actions"]);

/** A lookup over named sheets: `by` maps a name to {sheet, path}. */
const lookupIn = (by) => (ref) => {
  const f = by[ref.text];
  return f ? { id: f.id ?? ref.text, path: f.path ?? `${ref.text}.md`, name: ref.text, sheet: sheet(f.sheet) } : null;
};

beforeEach(() => {
  localStorage.clear();
  m.resetStoreForTests();
  m.setStatblockLang("en");
  m.setBestiaryIO(null);
});

describe("composing a block with its bases", () => {
  const goblin = { name: "Goblin", hp: 7, ac: 15, speed: "30 ft.", traits: [{ name: "Nimble Escape", desc: "Hides." }, { name: "Sneaky", desc: "Quiet." }] };

  test("the block's own keys override; the rest comes from the base", () => {
    const c = m.compose(sheet({ monster: "Goblin", name: "Goblin Rei", hp: 30 }), lookupIn({ Goblin: { sheet: goblin } }), traitsOnly);
    assert.equal(c.sheet.name, "Goblin Rei");
    assert.equal(c.sheet.hp, 30);
    assert.equal(c.sheet.ac, 15);
    assert.equal(c.sheet.speed, "30 ft.");
    assert.deepEqual(c.problems, []);
    assert.deepEqual(c.bases, [{ name: "Goblin", path: "Goblin.md" }]);
  });

  test("a base is never changed", () => {
    const base = sheet(goblin);
    const before = JSON.stringify(base);
    m.compose(sheet({ extends: "Goblin", hp: 1, "traits+": [{ name: "Extra", desc: "x" }] }), (r) => ({ id: "g", path: "g.md", name: "Goblin", sheet: base }), traitsOnly);
    assert.equal(JSON.stringify(base), before);
  });

  test("traits merge by name: the nearer wins, + adds, - removes, ~ changes only an existing one", () => {
    const own = sheet({
      extends: "Goblin",
      traits: [{ name: "Sneaky", desc: "Very quiet." }],
      "traits-": [{ name: "Nimble Escape" }],
      "traits+": [{ name: "Boss", desc: "Leads." }],
    });
    const c = m.compose(own, lookupIn({ Goblin: { sheet: goblin } }), traitsOnly);
    assert.deepEqual(c.sheet.traits, [{ name: "Sneaky", desc: "Very quiet." }, { name: "Boss", desc: "Leads." }]);
    assert.equal(c.sheet["traits+"], undefined);
    const mod = m.compose(sheet({ extends: "Goblin", "traits~": [{ name: "Sneaky", desc: "Changed." }, { name: "Nobody", desc: "Ignored." }] }), lookupIn({ Goblin: { sheet: goblin } }), traitsOnly);
    assert.deepEqual(mod.sheet.traits.map((t) => [t.name, t.desc]), [["Nimble Escape", "Hides."], ["Sneaky", "Changed."]]);
  });

  test("a key that is not a traits list is replaced, and key+ appends to it", () => {
    const c = m.compose(sheet({ extends: "G", senses: "darkvision", "languages+": "Goblin" }), lookupIn({ G: { sheet: { senses: "none", languages: "Common" } } }), traitsOnly);
    assert.equal(c.sheet.senses, "darkvision");
    assert.equal(c.sheet.languages, "Common, Goblin");
  });

  test("extends: a list is read in order, the first listed winning where they agree", () => {
    const by = { A: { sheet: { x: "a", y: "a" } }, B: { sheet: { x: "b", z: "b" } } };
    const c = m.compose(sheet({ extends: ["A", "B"] }), lookupIn(by), traitsOnly);
    assert.deepEqual([c.sheet.x, c.sheet.y, c.sheet.z], ["a", "a", "b"]);
    assert.deepEqual(c.bases.map((b) => b.name), ["A", "B"]);
  });

  test("monster: wins over extends:, and a base's own extends: is followed", () => {
    const by = { M: { sheet: { k: "m", only_m: 1, extends: "Deep" } }, E: { sheet: { k: "e", only_e: 1 } }, Deep: { sheet: { deep: true, only_m: 0 } } };
    const c = m.compose(sheet({ monster: "M", extends: "E" }), lookupIn(by), traitsOnly);
    assert.equal(c.sheet.k, "m");
    assert.equal(c.sheet.only_m, 1);
    assert.equal(c.sheet.only_e, 1);
    assert.equal(c.sheet.deep, true);
  });

  test("a link target is read as a link; a plain word as a name", () => {
    const seen = [];
    m.compose(sheet({ extends: ["[[Goblin]]", "Orc", "[[Dir/Troll|the troll]]"] }), (r) => (seen.push([r.kind, r.text]), null), traitsOnly);
    assert.deepEqual(seen, [["link", "Goblin"], ["name", "Orc"], ["link", "Dir/Troll"]]);
  });

  test("a missing base is a message, and the block's own keys still draw", () => {
    const c = m.compose(sheet({ monster: "Nope", hp: 3 }), () => null, traitsOnly);
    assert.deepEqual(c.problems, [{ kind: "missing", ref: "Nope" }]);
    assert.equal(c.sheet.hp, 3);
  });

  test("a cycle stops with a message and does not hang", () => {
    const by = { A: { id: "A", sheet: { extends: "B", a: 1 } }, B: { id: "B", sheet: { extends: "A", b: 1 } } };
    const c = m.compose(sheet({ extends: "A" }), lookupIn(by), traitsOnly);
    assert.ok(c.problems.some((p) => p.kind === "cycle"));
    assert.equal(c.sheet.a, 1);
    assert.equal(c.sheet.b, 1);
  });

  test("review M13: the block itself is on the stack: meeting it again is a cycle at once", () => {
    let calls = 0;
    const by = { B: { id: "n#9", path: "n.md", sheet: { extends: "Me", b: 1 } }, Me: { id: "n#0", path: "n.md", sheet: { extends: "B", me: 1 } } };
    const look = (r) => (calls++, lookupIn(by)(r));
    const own = sheet({ name: "Me", extends: "B" });
    m.compose(own, look, traitsOnly);
    assert.equal(calls, 3, "without knowing itself the walk goes one base further");
    calls = 0;
    const c = m.compose(own, look, traitsOnly, { path: "n.md", name: "Me" });
    assert.equal(calls, 2);
    assert.deepEqual(c.problems, [{ kind: "cycle", ref: "Me" }]);
  });

  test("a chain deeper than 8 stops with a message", () => {
    const by = {};
    for (let i = 0; i < 14; i++) by[`N${i}`] = { sheet: { [`k${i}`]: i, extends: `N${i + 1}` } };
    const c = m.compose(sheet({ extends: "N0" }), lookupIn(by), traitsOnly);
    assert.ok(c.problems.some((p) => p.kind === "depth"));
    assert.equal(c.sheet.k7, 7);
    assert.equal(c.sheet.k8, undefined);
    assert.equal(m.MAX_DEPTH, 8);
  });

  test("a wide fan-out of bases is bounded", () => {
    const own = sheet({ extends: Array.from({ length: 500 }, (_, i) => `X${i}`) });
    let calls = 0;
    m.compose(own, () => (calls++, null), traitsOnly);
    assert.ok(calls <= 8);
  });
});

/** An in-memory folder for the bestiary. */
function folder(files) {
  const io = {
    files,
    reads: 0,
    notes: () => Object.keys(io.files),
    read: async (p) => (io.reads++, Object.hasOwn(io.files, p) ? io.files[p] : null),
    find: async (words) => Object.keys(io.files).filter((p) => io.files[p].toLowerCase().includes(words.toLowerCase())).sort().reverse(),
    resolveLink: (target) => Object.keys(io.files).find((p) => p.replace(/\.md$/, "").split("/").pop() === target.split("/").pop()) ?? null,
  };
  return io;
}
const block = (yaml) => "```statblock\n" + yaml + "\n```\n";

async function settled(b, ref, from) {
  for (let i = 0; i < 40; i++) {
    const r = b.lookup(ref, from);
    if (r !== "pending") return r;
    await tick(2);
  }
  throw new Error("still pending");
}

describe("where a name is looked up", () => {
  test("a creature named so beats a note titled so; ties go to the first path", async () => {
    const io = folder({
      "Bestiary/Goblin.md": block("name: Goblin Chief\nhp: 1"),
      "Zoo/Orcs.md": block("name: Orc\n") + block("name: Goblin\nhp: 7"),
      "Another/Camp.md": block("name: Goblin\nhp: 9"),
    });
    const r = await settled(new m.Bestiary(io), { kind: "name", text: "Goblin", via: "monster" }, "x.md");
    // Two blocks named Goblin: the path that sorts first wins; the note titled Goblin is a tier lower.
    assert.equal(r.path, "Another/Camp.md");
    assert.equal(r.sheet.hp, 9);
  });

  test("with no creature of that name, the note titled so gives its first one; titles tie by path", async () => {
    const io = folder({
      "Z/Goblin.md": block("name: Z one\nhp: 1"),
      "A/Goblin.md": block("name: A one\nhp: 2") + block("name: A two"),
    });
    const r = await settled(new m.Bestiary(io), { kind: "name", text: "goblin", via: "extends" }, "x.md");
    assert.equal(r.path, "A/Goblin.md");
    assert.equal(r.sheet.hp, 2);
  });

  test("the exact spelling beats the same name in another case", async () => {
    const io = folder({ "A.md": block("name: GOBLIN\nhp: 1"), "B.md": block("name: Goblin\nhp: 2") });
    const r = await settled(new m.Bestiary(io), { kind: "name", text: "Goblin", via: "monster" }, "x.md");
    assert.equal(r.sheet.hp, 2);
  });

  test("the note's own other blocks are bases too", async () => {
    const io = folder({ "Fichas.md": block("name: Goblin\nhp: 7") + block("name: Goblin Rei\nmonster: Goblin") });
    const r = await settled(new m.Bestiary(io), { kind: "name", text: "Goblin", via: "monster" }, "Fichas.md");
    assert.equal(r.sheet.hp, 7);
  });

  test("a link names the note; frontmatter with statblock: true is a creature", async () => {
    const io = folder({ "Mobs/Wolf.md": "---\nstatblock: true\nname: Wolf\nhp: 11\n---\nA wolf.\n" });
    const b = new m.Bestiary(io);
    const viaLink = await settled(b, { kind: "link", text: "Wolf", via: "extends" }, "Fichas.md");
    assert.equal(viaLink.sheet.hp, 11);
    const viaName = await settled(b, { kind: "name", text: "Wolf", via: "monster" }, "Fichas.md");
    assert.equal(viaName.path, "Mobs/Wolf.md");
    assert.equal(m.entryOf("n.md", "---\ntitle: x\nhp: 1\n---\n").creatures.length, 0);
  });

  test("an unknown name and an unreadable link are missing, not pending for ever", async () => {
    const b = new m.Bestiary(folder({ "A.md": "nothing" }));
    assert.equal(await settled(b, { kind: "name", text: "Nobody", via: "monster" }, "A.md"), null);
    assert.equal(await settled(b, { kind: "link", text: "Nowhere", via: "extends" }, "A.md"), null);
  });
});

describe("the card", () => {
  const hostFor = (io) => {
    m.setBestiaryIO(io);
  };

  test("draws the base's keys under the block's, links to the base, and says what is missing", async () => {
    const io = folder({
      "Bestiary.md": block("name: Goblin\nhp: 7\nac: 15\ntraits:\n  - name: Nimble Escape\n    desc: Hides in plain sight."),
    });
    hostFor(io);
    const card = m.renderStatblock("name: Goblin Rei\nmonster: Goblin\nhp: 30", undefined, { source: "Fichas.md", key: "Fichas.md" });
    document.body.append(card);
    await tick(30);
    assert.match(card.textContent, /Goblin Rei/);
    assert.match(card.textContent, /Nimble Escape/);
    assert.match(card.textContent, /30/);
    const link = card.querySelector("a.statblock-based-link");
    assert.equal(link.textContent, "based on Goblin");
    assert.equal(link.dataset.target, "Bestiary.md");
    assert.equal(link.tabIndex, 0);
    assert.equal(card.querySelector(".statblock-badge-base"), null);
    const lost = m.renderStatblock("name: Orphan\nextends: Ghost", undefined, { source: "Fichas.md" });
    document.body.append(lost);
    await tick(30);
    assert.match(lost.querySelector(".statblock-badge-base").textContent, /Base "Ghost" not found/);
    card.remove();
    lost.remove();
  });

  test("speaks Portuguese too", async () => {
    m.setStatblockLang("pt");
    hostFor(folder({ "B.md": block("name: Goblin\nhp: 7") }));
    const card = m.renderStatblock("monster: Goblin", undefined, { source: "X.md" });
    document.body.append(card);
    await tick(30);
    assert.equal(card.querySelector("a.statblock-based-link").textContent, "baseado em Goblin");
    card.remove();
  });

  test("a cycle between two notes shows a message instead of hanging", async () => {
    hostFor(folder({ "A.md": block("name: A\nextends: B"), "B.md": block("name: B\nextends: A") }));
    const card = m.renderStatblock("name: Root\nextends: A", undefined, { source: "R.md" });
    document.body.append(card);
    await tick(60);
    assert.match(card.querySelector(".statblock-badge-base").textContent, /Circular inheritance/);
    card.remove();
  });

  test("when the base note changes, the card is drawn again in place", async () => {
    const io = folder({ "Base.md": block("name: Goblin\nhp: 7\nsenses: darkvision 60 ft.") });
    hostFor(io);
    const card = m.renderStatblock("name: Rei\nmonster: Goblin", undefined, { source: "Fichas.md" });
    document.body.append(card);
    await tick(30);
    assert.match(card.textContent, /darkvision 60 ft\./);
    io.files["Base.md"] = block("name: Goblin\nhp: 7\nsenses: blindsight 10 ft.");
    m.refreshBestiary();
    await tick(150);
    assert.match(card.textContent, /blindsight 10 ft\./);
    assert.doesNotMatch(card.textContent, /darkvision/);
    assert.ok(card.isConnected, "the same element");
    // The base note gone: the message shows, the block's own keys stay.
    delete io.files["Base.md"];
    m.refreshBestiary();
    await tick(150);
    assert.match(card.querySelector(".statblock-badge-base").textContent, /not found/);
    assert.match(card.textContent, /Rei/);
    card.remove();
  });
});
