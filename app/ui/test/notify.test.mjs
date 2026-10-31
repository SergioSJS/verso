// The notifications' book (ADR 0084 items 2, 5 and 8): once per change of
// a key's state, a newer one in the earlier's place, at most 100 entries
// and none older than 30 days, each kind as the person chose it, and a
// storage that refuses never losing what the window holds.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/notify/core.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/notify.test-bundle.mjs",
  logLevel: "error",
});
const { Book, DEFAULT_MODE, KINDS, LIST_KEY, MAX_AGE_MS, MAX_ENTRIES, STATES_KEY, dayOf, leavingSoon, modeOf, quotaNear } = await import("./.bundles/notify.test-bundle.mjs");

describe("someone joining (ADR 0084 item 8, amended 2026-10-28)", () => {
  const join = (name) => failed({ kind: "presence", key: `presence:f:A.md:${name}`, state: "in:1", level: "info", title: `${name} entrou` });
  test("never chosen: the list, no toast, and so nothing to the system (index.ts sends only a \"toast\")", () => {
    const b = new Book(memory(), clock().now, (k) => modeOf({}, k));
    const out = b.raise(join("Ana"));
    assert.equal(out.said, "list");
    assert.equal(out.entry.read, false, "the bell counts it");
    assert.equal(b.entries.length, 1);
  });
  test("set back to \"Aviso e lista\": a toast, and the system's behind, as before", () => {
    const b = new Book(memory(), clock().now, (k) => modeOf({ presence: "toast" }, k));
    assert.equal(b.raise(join("Ana")).said, "toast");
  });
  test("\"Desligado\": neither the list nor a ring", () => {
    const b = new Book(memory(), clock().now, (k) => modeOf({ presence: "off" }, k));
    assert.equal(b.raise(join("Ana")).said, "off");
  });
});

/** A machine's storage in memory; `refuse` makes every call throw. */
function memory() {
  const kept = new Map();
  return {
    kept,
    refuse: false,
    getItem(k) {
      if (this.refuse) throw new Error("SecurityError");
      return kept.has(k) ? kept.get(k) : null;
    },
    setItem(k, v) {
      if (this.refuse) throw new Error("QuotaExceededError");
      kept.set(k, v);
    },
  };
}

/** A clock a test moves on. */
function clock(start = Date.UTC(2026, 9, 14, 12)) {
  const c = { at: start, now: () => c.at };
  return c;
}

const failed = (over = {}) => ({ kind: "sync", key: "sync:f", state: "error:", level: "error", title: "A sincronização falhou", sentence: "Erro", folder: "f", folderName: "Pasta", ...over });

describe("once per change of the key's state", () => {
  test("the same state again says nothing", () => {
    const b = new Book(memory(), clock().now, () => "toast");
    assert.equal(b.raise(failed()).said, "toast");
    assert.equal(b.raise(failed()).said, "same");
    assert.equal(b.raise(failed({ sentence: "Erro, dito de novo" })).said, "same");
    assert.equal(b.entries.length, 1);
  });
  test("a newer state takes the earlier one's place in the list", () => {
    const b = new Book(memory(), clock().now, () => "toast");
    const first = b.raise(failed()).entry;
    const back = b.raise(failed({ state: "ok", level: "success", title: "A sincronização voltou" }));
    assert.equal(back.said, "toast");
    assert.equal(back.replaced?.id, first.id);
    assert.deepEqual(b.entries.map((e) => e.title), ["A sincronização voltou"]);
    // And failing again is news again.
    assert.equal(b.raise(failed()).said, "toast");
    assert.equal(b.entries.length, 1);
  });
  test("other keys stand beside it, newest first", () => {
    const c = clock();
    const b = new Book(memory(), c.now, () => "toast");
    b.raise(failed());
    c.at += 1000;
    b.raise(failed({ kind: "presence", key: "presence:f:A.md:Bia", state: "in", level: "info", title: "Bia entrou na nota" }));
    assert.deepEqual(b.entries.map((e) => e.key), ["presence:f:A.md:Bia", "sync:f"]);
  });
  test("a settled state makes the next change news, and says nothing itself", () => {
    const b = new Book(memory(), clock().now, () => "toast");
    const join = { kind: "presence", key: "presence:f:A.md:Bia", state: "in", level: "info", title: "Bia entrou", sentence: "", folder: "f", folderName: "P" };
    assert.equal(b.raise(join).said, "toast");
    assert.equal(b.raise(join).said, "same");
    assert.equal(b.settle(join.key, "out"), true);
    assert.equal(b.entries.length, 1, "leaving adds no line");
    assert.equal(b.raise(join).said, "toast");
  });
});

describe("the list's bounds", () => {
  test(`at most ${MAX_ENTRIES} entries, the oldest dropped`, () => {
    const c = clock();
    const b = new Book(memory(), c.now, () => "list");
    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      c.at += 1;
      b.raise(failed({ key: `k${i}` }));
    }
    assert.equal(b.entries.length, MAX_ENTRIES);
    assert.equal(b.entries[0].key, `k${MAX_ENTRIES + 19}`);
    assert.equal(b.entries.at(-1).key, "k20");
  });
  test("none older than 30 days, at the next raise and at the next read", () => {
    const c = clock();
    const store = memory();
    const b = new Book(store, c.now, () => "list");
    b.raise(failed({ key: "old" }));
    c.at += MAX_AGE_MS - 1;
    b.raise(failed({ key: "young" }));
    assert.deepEqual(b.entries.map((e) => e.key), ["young", "old"]);
    c.at += 2;
    b.raise(failed({ key: "newer" }));
    assert.deepEqual(b.entries.map((e) => e.key), ["newer", "young"]);
    // Thirty days and a moment after the last: nothing left to read.
    c.at += MAX_AGE_MS + 1;
    const again = new Book(store, c.now, () => "list");
    assert.deepEqual(again.entries, []);
  });
});

describe("each kind as the person chose it", () => {
  test("every kind starts as \"Aviso e lista\"", () => {
    assert.equal(DEFAULT_MODE, "toast");
    // Every kind is "Aviso e lista" until chosen, but the table's news, which is off (ADR 0107 item 13),
    // and someone joining, "Só na lista" (ADR 0084 item 8, amended 2026-10-28).
    const other = { table: "off", presence: "list" };
    for (const k of KINDS) assert.equal(modeOf({}, k), other[k] ?? "toast");
    assert.equal(modeOf(undefined, "presence"), "list", "never stored: the new default");
    assert.equal(modeOf({ table: "toast" }, "table"), "toast");
    assert.equal(modeOf({ presence: "toast" }, "presence"), "toast", "a stored choice is kept");
    assert.equal(modeOf({ presence: "off" }, "presence"), "off");
    assert.equal(modeOf(undefined, "sync"), "toast");
    assert.equal(modeOf({ sync: "nonsense" }, "sync"), "toast");
  });
  test("\"Só na lista\" lists without a toast; \"Desligado\" neither", () => {
    const chosen = { sync: "list", presence: "off" };
    const b = new Book(memory(), clock().now, (k) => modeOf(chosen, k));
    assert.equal(b.raise(failed()).said, "list");
    const off = b.raise(failed({ kind: "presence", key: "presence:x", state: "in" }));
    assert.equal(off.said, "off");
    assert.equal(off.entry, null);
    assert.deepEqual(b.entries.map((e) => e.key), ["sync:f"]);
    // Off still keeps the state: turned on again, the same state is not news.
    chosen.presence = "toast";
    assert.equal(b.raise(failed({ kind: "presence", key: "presence:x", state: "in" })).said, "same");
  });
});

describe("read, cleared, kept on this machine", () => {
  test("opening the centre marks everything read; Limpar empties the list but keeps the states", () => {
    const b = new Book(memory(), clock().now, () => "toast");
    b.raise(failed());
    b.raise(failed({ key: "other" }));
    assert.equal(b.unread(), 2);
    assert.equal(b.markAllRead(), true);
    assert.equal(b.unread(), 0);
    assert.equal(b.markAllRead(), false);
    b.clear();
    assert.deepEqual(b.entries, []);
    assert.equal(b.raise(failed()).said, "same");
  });
  test("another window of the machine reads the same list; a kept state outlives the window", () => {
    const store = memory();
    const c = clock();
    const one = new Book(store, c.now, () => "toast");
    one.raise({ ...failed(), kind: "updates", key: "update:0.9.0", state: "available", persist: true });
    one.raise(failed());
    const two = new Book(store, c.now, () => "toast");
    assert.deepEqual(two.entries.map((e) => e.key), ["sync:f", "update:0.9.0"]);
    // One notification per version: the next start does not raise it again…
    assert.equal(two.raise({ ...failed(), kind: "updates", key: "update:0.9.0", state: "available", persist: true }).said, "same");
    // …while a window's own state (the sync) starts over.
    assert.equal(two.raise(failed()).said, "toast");
    assert.ok(store.kept.has(LIST_KEY) && store.kept.has(STATES_KEY));
  });
  test("a storage that refuses: the list lives in the window, and says so", () => {
    const store = memory();
    store.refuse = true;
    const b = new Book(store, clock().now, () => "toast");
    assert.equal(b.storageOk, false);
    assert.equal(b.raise(failed()).said, "toast");
    assert.equal(b.entries.length, 1);
    assert.equal(b.storageOk, false);
    store.refuse = false;
    b.raise(failed({ key: "next" }));
    assert.equal(b.storageOk, true);
  });
  test("no storage at all, and a list that is not JSON", () => {
    const none = new Book(null, clock().now, () => "toast");
    assert.equal(none.storageOk, false);
    assert.equal(none.raise(failed()).said, "toast");
    const store = memory();
    store.kept.set(LIST_KEY, "{not json");
    const broken = new Book(store, clock().now, () => "toast");
    assert.deepEqual(broken.entries, []);
    store.kept.set(LIST_KEY, JSON.stringify([{ id: 1 }, { nonsense: true }]));
    assert.deepEqual(new Book(store, clock().now, () => "toast").entries, []);
  });
});

describe("the sources' thresholds", () => {
  test("the trash: entries leaving within 3 days, none for a bin kept for ever", () => {
    const now = Date.UTC(2026, 9, 14, 12);
    const s = now / 1000;
    const day = 86_400;
    assert.equal(leavingSoon([{ expires: s + day }, { expires: s + 3 * day }, { expires: s + 3 * day + 1 }, { expires: null }], now), 2);
    assert.equal(leavingSoon([], now), 0);
  });
  test("the day is the computer's", () => {
    const was = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      assert.equal(dayOf(Date.UTC(2026, 9, 15, 1)), "2026-10-14");
    } finally {
      if (was === undefined) delete process.env.TZ;
      else process.env.TZ = was;
    }
  });
  test("the quota: 90 % or more", () => {
    assert.equal(quotaNear(90, 100), true);
    assert.equal(quotaNear(89, 100), false);
    assert.equal(quotaNear(5, 0), false);
  });
});
