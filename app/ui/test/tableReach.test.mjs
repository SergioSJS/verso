// A synced folder's table (ADR 0107 item 9): where the window looks for it,
// from the sync's state alone. The server's table is tried when the folder
// does not sync (the side answers) and while the link is up; with the link
// down or the sync paused the window keeps its own log and says why, and it
// joins again when the state changes back. The panel is tried in
// e2e/synced-table.spec.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/reach";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableReach.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableReach.test-bundle.mjs");

test("the sync's state says where the table is", () => {
  assert.equal(m.reachOf(null), "none");
  assert.equal(m.reachOf({ on: false, state: "off" }), "none");
  assert.equal(m.reachOf({ on: true, state: "off" }), "none");
  for (const state of ["synced", "syncing", "error", "conflict"]) assert.equal(m.reachOf({ on: true, state }), "up", state);
  assert.equal(m.reachOf({ on: true, state: "offline" }), "down");
  assert.equal(m.reachOf({ on: true, state: "paused" }), "paused");
});

test("the server's table is tried unless the synced folder's server is known out of reach", () => {
  assert.equal(m.tryServerTable("none"), true);
  assert.equal(m.tryServerTable("up"), true);
  assert.equal(m.tryServerTable("down"), false);
  assert.equal(m.tryServerTable("paused"), false);
});

test("the panel says why its own log is not the table, only in a synced folder", () => {
  assert.equal(m.noticeKey("down", false), "syncOffline");
  assert.equal(m.noticeKey("paused", false), "syncPaused");
  // The link believed up but the join answered unavailable: still offline.
  assert.equal(m.noticeKey("up", true), "syncOffline");
  // A join refused for another reason (a share has no table), or a folder
  // that does not sync: the ordinary "not shared".
  assert.equal(m.noticeKey("up", false), null);
  assert.equal(m.noticeKey("none", false), null);
  assert.equal(m.noticeKey("none", true), null);
});

test("coming back: down then up is a change the window joins on, the same state twice is not", () => {
  const states = [
    { on: true, state: "syncing" },
    { on: true, state: "synced" },
    { on: true, state: "offline" },
    { on: true, state: "offline" },
    { on: true, state: "syncing" },
  ];
  let reach = "none";
  const joins = [];
  for (const s of states) {
    const next = m.reachOf(s);
    if (next === reach) continue;
    reach = next;
    joins.push(next);
  }
  assert.deepEqual(joins, ["up", "down", "up"]);
});

test("signed in again: the reach stays up, and a join answered unavailable is tried again on the next state", () => {
  // The session revoked: the status reads an error ("up"), the join says
  // unavailable; signed in again, the status reads synced, still "up".
  assert.equal(m.rejoin("up", "up", true), true);
  // Joined: the same state again asks nothing.
  assert.equal(m.rejoin("up", "up", false), false);
  // Out of reach: nothing to try while it stays so.
  assert.equal(m.rejoin("down", "down", true), false);
  assert.equal(m.rejoin("paused", "paused", true), false);
  // A change always is.
  assert.equal(m.rejoin("down", "up", false), true);
  assert.equal(m.rejoin("none", "up", false), true);
});
