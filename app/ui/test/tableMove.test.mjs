// A table moved to its other server (ADR 0117 D8, R9), the window's pure
// part: what the table's window offers the game master, how the other
// server is named, when the window shows the table on its new host, and a
// refusal of a moved table known from one of a closed one. The hosts' part
// is tried in `app/src-tauri/src/tests_table_move.rs` and the servers' in
// `crates/verso-server/src/tests_table_move.rs`; the window's cards in
// `e2e/table-move.spec.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/tableMove"; export { isTableClosed, isTableMoved, TABLE_CLOSED, TABLE_MOVED } from "./src/errorKinds";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableMove.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableMove.test-bundle.mjs");

const TABLE = { root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 };
const UNIVERSO = { to: "universo", name: "notas.exemplo", url: "https://notas.exemplo", folder: "f1", key: null };
const HERE = { to: "here", name: "", url: null, folder: null, key: "k1" };
const WORDS = { thisComputer: "este computador", universo: (n) => `o UniVerso ${n}`, elsewhere: "outro servidor" };

test("only the game master is offered the move, and only with another server", () => {
  assert.deepEqual(m.moveOffer(TABLE, UNIVERSO, "owner"), { kind: "move", to: UNIVERSO });
  assert.deepEqual(m.moveOffer(TABLE, HERE, "owner"), { kind: "move", to: HERE });
  assert.deepEqual(m.moveOffer(TABLE, null, "owner"), { kind: "none" });
  assert.deepEqual(m.moveOffer(TABLE, UNIVERSO, "player"), { kind: "none" });
  assert.deepEqual(m.moveOffer(undefined, UNIVERSO, "owner"), { kind: "none" });
});

test("a moved table is said as moved, with or without the server it went to", () => {
  const moved = { ...TABLE, open: false, moved: true };
  assert.deepEqual(m.moveOffer(moved, UNIVERSO, "owner"), { kind: "moved", to: UNIVERSO });
  assert.deepEqual(m.moveOffer(moved, null, "owner"), { kind: "moved", to: null });
  // A server before R9 says nothing of `moved`: not moved.
  assert.equal(m.moveOffer({ ...TABLE, open: false }, UNIVERSO, "owner").kind, "move");
});

test("the other server is named for the person", () => {
  assert.equal(m.hostName(UNIVERSO, WORDS), "o UniVerso notas.exemplo");
  assert.equal(m.hostName(HERE, WORDS), "este computador");
  assert.equal(m.hostName(null, WORDS), "outro servidor");
  assert.equal(m.hostName({ ...UNIVERSO, name: "" }, WORDS), "outro servidor");
});

test("the window is at the new host when the table there is not the moved one", () => {
  assert.equal(m.arrived([{ ...TABLE, moved: true, open: false }], "Mundo"), false);
  assert.equal(m.arrived([TABLE], "Mundo"), true);
  assert.equal(m.arrived([{ ...TABLE, root: "Sala" }], "Mundo"), false);
  assert.equal(m.arrived([], ""), false);
});

test("a moved table's refusal is a closed table's too, told apart by its words", () => {
  const moved = { kind: "refused", message: m.TABLE_MOVED };
  const closed = { kind: "refused", message: m.TABLE_CLOSED };
  assert.ok(m.TABLE_MOVED.startsWith(m.TABLE_CLOSED));
  assert.equal(m.isTableClosed(moved), true);
  assert.equal(m.isTableMoved(moved), true);
  assert.equal(m.isTableMoved(closed), false);
  assert.equal(m.isTableMoved({ kind: "failed", message: m.TABLE_MOVED }), false);
});

test("the way to the new host is the window's start's to give", () => {
  assert.equal(m.tableGo(), null);
  const go = async () => true;
  m.setTableGo(go);
  assert.equal(m.tableGo(), go);
});
