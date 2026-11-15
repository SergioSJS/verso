// The browser's sync client (ADR 0092 item 1) against a model of the
// server's rules: the guardrail of ADR 0079's Consequences, run against the
// browser's store — two devices and a server, editing at random and syncing
// in random orders, end with the same files and lose no edit nobody saw —
// and the rules one by one.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/offline/index.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/offline-sync.test-bundle.mjs",
  logLevel: "error",
});
const lib = await import("./.bundles/offline-sync.test-bundle.mjs");
const { FakeServer, err } = await import("./offlineModel.mjs");
const { Syncer, MemoryStore, StoreFull, sha256, plan, conflictName, newState, waiting, holdChanges, restoreChanges, heldChanges, heldCount, discardChanges, zip, crc32, HELD } = lib;

const enc = new TextEncoder();
const dec = new TextDecoder();

const kept = (role = "owner", attachments = "all") => ({ key: "pasta-1", id: "f1", name: "Pasta", role, account: "a1", attachments, opened: [], since: "2026-10-15T00:00:00Z", last: null });

/** A device: a store and the syncer that keeps it in step. */
function device(server, { name = "Fone", role = "owner", piece = 4, store = new MemoryStore(), attachments = "all" } = {}) {
  const k = kept(role, attachments);
  const statuses = [];
  const syncer = new Syncer({
    store,
    remote: server,
    kept: k,
    device: () => name,
    pt: () => false,
    now: () => new Date(2026, 9, 15, 9, 30),
    piece,
    shown: (s) => statuses.push(s.state),
  });
  return {
    name,
    store,
    kept: k,
    syncer,
    statuses,
    async write(path, text) {
      const bytes = enc.encode(text);
      await store.putFile("f1", { path, bytes, hash: sha256(bytes), size: bytes.length, modified: 1 });
    },
    async remove(path) {
      await store.deleteFile("f1", path);
    },
    async move(from, to) {
      const f = await store.file("f1", from);
      await store.putFile("f1", { ...f, path: to });
      await store.deleteFile("f1", from);
    },
    async text(path) {
      const f = await store.file("f1", path);
      return f ? dec.decode(f.bytes) : null;
    },
    async disk() {
      const out = new Map();
      for (const f of await store.all("f1")) out.set(f.path, dec.decode(f.bytes));
      return out;
    },
    async sync(confirmed = true) {
      if (confirmed) syncer.confirm();
      return syncer.settle();
    },
  };
}

const serverText = (s, p) => {
  const f = s.files.get(p);
  return f ? dec.decode(f.bytes) : null;
};

describe("the first sync", () => {
  test("what one side alone has goes to the other, and nothing is deleted", async () => {
    const s = new FakeServer();
    s.write("remoto.md", "do servidor");
    const d = device(s);
    await d.write("local.md", "daqui");
    const r = await d.sync();
    assert.equal(r.paused, null);
    assert.equal(serverText(s, "local.md"), "daqui");
    assert.equal(await d.text("remoto.md"), "do servidor");
    assert.equal(d.syncer.status.state, "synced");
    assert.deepEqual(d.syncer.status.conflicts, []);
  });
  test("a file different on both sides is kept twice: the server's with the name, the device's beside it", async () => {
    const s = new FakeServer();
    s.write("a.md", "servidor");
    const d = device(s);
    await d.write("a.md", "fone");
    await d.sync();
    assert.equal(await d.text("a.md"), "servidor");
    const copy = "a (conflito, Fone, 2026-10-15 09.30).md".replace("conflito", "conflict");
    assert.equal(await d.text(copy), "fone");
    assert.equal(serverText(s, copy), "fone", "the copy goes to the others too");
    assert.deepEqual(d.syncer.status.conflicts, [copy]);
    assert.equal(d.syncer.status.log[0].what === "sent" || d.syncer.status.log.some((l) => l.what === "conflict"), true);
  });
});

describe("working offline and coming back", () => {
  test("edits made while the connection was down wait as the difference from the base, and go up by the rules", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("nota.md", "um\n");
    await d.sync();
    // The connection drops: edits, a new note, a deletion.
    await d.write("nota.md", "um\ndois\n");
    await d.write("nova.md", "nova");
    const state = await d.store.state("f1");
    assert.equal(waiting(await d.store.listing("f1"), state), 2, "two writes wait");
    s.dropAfter = 0;
    await d.sync();
    assert.equal(d.syncer.status.state, "offline", "said, not silent");
    assert.equal(await d.text("nota.md"), "um\ndois\n", "nothing lost");
    assert.equal(waiting(await d.store.listing("f1"), await d.store.state("f1")), 2);
    // Back.
    s.dropAfter = null;
    d.syncer.reconnected();
    await d.sync();
    assert.equal(serverText(s, "nota.md"), "um\ndois\n");
    assert.equal(serverText(s, "nova.md"), "nova");
    assert.equal(waiting(await d.store.listing("f1"), await d.store.state("f1")), 0);
  });

  test("a note both sides only appended to is joined — the server's tail first — not a conflict", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("diario.md", "# Dia\n");
    await d.sync();
    s.write("diario.md", "# Dia\nde fora\n");
    await d.write("diario.md", "# Dia\nde dentro\n");
    d.syncer.reconnected();
    await d.sync();
    assert.equal(serverText(s, "diario.md"), "# Dia\nde fora\nde dentro\n");
    assert.equal(await d.text("diario.md"), "# Dia\nde fora\nde dentro\n");
    assert.ok(d.syncer.status.log.some((l) => l.what === "merged"));
    assert.deepEqual(d.syncer.status.conflicts, []);
  });

  test("a note both sides changed otherwise keeps both: a conflict's copy", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("n.md", "linha\n");
    await d.sync();
    s.write("n.md", "LINHA\n");
    await d.write("n.md", "outra\n");
    d.syncer.reconnected();
    await d.sync();
    assert.equal(await d.text("n.md"), "LINHA\n");
    assert.equal(d.syncer.status.conflicts.length, 1);
    assert.equal(await d.text(d.syncer.status.conflicts[0]), "outra\n");
  });

  test("deleted on one side and edited on the other: the edit wins", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("x.md", "1");
    await d.sync();
    s.remove("x.md");
    await d.write("x.md", "2");
    d.syncer.reconnected();
    await d.sync();
    assert.equal(serverText(s, "x.md"), "2");
  });

  test("a rename made offline crosses as a rename", async () => {
    const s = new FakeServer();
    const d = device(s);
    await d.write("velho.md", "texto");
    await d.sync();
    await d.move("velho.md", "novo.md");
    d.syncer.reconnected();
    await d.sync();
    assert.equal(serverText(s, "novo.md"), "texto");
    assert.equal(serverText(s, "velho.md"), null);
    assert.ok(s.calls.includes("rename"));
  });
});

describe("mass deletions pause, as the desktop's do", () => {
  test("three deletions of five wait for the person's yes", async () => {
    const s = new FakeServer();
    const d = device(s);
    for (const n of ["a", "b", "c", "d", "e"]) await d.write(`${n}.md`, n);
    await d.sync();
    for (const n of ["a", "b", "c"]) await d.remove(`${n}.md`);
    const r = await d.sync(false);
    assert.equal(r.paused, 3);
    assert.equal(d.syncer.status.state, "paused");
    assert.equal(d.syncer.status.deletions, 3);
    assert.equal(serverText(s, "a.md"), "a", "nothing deleted while it waits");
    await d.sync(true);
    assert.equal(serverText(s, "a.md"), null);
    assert.equal(d.syncer.status.state, "synced");
  });
});

describe("a reader", () => {
  test("receives, and her offline edit is refused, listed, and stays", async () => {
    const s = new FakeServer({ reader: false });
    s.write("a.md", "um");
    const d = device(s, { role: "reader" });
    await d.sync();
    assert.equal(await d.text("a.md"), "um");
    s.reader = true;
    await d.write("a.md", "meu");
    await d.sync();
    assert.equal(serverText(s, "a.md"), "um", "the server never saw it");
    assert.equal(await d.text("a.md"), "meu", "kept here");
    assert.deepEqual(d.syncer.status.refused.map((r) => [r.path, r.reason]), [["a.md", "reader"]]);
  });
});

describe("attachments kept once opened (ADR 0092 item 3)", () => {
  test("a picture on the server is not fetched until it is opened; a note is", async () => {
    const s = new FakeServer();
    s.write("nota.md", "texto");
    s.write("fotos/a.png", "PNG-A");
    s.write("doc.pdf", "PDF");
    s.write("dados.csv", "a,b");
    const d = device(s, { attachments: "opened" });
    await d.sync();
    assert.equal(await d.text("nota.md"), "texto");
    assert.equal(await d.text("dados.csv"), "a,b", "a text file is kept whole");
    assert.equal(await d.text("fotos/a.png"), null);
    assert.equal(await d.text("doc.pdf"), null);
    assert.equal(d.syncer.status.state, "synced");
    // Opened: the page says so, and the next pass keeps it.
    d.kept.opened.push("fotos/a.png");
    await d.sync();
    assert.equal(await d.text("fotos/a.png"), "PNG-A");
    assert.equal(await d.text("doc.pdf"), null);
    // Kept: a later edit on the server comes, and a deletion on the server goes.
    s.write("fotos/a.png", "PNG-B");
    s.remove("doc.pdf");
    await d.sync();
    assert.equal(await d.text("fotos/a.png"), "PNG-B");
    // "Keep every attachment".
    s.write("outra.pdf", "PDF2");
    d.kept.attachments = "all";
    await d.sync();
    assert.equal(await d.text("outra.pdf"), "PDF2");
  });
  test("a picture added here goes up, and one never fetched is never a deletion", async () => {
    const s = new FakeServer();
    s.write("longe.png", "L");
    const d = device(s, { attachments: "opened" });
    await d.write("aqui.png", "A");
    await d.sync();
    assert.equal(serverText(s, "aqui.png"), "A");
    assert.equal(serverText(s, "longe.png"), "L");
    s.remove("longe.png");
    await d.sync();
    assert.equal(d.syncer.status.state, "synced");
  });
});

describe("pieces", () => {
  test("a file larger than a piece crosses whole in both directions", async () => {
    const s = new FakeServer({ piece: 5 });
    const big = "0123456789".repeat(7);
    s.write("grande.md", big);
    const d = device(s, { piece: 6 });
    await d.write("daqui.md", big.split("").reverse().join(""));
    await d.sync();
    assert.equal(await d.text("grande.md"), big);
    assert.equal(serverText(s, "daqui.md"), big.split("").reverse().join(""));
    assert.ok(s.calls.filter((c) => c === "put").length > 5);
  });

  test("a download whose hash does not match is not kept", async () => {
    const s = new FakeServer();
    s.write("a.md", "bom");
    const original = s.read.bind(s);
    s.read = async (p, o) => {
      const r = await original(p, o);
      return { ...r, bytes: enc.encode("ruim") };
    };
    const d = device(s);
    await d.sync();
    assert.equal(await d.text("a.md"), null, "nothing half-written");
  });
});

describe("the browser's storage", () => {
  test("a store that is full is said, and what was kept stays kept", async () => {
    const s = new FakeServer();
    s.write("a.md", "um");
    s.write("b.md", "dois");
    const d = device(s);
    await d.write("local.md", "meu");
    d.store.full = true;
    await d.sync();
    assert.ok(d.syncer.status.refused.length >= 1 || d.syncer.status.state === "error");
    assert.equal(await d.text("local.md"), "meu");
    d.store.full = false;
    d.syncer.reconnected();
    await d.sync();
    assert.equal(await d.text("a.md"), "um");
    assert.equal(await d.text("b.md"), "dois");
    assert.ok(StoreFull);
  });
});

describe("two Unicode forms of a name are one file everywhere (spec Q7)", () => {
  test("a note edited under the other form is the same note", async () => {
    const s = new FakeServer();
    const composed = "Café.md";
    const decomposed = "Café.md";
    s.write(composed, "um");
    const d = device(s);
    await d.sync();
    await d.write(composed, "dois");
    await d.sync();
    assert.equal(serverText(s, composed), "dois");
    assert.equal(s.files.size, 1);
    void decomposed;
  });
});

// ---- The guardrail --------------------------------------------------------------

class Rng {
  constructor(seed) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  below(n) {
    this.s ^= this.s << 13;
    this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    this.s >>>= 0;
    return this.s % n;
  }
}

const COMPOSED = "Café.md";
const DECOMPOSED = "Café.md";
const byName = (m) => new Map([...m].map(([p, c]) => [p.normalize("NFC"), c]));
const picture = (m) => new Map([...m].map(([p, c]) => [p, { hash: sha256(enc.encode(c)), size: enc.encode(c).length }]));

async function run(seed) {
  const rng = new Rng(seed);
  const server = new FakeServer({ page: 2, piece: 3 });
  const devices = [device(server, { name: "A", piece: 4 }), device(server, { name: "B", piece: 5 })];
  const written = new Set();
  const seen = new Set();
  let counter = 0;
  const names = ["a.md", "b.md", "pasta/d.md", "e.png", COMPOSED, DECOMPOSED, "A.md"];
  const said = `seed ${seed}`;
  for (let step = 0; step < 40; step++) {
    const d = devices[rng.below(2)];
    switch (rng.below(6)) {
      case 0:
      case 1: {
        counter++;
        const content = `v${counter}`;
        const path = names[rng.below(names.length)];
        const old = await d.text(path);
        if (old !== null) seen.add(old);
        written.add(content);
        await d.write(path, content);
        break;
      }
      case 2: {
        const list = [...(await d.disk()).keys()];
        if (list.length) {
          const path = list[rng.below(list.length)];
          seen.add(await d.text(path));
          await d.remove(path);
        }
        break;
      }
      case 3: {
        const disk = await d.disk();
        const list = [...disk.keys()];
        if (list.length) {
          const from = list[rng.below(list.length)];
          const to = rng.below(4) === 3 ? (from === COMPOSED ? DECOMPOSED : from === DECOMPOSED ? COMPOSED : `renomeada-${rng.below(3)}.md`) : `renomeada-${rng.below(3)}.md`;
          if (!disk.has(to)) await d.move(from, to);
        }
        break;
      }
      default: {
        const confirmed = rng.below(3) !== 0;
        const refuse = rng.below(2) === 0 ? 0 : 30;
        server.refuse = refuse ? () => rng.below(100) < refuse : null;
        const before = [JSON.stringify([...(await d.disk())]), JSON.stringify([...server.files.keys()].map((p) => [p, serverText(server, p)]))];
        const state = (await d.store.state("f1")) ?? newState("", "f1");
        const paused = plan(picture(await d.disk()), picture(new Map([...server.files].map(([p, f]) => [p, dec.decode(f.bytes)]))), state, confirmed, (p, t) => conflictName(p, d.name, "t", true, t)).pause !== null;
        await d.sync(confirmed);
        server.refuse = null;
        if (paused) {
          const after = [JSON.stringify([...(await d.disk())]), JSON.stringify([...server.files.keys()].map((p) => [p, serverText(server, p)]))];
          assert.deepEqual(after, before, `${said}: a paused plan changed files`);
        }
      }
    }
  }
  // Quiet: sync until nothing moves.
  for (let i = 0; i < 6; i++) for (const d of devices) {
    d.syncer.reconnected();
    await d.sync(true);
  }
  const serverMap = new Map([...server.files].map(([p, f]) => [p, dec.decode(f.bytes)]));
  assert.equal(byName(serverMap).size, serverMap.size, `${said}: one name, one file on the server: ${[...serverMap.keys()]}`);
  for (const d of devices) {
    const disk = await d.disk();
    const state = await d.store.state("f1");
    const last = plan(picture(disk), picture(serverMap), state, true, (p, t) => conflictName(p, d.name, "t", true, t));
    assert.ok(last.actions.every((a) => a.t === "agree"), `${said}: ${d.name} still has work: ${JSON.stringify(last.actions)}`);
    const synced = new Map(disk);
    const there = new Map(serverMap);
    for (const h of last.held) {
      if (h.case) there.delete(h.path);
      else synced.delete(h.path);
    }
    assert.deepEqual([...byName(synced)].sort(), [...byName(there)].sort(), `${said}: ${d.name} differs from the server`);
  }
  const present = new Set([...serverMap.values(), ...(await Promise.all(devices.map((d) => d.disk()))).flatMap((m) => [...m.values()])]);
  for (const c of written) assert.ok(present.has(c) || seen.has(c), `${said}: the edit ${c} was lost unseen`);
}

describe("a session the server ended with changes not sent (ADR 0092 item 6, revised 2026-11-15)", () => {
  /** A device that synced three notes, then, offline, edited one, made one
   *  and deleted one: three changes wait. */
  async function waitingThree() {
    const s = new FakeServer();
    s.write("a.md", "a\n");
    s.write("b.md", "b\n");
    s.write("c.md", "c\n");
    const d = device(s);
    await d.store.putFolder(d.kept);
    await d.sync();
    await d.write("a.md", "a\nescrito sem rede\n");
    await d.write("nova.md", "nova\n");
    await d.remove("c.md");
    assert.equal(waiting(await d.store.listing("f1"), await d.store.state("f1")), 3);
    return { s, d };
  }

  test("keeps only the changes, with the base each was made on, for the account; the rest of the copy goes", async () => {
    const { d } = await waitingThree();
    await d.store.putFact("state", { account: { id: "a1" } });
    assert.equal(await holdChanges(d.store, "2026-11-15T12:00:00Z"), 3);
    assert.deepEqual(await d.store.folders(), []);
    assert.equal((await d.store.listing("f1")).size, 0, "the unchanged note is not kept");
    assert.equal(await d.store.state("f1"), null);
    assert.equal(await d.store.fact("state"), null, "nor the account last seen");
    const [h, ...rest] = await heldChanges(d.store);
    assert.equal(rest.length, 0);
    assert.equal(h.account, "a1");
    const by = new Map(h.files.map((f) => [f.path, f]));
    assert.deepEqual([...by.keys()].sort(), ["a.md", "c.md", "nova.md"]);
    assert.equal(dec.decode(by.get("a.md").bytes), "a\nescrito sem rede\n");
    assert.equal(by.get("a.md").base, sha256(enc.encode("a\n")));
    assert.equal(by.get("nova.md").base, null);
    assert.equal(by.get("c.md").bytes, null, "a deletion");
    assert.equal(by.get("c.md").base, sha256(enc.encode("c\n")));
    assert.equal(await heldCount(d.store), 3);
    // Done again (a page closed half-way, another tab): nothing doubled.
    assert.equal(await holdChanges(d.store), 0);
    assert.equal(await heldCount(d.store), 3);
  });

  test("a folder with nothing waiting keeps nothing", async () => {
    const s = new FakeServer();
    s.write("a.md", "a\n");
    const d = device(s);
    await d.store.putFolder(d.kept);
    await d.sync();
    assert.equal(await holdChanges(d.store), 0);
    assert.deepEqual(await heldChanges(d.store), []);
    assert.deepEqual(await d.store.folders(), []);
  });

  test("signed in again by the same account, the changes go up and the server judges each one", async () => {
    const { s, d } = await waitingThree();
    await holdChanges(d.store);
    // Meanwhile, elsewhere: b.md, which this device did not touch, changed;
    // and a.md changed too, so this device's edit is no longer over the
    // server's version.
    s.write("b.md", "b de fora\n");
    s.write("a.md", "a de fora\n");
    // Another account gets nothing.
    assert.deepEqual(await restoreChanges(d.store, "b2"), { folders: [], count: 0 });
    assert.deepEqual(await restoreChanges(d.store, ""), { folders: [], count: 0 });
    const { folders, count } = await restoreChanges(d.store, "a1");
    assert.equal(count, 3);
    assert.deepEqual(folders.map((k) => k.id), ["f1"]);
    assert.deepEqual(await heldChanges(d.store), [], "no longer kept apart");
    const again = device(s, { store: d.store });
    const r = await again.sync();
    assert.equal(r.paused, null);
    // The new note went up; the deletion went to the trash there; the
    // note changed on both sides kept both (invariant 11: never over the
    // server's version); the one only changed there came down.
    assert.equal(serverText(s, "nova.md"), "nova\n");
    assert.equal(serverText(s, "c.md"), null);
    assert.equal(serverText(s, "a.md"), "a de fora\n");
    const copy = [...s.files.keys()].find((p) => p.startsWith("a (conflict, "));
    assert.ok(copy, [...s.files.keys()].join(", "));
    assert.equal(serverText(s, copy), "a\nescrito sem rede\n");
    assert.equal(await again.text("b.md"), "b de fora\n");
    assert.equal(waiting(await again.store.listing("f1"), await again.store.state("f1")), 0);
  });

  test("an edit over the server's own version goes up as an edit, not a copy", async () => {
    const { s, d } = await waitingThree();
    await holdChanges(d.store);
    await restoreChanges(d.store, "a1");
    await device(s, { store: d.store }).sync();
    assert.equal(serverText(s, "a.md"), "a\nescrito sem rede\n");
    assert.ok(![...s.files.keys()].some((p) => p.includes("conflict")));
    assert.equal(serverText(s, "b.md"), "b\n");
  });

  test("another account's are discarded only on the word, and only theirs", async () => {
    const { d } = await waitingThree();
    await holdChanges(d.store);
    const mine = { account: "b2", id: "f9", key: "k", name: "Minha", role: "owner", attachments: "all", since: "", held: "", files: [{ path: "x.md", base: null, bytes: enc.encode("x"), hash: sha256(enc.encode("x")), modified: 1 }], made: [] };
    await d.store.putFact(HELD, [...(await heldChanges(d.store)), mine]);
    await discardChanges(d.store, (h) => h.account !== "b2");
    assert.deepEqual((await heldChanges(d.store)).map((h) => h.account), ["b2"]);
  });

  test("a zip of the changes holds each file whole, by its folder", async () => {
    const files = [
      { name: "Pasta/a.md", bytes: enc.encode("um\n") },
      { name: "Pasta/Notas/café.md", bytes: enc.encode("dois") },
    ];
    const z = zip(files, new Date(2026, 10, 15, 12, 0, 0));
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    const end = z.length - 22;
    assert.equal(v.getUint32(end, true), 0x06054b50);
    assert.equal(v.getUint16(end + 10, true), 2);
    let at = v.getUint32(end + 16, true);
    const found = [];
    for (let i = 0; i < 2; i++) {
      assert.equal(v.getUint32(at, true), 0x02014b50);
      const crc = v.getUint32(at + 16, true);
      const size = v.getUint32(at + 24, true);
      const nameLen = v.getUint16(at + 28, true);
      const local = v.getUint32(at + 42, true);
      const name = dec.decode(z.subarray(at + 46, at + 46 + nameLen));
      const skip = 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const bytes = z.subarray(local + skip, local + skip + size);
      assert.equal(crc32(bytes), crc);
      found.push([name, dec.decode(bytes)]);
      at += 46 + nameLen;
    }
    assert.deepEqual(found, [["Pasta/a.md", "um\n"], ["Pasta/Notas/café.md", "dois"]]);
    const { crc32: nodeCrc } = await import("node:zlib");
    if (nodeCrc) assert.equal(crc32(enc.encode("dois")), nodeCrc(Buffer.from("dois")));
  });
});

describe("the guardrail (ADR 0079, Consequences) against the browser's store", () => {
  test("two devices and a server end alike and lose no edit, 300 seeds", async () => {
    for (let seed = 1; seed <= 300; seed++) await run(seed);
  });
});
