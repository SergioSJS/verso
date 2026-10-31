// The graph's notes that do not exist yet (spec Q14, decision B): which
// links become a node and an edge, and which do not.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/leaves/graphMissing.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/graphMissing.test-bundle.mjs", logLevel: "error" });
const { missingNodes, missingId, isMissingId } = await import("./.bundles/graphMissing.test-bundle.mjs");

const LINKS = [
  { from: "A.md", target: "Goblin Rei" },
  { from: "B.md", target: "Goblin Rei" },
  { from: "pasta/C.md", target: "Goblin Rei" },
  { from: "A.md", target: "Dragão" },
  { from: "Fora.md", target: "Dragão" },
];

test("one node per name, an edge per note that links to it", () => {
  const { nodes, edges } = missingNodes(LINKS, new Set(["A.md", "B.md", "pasta/C.md", "Fora.md"]));
  assert.deepEqual(nodes.map((n) => n.target).sort(), ["Dragão", "Goblin Rei"]);
  const goblin = nodes.find((n) => n.target === "Goblin Rei");
  assert.deepEqual(goblin.from, ["A.md", "B.md", "pasta/C.md"]);
  assert.equal(edges.length, 5);
  assert.ok(edges.every(([from, to]) => !isMissingId(from) && isMissingId(to)));
});

test("only the notes the filters kept are sources", () => {
  const { nodes, edges } = missingNodes(LINKS, new Set(["B.md"]));
  assert.deepEqual(nodes.map((n) => n.target), ["Goblin Rei"]);
  assert.deepEqual(edges, [["B.md", missingId("Goblin Rei")]]);
  assert.deepEqual(missingNodes(LINKS, new Set()).nodes, []);
});

test("the same name spelled in two cases is one node", () => {
  const { nodes } = missingNodes([{ from: "A.md", target: "goblin rei" }, { from: "B.md", target: "Goblin Rei" }], new Set(["A.md", "B.md"]));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].from.length, 2);
});

test("a name with an extension is the same node as without", () => {
  const { nodes } = missingNodes([{ from: "A.md", target: "Novo.md" }, { from: "B.md", target: "Novo" }], new Set(["A.md", "B.md"]));
  assert.equal(nodes.length, 1);
});

test("a missing node's id never equals a note's path", () => {
  assert.ok(!missingId("Nota").endsWith(".md"));
  assert.ok(isMissingId(missingId("Nota")));
  assert.ok(!isMissingId("Nota.md"));
});

test("in a local graph a node is kept to the depth chosen", () => {
  const depth = new Map([["A.md", 0], ["B.md", 2]]);
  const { nodes } = missingNodes(LINKS, new Set(["A.md", "B.md"]), { depthOf: depth, maxDepth: 2 });
  const goblin = nodes.find((n) => n.target === "Goblin Rei");
  assert.equal(goblin.depth, 1);
  const none = missingNodes(LINKS, new Set(["B.md"]), { depthOf: depth, maxDepth: 2 });
  assert.deepEqual(none.nodes, []);
});
