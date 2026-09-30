// The board's pure parts (ADR 0057): the way between a canvas and
// Excalidraw's elements, a typed relation written into a note, and the
// reading of a drawing of the Excalidraw plugin.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import LZString from "lz-string";

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/board/model"; export * from "./src/board/relation"; export * from "./src/board/convert"; export * from "./src/board/export";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "dist/board.test-bundle.mjs",
  logLevel: "error",
});
const b = await import("../dist/board.test-bundle.mjs");

/** Elements as Excalidraw would hold them after `restoreElements`: the
 *  partial ones, with what the board reads. */
const restored = (doc) => b.toElements(doc).map((e) => ({ isDeleted: false, ...e }));

const OBSIDIAN = {
  nodes: [
    { id: "a", x: -417, y: -304, width: 400, height: 400, type: "file", file: "Escudo/Painel.md", "verso-extra": 1 },
    { id: "t", x: 40, y: -304, width: 250, height: 60, type: "text", text: "ver [[Barão]]", color: "4" },
    { id: "g", x: -500, y: -400, width: 1000, height: 700, type: "group", label: "Mesa" },
  ],
  edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "t", toSide: "left", label: "liga", "x-extra": true }],
};

describe("canvas ↔ elements", () => {
  test("a canvas comes back unchanged when nothing moved", () => {
    const back = b.fromElements(restored(OBSIDIAN), OBSIDIAN);
    assert.deepEqual(back.nodes, OBSIDIAN.nodes);
    assert.deepEqual(back.edges, OBSIDIAN.edges);
    assert.equal("verso" in back, false, "no key the file did not have");
  });

  test("a node keeps its unknown fields and its key order when moved", () => {
    const els = restored(OBSIDIAN).map((e) => (e.id === "a" ? { ...e, x: 10.6, y: 20.2 } : e));
    const node = b.fromElements(els, OBSIDIAN).nodes[0];
    assert.deepEqual(Object.keys(node), Object.keys(OBSIDIAN.nodes[0]));
    assert.equal(node.x, 11);
    assert.equal(node["verso-extra"], 1);
  });

  test("edges pass under the cards, the drawing over them", () => {
    const doc = { ...OBSIDIAN, verso: { version: 1, drawing: [{ id: "d", type: "ellipse", x: 0, y: 0, width: 9, height: 9 }] } };
    const ids = restored(doc).map((e) => e.id);
    assert.ok(ids.indexOf("e") < ids.indexOf("a") && ids.indexOf("e-label") < ids.indexOf("a"), "edge and label first");
    assert.deepEqual(ids.filter((id) => ["a", "t", "g"].includes(id)), ["a", "t", "g"], "nodes in the file's order");
    assert.equal(ids.at(-1), "d", "drawing last");
  });

  test("a node's file is found in the folder whatever the Unicode form", () => {
    const nfd = "Escudo/Caça\u0303o.md".normalize("NFD");
    const nfc = nfd.normalize("NFC");
    assert.notEqual(nfc, nfd);
    assert.equal(b.listedPath(nfc, [[nfd, "Outra.md"], []]), nfd, "the name the folder lists");
    assert.equal(b.listedPath("Outra.md", [["Outra.md"]]), "Outra.md");
    assert.equal(b.listedPath("Nada.md", [["Outra.md"], ["img.png"]]), undefined);
    assert.equal(b.linkTo(nfc, [nfd, "Outro/" + nfc]), `[[${nfc.replace(/\.md$/, "")}]]`, "two of one name are two, in any form");
  });

  test("the board's background is kept under verso, and only when it has one", () => {
    assert.equal(b.backgroundOf(OBSIDIAN), null);
    const none = b.fromElements(restored(OBSIDIAN), OBSIDIAN, "transparent");
    assert.equal("verso" in none, false, "no background, no key");
    const set = b.fromElements(restored(OBSIDIAN), OBSIDIAN, "#ffec99");
    assert.equal(set.verso.background, "#ffec99");
    assert.equal(b.backgroundOf(set), "#ffec99");
    const back = b.fromElements(restored(set), set, "transparent");
    assert.equal("background" in back.verso, false, "taken off when set back to none");
    assert.equal(b.backgroundOf({ verso: { background: "url(x)" } }), null, "only a colour");
  });

  test("a card's own background is kept on its node, under verso", () => {
    const els = restored(OBSIDIAN);
    assert.equal(els.find((e) => e.id === "a").backgroundColor, b.CARD_PAPER, "none: the paper");
    const coloured = els.map((e) => (e.id === "a" ? { ...e, backgroundColor: "#ffc9c9" } : e));
    const saved = b.fromElements(coloured, OBSIDIAN);
    const node = saved.nodes.find((n) => n.id === "a");
    assert.deepEqual(node.verso, { background: "#ffc9c9" });
    assert.equal(node["verso-extra"], 1, "its other fields kept");
    assert.equal(restored(saved).find((e) => e.id === "a").backgroundColor, "#ffc9c9", "read back");
    const back = b.fromElements(restored(saved).map((e) => (e.id === "a" ? { ...e, backgroundColor: "transparent" } : e)), saved);
    assert.equal("verso" in back.nodes.find((n) => n.id === "a"), false, "taken off when set back to none");
    assert.deepEqual(b.fromElements(restored(OBSIDIAN), OBSIDIAN).nodes, OBSIDIAN.nodes, "untouched cards write nothing new");
  });

  test("groups are frames; a node inside a group is in its frame", () => {
    const els = restored(OBSIDIAN);
    assert.equal(els.find((e) => e.id === "g").type, "frame");
    assert.equal(els.find((e) => e.id === "a").frameId, "g");
  });

  test("an arrow bound to two nodes is an edge; any other is drawing", () => {
    const free = { id: "f", type: "arrow", x: 0, y: 0, width: 5, height: 5, points: [[0, 0], [5, 5]], startBinding: null, endBinding: null, strokeColor: "#1e1e1e" };
    const back = b.fromElements([...restored(OBSIDIAN), free], OBSIDIAN);
    assert.equal(back.edges.length, 1);
    assert.deepEqual(back.verso.drawing.map((d) => d.id), ["f"]);
  });

  test("an edge drawn with Excalidraw's default stroke has no color", () => {
    const doc = { nodes: OBSIDIAN.nodes, edges: [] };
    const arrow = { id: "n", type: "arrow", x: -17, y: -104, width: 57, height: 1, points: [[0, 0], [57, 0]], startBinding: { elementId: "a" }, endBinding: { elementId: "t" }, strokeColor: "#1e1e1e", endArrowhead: "arrow" };
    const edge = b.fromElements([...restored(doc), arrow], doc).edges[0];
    assert.deepEqual(edge, { id: "n", fromNode: "a", toNode: "t", fromSide: "right", toSide: "left" });
  });

  test("the outline lists groups, cards, edges and, apart, the drawing's texts", () => {
    const note = { id: "x", type: "text", x: 900, y: 900, width: 10, height: 10, text: "nota solta" };
    const o = b.outlineOf([...restored(OBSIDIAN), note], { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: (a, c, l) => `${a} → ${c} (${l})` });
    assert.equal(o.groups[0].group.label, "Mesa");
    assert.deepEqual(o.groups[0].items.map((i) => i.label), ["Painel", "ver [[Barão]]"]);
    assert.deepEqual(o.edges.map((e) => e.label), ["Painel → ver [[Barão]] (liga)"]);
    assert.deepEqual(o.annotations.map((e) => e.label), ["nota solta"]);
  });

  test("a text card is named by its first line, without Markdown marks", () => {
    const s = { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo" };
    assert.equal(b.nodeName({ id: "t", type: "text", text: "\n## **Gancho**\nmais", x: 0, y: 0, width: 1, height: 1 }, s), "Gancho");
    assert.equal(b.nodeName({ id: "t", type: "text", text: "", x: 0, y: 0, width: 1, height: 1 }, s), "Texto");
  });

  test("an arrow between two notes can be promoted; to a text card it cannot", () => {
    const els = restored({ nodes: [...OBSIDIAN.nodes, { id: "n2", type: "file", file: "B.md", x: 0, y: 0, width: 1, height: 1 }], edges: [] });
    const arrow = (to) => ({ id: "r", type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: to } });
    assert.deepEqual(b.relationEnds(arrow("n2"), els), { from: "Escudo/Painel.md", to: "B.md" });
    assert.equal(b.relationEnds(arrow("t"), els), null);
  });
});

describe("a typed relation in the frontmatter (spec Q10)", () => {
  test("a new key holds one quoted link", () => {
    assert.equal(b.withRelation("# A\n", "aliado", "[[B]]"), '---\naliado: "[[B]]"\n---\n# A\n');
  });
  test("a list gains the link", () => {
    assert.equal(b.withRelation('---\ninimigos:\n  - "[[A]]"\n---\n', "inimigos", "[[B]]"), '---\ninimigos:\n  - "[[A]]"\n  - "[[B]]"\n---\n');
  });
  test("one value becomes a list of the two", () => {
    assert.equal(b.withRelation('---\naliado: "[[A]]"\nx: 1\n---\n', "aliado", "[[B]]"), '---\nx: 1\naliado:\n  - "[[A]]"\n  - "[[B]]"\n---\n');
  });
  test("a relation already there changes nothing", () => {
    const doc = '---\naliado: "[[B]]"\n---\n';
    assert.equal(b.withRelation(doc, "aliado", "[[B]]"), doc);
  });
  test("the link is the bare name unless another note has it", () => {
    assert.equal(b.linkTo("npcs/Barão.md", ["npcs/Barão.md", "Taverna.md"]), "[[Barão]]");
    assert.equal(b.linkTo("npcs/Barão.md", ["npcs/Barão.md", "outros/Barão.md"]), "[[npcs/Barão]]");
  });
  test("a key a relation cannot have is refused", () => {
    for (const bad of ["", "a:b", "#x", "- y"]) assert.equal(b.relationKeyOk(bad), false, bad);
    assert.equal(b.relationKeyOk("aliado"), true);
  });
});

describe("a drawing of the Excalidraw plugin (ADR 0057 point 5)", () => {
  const scene = {
    type: "excalidraw",
    elements: [
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
      { id: "i1", type: "image", fileId: "abcdef0123", x: 5.4, y: 6.6, width: 100, height: 50 },
      { id: "i2", type: "image", fileId: "ffffffffff", x: 0, y: 0, width: 1, height: 1 },
      { id: "d", type: "text", isDeleted: true },
    ],
  };
  const note = (block) => `---\n\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Text Elements\nx ^a\n\n## Embedded Files\nabcdef0123: [[mapa.png]]\n\n%%\n## Drawing\n${block}\n%%`;

  test("a compressed drawing: images with a file become file nodes", () => {
    const text = note("```compressed-json\n" + LZString.compressToBase64(JSON.stringify(scene)).replace(/(.{64})/g, "$1\n") + "\n```");
    const read = b.readDrawing(text);
    assert.ok("drawing" in read);
    const { doc, dropped } = b.toBoard(read.drawing, (t) => (t === "mapa.png" ? "anexos/mapa.png" : null));
    assert.deepEqual(doc.nodes, [{ id: "i1", type: "file", file: "anexos/mapa.png", x: 5, y: 7, width: 100, height: 50 }]);
    assert.deepEqual(doc.verso.drawing.map((e) => e.id), ["r1"]);
    assert.equal(dropped, 1);
  });

  test("a plain JSON drawing reads too; a note without one does not", () => {
    assert.ok("drawing" in b.readDrawing(note("```json\n" + JSON.stringify(scene) + "\n```")));
    assert.deepEqual(b.readDrawing("# Só uma nota\n"), { error: "not-drawing" });
    assert.deepEqual(b.readDrawing(note("```compressed-json\n!!!\n```")), { error: "unreadable" });
  });

  test("the board goes beside the drawing", () => {
    assert.equal(b.boardPathFor("t/Plano.excalidraw.md"), "t/Plano.canvas");
    assert.equal(b.boardPathFor("t/Plano.md"), "t/Plano.canvas");
  });
});

describe("the board as a picture", () => {
  test("a note reads as plain lines", () => {
    const md = "---\ntipo: pdm\n---\n# Barão\nVive no **castelo**, ver [[Lugares/Castelo|o castelo]] e [[Zefa]].\n![[mapa.png]]\n- [ ] investigar\n- item\n\n\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    assert.equal(b.plainOf(md), "Barão\nVive no castelo, ver o castelo e Zefa.\n\n☐ investigar\n• item\n\na   b\n1   2");
  });

  test("a callout reads by its title, without its mark", () => {
    assert.equal(b.plainOf("> [!warning] Segredo do mestre\n> O barão está nas catacumbas."), "Segredo do mestre\nO barão está nas catacumbas.");
  });

  test("lines wrap to the width and end in an ellipsis when cut", () => {
    const m = (s) => s.length;
    assert.deepEqual(b.wrapLines("um dois tres quatro", 8, 5, m), ["um dois", "tres", "quatro"]);
    assert.deepEqual(b.wrapLines("um dois tres quatro", 8, 2, m), ["um dois", "tres…"]);
    assert.deepEqual(b.wrapLines("abcdefghijkl", 5, 5, m), ["abcde", "fghij", "kl"]);
  });
});
