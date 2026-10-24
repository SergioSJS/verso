// What the window does with what the server says of a person (ADR 0113
// section C), asked every case of the shared vectors: the server's own test
// wrote them (`crates/verso-server/src/access/vectors.rs`), so the window's
// guards and the server's rules cannot drift apart.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/accessCore.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/accessCore.test-bundle.mjs", logLevel: "error" });
const { decide } = await import("./.bundles/accessCore.test-bundle.mjs");

const vectors = JSON.parse(readFileSync(new URL("./access-vectors.json", import.meta.url), "utf8"));
const whoIndex = (name) => vectors.who.findIndex((w) => w.name === name);
const allow = (c, name) => c.allow[whoIndex(name)] === "y";
const find = (action, table, rest) =>
  vectors.cases.find((c) => c.action === action && c.table === table && Object.entries(rest).every(([k, v]) => c[k] === undefined || c[k] === v));

/** The cases the window asks about, by the action it names. */
const ACTIONS = { see: "see", edit: "edit", attach: "attach", create: "create", rename: "rename", delete: "delete", move: "move" };

/** What the server says of a person, as its capabilities and its reads say it. */
function told(w, c) {
  const seat = w.link ? "visitor" : w.role === "owner" ? "master" : w.role ? "player" : "none";
  const folder = { seat, role: w.link ? "" : (w.role ?? ""), cap: w.cap, table: c.table !== "none" };
  // The level does not depend on the credential: the same person with a credential that writes.
  const writer = vectors.who.find((x) => x.role === w.role && x.link === w.link && x.cap === "write" && !x.phone && x.admin === w.admin && x.other === w.other) ?? w;
  const level = allow(c.edit ?? c.self, writer.name) ? "edit" : allow(c.see ?? c.self, writer.name) ? "see" : "none";
  return { folder, level };
}

describe("the window's guards agree with the vectors", () => {
  // Group by the setting a case names; for each, ask the six actions.
  const settings = new Map();
  for (const c of vectors.cases) {
    if (!(c.action in ACTIONS) || c.kind === "table") continue;
    const key = JSON.stringify([c.table, c.source, c.level, c.kind, c.right, c.derived]);
    if (!settings.has(key)) settings.set(key, c);
  }
  test("every setting, every person, every action", () => {
    let asked = 0;
    for (const base of settings.values()) {
      const ask = (action) => find(action, base.table, { source: base.source, level: base.level, kind: base.kind, right: base.right, derived: base.derived });
      const row = { see: ask("see"), edit: ask("edit"), attach: ask("attach"), create: ask("create"), rename: ask("rename"), delete: ask("delete"), move: ask("move") };
      if (Object.values(row).some((x) => !x)) continue;
      for (const w of vectors.who) {
        if (w.admin || w.phone) continue;
        const { folder, level } = told(w, { table: base.table, edit: row.edit, see: row.see, self: row.see });
        const file = { level, attach: allow(row.attach, w.name), why: { kind: "own" } };
        const ctx = { folder, canWrite: false, syncedReader: false };
        for (const action of Object.keys(ACTIONS)) {
          asked += 1;
          assert.equal(decide(ctx, file, action), allow(row[action], w.name), `${w.name} ${action} ${JSON.stringify(base)}`);
        }
      }
    }
    assert.ok(asked > 1000, `only ${asked} cases were asked`);
  });
});

describe("a path the server did not describe", () => {
  const caps = (seat, table, cap = "write") => ({ folder: { seat, role: seat === "master" ? "owner" : "reader", cap, table }, canWrite: cap === "write", syncedReader: false });
  test("a folder of this computer alone is the side's capability", () => {
    assert.equal(decide({ folder: null, canWrite: true, syncedReader: false }, null, "edit"), true);
    assert.equal(decide({ folder: null, canWrite: false, syncedReader: false }, null, "create"), false);
  });
  test("at a table, only the game master writes where no answer said", () => {
    assert.equal(decide(caps("master", true), null, "create"), true);
    assert.equal(decide(caps("player", true), null, "create"), false);
    assert.equal(decide(caps("player", false), null, "create"), true);
  });
  test("the credential's ceiling and a synced reader remove writing, never seeing", () => {
    assert.equal(decide(caps("master", true, "read"), null, "edit"), false);
    assert.equal(decide({ ...caps("master", true), syncedReader: true }, { level: "edit", attach: true, why: { kind: "master" } }, "edit"), false);
    assert.equal(decide({ ...caps("master", true), syncedReader: true }, { level: "edit", attach: true, why: { kind: "master" } }, "see"), true);
  });
});
