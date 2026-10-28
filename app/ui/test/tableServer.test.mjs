// The server's table (ADR 0107, phase 2): what the window types (a message,
// `/r 1d20+3`, an image) and the server source's handling of the contract's
// commands and events — one entry held once however it arrives, pins, clear,
// roles, the roster. The panel itself is tested in e2e/table2.spec.mjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/server"; export * from "./src/table/send"; export * from "./src/table/model";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableServer.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableServer.test-bundle.mjs");

/* ---------- what is typed ---------- */

test("a line is a message, a roll after /r, or nothing", () => {
  assert.deepEqual(m.readTyped("   "), { kind: "empty" });
  assert.deepEqual(m.readTyped(" Olá, mesa! "), { kind: "say", text: "Olá, mesa!" });
  assert.deepEqual(m.readTyped("/r 1d20+3"), { kind: "roll", notation: "1d20+3" });
  assert.deepEqual(m.readTyped("/R 4d6kh3"), { kind: "roll", notation: "4d6kh3" });
  assert.deepEqual(m.readTyped("/roll 2d6 + 1"), { kind: "roll", notation: "2d6+1" });
  // The field is several lines tall: a roll is its first line; a message keeps its line breaks.
  assert.deepEqual(m.readTyped("/r 1d20+3\nnota para mim"), { kind: "roll", notation: "1d20+3" });
  assert.deepEqual(m.readTyped("linha um\nlinha dois"), { kind: "say", text: "linha um\nlinha dois" });
});

test("/r with nothing readable is a bad roll, said as such; /rant is a message", () => {
  assert.deepEqual(m.readTyped("/r"), { kind: "badRoll", typed: "" });
  assert.deepEqual(m.readTyped("/r banana"), { kind: "badRoll", typed: "banana" });
  assert.deepEqual(m.readTyped("/rant about it"), { kind: "say", text: "/rant about it" });
  assert.deepEqual(m.readTyped("/dado"), { kind: "say", text: "/dado" });
});

test("a message is at most 500 characters, counted as people count them", () => {
  assert.equal(m.readTyped("a".repeat(500)).kind, "say");
  assert.deepEqual(m.readTyped("a".repeat(501)), { kind: "long", length: 501 });
  // 500 emoji are 500 characters, not 1000.
  assert.equal(m.readTyped("😀".repeat(500)).kind, "say");
  assert.equal(m.charsOf("  😀😀 "), 2);
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test("an image is checked by its bytes: PNG, JPEG, WebP, GIF; not SVG, not a name", () => {
  for (const bytes of [png, jpg, gif, webp]) assert.equal(m.checkImage(bytes), null);
  assert.equal(m.checkImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), "type");
  assert.equal(m.checkImage(new TextEncoder().encode("a text that is named photo.png")), "type");
  assert.equal(m.checkImage(new Uint8Array(0)), "empty");
  // RIFF that is not WebP (a WAV) is no image.
  assert.equal(m.checkImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), "type");
});

test("an image over 10 MB is refused before it is read as one", () => {
  const big = new Uint8Array(m.IMAGE_MAX + 1);
  big.set(png);
  assert.equal(m.checkImage(big), "size");
  const edge = new Uint8Array(m.IMAGE_MAX);
  edge.set(png);
  assert.equal(m.checkImage(edge), null);
});

test("base64 of a large image is made in slices and decodes back", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.deepEqual(new Uint8Array(Buffer.from(m.toBase64(bytes), "base64")), bytes);
});

test("the server's pace refusal gives the seconds to wait", () => {
  assert.equal(m.paceWait("too fast: wait 3 s"), 3);
  assert.equal(m.paceWait("a message is plain text"), null);
});

/* ---------- the source ---------- */

const styles = { 1: { body: "#112233", number: "#ffffff", outline: "#000000", texture: "none", material: "plastic" }, 2: { body: "#112233", number: "#ffffff", outline: "#000000", texture: "none", material: "plastic" }, 3: { body: "#112233", number: "#ffffff", outline: "#000000", texture: "none", material: "plastic" } };
const wire = (id, over = {}) => ({ table: "", id: String(id), kind: "say", by: "Bia", by_id: "acc-bia", at: `2026-10-22T12:00:${String(id % 60).padStart(2, "0")}Z`, path: null, pinned: false, secret: false, roll: null, draw: null, text: `msg ${id}`, image: null, ...over });
const rollWire = (id, over = {}) => wire(id, { kind: "roll", text: null, roll: { notation: "1d20+3", source: null, terms: [{ sign: 1, sides: 20, fudge: false, kept: [14], dropped: [] }], modifier: 3, total: 17, by: "Bia", at: "2026-10-22T12:00:00Z", styles }, ...over });

function fake({ role = "editor", entries = [], more = false, roster, joinFails = false, table = "", images, files } = {}) {
  const calls = [];
  /** The table each command named, in order. */
  const named = [];
  const handlers = new Map();
  const unlistened = [];
  const ok = (data) => Promise.resolve({ status: "ok", data });
  const api = {
    join: (color, st, tb) => {
      calls.push(["join", color, st]);
      named.push(tb);
      if (joinFails) return ok(null).then(() => ({ status: "error", error: { kind: "refused", message: "the table is a server's" } }));
      return ok({ table, you: "acc-ana", role, entries, more, roster: roster ?? [{ name: "Ana", by_id: "acc-ana", color: "#b5651d", styles: null }], ...(images === undefined ? {} : { images }), ...(files === undefined ? {} : { files }) });
    },
    leave: (tb) => (calls.push(["leave"]), named.push(tb), ok(null)),
    look: (color, st, tb) => (calls.push(["look", color, st]), named.push(tb), ok(null)),
    history: (before, limit, tb) => {
      calls.push(["history", before, limit]);
      named.push(tb);
      return ok({ entries: [wire(1), wire(2)], more: false });
    },
    say: (text, tb) => (calls.push(["say", text]), named.push(tb), ok(wire(90, { by: "Ana", by_id: "acc-ana", text }))),
    sendImage: () => ok(wire(91, { kind: "image", text: null, image: "attachments/x.png", by: "Ana", by_id: "acc-ana" })),
    roll: (n, s, p, secret, st, occ, tb) => (calls.push(["roll", n, s, p, secret, st]), named.push(tb), ok(rollWire(92, { by: "Ana", by_id: "acc-ana", secret: secret === true }))),
    pin: (id, pinned, tb) => (calls.push(["pin", id, pinned]), named.push(tb), ok(null)),
    del: (id, tb) => (calls.push(["del", id]), named.push(tb), ok(null)),
    clear: (keep, tb) => (calls.push(["clear", keep]), named.push(tb), ok(null)),
    listen: (event, fn) => {
      handlers.set(event, fn);
      return Promise.resolve(() => unlistened.push(event));
    },
  };
  const deps = { api, table, styles: () => styles, colorFor: (name) => (name === "Ana" ? "#2e7d32" : null), oracleWords: (d) => d.words.join(" "), explain: (e) => `E:${e.message}` };
  return { api, deps, calls, named, handlers, unlistened, fire: (event, payload) => handlers.get(event)(payload) };
}

test("joining holds the latest entries and the pinned ones, in order, and the roster", async () => {
  const f = fake({ entries: [wire(1), wire(2, { pinned: true }), rollWire(3)], more: true });
  const t = await m.openServerTable(f.deps);
  assert.ok(m.isServerTable(t));
  assert.equal(t.shared, true);
  assert.equal(t.receivesOwn, true);
  assert.deepEqual(t.entries().map((e) => e.id), ["1", "3"]);
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["2"]);
  assert.equal(t.more(), true);
  assert.equal(t.roster()[0].name, "Ana");
  // The join sent the person's dice and no colour yet (the name is learned from it).
  assert.deepEqual(f.calls[0], ["join", null, styles]);
  // The history is not news.
  assert.equal(t.unread(), 0);
});

test("the person's presence colour is told once the join has given the name", async () => {
  const f = fake();
  await m.openServerTable(f.deps);
  assert.deepEqual(f.calls[1], ["look", "#2e7d32", styles]);
});

test("listening starts before the join: an entry sent meanwhile is held once", async () => {
  const f = fake({ entries: [wire(5)] });
  const t = await m.openServerTable(f.deps);
  f.fire("table-entry", wire(5));
  f.fire("table-entry", wire(6));
  f.fire("table-entry", wire(6));
  assert.deepEqual(t.entries().map((e) => e.id), ["5", "6"]);
});

test("an entry by someone else is unread and told to the window; mine, and the sender's echo, are not", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  f.fire("table-entry", wire(10));
  f.fire("table-entry", rollWire(11));
  assert.equal(t.unread(), 2);
  assert.deepEqual(news, ["10", "11"]);
  // My own message arrives as the command's answer and as the event: once, never unread.
  assert.equal(await t.say("oi"), null);
  f.fire("table-entry", wire(90, { by: "Ana", by_id: "acc-ana", text: "oi" }));
  assert.equal(t.entries().filter((e) => e.id === "90").length, 1);
  assert.equal(t.entries().find((e) => e.id === "90").mine, true);
  assert.equal(t.unread(), 2);
  t.markSeen();
  assert.equal(t.unread(), 0);
});

test("the same account on ANOTHER device is news here: it falls, sounds and counts unread, still \"Você\"", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  // No command of this window is on its way: acc-ana's entry came from elsewhere.
  f.fire("table-entry", rollWire(30, { by: "Ana", by_id: "acc-ana" }));
  assert.deepEqual(news, ["30"]);
  assert.equal(t.unread(), 1);
  const e = t.entries().find((x) => x.id === "30");
  assert.equal(e.mine, true);
  assert.equal(e.elsewhere, true);
  assert.equal(m.isNews(e), true);
});

test("this window's own roll, its event arriving BEFORE the answer, is not news; another device's meanwhile is", async () => {
  const news = [];
  const f = fake();
  let answer;
  f.api.roll = () => new Promise((res) => (answer = () => res({ status: "ok", data: rollWire(92, { by: "Ana", by_id: "acc-ana" }) })));
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  const rolled = t.roll("1d20+3");
  // The server tells every window of the account, this one too, before the answer;
  // and another device of the account rolled at the same moment.
  f.fire("table-entry", rollWire(92, { by: "Ana", by_id: "acc-ana" }));
  f.fire("table-entry", rollWire(93, { by: "Ana", by_id: "acc-ana" }));
  assert.deepEqual(news, []);
  answer();
  await rolled;
  assert.deepEqual(news, ["93"]);
  assert.equal(t.unread(), 1);
  assert.equal(t.entries().find((x) => x.id === "92").elsewhere, undefined);
  assert.equal(t.entries().find((x) => x.id === "93").elsewhere, true);
});

const deferred = () => {
  let done;
  const promise = new Promise((res) => (done = res));
  return { promise, done };
};

test("a note room's roll made here: the table's push, before OR after the room's answer, is not news", async () => {
  for (const order of ["before", "after"]) {
    const news = [];
    const f = fake();
    const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
    const answer = deferred();
    const roll = rollWire(40, { by: "Ana", by_id: "acc-ana" }).roll;
    const call = t.making(answer.promise, (r) => (r.status === "ok" ? m.claimRoll("", r.data) : null));
    if (order === "before") f.fire("table-entry", rollWire(40, { by: "Ana", by_id: "acc-ana" }));
    answer.done({ status: "ok", data: roll });
    await call;
    if (order === "after") f.fire("table-entry", rollWire(40, { by: "Ana", by_id: "acc-ana" }));
    assert.deepEqual(news, [], order);
    assert.equal(t.unread(), 0, order);
    // Another device's roll of the same dice afterwards is news again.
    f.fire("table-entry", rollWire(41, { by: "Ana", by_id: "acc-ana" }));
    assert.deepEqual(news, ["41"], order);
  }
});

test("a claim needs the same note: another device's identical roll elsewhere is news", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  const answer = deferred();
  const call = t.making(answer.promise, (r) => (r.status === "ok" ? m.claimRoll("Ata.md", r.data) : null));
  answer.done({ status: "ok", data: rollWire(90, { by: "Ana", by_id: "acc-ana" }).roll });
  await call;
  f.fire("table-entry", rollWire(91, { by: "Ana", by_id: "acc-ana", path: "Outra.md" }));
  assert.deepEqual(news, ["91"]);
  f.fire("table-entry", rollWire(92, { by: "Ana", by_id: "acc-ana", path: "Ata.md" }));
  assert.deepEqual(news, ["91"]);
});

test("a command that fails as unavailable may still have been appended: its entry is not released as another device's", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  const answer = deferred();
  const call = t.making(answer.promise, (r) => (r.status === "error" && r.error.kind === "unavailable" ? (e) => e.notation === "1d20+3" : null));
  f.fire("table-entry", rollWire(50, { by: "Ana", by_id: "acc-ana" }));
  answer.done({ status: "error", error: { kind: "unavailable", message: "gone" } });
  await call;
  assert.deepEqual(news, []);
});

test("two commands at once: each claims its own entry, and a third that nobody claimed is news", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  const one = deferred();
  const two = deferred();
  const claim = (r) => (r.status === "ok" ? m.claimRoll("", r.data) : null);
  const a = t.making(one.promise, claim);
  const b = t.making(two.promise, claim);
  const mk = (id, total) => rollWire(id, { by: "Ana", by_id: "acc-ana", roll: { ...rollWire(id).roll, total } });
  f.fire("table-entry", mk(60, 11));
  f.fire("table-entry", mk(61, 12));
  f.fire("table-entry", mk(62, 13));
  one.done({ status: "ok", data: mk(60, 11).roll });
  await a;
  assert.deepEqual(news, [], "one command is still on its way");
  two.done({ status: "ok", data: mk(61, 12).roll });
  await b;
  assert.deepEqual(news, ["62"]);
  assert.equal(t.unread(), 1);
});

test("an entry held for a command that never answers is released as news after a few seconds", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const news = [];
    const f = fake();
    const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
    void t.making(new Promise(() => {}), () => null);
    f.fire("table-entry", rollWire(70, { by: "Ana", by_id: "acc-ana" }));
    assert.deepEqual(news, []);
    mock.timers.tick(3100);
    assert.deepEqual(news, [], "still tied to a command in flight");
    mock.timers.tick(30000);
    assert.deepEqual(news, ["70"]);
  } finally {
    mock.timers.reset();
  }
});

test("an entry removed or a table closed while held is never news", async () => {
  const news = [];
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, onNews: (e) => news.push(e.id) });
  const answer = deferred();
  const call = t.making(answer.promise, () => null);
  f.fire("table-entry", rollWire(80, { by: "Ana", by_id: "acc-ana" }));
  f.fire("table-removed", { table: "", id: "80" });
  f.fire("table-entry", rollWire(81, { by: "Ana", by_id: "acc-ana" }));
  await t.close();
  answer.done({ status: "ok", data: null });
  await call;
  assert.deepEqual(news, []);
  assert.equal(t.unread(), 0);
});

test("a roll carries the roller's dice into the entry; a malformed look falls back field by field", async () => {
  const f = fake();
  const t = await m.openServerTable(f.deps);
  f.fire("table-entry", rollWire(20));
  assert.equal(t.entries()[0].styles["1"].body, "#112233");
  f.fire("table-entry", rollWire(21, { roll: { ...rollWire(21).roll, styles: { 1: { body: "url(http://x)", number: "red;", outline: 1, texture: "../x", material: "glass" } } } }));
  const bad = t.entries().find((e) => e.id === "21").styles["1"];
  assert.match(bad.body, /^#[0-9a-f]{6}$/);
  assert.match(bad.number, /^#[0-9a-f]{6}$/);
  assert.equal(bad.texture, "none");
});

test("pinning moves an entry to the pinned list for everyone; unpinning brings it back", async () => {
  const f = fake({ entries: [wire(1), wire(2)] });
  const t = await m.openServerTable(f.deps);
  assert.equal(await t.pin("1", true), null);
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["1"]);
  assert.deepEqual(t.entries().map((e) => e.id), ["2"]);
  // Someone else pins the other: the event does the same.
  f.fire("table-pinned", { table: "", id: "2", pinned: true });
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["1", "2"]);
  f.fire("table-pinned", { table: "", id: "1", pinned: false });
  assert.deepEqual(t.entries().map((e) => e.id), ["1"]);
});

test("removal and clear: the pinned stay when asked, everything goes when not; hiding does not touch the pinned", async () => {
  const f = fake({ role: "owner", entries: [wire(1), wire(2, { pinned: true }), wire(3)] });
  const t = await m.openServerTable(f.deps);
  f.fire("table-removed", { table: "", id: "3" });
  assert.deepEqual(t.entries().map((e) => e.id), ["1"]);
  t.hideUpToHere();
  assert.deepEqual(t.entries().map((e) => e.id), []);
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["2"]);
  assert.equal(t.undoHide(), true);
  f.fire("table-cleared", { table: "", keep_pinned: true });
  assert.deepEqual(t.entries(), []);
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["2"]);
  assert.equal(await t.clear(false), null);
  assert.deepEqual(t.pinnedEntries(), []);
  assert.deepEqual(f.calls.at(-1), ["clear", false]);
});

test("a secret roll: the roller and the owners have it, the others a line without notation or number", async () => {
  const f = fake();
  const t = await m.openServerTable(f.deps);
  f.fire("table-entry", wire(30, { kind: "secret", text: null, secret: true }));
  const e = t.entries()[0];
  assert.equal(e.kind, "secret");
  assert.equal(e.notation, "");
  assert.equal(e.total, null);
  t.secret = true;
  const r = await t.roll("1d20", { secret: t.secret });
  assert.ok("entry" in r);
  assert.deepEqual(f.calls.at(-1).slice(0, 5), ["roll", "1d20", null, null, true]);
  // The toggle is for what the person typed: a note's die does not pass it, and is not secret.
  await t.roll("1d6", { path: "N.md" });
  assert.deepEqual(f.calls.at(-1).slice(0, 5), ["roll", "1d6", null, "N.md", null]);
});

test("what each role may do", async () => {
  const mk = async (role) => m.openServerTable(fake({ role, entries: [wire(1, { by_id: "acc-ana", by: "Ana" }), wire(2), rollWire(3, { by_id: "acc-ana", by: "Ana" })] }).deps);
  const owner = await mk("owner");
  const editor = await mk("editor");
  const reader = await mk("reader");
  assert.equal(owner.canClear() && !editor.canClear() && !reader.canClear(), true);
  assert.equal(owner.canSendImage() && editor.canSendImage() && !reader.canSendImage(), true);
  const by = (t, id) => t.entries().find((e) => e.id === id);
  // Mine: deleted by me; another's: only by an owner; a roll: only by an owner (the game master, ADR 0107 2026-10-23).
  assert.equal(editor.canDelete(by(editor, "1")), true);
  assert.equal(editor.canDelete(by(editor, "2")), false);
  assert.equal(owner.canDelete(by(owner, "2")), true);
  assert.equal(owner.canDelete(by(owner, "3")), true);
  assert.equal(editor.canDelete(by(editor, "3")), false);
  assert.equal(reader.canDelete(by(reader, "3")), false);
});

test("older entries are asked from the oldest unpinned one held, and added in their place", async () => {
  const f = fake({ entries: [wire(7, { pinned: true }), wire(10), wire(11)], more: true });
  const t = await m.openServerTable(f.deps);
  assert.equal(await t.loadOlder(), null);
  assert.deepEqual(f.calls.at(-1), ["history", "10", m.PAGE]);
  assert.deepEqual(t.entries().map((e) => e.id), ["1", "2", "10", "11"]);
  assert.equal(t.more(), false);
  // Not news.
  assert.equal(t.unread(), 0);
});

test("the roster follows the server's list, with each person's colour and dice", async () => {
  const f = fake();
  const t = await m.openServerTable(f.deps);
  let told = 0;
  t.onChange(() => told++);
  f.fire("table-roster", { table: "", members: [{ name: "Ana", by_id: "acc-ana", color: "#2e7d32", styles: null }, { name: "Bia", by_id: "acc-bia", color: "#1565c0", styles }] });
  assert.deepEqual(t.roster().map((x) => [x.name, x.color]), [["Ana", "#2e7d32"], ["Bia", "#1565c0"]]);
  assert.equal(t.roster()[1].styles["1"].body, "#112233");
  assert.ok(told > 0);
});

test("a refusal is returned in the person's words and holds nothing", async () => {
  const f = fake();
  f.api.say = () => Promise.resolve({ status: "error", error: { kind: "refused", message: "too fast: wait 2 s" } });
  const t = await m.openServerTable(f.deps);
  assert.equal(await t.say("oi"), "E:too fast: wait 2 s");
  assert.deepEqual(t.entries(), []);
  f.api.roll = () => Promise.reject(new Error("socket closed"));
  const r = await t.roll("1d6");
  assert.ok("error" in r);
});

test("a table the side does not have: the join is refused and nothing stays listening", async () => {
  const f = fake({ joinFails: true });
  assert.equal(await m.openServerTable(f.deps), null);
  assert.equal(f.unlistened.length, 6);
});

test("closing leaves the table and stops hearing it; what arrives after is dropped", async () => {
  const f = fake();
  const t = await m.openServerTable(f.deps);
  t.close();
  assert.equal(f.unlistened.length, 6);
  assert.deepEqual(f.calls.at(-1), ["leave"]);
  f.fire("table-entry", wire(40));
  assert.deepEqual(t.entries(), []);
});

test("the dice look changing is told to the table", async () => {
  const f = fake();
  const t = await m.openServerTable(f.deps);
  t.look();
  assert.deepEqual(f.calls.at(-1), ["look", "#2e7d32", styles]);
});

test("a table roll's row is read from its note and drawn when it arrives", async () => {
  const f = fake();
  const t = await m.openServerTable({ ...f.deps, rowOf: async (e) => (e.kind === "table" ? "Lobos" : null) });
  f.fire("table-entry", rollWire(50, { roll: { ...rollWire(50).roll, source: "[[Mesa#^e]]" } }));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(t.entries()[0].row, "Lobos");
});

/* ---------- one log per table (ADR 0107, 2026-10-23) ---------- */

test("every command names the table the window joined, and the join says which it is", async () => {
  const f = fake({ table: "Cripta" });
  const t = await m.openServerTable({ ...f.deps, table: "Cripta" });
  assert.equal(t.table, "Cripta");
  await t.say("oi");
  await t.roll("1d6", { path: "Cripta/N.md" });
  await t.loadOlder();
  await t.pin("1", true);
  await t.remove("1");
  await t.clear(true);
  t.look();
  await t.close();
  assert.ok(f.named.length >= 9, String(f.named.length));
  assert.ok(f.named.every((x) => x === "Cripta"), JSON.stringify(f.named));
});

test("a window that asks for no table is at the one the server names", async () => {
  const f = fake({ table: "Sala" });
  const t = await m.openServerTable({ ...f.deps, table: null });
  assert.equal(f.named[0], null);
  assert.equal(t.table, "Sala");
  await t.say("oi");
  assert.equal(f.named.at(-1), "Sala");
});

test("what is told of another table is not this table's: no entry, pin, removal, clear or roster", async () => {
  const f = fake({ table: "Cripta", entries: [wire(1, { table: "Cripta" }), wire(2, { table: "Cripta", pinned: true })] });
  const t = await m.openServerTable({ ...f.deps, table: "Cripta" });
  f.fire("table-entry", wire(3, { table: "Sala" }));
  f.fire("table-pinned", { table: "Sala", id: "1", pinned: true });
  f.fire("table-removed", { table: "Sala", id: "1" });
  f.fire("table-cleared", { table: "Sala", keep_pinned: false });
  f.fire("table-roster", { table: "Sala", members: [] });
  assert.deepEqual(t.entries().map((e) => e.id), ["1"]);
  assert.deepEqual(t.pinnedEntries().map((e) => e.id), ["2"]);
  assert.equal(t.roster().length, 1);
  assert.equal(t.unread(), 0);
  // The same events for its own table are heard.
  f.fire("table-entry", wire(4, { table: "Cripta" }));
  f.fire("table-roster", { table: "Cripta", members: [] });
  assert.deepEqual(t.entries().map((e) => e.id), ["1", "4"]);
  assert.equal(t.roster().length, 0);
});

test("a player sends images when the game master lets it, told live; an older server's reader never does", async () => {
  // The join says it; the permission can change under the window and it is told at once.
  const f = fake({ role: "reader", images: false });
  const t = await m.openServerTable(f.deps);
  let heard = 0;
  t.onChange(() => heard++);
  assert.equal(t.canSendImage(), false);
  f.fire("table-images", { table: "", images: true });
  assert.equal(t.canSendImage(), true);
  assert.equal(heard, 1);
  f.fire("table-images", { table: "", images: true });
  assert.equal(heard, 1, "the same news is no change");
  f.fire("table-images", { table: "Outra", images: false });
  assert.equal(t.canSendImage(), true, "another table's news is not this one's");
  f.fire("table-images", { table: "", images: false });
  assert.equal(t.canSendImage(), false);
  assert.equal(heard, 2);
  // Granted at the join.
  const g = await m.openServerTable(fake({ role: "reader", images: true }).deps);
  assert.equal(g.canSendImage(), true);
  // A server that does not say: a reader does not, an editor does.
  assert.equal((await m.openServerTable(fake({ role: "reader" }).deps)).canSendImage(), false);
  assert.equal((await m.openServerTable(fake({ role: "editor" }).deps)).canSendImage(), true);
});

test("Images and Files are two rights: told apart at the join and live (ADR 0113 K.6)", async () => {
  const f = fake({ role: "reader", images: false, files: false });
  const t = await m.openServerTable(f.deps);
  assert.equal(t.canSendImage() || t.canSendFile(), false);
  let heard = 0;
  t.onChange(() => heard++);
  f.fire("table-images", { table: "", images: true, files: false });
  assert.deepEqual([t.canSendImage(), t.canSendFile()], [true, false]);
  f.fire("table-images", { table: "", images: true, files: true });
  assert.deepEqual([t.canSendImage(), t.canSendFile()], [true, true]);
  f.fire("table-images", { table: "", images: false, files: true });
  assert.deepEqual([t.canSendImage(), t.canSendFile()], [false, true]);
  assert.equal(heard, 3);
  // At the join: only the files.
  const g = await m.openServerTable(fake({ role: "reader", images: false, files: true }).deps);
  assert.deepEqual([g.canSendImage(), g.canSendFile()], [false, true]);
});

test("a file of the chat is an entry that can be dragged as a link; a masked secret holds nothing to drag", () => {
  const words = () => "";
  const file = m.entryOfServer(wire(1, { kind: "file", text: null, image: "attachments/mapa.pdf" }), "acc-ana", words);
  assert.equal(file?.kind, "file");
  assert.equal(file?.image, "attachments/mapa.pdf");
  const masked = m.entryOfServer(wire(2, { kind: "secret", text: null }), "acc-ana", words);
  assert.equal(masked?.kind, "secret");
  assert.equal(masked?.image, null);
});

test("Send files (K.4): a PDF and audio are checked by their bytes like an image; not a page, not a script", () => {
  const text = (s) => new TextEncoder().encode(s);
  const pdf = text("%PDF-1.4\n1 0 obj");
  const mp3 = text("ID3\x04\0\0\0\0\0\0");
  const ogg = text("OggS\0\x02");
  const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  const m4a = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  for (const bytes of [pdf, mp3, ogg, wav, m4a, png]) assert.equal(m.checkFile(bytes), null);
  assert.equal(m.fileKind(pdf), "pdf");
  assert.equal(m.fileKind(wav), "audio");
  assert.equal(m.fileKind(png), "image");
  assert.equal(m.checkFile(text("<html><script>1</script></html>")), "type");
  assert.equal(m.checkFile(text('<svg xmlns="http://www.w3.org/2000/svg"/>')), "type");
  assert.equal(m.checkFile(new Uint8Array(0)), "empty");
  const big = new Uint8Array(m.IMAGE_MAX + 1);
  big.set(pdf);
  assert.equal(m.checkFile(big), "size");
  // What a browser lists as sendable, with or without a type.
  assert.equal(m.sendable({ type: "application/pdf", name: "a" }), true);
  assert.equal(m.sendable({ type: "audio/ogg", name: "a" }), true);
  assert.equal(m.sendable({ type: "", name: "a.PDF" }), true);
  assert.equal(m.sendable({ type: "text/html", name: "a.html" }), false);
});
