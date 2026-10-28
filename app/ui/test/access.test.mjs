// What the window does with what the server says of a person (ADR 0113
// section C), asked every case of the shared vectors: the server's own test
// wrote them (`crates/verso-server/src/access/vectors.rs`), so the window's
// guards and the server's rules cannot drift apart.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/accessCore.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/accessCore.test-bundle.mjs", logLevel: "error" });
const { decide, mayImportFiles } = await import("./.bundles/accessCore.test-bundle.mjs");

const vectors = JSON.parse(readFileSync(new URL("./access-vectors.json", import.meta.url), "utf8"));
const whoIndex = (name) => vectors.who.findIndex((w) => w.name === name);
const allow = (c, name) => c.allow[whoIndex(name)] === "y";
// The cases by action, table, source and level: a case names the dimensions its answer depends on, and the
// dimension it leaves out is one the answer does not depend on (the file's kind, which rights, whether shown).
const index = new Map();
for (const c of vectors.cases) {
  const key = [c.action, c.table, c.source ?? "", c.level ?? ""].join("|");
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(c);
}
/** The case that answers `action` for a setting of the full product, or undefined. */
function find(action, s) {
  const list = index.get([action, s.table, s.source ?? "", s.level ?? ""].join("|")) ?? [];
  return list.find(
    (c) =>
      (c.kind === undefined || c.kind === s.kind) &&
      (c.images === undefined || c.images === s.images) &&
      (c.files === undefined || c.files === s.files) &&
      (c.creates_notes === undefined || c.creates_notes === s.creates_notes) &&
      (c.creates_boards === undefined || c.creates_boards === s.creates_boards) &&
      (c.derived === undefined || c.derived === s.derived),
  );
}

/** The actions the window asks, by the vectors' words (create is a note or a board, asked of a folder). */
const ACTIONS = { see: "see", edit: "edit", attach: "attach", attachImage: "attach-image", createNote: "create-note", createBoard: "create-board", rename: "rename", delete: "delete", move: "move" };

/** What the server says of a person, as its capabilities and its reads say it. */
function told(w, row) {
  const seat = w.link ? "visitor" : w.role === "owner" ? "master" : w.role ? "player" : "none";
  const folder = { seat, role: w.link ? "" : (w.role ?? ""), cap: w.cap, table: row.table !== "none" };
  // The level does not depend on the credential: the same person with a credential that writes.
  const writer = vectors.who.find((x) => x.role === w.role && x.link === w.link && x.cap === "write" && !x.phone && x.admin === w.admin && x.other === w.other) ?? w;
  const level = allow(row.edit, writer.name) ? "edit" : allow(row.see, writer.name) ? "see" : "none";
  return { folder, level };
}

/** Every setting of the full product the matrix covers. */
function* settings() {
  const bits = [false, true];
  for (const table of ["none", "open", "closed"]) {
    const places = table === "none" ? [[undefined, undefined]] : ["nothing", "file", "folder", "exception", "below-whole", "moved-in"].flatMap((source) => ["none", "see", "edit"].map((level) => [source, level]));
    for (const [source, level] of places) {
      for (const kind of ["note", "board", "base", "attachment", "other-file", "folder"]) {
        for (const derived of bits)
          for (const images of bits)
            for (const files of bits)
              for (const creates_notes of bits)
                for (const creates_boards of bits) yield { table, source, level, kind, derived, images, files, creates_notes, creates_boards };
      }
    }
  }
}

describe("the window's guards agree with the vectors", () => {
  test("every setting, every person, every action", () => {
    let asked = 0;
    for (const base of settings()) {
      const row = Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, find(v, base)]));
      if (Object.values(row).some((x) => !x)) continue;
      const folder = base.kind === "folder";
      for (const w of vectors.who) {
        if (w.admin || w.phone) continue;
        const { folder: caps, level } = told(w, { table: base.table, edit: row.edit, see: row.see });
        const file = {
          level,
          attach: allow(row.attach, w.name),
          attach_image: allow(row.attachImage, w.name),
          // What can be made is told of a folder only (K.6).
          create_note: folder && allow(row.createNote, w.name),
          create_board: folder && allow(row.createBoard, w.name),
          why: { kind: "own" },
        };
        const ctx = { folder: caps, canWrite: false, syncedReader: false };
        for (const action of ["see", "edit", "attach", "attachImage", "rename", "delete", "move"]) {
          asked += 1;
          assert.equal(decide(ctx, file, action), allow(row[action], w.name), `${w.name} ${action} ${JSON.stringify(base)}`);
        }
        if (folder) {
          for (const action of ["createNote", "createBoard"]) {
            asked += 1;
            assert.equal(decide(ctx, file, action), allow(row[action], w.name), `${w.name} ${action} ${JSON.stringify(base)}`);
          }
          asked += 1;
          assert.equal(decide(ctx, file, "create"), allow(row.createNote, w.name) || allow(row.createBoard, w.name), `${w.name} create ${JSON.stringify(base)}`);
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
    assert.equal(decide({ ...caps("master", true), syncedReader: true }, { level: "edit", attach: true, attach_image: true, create_note: true, create_board: true, why: { kind: "master" } }, "edit"), false);
    assert.equal(decide({ ...caps("master", true), syncedReader: true }, { level: "edit", attach: true, attach_image: true, create_note: true, create_board: true, why: { kind: "master" } }, "see"), true);
  });
});

describe("Import files", () => {
  test("a player at a table imports only with a right to put files in; anyone else as before", () => {
    assert.equal(mayImportFiles(true, [{ images: false, files: false }]), false);
    assert.equal(mayImportFiles(true, []), false);
    assert.equal(mayImportFiles(true, [{ images: true }]), true);
    assert.equal(mayImportFiles(true, [{ images: false }, { files: true }]), true);
    assert.equal(mayImportFiles(false, []), true);
  });
});
