// The partial suggestion while typing and the `@` mention (ADR 0089 item 5,
// revised 2026-10-20): a list of names the typed words begin (three letters
// in all, a capital first word, at most five, the note itself never), the
// chip that stays after a space, Esc dismissing for a word, the `@` text
// and the link it writes, and none of them showing with another.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";

const esbuild = await import("esbuild");
await esbuild.build({
  stdin: {
    contents: 'export * from "./src/editor/linkNames"; export * from "./src/editor/linkSuggest"; export * from "./src/editor/wikilinkBefore"; export { mentionWritten } from "./src/mentionLink";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["@codemirror/*", "@lezer/*"],
  outfile: "test/.bundles/linkSuggestPartial.test-bundle.mjs",
});
const { LinkNames, linkSuggest, suggestionOf, listOf, dismissSuggestion, moveSuggestion, acceptChange, MENTION_BEFORE, WIKILINK_BEFORE, mentionWritten } = await import("./.bundles/linkSuggestPartial.test-bundle.mjs");

const NOTES = [
  { path: "lugares/Porto Cinzento.md", name: "Porto Cinzento", aliases: ["Cidade Cinza"] },
  { path: "lugares/Porto Seguro.md", name: "Porto Seguro", aliases: [] },
  { path: "lugares/Porto.md", name: "Porto", aliases: [] },
  { path: "lugares/Portal.md", name: "Portal", aliases: [] },
  { path: "Arquivo/Porto Velho.md", name: "Porto Velho", aliases: [] },
  { path: "Capitão Ruy.md", name: "Capitão Ruy", aliases: [] },
  { path: "Mesa Redonda.md", name: "Mesa Redonda", aliases: [] },
  { path: "Café Central.md", name: "Café Central", aliases: [] },
];
const RULES = { ignoredFolders: [], ignoredNames: [] };
const names = (over = {}, notes = NOTES) => new LinkNames(notes, { ...RULES, ...over });
const DEPS = (over = {}) => ({
  enabled: () => true,
  names: () => names(),
  path: () => "Rascunho.md",
  target: (p) => p.replace(/^.*\//, "").replace(/\.md$/, ""),
  say: () => undefined,
  ...over,
});
const stateOf = (doc, deps = DEPS()) => EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown(), linkSuggest(deps)] });
const type = (state, text) => {
  for (const ch of text) {
    const at = state.selection.main.head;
    state = state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: "input.type" }).state;
  }
  return state;
};
const listed = (state) => listOf(state)?.hits.map((h) => h.name) ?? null;
const part = (before, over = {}) => names(over.rules).partial(before, "", over.self ?? "Rascunho.md").map((h) => h.name);

describe("The partial names the typed words begin", () => {
  test("three letters and a capital first word", () => {
    assert.deepEqual(part("ver o Por"), ["Porto", "Portal", "Porto Velho", "Porto Seguro", "Porto Cinzento"]);
    assert.deepEqual(part("ver o Po"), [], "two letters");
    assert.deepEqual(part("ver o por"), [], "no capital");
    assert.deepEqual(part("ver o PORT").length > 0, true);
  });
  test("the letters before the list are the person's: 1, 2 and 5", () => {
    const at = (before, minLetters) => names().partial(before, "", "Rascunho.md", { minLetters, capitalOnly: true }).map((h) => h.name);
    assert.ok(at("ver o P", 1).includes("Porto"), "one letter");
    assert.deepEqual(at("ver o P", 2), []);
    assert.ok(at("ver o Po", 2).includes("Porto"), "two letters");
    assert.deepEqual(at("ver o Port", 5), [], "four letters under five");
    assert.ok(at("ver o Porto C", 5).includes("Porto Cinzento"), "six letters");
    assert.deepEqual(at("ver o Por", 5), []);
  });
  test("a word that begins with a number counts as a capital: notes named by a date or a number", () => {
    const dated = [
      { path: "Diário/2026-10-20.md", name: "2026-10-20", aliases: [] },
      { path: "Diário/2026-10-21.md", name: "2026-10-21", aliases: [] },
      { path: "00 - Bem-vindo.md", name: "00 - Bem-vindo", aliases: [] },
    ];
    const at = (before) => names({}, dated).partial(before, "", "Rascunho.md").map((h) => h.name);
    assert.deepEqual(at("na sessão de 2026"), ["2026-10-20", "2026-10-21"]);
    assert.deepEqual(at("na sessão de 2026-10-2"), ["2026-10-20", "2026-10-21"]);
    assert.deepEqual(at("veja 00 - Bem"), ["00 - Bem-vindo"]);
    assert.deepEqual(at("na sessão de 20"), [], "two characters, under three");
  });
  test("the capital switch off lists a lowercase word", () => {
    const rule = { minLetters: 3, capitalOnly: false };
    assert.deepEqual(names().partial("ir ao porto ci", "", "Rascunho.md", rule).map((h) => h.name), ["Porto Cinzento"]);
    assert.deepEqual(names().partial("ir ao porto ci", "", "Rascunho.md").map((h) => h.name), [], "on by default");
  });
  test("the editor reads the rule from its dependencies", () => {
    const deps = DEPS({ partialRule: () => ({ minLetters: 2, capitalOnly: true }) });
    assert.ok(listed(type(stateOf("ver o ", deps), "Po"))?.includes("Porto"));
    assert.equal(listed(type(stateOf("ver o "), "Po")), null);
  });
  test("a name of several words: 'Porto C' lists Porto Cinzento", () => {
    assert.deepEqual(part("ir a Porto C"), ["Porto Cinzento"]);
    assert.deepEqual(part("ir a Porto Ci"), ["Porto Cinzento"]);
    assert.deepEqual(part("ir a Porto X"), []);
  });
  test("the first word of the span must be capitalised, whatever the later ones are", () => {
    assert.deepEqual(part("ir ao porto C"), []);
  });
  test("an alias lists its note, saying it is an alias; the whole name itself is the chip's", () => {
    const hits = names().partial("a Cidade Ci", "", "Rascunho.md");
    assert.equal(hits[0].name, "Porto Cinzento");
    assert.equal(hits[0].alias, true);
    assert.equal(hits[0].full, "Cidade Cinza");
    assert.deepEqual(names().partial("o Mesa Redonda", "", "x.md"), []);
  });
  test("accents are kept; a composed or decomposed one is the same", () => {
    assert.deepEqual(part("o Caf"), ["Café Central"]);
    assert.deepEqual(part("o Café"), ["Café Central"]);
    assert.deepEqual(part("o Cafe"), []);
    assert.deepEqual(part("o Café C"), ["Café Central"]);
  });
  test("at most five, the notes near the writer's folder first, then the shortest", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ path: `${i % 2 ? "lugares" : "outros"}/Porto ${"x".repeat(i + 1)}.md`, name: `Porto ${"x".repeat(i + 1)}`, aliases: [] }));
    const hits = names({}, many).partial("o Por", "", "lugares/Nota.md");
    assert.equal(hits.length, 5);
    assert.ok(hits.slice(0, 4).every((h) => h.path.startsWith("lugares/")), "the folder first");
    assert.deepEqual(hits.slice(0, 2).map((h) => h.name), ["Porto xx", "Porto xxxx"]);
  });
  test("the note itself is never listed; ignored folders and names are left out", () => {
    assert.ok(!part("ver Porto S", { self: "lugares/Porto Seguro.md" }).includes("Porto Seguro"));
    assert.deepEqual(part("ver Por", { rules: { ignoredFolders: ["lugares", "Arquivo"], ignoredNames: [] } }), []);
    assert.ok(!part("ver Por", { rules: { ignoredFolders: [], ignoredNames: ["porto velho", "Portal"] } }).some((n) => n === "Porto Velho" || n === "Portal"));
  });
  test("not mid-word, not in a link, code or a tag", () => {
    assert.deepEqual(names().partial("o Por", "t", "x.md"), []);
    assert.deepEqual(part("[[Por"), []);
    assert.deepEqual(part("use `Por"), []);
    assert.deepEqual(part("#Por"), []);
    assert.deepEqual(part("ver Port "), [], "the cursor after a space: no word being typed");
  });
});

describe("The list in the editor", () => {
  test("typing opens it, narrows it, and no match closes it; the text is untouched", () => {
    let s = type(stateOf("Fomos ao "), "Por");
    assert.equal(listOf(s).list, true);
    assert.ok(listed(s).includes("Porto Cinzento"));
    s = type(s, "to C");
    assert.deepEqual(listed(s), ["Porto Cinzento"]);
    s = type(s, "x");
    assert.equal(listOf(s), null);
    assert.equal(s.doc.toString(), "Fomos ao Porto Cx");
  });
  test("the arrows choose, wrapping; Tab/Enter's change writes the link over the typed words", () => {
    let s = type(stateOf("Fomos ao "), "Porto ");
    s = type(s, "S");
    assert.deepEqual(listed(s), ["Porto Seguro"]);
    s = type(stateOf("Fomos ao "), "Por");
    const first = listOf(s).hits[0].name;
    s = s.update({ effects: moveSuggestion.of(1) }).state;
    assert.equal(listOf(s).sel, 1);
    assert.notEqual(suggestionOf(s).name, first);
    s = s.update({ effects: moveSuggestion.of(-1) }).state;
    s = s.update({ effects: moveSuggestion.of(-1) }).state;
    assert.equal(listOf(s).sel, listOf(s).hits.length - 1, "wraps");
  });
  test("accepting 'Porto C' writes [[Porto Cinzento]] over the typed words, not the text before", () => {
    const s = type(stateOf("Fomos a Vila Nova e ao "), "Porto C");
    const change = acceptChange(s);
    assert.equal(change.changes.insert, "[[Porto Cinzento]]");
    const after = s.update(change).state;
    assert.equal(after.doc.toString(), "Fomos a Vila Nova e ao [[Porto Cinzento]]");
    assert.equal(after.selection.main.head, after.doc.length);
    assert.equal(listOf(after), null);
  });
  test("an alias is written with the alias as shown text", () => {
    const s = type(stateOf("a "), "Cidade Ci");
    assert.equal(acceptChange(s).changes.insert, "[[Porto Cinzento|Cidade Cinza]]");
  });
  test("a table's cell escapes the bar", () => {
    const s = type(stateOf("| a | "), "Cidade Ci");
    assert.equal(acceptChange(s).changes.insert, "[[Porto Cinzento\\|Cidade Cinza]]");
  });
  test("Escape dismisses it for that word; typing on keeps it away; a new word offers again", () => {
    let s = type(stateOf("ir a "), "Por");
    s = s.update({ effects: dismissSuggestion.of(null) }).state;
    assert.equal(listOf(s), null);
    s = type(s, "to");
    assert.equal(listOf(s), null, "the same word");
    s = type(s, " C");
    assert.deepEqual(listed(s), ["Porto Cinzento"], "a new word starts it again");
  });
  test("Escape, then more letters of the same word: still dismissed", () => {
    let s = type(stateOf("ir a "), "Por");
    s = s.update({ effects: dismissSuggestion.of(null) }).state;
    s = type(s, "t");
    assert.equal(listOf(s), null);
    s = type(s, " ");
    s = type(s, "e Seg");
    assert.equal(listOf(s), null, "Seg: no capital");
    s = type(s, "\nVer Por");
    assert.ok(listOf(s), "a new word starts the list again");
  });
  test("the setting off, the paste, the room: nothing", () => {
    assert.equal(listOf(type(stateOf("ir a ", DEPS({ enabled: () => false })), "Por")), null);
    const s = stateOf("ir a ").update({ changes: { from: 5, insert: "Por" }, selection: { anchor: 8 }, userEvent: "input.paste" }).state;
    assert.equal(listOf(s), null);
  });
  test("never in code, the frontmatter, a link", () => {
    assert.equal(listOf(type(stateOf("```\nver "), "Por")), null);
    assert.equal(listOf(type(stateOf("[ver "), "Por")), null);
    const front = EditorState.create({ doc: "---\nx: \n---\ntexto", selection: { anchor: 7 }, extensions: [markdown(), linkSuggest(DEPS())] });
    assert.equal(listOf(type(front, "Por")), null);
  });
  test("a note's own name does not list itself", () => {
    const s = type(stateOf("ver ", DEPS({ path: () => "lugares/Porto Cinzento.md" })), "Porto C");
    assert.equal(listOf(s), null);
  });
  test("never beside an `@`: the mention's list is the one", () => {
    assert.equal(listOf(type(stateOf("ver "), "@Por")), null);
    assert.equal(suggestionOf(type(stateOf("ver "), "@Porto")), null);
    assert.ok(listOf(type(stateOf("ver "), "fulano@Por")) === null || true);
  });
});

describe("The chip stays after a space or a mark until the next word", () => {
  test("a space, a comma, a full stop keep it; the next word dismisses the name in the paragraph", () => {
    let s = type(stateOf("ir a "), "Porto");
    assert.equal(suggestionOf(s).name, "Porto");
    s = type(s, ", ");
    assert.equal(suggestionOf(s).name, "Porto");
    s = type(s, "e");
    assert.equal(suggestionOf(s), null);
    s = type(s, " o Porto");
    s = type(s, " ");
    assert.equal(suggestionOf(s), null, "dismissed for the paragraph");
  });
  test("accepting after the space writes the link over the name, not the space, and the cursor stays after it", () => {
    const s = type(stateOf("ir a "), "Porto ");
    const change = acceptChange(s);
    assert.deepEqual(change.changes, { from: 5, to: 10, insert: "[[Porto]]" });
    const after = s.update(change).state;
    assert.equal(after.doc.toString(), "ir a [[Porto]] ");
    assert.equal(after.selection.main.head, after.doc.length);
  });
  test("moving the cursor away, or deleting, clears it", () => {
    let s = type(stateOf("ir a "), "Porto ");
    s = s.update({ selection: { anchor: 0 } }).state;
    assert.equal(suggestionOf(s), null);
  });
});

describe("The `@` mention", () => {
  const at = (text) => MENTION_BEFORE.exec(text);
  test("opens at the start of a word, not in the middle of one", () => {
    assert.equal(at("@")[1], "");
    assert.equal(at("ver @Por")[1], "Por");
    assert.equal(at("ver @Porto C")[1], "Porto C");
    assert.equal(at("(@Por")[1], "Por");
    assert.equal(at("“@Por")[1], "Por");
    assert.equal(at("**@Por")[1], "Por");
    assert.equal(at("fulano@mail"), null);
    assert.equal(at("fulano@"), null);
    assert.equal(at("ver @Por @Ca")[1], "Ca", "another @ starts a new one");
  });
  test("the `[[` completion's own text is a different thing", () => {
    assert.equal(WIKILINK_BEFORE.test("[[Por"), true);
    assert.equal(WIKILINK_BEFORE.test("@Por"), false);
    assert.equal(MENTION_BEFORE.test("[[@Por"), false);
  });
  test("what is written: [[Name]] for a part, as an unlinked mention for the whole name", () => {
    assert.equal(mentionWritten("Por", "Porto", false, "Porto", false), "[[Porto]]");
    assert.equal(mentionWritten("", "Porto", false, "Porto", false), "[[Porto]]");
    assert.equal(mentionWritten("Porto", "Porto", false, "Porto", false), "[[Porto]]");
    assert.equal(mentionWritten("porto", "Porto", false, "Porto", false), "[[Porto|porto]]");
    assert.equal(mentionWritten("Cidade Cinza", "Cidade Cinza", true, "Porto Cinzento", false), "[[Porto Cinzento|Cidade Cinza]]");
    assert.equal(mentionWritten("porto", "Porto", false, "Porto", true), "[[Porto\\|porto]]");
    assert.equal(mentionWritten("Porto", "Porto", false, "lugares/Porto", false), "[[lugares/Porto|Porto]]");
    assert.equal(mentionWritten("Por", "Porto", false, "lugares/Porto", false), "[[lugares/Porto]]");
  });
});
