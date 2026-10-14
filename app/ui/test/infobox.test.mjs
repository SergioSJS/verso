// The infobox (ADR 0086): a typed note's `link` and `image` properties,
// and the properties panel laid out as a card when its schema says
// `layout: infobox`. The same rows and the same writes as the panel: an
// edit in the card is one change to the key's lines; a web picture is not
// fetched from an origin the person did not approve.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&") };
globalThis.HTMLElement = win.HTMLElement;
globalThis.localStorage = win.localStorage;

await esbuild.build({
  stdin: {
    contents: `export * from "./src/infobox.ts";
export { PropertiesView, propertyChange } from "./src/props.ts";
export { allowEmbedOrigins, allowRemoteContent, configureEmbeds } from "./src/sanitize.ts";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/infobox.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/infobox.test-bundle.mjs");

const picture = {
  pictureOrigin: (o) => `origin ${o}`,
  pictureRemote: "remote off",
  approve: (o) => `approve ${o}`,
  approveFailed: "approve failed",
  load: "load",
  pictureMissing: (t) => `missing ${t}`,
};
const typed = {
  type: (l) => `Type: ${l}`,
  openSchema: "Open the schema",
  conflict: () => "",
  invalid: () => "",
  misfit: (k) => `Not a ${k}`,
  kinds: {},
  errors: {},
  picture,
  unresolved: "No such note",
  addLink: "Add a link",
  others: (n) => `Other properties (${n})`,
  more: (n) => `Show every property (${n})`,
  less: "Show less",
};
const strings = { addProperty: "Add", keyPlaceholder: "key", emptyValue: "Empty", addItem: "Add item", remove: "Remove", fixed: "fixed", open: "Open", propertiesTitle: "Properties", typed };

const decl = (key, kind, fits = true, present = true) => ({ key, kind, labels: [], present, fits });
function noteType(layout, properties) {
  return { written: "npc", state: { kind: "typed", schema: "PdM.md", name: "npc", labels: [{ lang: "en", text: "NPC" }], properties, layout } };
}

describe("a link and a picture, as the panel reads them", () => {
  test("a wikilink's target and alias; anything else is no link", () => {
    assert.deepEqual(m.linkParts("[[Barão#Casa|o barão]]"), { target: "Barão#Casa", alias: "o barão" });
    assert.deepEqual(m.linkParts(" [[Barão]] "), { target: "Barão", alias: null });
    assert.equal(m.linkParts("Barão"), null);
    assert.equal(m.linkParts("[[A]] e [[B]]"), null);
  });
  test("what is typed in a link's field is written as a link", () => {
    assert.equal(m.asLink("Barão"), "[[Barão]]");
    assert.equal(m.asLink("[[Barão|b]]"), "[[Barão|b]]");
    assert.equal(m.asLink("[[Barão"), "[[Barão]]");
    assert.equal(m.asLink("  "), "");
  });
  test("a picture is the folder's (its alias the alternative text) or the web's", () => {
    assert.deepEqual(m.pictureSource('[[roderick.jpg|Lorde Roderick]]'), { kind: "folder", target: "roderick.jpg", alt: "Lorde Roderick" });
    assert.deepEqual(m.pictureSource("assets/r.png"), { kind: "folder", target: "assets/r.png", alt: null });
    assert.deepEqual(m.pictureSource("https://img.example/r.png"), { kind: "web", url: "https://img.example/r.png" });
    assert.equal(m.pictureSource(" "), null);
  });
});

describe("a web picture loads only from an approved origin (ADR 0086 item 1)", () => {
  const host = (said = []) => ({ strings: picture, resolve: async () => null, title: "Roderick", status: (s) => said.push(s) });
  beforeEach(() => {
    m.allowEmbedOrigins([]);
    m.allowRemoteContent(true);
  });
  test("not approved: the address as text, why, and a way to approve it — nothing fetched", () => {
    const node = m.pictureNode("https://img.example/r.png", host());
    assert.equal(node.querySelector("img"), null);
    assert.equal(node.tagName, "SPAN");
    assert.equal(node.querySelector(".prop-picture-address").textContent, "https://img.example/r.png");
    assert.equal(node.querySelector(".prop-picture-why").textContent, "origin https://img.example");
    assert.equal(node.querySelector("button").textContent, "approve https://img.example");
  });
  test("approved: shown, with no referrer", () => {
    m.allowEmbedOrigins(["https://img.example"]);
    const node = m.pictureNode("https://img.example/r.png", host());
    assert.equal(node.tagName, "IMG");
    assert.equal(node.getAttribute("src"), "https://img.example/r.png");
    assert.equal(node.referrerPolicy, "no-referrer");
    assert.equal(node.alt, "Roderick");
  });
  test("approved but remote content off: held, with a button that loads it", () => {
    m.allowEmbedOrigins(["https://img.example"]);
    m.allowRemoteContent(false);
    const node = m.pictureNode("https://img.example/r.png", host());
    assert.equal(node.querySelector("img"), null);
    assert.equal(node.querySelector(".prop-picture-why").textContent, "remote off");
  });
  test("approving with nothing to keep it says so and loads nothing", async () => {
    const said = [];
    const holder = document.createElement("div");
    const node = m.pictureNode("https://img.example/r.png", host(said));
    holder.append(node);
    node.querySelector("button").click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(said, ["approve failed"]);
    assert.equal(holder.querySelector("img"), null);
  });
  test("approving keeps the origin and shows the picture", async () => {
    let kept = "";
    m.configureEmbeds({ strings: {}, approve: async (o) => ((kept = o), true) });
    const holder = document.createElement("div");
    const node = m.pictureNode("https://img.example/r.png", host());
    holder.append(node);
    node.querySelector("button").click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(kept, "https://img.example");
    assert.equal(holder.querySelector("img").getAttribute("src"), "https://img.example/r.png");
  });
});

const TEXT = '---\ntype: npc\nretrato: "[[roderick.jpg|Lorde Roderick]]"\naliados:\n  - "[[Barão]]"\nnível: 3\nfacção: Coroa\nhumor: azedo\n---\n# Roderick\n';
const ITEMS = [
  { key: "type", value: { kind: "text", value: "npc" } },
  { key: "retrato", value: { kind: "text", value: "[[roderick.jpg|Lorde Roderick]]" } },
  { key: "aliados", value: { kind: "list", value: ["[[Barão]]"] } },
  { key: "nível", value: { kind: "number", value: "3" } },
  { key: "facção", value: { kind: "text", value: "Coroa" } },
  { key: "humor", value: { kind: "text", value: "azedo" } },
];
const DECLARED = [decl("retrato", "image"), decl("aliados", "link"), decl("nível", "number"), decl("facção", "text"), decl("mestre", "link", false, false)];

function panel(layout) {
  let doc = TEXT;
  const followed = [];
  const changes = [];
  const sheet = document.createElement("div");
  const view = new m.PropertiesView({
    strings,
    lang: "en",
    doc: () => doc,
    apply: (c) => {
      changes.push(c);
      doc = doc.slice(0, c.from) + c.insert + doc.slice(c.to);
    },
    refused: () => {},
    onTag: () => {},
    onFollow: (t) => followed.push(t),
    resolveLink: (t) => (t === "Barão" ? "Barão.md" : null),
    picture: async (t) => (t === "roderick.jpg" ? "verso://roderick.jpg" : null),
    title: () => "Roderick",
    suggest: () => [{ value: "[[Barão]]", label: "Barão.md" }],
  });
  sheet.append(view.el);
  document.body.append(sheet);
  view.render(ITEMS, TEXT, false, noteType(layout, DECLARED));
  return { view, sheet, followed, changes, doc: () => doc };
}

describe("the infobox (ADR 0086 items 2, 3 and 6)", () => {
  test("no layout: the strip as it was", () => {
    const { view, sheet } = panel(null);
    assert.equal(view.el.classList.contains("infobox"), false);
    assert.equal(sheet.classList.contains("with-infobox"), false);
    assert.equal(view.el.getAttribute("role"), null);
    assert.ok(view.el.querySelector(".props-header"));
  });
  test("a complementary region named after the note: picture, type, declared rows, others folded", async () => {
    const { view, sheet } = panel("infobox");
    assert.ok(view.el.classList.contains("infobox"));
    assert.ok(sheet.classList.contains("with-infobox"));
    assert.equal(view.el.getAttribute("role"), "complementary");
    assert.equal(view.el.getAttribute("aria-label"), "Roderick");
    const order = [...view.el.children].map((e) => e.className.split(" ")[0]);
    assert.deepEqual(order, ["ib-picture", "props-type", "prop", "prop", "prop", "ib-expand", "prop", "prop", "ib-others", "prop-new"]);
    const keys = [...view.el.querySelectorAll(":scope > .prop")].map((e) => e.dataset.key);
    assert.deepEqual(keys, ["retrato", "aliados", "nível", "facção", "mestre"]);
    // The alternative text is the wikilink's alias.
    const img = view.el.querySelector(".ib-picture img");
    assert.equal(img.alt, "Lorde Roderick");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(img.getAttribute("src"), "verso://roderick.jpg");
    // The other keys, folded below.
    const others = view.el.querySelector("details.ib-others");
    assert.equal(others.querySelector("summary").textContent, "Other properties (2)");
    assert.deepEqual([...others.querySelectorAll(".prop")].map((e) => e.dataset.key), ["type", "humor"]);
    // Rows after the first three are what the narrow card folds.
    assert.deepEqual([...view.el.querySelectorAll(":scope > .ib-more")].map((e) => e.dataset.key ?? e.className), ["facção", "mestre", "ib-others ib-more", "prop-new ib-more"]);
  });
  test("the narrow card's button shows every property, and says so", () => {
    const { view } = panel("infobox");
    const toggle = view.el.querySelector(".ib-expand");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.textContent, "Show every property (7)");
    toggle.click();
    assert.ok(view.el.classList.contains("expanded"));
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(toggle.textContent, "Show less");
  });
  test("a link is followed; an unresolved one is said; a misfit is shown as written", () => {
    const { view, followed } = panel("infobox");
    const link = view.el.querySelector('.prop[data-key="aliados"] a.wikilink');
    assert.equal(link.textContent, "Barão");
    assert.equal(link.dataset.target, "Barão");
    link.click();
    assert.deepEqual(followed, ["Barão"]);
    // The absent declared link: a field offering the folder's notes.
    const absent = view.el.querySelector('.prop.absent[data-key="mestre"] input');
    assert.ok(absent.getAttribute("list"));
  });
  test("an edit in the card is the panel's: one change to the key's lines", () => {
    const { view, doc, changes } = panel("infobox");
    const add = view.el.querySelector('.prop[data-key="aliados"] .prop-add');
    add.value = "Irmã Cinza";
    add.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(changes.length, 1);
    assert.equal(doc(), TEXT.replace('  - "[[Barão]]"\n', '  - "[[Barão]]"\n  - "[[Irmã Cinza]]"\n'));
  });
  test("a link edited in the card that changed in the text meanwhile is refused", () => {
    let refused = "";
    let doc = TEXT;
    const view = new m.PropertiesView({ strings, lang: "en", doc: () => doc, apply: () => assert.fail("no write"), refused: (w) => (refused = w), onTag: () => {} });
    document.body.append(view.el);
    view.render(ITEMS, TEXT, false, noteType("infobox", DECLARED));
    doc = TEXT.replace('  - "[[Barão]]"', '  - "[[Duque]]"');
    view.el.querySelector('.prop[data-key="aliados"] .pill-x').click();
    assert.equal(refused, "changed");
  });
});
