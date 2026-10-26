// The board's pure parts (ADR 0057): the way between a canvas and
// Excalidraw's elements, a typed relation written into a note, and the
// reading of a drawing of the Excalidraw plugin.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import LZString from "lz-string";
import { readFileSync } from "node:fs";

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/board/model"; export * from "./src/board/relation"; export * from "./src/board/convert"; export * from "./src/board/export";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/board.test-bundle.mjs",
  logLevel: "error",
});
const b = await import("./.bundles/board.test-bundle.mjs");

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

  // Decided on 2026-10-01, review `board.md` §6 item 5: a save changes only
  // what the user changed.
  test("a fraction where the file put it stays; a card moved is written whole", () => {
    const doc = { nodes: [{ id: "a", x: -417.5, y: 10.25, width: 250.5, height: 60, type: "text", text: "a" }, { id: "b", x: 0, y: 0, width: 9, height: 9, type: "text", text: "b" }] };
    const els = restored(doc).map((e) => (e.id === "b" ? { ...e, x: 30.4 } : e));
    const back = b.fromElements(els, doc).nodes;
    assert.deepEqual([back[0].x, back[0].y, back[0].width], [-417.5, 10.25, 250.5]);
    assert.equal(back[1].x, 30);
  });

  test("an edge keeps its sides while its ends stay on their cards, and gains none", () => {
    const doc = {
      nodes: [{ id: "t", x: 0, y: 0, width: 100, height: 50, type: "text", text: "t" }, { id: "o", x: 0, y: 300, width: 100, height: 50, type: "text", text: "o" }],
      edges: [{ id: "e2", fromNode: "t", fromSide: "bottom", toNode: "o", toSide: "top" }, { id: "e3", fromNode: "t", toNode: "o" }],
    };
    const els = restored(doc).map((e) => (e.id === "o" ? { ...e, x: 400, y: 0 } : e));
    const edges = b.fromElements(els, doc).edges;
    assert.deepEqual([edges[0].fromSide, edges[0].toSide], ["bottom", "top"]);
    assert.equal("fromSide" in edges[1] || "toSide" in edges[1], false);
  });

  test("what the board cannot draw goes back where it was", () => {
    const doc = {
      nodes: [{ id: "a", x: 0, y: 0, width: 9, height: 9, type: "text", text: "a" }, { type: "text", text: "no id" }],
      edges: [{ id: "x", fromNode: "a", toNode: "nobody" }, { id: "y", fromNode: "a", toNode: "a", label: "" }],
    };
    const back = b.fromElements(restored(doc), doc);
    assert.deepEqual(back.nodes, doc.nodes);
    assert.deepEqual(back.edges, doc.edges);
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

  test("a card's fill is kept beside its colour, solid by default", () => {
    const els = restored(OBSIDIAN).map((e) => (e.id === "a" ? { ...e, backgroundColor: "#a5d8ff", fillStyle: "hachure" } : e));
    const saved = b.fromElements(els, OBSIDIAN);
    assert.deepEqual(saved.nodes.find((n) => n.id === "a").verso, { background: "#a5d8ff", fill: "hachure" });
    assert.equal(restored(saved).find((e) => e.id === "a").fillStyle, "hachure", "read back");
    const solid = b.fromElements(restored(saved).map((e) => (e.id === "a" ? { ...e, fillStyle: "solid" } : e)), saved);
    assert.deepEqual(solid.nodes.find((n) => n.id === "a").verso, { background: "#a5d8ff" }, "solid is not written");
  });

  test("a card's style from the panel is kept under its verso, and only what is not the default", () => {
    const styled = restored(OBSIDIAN).map((e) =>
      e.id === "a"
        ? { ...e, roundness: null, strokeWidth: 4, strokeStyle: "dashed", roughness: 2, opacity: 60, angle: 0.5, locked: true, groupIds: ["g1"] }
        : e,
    );
    const saved = b.fromElements(styled, OBSIDIAN);
    const node = saved.nodes.find((n) => n.id === "a");
    assert.deepEqual(node.verso, { corners: "sharp", strokeWidth: 4, roughness: 2, angle: 0.5, strokeStyle: "dashed", opacity: 60, locked: true, groups: ["g1"] });
    const back = restored(saved).find((e) => e.id === "a");
    for (const [k, v] of Object.entries({ roundness: null, strokeWidth: 4, strokeStyle: "dashed", roughness: 2, opacity: 60, angle: 0.5, locked: true })) assert.deepEqual(back[k], v, k);
    assert.deepEqual(back.groupIds, ["g1"]);
    // The defaults as Excalidraw's restore fills them in write nothing.
    const plain = restored(OBSIDIAN).map((e) => (e.id === "a" ? { ...e, strokeStyle: "solid", opacity: 100, angle: 0, locked: false, groupIds: [] } : e));
    assert.deepEqual(b.fromElements(plain, OBSIDIAN).nodes, OBSIDIAN.nodes);
  });

  test("an edge keeps its kind of line, heads, bends and label size", () => {
    const doc = { ...OBSIDIAN, edges: [{ ...OBSIDIAN.edges[0], fromEnd: "arrow" }] };
    const els = restored(doc).map((e) => {
      if (e.id === "e") return { ...e, roundness: { type: 2 }, startArrowhead: "dot", endArrowhead: "triangle", strokeWidth: 2, roughness: 0, points: [[0, 0], [100, 40], [240, 10]] };
      if (e.id === "e-label") return { ...e, fontSize: 24, fontFamily: 5 };
      return e;
    });
    const edge = b.fromElements(els, doc).edges[0];
    assert.deepEqual(edge.verso, { line: "curved", startHead: "dot", endHead: "triangle", bends: [[100, 40]], labelSize: 24 });
    assert.equal(edge.fromEnd, "arrow");
    assert.equal(edge["x-extra"], true, "its other fields kept");
    const back = restored(b.fromElements(els, doc));
    const arrow = back.find((e) => e.id === "e");
    assert.deepEqual(arrow.roundness, { type: 2 });
    assert.equal(arrow.startArrowhead, "dot");
    assert.equal(arrow.endArrowhead, "triangle");
    assert.deepEqual(arrow.points[1], [100, 40]);
    assert.equal(back.find((e) => e.id === "e-label").fontSize, 24);
  });

  test("an elbow edge comes back bound to points of its cards, along right angles", () => {
    const els = restored(OBSIDIAN).map((e) => (e.id === "e" ? { ...e, elbowed: true, roundness: null } : e));
    const saved = b.fromElements(els, OBSIDIAN);
    assert.deepEqual(saved.edges[0].verso, { line: "elbow" });
    const arrow = restored(saved).find((e) => e.id === "e");
    assert.equal(arrow.elbowed, true);
    assert.deepEqual(arrow.startBinding.fixedPoint, [1, 0.5001], "from the right side");
    assert.deepEqual(arrow.endBinding.fixedPoint, [0, 0.5001], "to the left side");
    for (let i = 1; i < arrow.points.length; i++) {
      const [p, q] = [arrow.points[i - 1], arrow.points[i]];
      assert.ok(p[0] === q[0] || p[1] === q[1], `segment ${i} is straight across or down`);
    }
    assert.deepEqual(b.fromElements(restored(saved), saved).edges[0].verso, { line: "elbow" }, "and stays an edge");
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
    const arrow = { id: "n", type: "arrow", x: -17, y: -104, width: 57, height: 170, points: [[0, 0], [57, -170]], startBinding: { elementId: "a", fixedPoint: [1, 0.5001], mode: "orbit" }, endBinding: { elementId: "t", fixedPoint: [0, 0.5001], mode: "orbit" }, strokeColor: "#1e1e1e", endArrowhead: "arrow" };
    const edge = b.fromElements([...restored(doc), arrow], doc).edges[0];
    assert.deepEqual(edge, { id: "n", fromNode: "a", toNode: "t", fromSide: "right", toSide: "left" });
  });

  test("a new edge's ends take the side nearest their point, and keep the point when it is not a side's middle (ADR 0057 point 20)", () => {
    const left = { x: 0, y: 0, width: 300, height: 200 };
    const right = { x: 700, y: 0, width: 300, height: 200 };
    const below = { x: 50, y: 600, width: 200, height: 100 };
    // An edge with no side in the file meets the side facing the other card.
    assert.deepEqual([b.endSide(left, right), b.endSide(right, left)], ["right", "left"]);
    assert.deepEqual([b.endSide(left, below), b.endSide(below, left)], ["bottom", "top"]);
    const doc = { nodes: [{ id: "a", type: "text", text: "A", ...left }, { id: "c", type: "text", text: "C", ...right }], edges: [] };
    const arrow = { id: "n", type: "arrow", x: 300, y: 60, width: 430, height: 40, points: [[0, 0], [430, 40]], startBinding: { elementId: "a", fixedPoint: [1, 0.3], mode: "orbit" }, endBinding: { elementId: "c", fixedPoint: [0.1, 0.5], mode: "inside" }, strokeColor: "#1e1e1e", endArrowhead: "arrow" };
    const edge = b.fromElements([...restored(doc), arrow], doc).edges[0];
    assert.deepEqual([edge.fromSide, edge.toSide], ["right", "left"]);
    // Bound inside by Excalidraw, an edge's end is on the outline: no "inside" is kept.
    assert.deepEqual(edge.verso, { fromPoint: [1, 0.3], toPoint: [0.1, 0.5] });
    // Read again, each end is bound where it was.
    const back = b.toElements({ ...doc, edges: [edge] }).find((e) => e.id === "n");
    assert.deepEqual([back.startBinding.fixedPoint, back.startBinding.mode], [[1, 0.3], "orbit"]);
    assert.deepEqual([back.endBinding.fixedPoint, back.endBinding.mode], [[0.1, 0.5], "orbit"]);
  });

  test("a card read from the file lists the drawing's arrows bound to it, so they move with it", () => {
    const doc = {
      nodes: [{ id: "p", type: "file", file: "a.png", x: 600, y: 0, width: 300, height: 200 }],
      edges: [],
      verso: { version: 1, drawing: [
        { id: "r", type: "rectangle", x: 0, y: 0, width: 100, height: 100, boundElements: [{ id: "ar", type: "arrow" }] },
        { id: "ar", type: "arrow", x: 50, y: 50, width: 700, height: 50, points: [[0, 0], [700, 50]], startBinding: { elementId: "r", fixedPoint: [0.5, 0.5], mode: "inside" }, endBinding: { elementId: "p", fixedPoint: [0.5, 0.5], mode: "inside" } },
      ] },
    };
    const card = b.toElements(doc).find((e) => e.id === "p");
    assert.deepEqual(card.boundElements, [{ id: "ar", type: "arrow" }]);
  });

  test("an edge's ends left where the file put them write nothing new, a side-less edge included", () => {
    const doc = {
      nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 300, height: 200 }, { id: "c", type: "text", text: "C", x: 700, y: 0, width: 300, height: 200 }],
      edges: [
        { id: "e1", fromNode: "a", fromSide: "bottom", toNode: "c" },
        // A point kept from an earlier save, and an "inside" no edge keeps:
        // read and saved again untouched, the edge is the same.
        { id: "e2", fromNode: "a", fromSide: "right", toNode: "c", toSide: "left", verso: { fromPoint: [1, 0.3], toPoint: [0.1, 0.5], toInside: true } },
      ],
    };
    const els = b.toElements(doc);
    const arrow = els.find((e) => e.id === "e1");
    assert.deepEqual(arrow.startBinding.fixedPoint, [0.5001, 1]);
    assert.deepEqual(arrow.endBinding.fixedPoint, [0, 0.5001]);
    // A card moved: Excalidraw keeps the ends at their points; the file's edge is the same.
    const moved = els.map((e) => (e.id === "c" ? { ...e, y: 400 } : e));
    assert.deepEqual(b.fromElements(moved, doc).edges, doc.edges);
  });

  test("a picture card's crop is kept on its node, under verso, the rest of verso kept", () => {
    const node = { id: "p", type: "file", file: "a.png", x: 0, y: 0, width: 100, height: 100, verso: { background: "#a5d8ff" } };
    const cropped = b.withCrop(node, { x: 0.1, y: 0.2, w: 0.5, h: 0.333333 });
    assert.deepEqual(cropped.verso, { background: "#a5d8ff", crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.3333 } });
    assert.deepEqual(b.cardCrop(cropped), { x: 0.1, y: 0.2, w: 0.5, h: 0.3333 });
    // Taken off, or the whole picture: no crop written; verso's other keys stay.
    assert.deepEqual(b.withCrop(cropped, null).verso, { background: "#a5d8ff" });
    assert.deepEqual(b.withCrop(cropped, { x: 0, y: 0, w: 1, h: 1 }).verso, { background: "#a5d8ff" });
    assert.equal("verso" in b.withCrop({ id: "q", type: "file", file: "a.png" }, null), false);
    // A crop the board cannot draw is none.
    for (const bad of [{ x: 0.8, y: 0, w: 0.5, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }, { x: "a", y: 0, w: 1, h: 1 }]) assert.equal(b.cardCrop({ verso: { crop: bad } }), null);
  });

  test("the outline lists groups, cards, edges and, apart, the drawing's texts", () => {
    const note = { id: "x", type: "text", x: 900, y: 900, width: 10, height: 10, text: "nota solta" };
    const o = b.outlineOf([...restored(OBSIDIAN), note], { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: (a, c, l) => `${a} → ${c} (${l})` });
    assert.equal(o.groups[0].group.label, "Mesa");
    assert.deepEqual(o.groups[0].items.map((i) => i.label), ["Painel", "ver [[Barão]]"]);
    assert.deepEqual(o.edges.map((e) => e.label), ["Painel → ver [[Barão]] (liga)"]);
    assert.deepEqual(o.annotations.map((e) => e.label), ["nota solta"]);
  });

  test("a drawn element under a card keeps its place when the board opens again", () => {
    const doc = {
      nodes: [
        { id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 50 },
        { id: "b", type: "text", text: "B", x: 200, y: 0, width: 100, height: 50 },
      ],
      edges: [],
      verso: {
        version: 1,
        drawing: [
          { id: "low", type: "rectangle", x: 10, y: 10, width: 20, height: 20, under: "b" },
          { id: "top", type: "ellipse", x: 10, y: 10, width: 20, height: 20 },
          { id: "lost", type: "line", x: 0, y: 0, width: 5, height: 5, under: "gone" },
        ],
      },
    };
    const els = restored(doc);
    // Just under its card; over every card without one, or when its card is gone.
    assert.deepEqual(els.map((e) => e.id), ["a", "low", "b", "top", "lost"]);
    assert.equal("under" in els[1], false);
    const saved = b.fromElements(els, doc).verso.drawing;
    assert.deepEqual(saved.map((d) => [d.id, d.under]), [["low", "b"], ["top", undefined], ["lost", undefined]]);
    // Sent to the back of the board: under the first card.
    const back = [els[1], els[0], els[2], els[3], els[4]];
    assert.equal(b.fromElements(back, doc).verso.drawing[0].under, "a");
  });

  test("a drawing over every card is written as it was read", () => {
    const doc = { nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 50 }], edges: [], verso: { version: 1, drawing: [{ id: "d", type: "ellipse", x: 1, y: 1, width: 2, height: 2 }] } };
    const saved = b.fromElements(restored(doc), doc).verso.drawing;
    assert.equal("under" in saved[0], false);
  });

  test("a group renamed on the board is listed by its new name", () => {
    const els = restored(OBSIDIAN).map((e) => (e.type === "frame" ? { ...e, name: "Bancada" } : e));
    const o = b.outlineOf(els, { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: (a, c, l) => `${a} → ${c} (${l})` });
    assert.equal(o.groups[0].group.label, "Bancada");
    // A frame made on the board, never in the file: its name too, or none.
    const fresh = { id: "f2", type: "frame", x: 0, y: 0, width: 10, height: 10, name: null, isDeleted: false };
    assert.equal(b.outlineOf([fresh], { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: () => "" }).groups[0].group.label, "Grupo");
    assert.equal(b.outlineOf([{ ...fresh, name: "Frutas" }], { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: () => "" }).groups[0].group.label, "Frutas");
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
    // In its place: the key no longer moves to the end of the frontmatter.
    assert.equal(b.withRelation('---\naliado: "[[A]]"\nx: 1\n---\n', "aliado", "[[B]]"), '---\naliado:\n  - "[[A]]"\n  - "[[B]]"\nx: 1\n---\n');
    // A note whose only property it is.
    assert.equal(b.withRelation('---\naliado: "[[A]]"\n---\n', "aliado", "[[B]]"), '---\naliado:\n  - "[[A]]"\n  - "[[B]]"\n---\n');
  });
  test("a relation already there changes nothing", () => {
    const doc = '---\naliado: "[[B]]"\n---\n';
    assert.equal(b.withRelation(doc, "aliado", "[[B]]"), doc);
  });
  test("the link is the bare name unless another note has it", () => {
    assert.equal(b.linkTo("npcs/Barão.md", ["npcs/Barão.md", "Taverna.md"]), "[[Barão]]");
    assert.equal(b.linkTo("npcs/Barão.md", ["npcs/Barão.md", "outros/Barão.md"]), "[[npcs/Barão]]");
  });
  test("a name no link can reach gives no link (review board.md, reading 2, finding 9)", () => {
    assert.equal(b.linkTo("A|B.md", ["A|B.md"]), null);
    assert.equal(b.linkTo("C#1.md", ["C#1.md"]), null);
  });
  test("a key written in another case is the same key", () => {
    const doc = '---\nAliado: "[[A]]"\n---\n';
    const after = b.withRelation(doc, "aliado", "[[B]]");
    assert.ok(after.includes("Aliado:"), after);
    assert.ok(!/^aliado:/m.test(after), after);
    assert.ok(after.includes("[[B]]"), after);
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

describe("the file a board writes has the same bytes for the same board", () => {
  test("two equal elements put together in other orders write byte-identical files", () => {
    const base = { nodes: [], edges: [] };
    const one = {
      id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 3, versionNonce: 7,
      boundElements: [{ type: "text", id: "t" }, { type: "arrow", id: "a" }],
      roundness: { type: 3 },
      customData: { canvas: { b: 1, a: { y: 2, x: 1 } } },
    };
    const two = {
      id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 3, versionNonce: 7,
      boundElements: [{ id: "t", type: "text" }, { id: "a", type: "arrow" }],
      roundness: { type: 3 },
      customData: { canvas: { a: { x: 1, y: 2 }, b: 1 } },
    };
    const a = JSON.stringify(b.fromElements([one], base));
    assert.equal(JSON.stringify(b.fromElements([two], base)), a);
    // One order, by name: a binding is {id, type}; the list keeps its order.
    assert.ok(a.includes('"boundElements":[{"id":"t","type":"text"},{"id":"a","type":"arrow"}]'), a);
  });

  test("the demo vault's boards come back byte-identical from the converter", () => {
    for (const name of ["Board de Demonstração", "Tour do Verso", "Treino do Board"]) {
      const doc = JSON.parse(readFileSync(new URL(`../../../demo-vault/${name}.canvas`, import.meta.url), "utf8"));
      assert.equal(JSON.stringify(b.fromElements(b.toElements(doc), doc)), JSON.stringify(doc), name);
    }
  });
});

describe("a web page as a link card (ADR 0057 point 10, decided 2026-10-21)", () => {
  test("a new page card is a JSON Canvas link node with the page flag under verso", () => {
    const n = b.newNode("link", "https://ok.example/p", [0, 0], "p1", true);
    assert.equal(n.type, "link");
    assert.equal(n.url, "https://ok.example/p");
    assert.deepEqual(n.verso, { page: true });
    assert.equal(b.isPage(n), true);
    assert.equal(b.isPage(b.newNode("link", "https://ok.example/p", [0, 0], "p2")), false, "a plain link card is no page");
  });
  test("it round-trips as a link node, the flag kept, and nothing is added to a plain link", () => {
    const doc = { nodes: [b.newNode("link", "https://ok.example/p", [0, 0], "p1", true), { id: "l", type: "link", x: 0, y: 500, width: 400, height: 120, url: "https://plain.example/" }], edges: [] };
    const back = b.fromElements(restored(doc), doc);
    assert.deepEqual(back.nodes, doc.nodes);
    assert.equal(back.nodes[1].verso, undefined);
  });
  test("the switch writes and takes off the flag, other verso keys kept", () => {
    const plain = { id: "l", type: "link", x: 0, y: 0, width: 400, height: 120, url: "https://a.example/", verso: { background: "#a5d8ff" } };
    const on = b.withPage(plain, true);
    assert.deepEqual(on.verso, { background: "#a5d8ff", page: true });
    const off = b.withPage(on, false);
    assert.deepEqual(off.verso, { background: "#a5d8ff" });
    assert.equal(b.withPage({ ...plain, verso: undefined }, false).verso, undefined);
  });
  test("a page's origin is read from its address; only the web has one", () => {
    assert.equal(b.pageOrigin("https://ok.example:8080/a?b#c"), "https://ok.example:8080");
    assert.equal(b.pageOrigin("javascript:alert(1)"), null);
    assert.equal(b.pageOrigin("not a url"), null);
  });
});

describe("a data file's card (ADR 0057 point 10, ADR 0106)", () => {
  const file = { id: "d", type: "file", file: "Dados/npcs.json", x: 0, y: 0, width: 400, height: 400 };
  test("it shows its text unless the node's own verso says diagram, and any other value reads as text", () => {
    assert.equal(b.cardView(file), "text");
    assert.equal(b.cardView({ ...file, verso: { view: "diagram" } }), "diagram");
    assert.equal(b.cardView({ ...file, verso: { view: "nonsense" } }), "text");
    assert.equal(b.cardView({ ...file, verso: "x" }), "text");
  });
  test("the switch writes the mode and takes it off for the text, other verso keys kept", () => {
    const colored = { ...file, verso: { background: "#a5d8ff" } };
    const on = b.withView(colored, "diagram");
    assert.deepEqual(on.verso, { background: "#a5d8ff", view: "diagram" });
    assert.deepEqual(b.withView(on, "text").verso, { background: "#a5d8ff" });
    assert.equal(b.withView(file, "text").verso, undefined, "the default is not written");
  });
  test("the mode round-trips through the board, and a file card left alone gains nothing", () => {
    const doc = { nodes: [{ ...file, verso: { view: "diagram" } }, { ...file, id: "e", y: 500 }], edges: [] };
    const back = b.fromElements(restored(doc), doc);
    assert.deepEqual(back.nodes, doc.nodes);
    assert.equal(back.nodes[1].verso, undefined);
  });
  test("a card shows at most the first 64 KB of the file, cut with a flag, never in a surrogate pair", () => {
    assert.deepEqual(b.cardText("abc"), { shown: "abc", cut: false });
    const big = b.cardText("x".repeat(b.CARD_TEXT_MAX + 5));
    assert.equal(big.shown.length, b.CARD_TEXT_MAX);
    assert.equal(big.cut, true);
    const pair = b.cardText("x".repeat(b.CARD_TEXT_MAX - 1) + "😀tail");
    assert.equal(pair.cut, true);
    assert.equal(pair.shown.length, b.CARD_TEXT_MAX - 1);
  });
});

describe("a text card added by hand (ADR 0057, 2026-10-23)", () => {
  test("is a JSON Canvas text node, 340x110, centred on the point", () => {
    const n = b.textCardAt("Olá `dice: 1d20`", [1000, 500], "x1");
    assert.deepEqual(n, { id: "x1", type: "text", x: 830, y: 445, width: 340, height: 110, text: "Olá `dice: 1d20`" });
  });
  test("two taps close in time and place are a double tap", () => {
    assert.equal(b.isDoubleTap(null, 100, 5, 5), false);
    assert.equal(b.isDoubleTap({ at: 0, x: 10, y: 10 }, 250, 20, 18), true);
    assert.equal(b.isDoubleTap({ at: 0, x: 10, y: 10 }, 450, 10, 10), false);
    assert.equal(b.isDoubleTap({ at: 0, x: 10, y: 10 }, 200, 80, 10), false);
  });
});
