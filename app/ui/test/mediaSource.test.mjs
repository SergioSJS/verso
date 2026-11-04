// Where an <audio> element's bytes come from (src/audio/source.ts): in
// Linux's web view (WebKitGTK) the media engine refuses the app's own
// schemes (`verso://`, `tauri://`: MediaError 4), so the file is fetched and
// given as a blob of the page's own making; everywhere else the element gets
// the file's own address, as before. The player that uses it is tried on a
// Linux VM (docs/reference/manual-checks.md).
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/audio/source"; export { routeMedia, resetOwnOutputForTests } from "./src/dice3d/ownOutput";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/mediaSource.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/mediaSource.test-bundle.mjs");

globalThis.location = { href: "tauri://localhost/", origin: "tauri://localhost" };

/** An element that keeps its attributes and counts its loads. */
function el() {
  const attrs = new Map();
  return {
    loads: 0,
    currentSrc: "",
    get src() {
      return attrs.get("src") ?? "";
    },
    set src(v) {
      attrs.set("src", v);
    },
    get crossOrigin() {
      return attrs.get("crossorigin") ?? null;
    },
    set crossOrigin(v) {
      attrs.set("crossorigin", v);
    },
    getAttribute: (n) => attrs.get(n) ?? null,
    removeAttribute: (n) => attrs.delete(n),
    load() {
      this.loads++;
    },
  };
}

/** A fetch the test answers by hand, and the blob addresses made and revoked. */
let fetched, made, revoked;
function env(linux) {
  fetched = [];
  made = [];
  revoked = [];
  let n = 0;
  m.setSourceEnvForTests({
    linux,
    fetchBlob: (url) =>
      new Promise((resolve, reject) => {
        fetched.push({ url, resolve, reject });
      }),
    makeUrl: () => {
      const u = `blob:tauri://localhost/${++n}`;
      made.push(u);
      return u;
    },
    revoke: (u) => revoked.push(u),
  });
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("which addresses need a blob", () => {
  test("on Linux, the app's own schemes, and a path of the app's own page", () => {
    for (const u of ["verso://localhost/Musica%2Ftaverna.mp3", "tauri://localhost/dice-sounds/a.mp3", "/dice-sounds/a.mp3"]) assert.equal(m.needsBlob(u, true), true, u);
  });
  test("on Linux, never what the media engine opens itself", () => {
    for (const u of ["https://app.test/f/a.mp3", "http://verso.localhost/a.mp3", "blob:tauri://localhost/1", "data:audio/mpeg;base64,AAAA"]) assert.equal(m.needsBlob(u, true), false, u);
  });
  test("elsewhere (the Mac, Windows, the web), never", () => {
    for (const u of ["verso://localhost/a.mp3", "tauri://localhost/a.mp3", "https://app.test/f/a.mp3"]) assert.equal(m.needsBlob(u, false), false, u);
  });
});

describe("an element given its file", () => {
  beforeEach(() => m.resetOwnOutputForTests());

  test("off Linux: the address itself, at once, asked for with crossorigin as before", async () => {
    env(false);
    const a = el();
    const given = m.setSource(a, "verso://localhost/a.mp3");
    assert.equal(a.src, "verso://localhost/a.mp3");
    assert.equal(a.crossOrigin, "anonymous");
    assert.equal(m.sourceReady(a), true);
    assert.equal(await given, true);
    assert.equal(fetched.length, 0);
  });

  test("on Linux: fetched, then given as a blob; routed into Web Audio as the page's own bytes", async () => {
    env(true);
    const a = el();
    const given = m.setSource(a, "verso://localhost/Musica%2Ftaverna.mp3");
    assert.equal(a.getAttribute("src"), null, "no src before the bytes are here");
    assert.equal(m.sourceReady(a), false);
    assert.deepEqual(
      fetched.map((f) => f.url),
      ["verso://localhost/Musica%2Ftaverna.mp3"],
    );
    fetched[0].resolve({});
    assert.equal(await given, true);
    assert.equal(a.src, made[0]);
    assert.equal(a.crossOrigin, null, "a blob needs no crossorigin");
    assert.equal(m.sourceReady(a), true);
    const ctx = { state: "running", destination: { connect() {} }, createGain: () => ({ gain: { value: 1 }, connect: (n) => n }), createMediaElementSource: () => ({ connect: (n) => n }) };
    assert.ok(m.routeMedia(a, ctx), "a blob's bytes are readable");
  });

  test("lazy: nothing fetched until it is played, and one fetch for two plays", async () => {
    env(true);
    const a = el();
    assert.equal(await m.setSource(a, "verso://localhost/a.mp3", true), false);
    assert.equal(fetched.length, 0);
    const p1 = m.ensureSource(a);
    const p2 = m.ensureSource(a);
    assert.equal(fetched.length, 1);
    fetched[0].resolve({});
    assert.deepEqual([await p1, await p2], [true, true]);
    assert.equal(a.src, made[0]);
    assert.equal(await m.ensureSource(a), true);
    assert.equal(fetched.length, 1);
  });

  test("a newer file wins over a fetch still under way; the old blob is revoked", async () => {
    env(true);
    const a = el();
    const first = m.setSource(a, "verso://localhost/a.mp3");
    const second = m.setSource(a, "verso://localhost/b.mp3");
    fetched[1].resolve({});
    assert.equal(await second, true);
    fetched[0].resolve({});
    assert.equal(await first, false, "the older file never reaches the element");
    assert.equal(made.length, 1);
    assert.equal(a.src, made[0]);
    m.setSource(a, "verso://localhost/c.mp3");
    assert.deepEqual(revoked, [made[0]]);
    assert.equal(a.getAttribute("src"), null);
  });

  test("a file that cannot be read: the element gets the address and fails as any file that does not load", async () => {
    env(true);
    const a = el();
    const given = m.setSource(a, "verso://localhost/gone.mp3");
    fetched[0].reject(new Error("404"));
    assert.equal(await given, true);
    assert.equal(a.src, "verso://localhost/gone.mp3");
    assert.equal(made.length, 0);
  });

  test("released (a player gone): the blob revoked, fetched again if played again; cleared: nothing left", async () => {
    env(true);
    const a = el();
    const given = m.setSource(a, "verso://localhost/a.mp3");
    fetched[0].resolve({});
    await given;
    m.releaseSource(a);
    assert.deepEqual(revoked, [made[0]]);
    assert.equal(a.getAttribute("src"), null);
    assert.equal(m.sourceReady(a), false);
    const again = m.ensureSource(a);
    fetched[1].resolve({});
    assert.equal(await again, true);
    assert.equal(a.src, made[1]);
    m.clearSource(a);
    assert.deepEqual(revoked, [made[0], made[1]]);
    assert.equal(a.getAttribute("src"), null);
    assert.equal(m.sourceReady(a), true, "nothing waits");
    await tick();
  });
});

