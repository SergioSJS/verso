// When a person's joining is news: only where the person looks, and once.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/notify/presenceNews.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/presenceNews.test-bundle.mjs",
  logLevel: "error",
});
const { PRESENCE_AGAIN_MS, PRESENCE_SETTLE_MS, PresenceNews, concerns } = await import("./.bundles/presenceNews.test-bundle.mjs");

const here = { folder: "/mesa", tabShowing: true, windowInFront: true };
const MIN = 60_000;
const verdict = (n, where, path, name, now) => n.verdict(where, path, name, now);

describe("where", () => {
  test("showing tab in the front window concerns; a hidden tab or a window behind does not", () => {
    assert.equal(concerns(here), true);
    assert.equal(concerns({ ...here, tabShowing: false }), false);
    assert.equal(concerns({ ...here, windowInFront: false }), false);
  });
  test("the real decision: toast where looked at, the list elsewhere", () => {
    const n = new PresenceNews();
    assert.equal(verdict(n, here, "a.md", "Ana", 0), "toast");
    assert.equal(verdict(n, { ...here, tabShowing: false }, "b.md", "Ana", 0), "list", "a hidden tab: the list, no toast");
    assert.equal(verdict(n, { ...here, windowInFront: false }, "c.md", "Ana", 0), "list", "a window behind: the list and the system, no toast");
  });
  test("another folder's sightings are its own", () => {
    const n = new PresenceNews();
    assert.equal(verdict(n, here, "a.md", "Ana", 0), "toast");
    assert.equal(verdict(n, { ...here, folder: "/outra" }, "a.md", "Ana", 1), "toast");
  });
  test("a sighting while hidden is not news when the tab shows again", () => {
    const n = new PresenceNews();
    verdict(n, { ...here, tabShowing: false }, "a.md", "Ana", 0);
    assert.equal(verdict(n, here, "a.md", "Ana", 5 * MIN), "none");
  });
});

describe("rate", () => {
  test("a rejoin within the window is nothing; after it, news again", () => {
    const n = new PresenceNews();
    assert.equal(verdict(n, here, "a.md", "Ana", 0), "toast");
    assert.equal(verdict(n, here, "a.md", "Ana", 30_000), "none");
    assert.equal(verdict(n, here, "a.md", "Ana", 9 * MIN), "none");
    assert.equal(verdict(n, here, "a.md", "Ana", 9 * MIN + PRESENCE_AGAIN_MS + 1), "toast");
  });
  test("another person, or another file, is its own news", () => {
    const n = new PresenceNews();
    verdict(n, here, "a.md", "Ana", 0);
    assert.equal(verdict(n, here, "a.md", "Bia", 1), "toast");
    assert.equal(verdict(n, here, "b.md", "Ana", 1), "toast");
  });
  test("a person flapping every few minutes stays quiet", () => {
    const n = new PresenceNews();
    verdict(n, here, "a.md", "Ana", 0);
    for (let t = 4 * MIN; t < 60 * MIN; t += 4 * MIN) assert.equal(verdict(n, here, "a.md", "Ana", t), "none");
  });
  test("old sightings are forgotten", () => {
    const n = new PresenceNews();
    for (let i = 0; i < 50; i++) verdict(n, here, `n${i}.md`, "Ana", 0);
    verdict(n, here, "z.md", "Ana", PRESENCE_AGAIN_MS + 1);
    assert.equal(n.heard.size, 1);
  });
});

describe("already there", () => {
  test("those present when the room was bound are not joining", () => {
    const n = new PresenceNews();
    n.opened("/mesa", "a.md", 0);
    n.present("/mesa", "a.md", ["Ana"], 0);
    assert.equal(verdict(n, here, "a.md", "Ana", 100), "none");
    assert.equal(verdict(n, here, "a.md", "Bia", 100), "none", "awareness arriving late, within the settle time");
    assert.equal(verdict(n, here, "a.md", "Caio", PRESENCE_SETTLE_MS + 1), "toast");
  });
});
