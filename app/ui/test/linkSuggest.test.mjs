// The suggestion while typing (ADR 0089 item 5, revised 2026-10-15): the
// names of the folder matched at the end of what was just typed — whole
// name, case ignored, accents kept, NFC = NFD, three characters at least,
// the longest name winning, aliases counting, the ignored folders and
// names and the note itself left out — the places that are not prose, the
// link that is written, and the editor's field that holds the suggestion
// (typed in, dismissed, accepted), over a state without a page. The last
// test is the benchmark for a folder of 10,000 notes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";

const esbuild = await import("esbuild");
await esbuild.build({
  stdin: { contents: 'export * from "./src/editor/linkNames"; export * from "./src/editor/linkSuggest";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["@codemirror/*", "@lezer/*"],
  outfile: "test/.bundles/linkSuggest.test-bundle.mjs",
});
const { LinkNames, linkWritten, suggestionOf, linkSuggest, dismissSuggestion, acceptChange } = await import("./.bundles/linkSuggest.test-bundle.mjs");

const NOTES = [
  { path: "personagens/Capitão Ruy.md", name: "Capitão Ruy", aliases: ["O Capitão"] },
  { path: "lugares/Porto.md", name: "Porto", aliases: ["Cidade Invicta"] },
  { path: "lugares/Porto Alegre.md", name: "Porto Alegre", aliases: [] },
  { path: "Mesa.md", name: "Mesa", aliases: [] },
  { path: "Ed.md", name: "Ed", aliases: [] },
  { path: "Café.md", name: "Café", aliases: [] },
  { path: "Arquivo/Velho.md", name: "Velho", aliases: [] },
  { path: "Viagem.md", name: "Viagem", aliases: ["Jornada"] },
];
const RULES = { ignoredFolders: [], ignoredNames: [] };
const names = (over = {}, notes = NOTES) => new LinkNames(notes, { ...RULES, ...over });
const find = (n, before, over = {}) => n.find(before, over.next ?? "", over.self ?? "Outra.md");

describe("What is matched at the end of what was typed", () => {
  test("a whole note name, the match starting where the name starts", () => {
    const hit = find(names(), "Fomos ao Porto");
    assert.equal(hit.path, "lugares/Porto.md");
    assert.equal(hit.name, "Porto");
    assert.equal(hit.start, 9);
    assert.equal(hit.text, "Porto");
    assert.equal(hit.alias, false);
  });
  test("case ignored", () => {
    const hit = find(names(), "o capitão ruy");
    assert.equal(hit.path, "personagens/Capitão Ruy.md");
    assert.equal(hit.text, "capitão ruy");
  });
  test("accents kept: without the accent it is another word", () => {
    assert.equal(find(names(), "o capitao ruy"), null);
    assert.equal(find(names(), "o Capitao Ruy"), null);
  });
  test("a composed accent and a decomposed one are the same accent", () => {
    assert.equal(find(names(), "um Café").path, "Café.md");
    assert.equal(find(names([], [{ path: "Café.md", name: "Café", aliases: [] }]), "um Café").path, "Café.md");
  });
  test("three characters at least", () => {
    assert.equal(find(names(), "o Ed"), null);
    assert.ok(find(names([], [{ path: "Edu.md", name: "Edu", aliases: [] }]), "o Edu"));
  });
  test("the whole name: not the end of a longer word, not the start of one", () => {
    assert.equal(find(names(), "o Reiporto"), null);
    assert.equal(find(names(), "o Portos"), null);
    assert.equal(find(names(), "o Porto", { next: "s" }), null);
    assert.ok(find(names(), "o Porto", { next: " " }));
    assert.ok(find(names(), "o Porto", { next: "," }));
  });
  test("a name of several words; the longest name wins", () => {
    assert.equal(find(names(), "ir a Porto Alegre").name, "Porto Alegre");
    assert.equal(find(names(), "ir a Porto").name, "Porto");
    assert.equal(find(names(), "ir a Porto Alegre").start, 5);
  });
  test("a typed text with a single space is the name; with two it is not", () => {
    assert.equal(find(names(), "ir a Porto  Alegre"), null);
  });
  test("an alias is a name, and the hit says it is one", () => {
    const hit = find(names(), "a Cidade Invicta");
    assert.equal(hit.path, "lugares/Porto.md");
    assert.equal(hit.name, "Porto");
    assert.equal(hit.alias, true);
    assert.equal(hit.text, "Cidade Invicta");
  });
  test("the note itself is never suggested, by its name or by an alias", () => {
    assert.equal(find(names(), "o Porto", { self: "lugares/Porto.md" }), null);
    assert.equal(find(names(), "a Cidade Invicta", { self: "lugares/Porto.md" }), null);
    // The other notes still are.
    assert.ok(find(names(), "o Porto Alegre", { self: "lugares/Porto.md" }));
  });
  test("two notes of one name: the one in the writer's folder, else the shallowest; the note itself skipped", () => {
    const two = [
      { path: "a/Ruy.md", name: "Ruy", aliases: [] },
      { path: "b/c/Ruy.md", name: "Ruy", aliases: [] },
      { path: "Ruy.md", name: "Ruy", aliases: [] },
    ];
    assert.equal(find(names({}, two), "o Ruy", { self: "x.md" }).path, "Ruy.md");
    assert.equal(find(names({}, two), "o Ruy", { self: "Ruy.md" }).path, "a/Ruy.md");
    assert.equal(find(names({}, two), "o Ruy", { self: "b/c/x.md" }).path, "b/c/Ruy.md");
  });
});

describe("What the person asked not to be suggested", () => {
  test("a folder: its notes and its subfolders' notes, not a folder of the same prefix", () => {
    const n = names({ ignoredFolders: ["lugares"] });
    assert.equal(find(n, "o Porto"), null);
    assert.equal(find(n, "a Cidade Invicta"), null);
    assert.ok(find(n, "o Capitão Ruy"));
    const m = names({ ignoredFolders: ["Arq"] });
    assert.ok(find(m, "o Velho"), "a folder named Arquivo is not Arq");
    assert.equal(find(names({ ignoredFolders: ["Arquivo/"] }), "o Velho"), null);
    assert.equal(find(names({ ignoredFolders: ["/Arquivo"] }), "o Velho"), null);
  });
  test("a name, case and accent as for the match; an alias too", () => {
    assert.equal(find(names({ ignoredNames: ["mesa"] }), "a Mesa"), null);
    assert.equal(find(names({ ignoredNames: ["MESA"] }), "a mesa"), null);
    assert.ok(find(names({ ignoredNames: ["mesa"] }), "a Mesas") === null);
    assert.equal(find(names({ ignoredNames: ["Cidade Invicta"] }), "a Cidade Invicta"), null);
    assert.ok(find(names({ ignoredNames: ["Cidade Invicta"] }), "o Porto"), "the note's own name still is");
  });
  test("an ignored longer name does not hide the shorter one it ends with", () => {
    const hit = find(names({ ignoredNames: ["Porto Alegre"] }), "ir a Porto Alegre");
    assert.equal(hit, null, "the shorter name is not at the end of the typed words");
  });
});

describe("Where it is prose", () => {
  const at = (before) => find(names(), before);
  test("plain text and a heading, a list item, a quote", () => {
    assert.ok(at("Fomos ao Porto"));
    assert.ok(at("# Porto"));
    assert.ok(at("- ver o Porto"));
    assert.ok(at("> o Porto"));
  });
  test("never inside a link that is being written", () => {
    assert.equal(at("[[Porto"), null);
    assert.equal(at("![[Porto"), null);
    assert.equal(at("[[x|Porto"), null);
    assert.equal(at("[Porto"), null);
    assert.equal(at("[x](Porto"), null);
    assert.ok(at("[[x]] e o Porto"), "after a finished link it is prose again");
  });
  test("never in inline code, math, a comment, an HTML tag, a tag", () => {
    assert.equal(at("use `Porto"), null);
    assert.equal(at("vale $Porto"), null);
    assert.equal(at("%% o Porto"), null);
    assert.equal(at('<a href="x" title="Porto'), null);
    assert.equal(at("#Porto"), null);
    assert.equal(at("#lugares/Porto"), null);
    assert.ok(at("`x` e o Porto"));
    assert.ok(at("$x$ e o Porto"));
  });
});

describe("The link that is written", () => {
  const hit = (over) => ({ start: 0, text: "Porto", path: "lugares/Porto.md", name: "Porto", alias: false, ...over });
  test("the name as written: a bare link; another case or an alias: the typed text kept", () => {
    assert.equal(linkWritten(hit({}), "Porto", false), "[[Porto]]");
    assert.equal(linkWritten(hit({ text: "porto" }), "Porto", false), "[[Porto|porto]]");
    assert.equal(linkWritten(hit({ text: "Cidade Invicta", alias: true }), "Porto", false), "[[Porto|Cidade Invicta]]");
    assert.equal(linkWritten(hit({}), "lugares/Porto", false), "[[lugares/Porto|Porto]]");
  });
  test("in a table's cell the bar is escaped", () => {
    assert.equal(linkWritten(hit({ text: "porto" }), "Porto", true), "[[Porto\\|porto]]");
  });
});

const DEPS = (over = {}) => ({
  enabled: () => true,
  names: () => names(),
  path: () => "Outra.md",
  target: (p) => p.replace(/^.*\//, "").replace(/\.md$/, ""),
  announce: () => undefined,
  ...over,
});
const stateOf = (doc, deps = DEPS(), pos = doc.length) =>
  EditorState.create({ doc, selection: { anchor: pos }, extensions: [markdown(), linkSuggest(deps)] });
/** Type `text` one character at a time at the cursor, as the editor's
 *  input does. */
const type = (state, text) => {
  for (const ch of text) {
    const at = state.selection.main.head;
    state = state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: "input.type" }).state;
  }
  return state;
};
const shown = (state) => suggestionOf(state)?.name ?? null;

describe("The suggestion in the editor", () => {
  test("typing a name shows it, and the text is not changed", () => {
    const s = type(stateOf("Fomos ao "), "Porto");
    assert.equal(shown(s), "Porto");
    assert.equal(s.doc.toString(), "Fomos ao Porto");
  });
  test("it follows the longest name as the words are typed", () => {
    let s = type(stateOf("ir a "), "Porto");
    assert.equal(shown(s), "Porto");
    s = type(s, " ");
    assert.equal(shown(s), "Porto", "a space after the name: the chip stays until the next word starts");
    s = type(s, "Alegre");
    assert.equal(shown(s), "Porto Alegre");
  });
  test("continuing to type dismisses it, and the name is not offered again in the paragraph", () => {
    let s = type(stateOf("ir a "), "Porto");
    s = type(s, " ");
    s = type(s, "e Porto");
    assert.equal(shown(s), null, "dismissed in this paragraph");
    // A new paragraph offers it again.
    s = type(s, "\n\nde novo o Porto");
    assert.equal(shown(s), "Porto");
  });
  test("Escape dismisses it, the same way", () => {
    let s = type(stateOf("ir a "), "Porto");
    s = s.update({ effects: dismissSuggestion.of(null) }).state;
    assert.equal(shown(s), null);
    assert.equal(s.doc.toString(), "ir a Porto");
    s = type(s, " e o Porto");
    assert.equal(shown(s), null);
  });
  test("accepting writes the link over the typed words and puts the cursor after it", () => {
    const s = type(stateOf("Fomos ao "), "porto");
    const change = acceptChange(s);
    assert.deepEqual(change.changes, { from: 9, to: 14, insert: "[[Porto|porto]]" });
    const after = s.update(change).state;
    assert.equal(after.doc.toString(), "Fomos ao [[Porto|porto]]");
    assert.equal(after.selection.main.head, 24);
    assert.equal(shown(after), null);
  });
  test("the target is the link text of the note: a path when the name alone is not enough", () => {
    const s = type(stateOf("ver "), "Porto");
    const deps = DEPS({ target: () => "lugares/Porto" });
    const t = type(stateOf("ver ", deps), "Porto");
    assert.equal(acceptChange(t).changes.insert, "[[lugares/Porto|Porto]]");
    assert.equal(acceptChange(s).changes.insert, "[[Porto]]");
  });
  test("in a table's cell the bar of the link is escaped", () => {
    const s = type(stateOf("| a | "), "porto");
    assert.equal(acceptChange(s).changes.insert, "[[Porto\\|porto]]");
  });
  test("nothing is accepted when nothing is shown", () => {
    assert.equal(acceptChange(stateOf("sem nada")), null);
  });
  test("the setting off: nothing shown", () => {
    const s = type(stateOf("ir a ", DEPS({ enabled: () => false })), "Porto");
    assert.equal(shown(s), null);
  });
  test("only typing suggests: a paste, an edit from the room, an undo do not", () => {
    for (const userEvent of ["input.paste", "undo", "input.complete", undefined]) {
      const base = stateOf("ir a ");
      const s = base.update({ changes: { from: 5, insert: "Porto" }, selection: { anchor: 10 }, userEvent }).state;
      assert.equal(shown(s), null, String(userEvent));
    }
  });
  test("moving the cursor away clears it", () => {
    let s = type(stateOf("ir a "), "Porto");
    s = s.update({ selection: { anchor: 0 } }).state;
    assert.equal(shown(s), null);
  });
  test("an edit that is not the person's typing (the room's) clears it without dismissing the name", () => {
    let s = type(stateOf("ir a "), "Porto");
    s = s.update({ changes: { from: 0, insert: "x" } }).state;
    assert.equal(shown(s), null);
    s = type(s, " ");
    assert.equal(shown(s), "Porto", "not dismissed: it was never the person's choice");
  });
  test("not in the middle of a word", () => {
    const base = stateOf("ir a Ports", DEPS(), 9);
    const s = base.update({ changes: { from: 9, insert: "o" }, selection: { anchor: 10 }, userEvent: "input.type" }).state;
    assert.equal(shown(s), null);
  });
  test("never in the frontmatter, a code block, an HTML block", () => {
    const front = type(stateOf("---\ntitle: x\n---\n", DEPS(), 8), "Porto");
    assert.equal(shown(front), null);
    const fenced = type(stateOf("```\nver ", DEPS()), "Porto");
    assert.equal(shown(fenced), null);
    const indented = type(stateOf("texto\n\n    ver ", DEPS()), "Porto");
    assert.equal(shown(indented), null);
    const html = type(stateOf("<div>\nver ", DEPS()), "Porto");
    assert.equal(shown(html), null);
    const prose = type(stateOf("```\ncódigo\n```\n\nver "), "Porto");
    assert.equal(shown(prose), "Porto");
  });
  test("never inside a markdown link's text or address, or an inline code", () => {
    assert.equal(shown(type(stateOf("[ver "), "Porto")), null);
    assert.equal(shown(type(stateOf("[x](http://a/"), "Porto")), null);
    assert.equal(shown(type(stateOf("`ver "), "Porto")), null);
  });
});

describe("Cost on a folder of 10,000 notes", () => {
  test("the names are built once and each keystroke is a few lookups", () => {
    const words = ["Porto", "Mesa", "Ruy", "Lago", "Forte", "Praia", "Serra", "Rio", "Vale", "Monte", "Ilha", "Cais", "Torre"];
    const notes = [];
    for (let i = 0; i < 10000; i++) {
      const a = words[i % words.length];
      const b = words[Math.floor(i / words.length) % words.length];
      notes.push({ path: `d${i % 50}/${a} ${b} ${i}.md`, name: `${a} ${b} ${i}`, aliases: i % 5 === 0 ? [`Apelido ${i}`] : [] });
    }
    const t0 = performance.now();
    const big = new LinkNames(notes, RULES);
    const build = performance.now() - t0;
    const line = "Era uma vez um capitão que viajou até o Porto Mesa 13";
    const N = 20000;
    let found = 0;
    const t1 = performance.now();
    for (let i = 0; i < N; i++) {
      // Each keystroke is a longer prefix of the line; the last ones hit.
      const upTo = line.slice(0, 10 + (i % (line.length - 10)) + 1);
      if (big.find(upTo, "", "x.md")) found++;
    }
    const each = (performance.now() - t1) / N;
    console.log(`link suggestions, 10,000 notes (+2,000 aliases): build ${build.toFixed(1)} ms, ${(each * 1000).toFixed(1)} µs per keystroke over ${N} keystrokes (${found} hits)`);
    assert.ok(found > 0);
    assert.ok(build < 500, `build ${build} ms`);
    assert.ok(each < 0.2, `${each} ms per keystroke`);
  });
});
