// Two holes of the browser's offline copy (ADR 0092), from the sync review
// of 2026-11-15:
//
// WEB-B1 — the window answered from the copy (its own connection down)
// while the folder's sync connection is up: a pass brings another person's
// edit of a note into the store, the core still holds the version it read
// at start, and the window's next save wrote over the downloaded version;
// the pass after sent it over the server's edit, lost with no conflict.
// Now a write goes over the version the core read and nothing else
// (invariant 11): refused as `changed`, and the core reads the file again.
//
// WEB-I1 — a file edited here while its upload crossed: the server said
// `done`, but the step was refused before the base was recorded, and the
// next pass took this device's own upload for the server's edit — a
// conflict copy, or a note's tail joined twice. Now the base is what was
// sent, and the newer text goes up on the pass right after.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

globalThis.location ??= { host: "verso.test", origin: "https://verso.test" };

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/web/offline/index"; export { OfflineCore } from "./src/web/offline/core";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/offlineStale.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
});
const { Syncer, MemoryStore, sha256, OfflineCore } = await import("./.bundles/offlineStale.test-bundle.mjs");
const { FakeServer } = await import("./offlineModel.mjs");

const enc = new TextEncoder();
const dec = new TextDecoder();

const kept = () => ({ key: "pasta-1", id: "f1", name: "Pasta", role: "owner", account: "a1", attachments: "all", opened: [], since: "2026-10-15T00:00:00Z", last: null });

function device(server, store = new MemoryStore()) {
  const syncer = new Syncer({ store, remote: server, kept: kept(), device: () => "Fone", pt: () => false, now: () => new Date(2026, 9, 15, 9, 30), piece: 4 });
  return {
    store,
    syncer,
    async sync() {
      syncer.confirm();
      return syncer.settle();
    },
    async text(path) {
      const f = await store.file("f1", path);
      return f ? dec.decode(f.bytes) : null;
    },
    async write(path, text) {
      const bytes = enc.encode(text);
      await store.putFile("f1", { path, bytes, hash: sha256(bytes), size: bytes.length, modified: 1 });
    },
  };
}

const serverText = (s, p) => {
  const f = s.files.get(p);
  return f ? dec.decode(f.bytes) : null;
};

/** The core the window is answered from, loaded from the store. */
async function coreOf(store) {
  const core = new OfflineCore(kept(), false);
  core.load(await store.all("f1"));
  return core;
}

/** A server's revision of `text`, as `verso-core`'s `revision::encode`
 *  writes it: nanoseconds, length, FNV-1a 64 of the bytes. */
function serverRevision(text) {
  const bytes = enc.encode(text);
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return `1790000000000000000:${bytes.length}:${h.toString(16).padStart(16, "0")}`;
}

const refusal = async (p) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
};

describe("WEB-B1: a pass brings a newer version while the window is answered from the copy", () => {
  test("a save over the version the core read is refused as changed, and never goes up over the server's edit", async () => {
    const s = new FakeServer();
    s.write("X.md", "um\n");
    const d = device(s);
    await d.sync();
    const core = await coreOf(d.store);
    const read = await core.answer(d.store, "read_note", { path: "X.md" });
    // Another person edits X; this device's sync connection is up and
    // brings it into the store, the window's core not told.
    s.write("X.md", "dela\n");
    await d.sync();
    assert.equal(await d.text("X.md"), "dela\n");
    const e = await refusal(core.answer(d.store, "write_note", { path: "X.md", text: "meu\n", revision: read.revision }));
    assert.equal(e?.kind, "changed", "refused, as a write over a file changed on the disk");
    assert.equal(await d.text("X.md"), "dela\n", "the store keeps the version the pass brought");
    // The core reads the file again: the window's diff shows the new one,
    // and a save over it (the person's choice) is taken.
    const again = await core.answer(d.store, "read_note", { path: "X.md" });
    assert.deepEqual(again.lines.slice(0, 1), ["dela"]);
    await core.answer(d.store, "write_note", { path: "X.md", text: "dela\nmeu\n", revision: again.revision });
    await d.sync();
    assert.equal(serverText(s, "X.md"), "dela\nmeu\n", "the person's edit over the new version goes up");
  });

  test("the core caught up after a pass: the old revision no longer writes, the new text is read", async () => {
    const s = new FakeServer();
    s.write("X.md", "um\n");
    const d = device(s);
    await d.sync();
    const core = await coreOf(d.store);
    const read = await core.answer(d.store, "read_note", { path: "X.md" });
    s.write("X.md", "dela\n");
    await d.sync();
    assert.equal(await core.catchUp(d.store), true, "the pass wrote: the core reads again");
    assert.equal(await core.catchUp(d.store), false, "nothing new the second time");
    const now = await core.answer(d.store, "read_note", { path: "X.md" });
    assert.equal(now.lines[0], "dela");
    const e = await refusal(core.answer(d.store, "write_note", { path: "X.md", text: "meu\n", revision: read.revision }));
    assert.equal(e?.kind, "changed");
    await d.sync();
    assert.equal(serverText(s, "X.md"), "dela\n");
  });

  test("a revision the server gave before the drop writes only over the bytes it names", async () => {
    const s = new FakeServer();
    s.write("X.md", "um\n");
    s.write("Y.md", "y\n");
    const d = device(s);
    await d.sync();
    const core = await coreOf(d.store);
    // The window opened Y online: its server revision names Y's bytes here.
    await core.answer(d.store, "write_note", { path: "Y.md", text: "y editado\n", revision: serverRevision("y\n") });
    assert.equal(await d.text("Y.md"), "y editado\n");
    // X opened online at "um", then a pass brought "dela": the old
    // server revision is refused once the core holds the new bytes.
    s.write("X.md", "dela\n");
    await d.sync();
    await core.catchUp(d.store);
    const e = await refusal(core.answer(d.store, "write_note", { path: "X.md", text: "meu\n", revision: serverRevision("um\n") }));
    assert.equal(e?.kind, "changed");
    await d.sync();
    assert.equal(serverText(s, "X.md"), "dela\n");
    assert.equal(serverText(s, "Y.md"), "y editado\n");
  });

  test("a new file the pass brought, and one it deleted, reach the core", async () => {
    const s = new FakeServer();
    s.write("X.md", "um\n");
    const d = device(s);
    await d.sync();
    const core = await coreOf(d.store);
    s.write("pasta/nova.md", "nova\n");
    s.remove("X.md");
    await d.sync();
    await core.catchUp(d.store);
    const listed = await core.answer(d.store, "list_notes", {});
    const paths = JSON.stringify(listed);
    assert.ok(paths.includes("pasta/nova.md"), paths);
    assert.ok(!paths.includes("X.md"), paths);
  });
});

describe("WEB-I1: edited here while its upload crossed", () => {
  /** A server whose answer to the last piece of `path` comes after `meanwhile`. */
  function slowLastPiece(s, path, meanwhile) {
    const put = s.put.bind(s);
    let once = true;
    s.put = async (args, bytes) => {
      const a = await put(args, bytes);
      if (a.done && args.path === path && once) {
        once = false;
        await meanwhile();
      }
      return a;
    };
  }

  test("a note: no tail joined twice, the newer text goes up, no conflict copy", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("diario.md", "A\n");
    await d.sync();
    await d.write("diario.md", "A\nB\n");
    slowLastPiece(s, "diario.md", () => d.write("diario.md", "A\nB\nC\n"));
    await d.sync();
    await d.sync();
    assert.equal(serverText(s, "diario.md"), "A\nB\nC\n", "the newer text, once");
    assert.equal(await d.text("diario.md"), "A\nB\nC\n");
    assert.deepEqual(d.syncer.status.conflicts, []);
    assert.deepEqual([...s.files.keys()].filter((p) => p.includes("conflict")), []);
  });

  test("a file that is not a note: no conflict copy of this device's own upload", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("dados.json", '{"a":1}');
    await d.sync();
    await d.write("dados.json", '{"a":2}');
    slowLastPiece(s, "dados.json", () => d.write("dados.json", '{"a":3}'));
    await d.sync();
    await d.sync();
    assert.equal(serverText(s, "dados.json"), '{"a":3}');
    assert.deepEqual(d.syncer.status.conflicts, []);
    assert.deepEqual([...(await d.store.listing("f1")).keys()].sort(), ["dados.json"]);
  });

  test("the newer text goes up within the same settle", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("n.md", "1\n");
    await d.sync();
    await d.write("n.md", "1\n2\n");
    slowLastPiece(s, "n.md", () => d.write("n.md", "1\n2\n3\n"));
    await d.sync();
    assert.equal(serverText(s, "n.md"), "1\n2\n3\n", "a pass ran again for it");
  });
});
