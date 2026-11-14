// A web page that is a native view floats over the DOM (ADR 0056): while an
// overlay is open it is replaced by a picture of itself (revision of
// 2026-11-12, the maintainer: "pode claro"). The order is what keeps the
// page from flashing: the picture in place before the view hides, the view
// shown before the picture goes; and a page with no picture hides as before.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.getComputedStyle = (el) => win.getComputedStyle(el);

await esbuild.build({
  entryPoints: ["src/leaves/webSnapshot.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/webSnapshot.test-bundle.mjs",
  logLevel: "error",
});
const { coverPage, uncoverPage, dropPage, pageStep, pictureBlob, covered, COVERED, COVER_WAIT } = await import("./.bundles/webSnapshot.test-bundle.mjs");

const PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPQyp8ORAwQCgAfmgTBPNjIwQAAAABJRU5ErkJggg==";

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

/** The host and the window, played by hand: each step is logged in order,
 *  the picture and the timer come when the test says. */
function fakeIo(host) {
  const log = [];
  const shot = deferred();
  const timers = [];
  let urls = 0;
  const io = {
    log,
    shot,
    timers,
    live: new Set(),
    snapshot: (label) => {
      log.push(`snapshot ${label}`);
      return shot.promise;
    },
    visible: async (label, on) => {
      log.push(`${on ? "show" : "hide"} ${label}${host.querySelector("img.web-snapshot") ? " (picture in place)" : ""}`);
    },
    after: (ms, fn) => timers.push({ ms, fn }),
    painted: async () => {
      log.push("painted");
    },
    decode: async () => {},
    url: () => {
      const u = `blob:picture-${++urls}`;
      io.live.add(u);
      return u;
    },
    revoke: (u) => {
      io.live.delete(u);
      log.push(`revoke ${u}`);
    },
  };
  return io;
}

/** Let every pending promise run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function box() {
  const host = document.createElement("div");
  host.className = "embed-web";
  host.style.border = "1px solid black";
  document.body.append(host);
  return host;
}

describe("a web page behind an overlay", () => {
  beforeEach(() => document.body.replaceChildren());

  test("the overlay opens: the picture goes in place, then the view hides", async () => {
    const host = box();
    const io = fakeIo(host);
    coverPage(host, "web-1", io);
    assert.deepEqual(io.log, ["snapshot web-1"]);
    assert.equal(io.timers[0].ms, COVER_WAIT);
    io.shot.resolve(PICTURE);
    await settle();
    const img = host.querySelector("img.web-snapshot");
    assert.ok(img, "the picture is in the page's box");
    // Hidden only once the picture was painted: no flash.
    assert.deepEqual(io.log, ["snapshot web-1", "painted", "hide web-1 (picture in place)"]);
    // Decorative: nothing for assistive technology, no pointer.
    assert.equal(img.getAttribute("aria-hidden"), "true");
    assert.equal(img.getAttribute("alt"), "");
    assert.equal(img.draggable, false);
    // Over the box's border too, where the page's view is.
    assert.equal(img.style.left, "-1px");
    assert.equal(img.style.top, "-1px");
    assert.equal(img.style.width, "calc(100% + 2px)");
    assert.equal(img.style.height, "calc(100% + 2px)");
    // The timer that follows finds the page hidden already.
    io.timers[0].fn();
    assert.equal(io.log.filter((l) => l.startsWith("hide")).length, 1);
  });

  test("the overlay closes: the view shows first, then the picture goes and its URL is released", async () => {
    const host = box();
    const io = fakeIo(host);
    pageStep(host, "web-1", "1|0|0|800|600|2", COVERED, async () => {}, io);
    io.shot.resolve(PICTURE);
    await settle();
    io.log.length = 0;
    pageStep(host, "web-1", COVERED, "1|0|0|800|600|2", async () => io.log.push("place web-1"), io);
    await settle();
    assert.deepEqual(io.log, ["place web-1", "show web-1 (picture in place)", "painted", "revoke blob:picture-1"]);
    assert.equal(host.querySelector("img"), null);
    assert.equal(io.live.size, 0, "no object URL left behind");
    assert.equal(covered(host), false);
  });

  test("no picture (a system that cannot draw one): the page hides, as before", async () => {
    const host = box();
    const io = fakeIo(host);
    coverPage(host, "web-2", io);
    io.shot.resolve(null);
    await settle();
    assert.deepEqual(io.log, ["snapshot web-2", "hide web-2"]);
    assert.equal(host.querySelector("img"), null);
    assert.equal(io.live.size, 0);
  });

  test("a picture that is not an image hides the page too", async () => {
    const host = box();
    const io = fakeIo(host);
    coverPage(host, "web-2", io);
    io.shot.resolve("data:text/html;base64,PGI+");
    await settle();
    assert.deepEqual(io.log, ["snapshot web-2", "hide web-2"]);
  });

  test("a slow picture: the page hides after the wait, and the late picture still shows", async () => {
    const host = box();
    const io = fakeIo(host);
    coverPage(host, "web-3", io);
    io.timers[0].fn();
    assert.deepEqual(io.log, ["snapshot web-3", "hide web-3"]);
    io.shot.resolve(PICTURE);
    await settle();
    assert.ok(host.querySelector("img.web-snapshot"), "the late picture fills the hole");
    assert.equal(io.log.filter((l) => l.startsWith("hide")).length, 1, "hidden once");
  });

  test("the overlay closes before the picture comes: the view never hid, no picture is left", async () => {
    const host = box();
    const io = fakeIo(host);
    pageStep(host, "web-4", "1|a", COVERED, async () => {}, io);
    pageStep(host, "web-4", COVERED, "1|a", async () => {}, io);
    await settle();
    io.shot.resolve(PICTURE);
    io.timers[0].fn();
    await settle();
    assert.equal(io.log.filter((l) => l.startsWith("hide")).length, 0);
    assert.equal(host.querySelector("img"), null);
    assert.equal(io.live.size, 0);
  });

  test("the page leaves the screen under the overlay: the picture goes at once", async () => {
    const host = box();
    const io = fakeIo(host);
    pageStep(host, "web-5", "1|a", COVERED, async () => {}, io);
    io.shot.resolve(PICTURE);
    await settle();
    io.log.length = 0;
    pageStep(host, "web-5", COVERED, "0", async () => {}, io);
    assert.equal(host.querySelector("img"), null);
    assert.deepEqual(io.log, ["revoke blob:picture-1", "hide web-5"]);
    // Gone already: dropping again does nothing.
    dropPage(host, io);
    await uncoverPage(host, io);
    assert.equal(io.log.length, 2);
  });

  test("a page that was not showing has no picture to take: it stays hidden", async () => {
    const host = box();
    for (const was of ["", "0"]) {
      const io = fakeIo(host);
      pageStep(host, "web-6", was, COVERED, async () => {}, io);
      await settle();
      assert.deepEqual(io.log, ["hide web-6"], `from "${was}"`);
      assert.equal(covered(host), false);
    }
  });

  test("the picture's bytes come from its data address", () => {
    const blob = pictureBlob(PICTURE);
    assert.equal(blob.type, "image/png");
    assert.ok(blob.size > 50);
    assert.equal(pictureBlob("data:text/plain;base64,aGk="), null);
    assert.equal(pictureBlob("https://example.com/a.png"), null);
    assert.equal(pictureBlob("data:image/png;base64,***"), null);
  });
});
