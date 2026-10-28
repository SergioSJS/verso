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

const here = { openFolder: "/mesa", folder: "/mesa", tabShowing: true, windowInFront: true };
const MIN = 60_000;

describe("scoping", () => {
  test("a join in this folder, in the showing tab, in the front window concerns", () => {
    assert.equal(concerns(here), true);
  });
  test("another folder's join never concerns this window", () => {
    assert.equal(concerns({ ...here, folder: "/outra" }), false);
  });
  test("a tab not showing, or a window behind (nor the system), is not told", () => {
    assert.equal(concerns({ ...here, tabShowing: false }), false);
    assert.equal(concerns({ ...here, windowInFront: false }), false);
  });
  test("a join that does not concern is not told but is remembered", () => {
    const n = new PresenceNews();
    assert.equal(n.joined({ ...here, windowInFront: false }, "a.md", "Ana", 0), false);
    assert.equal(n.joined(here, "a.md", "Ana", 5 * MIN), false, "seen 5 min ago behind: not news now");
  });
});

describe("rate", () => {
  test("the first join is news", () => {
    assert.equal(new PresenceNews().joined(here, "a.md", "Ana", 0), true);
  });
  test("a rejoin within the window is not", () => {
    const n = new PresenceNews();
    assert.equal(n.joined(here, "a.md", "Ana", 0), true);
    assert.equal(n.joined(here, "a.md", "Ana", 30_000), false);
    assert.equal(n.joined(here, "a.md", "Ana", 9 * MIN), false);
  });
  test("away longer than the window, back is news again", () => {
    const n = new PresenceNews();
    n.joined(here, "a.md", "Ana", 0);
    assert.equal(n.joined(here, "a.md", "Ana", PRESENCE_AGAIN_MS + 1), true);
  });
  test("another person, or another file, is its own news", () => {
    const n = new PresenceNews();
    n.joined(here, "a.md", "Ana", 0);
    assert.equal(n.joined(here, "a.md", "Bia", 1), true);
    assert.equal(n.joined(here, "b.md", "Ana", 1), true);
  });
  test("a person flapping every few minutes stays quiet", () => {
    const n = new PresenceNews();
    n.joined(here, "a.md", "Ana", 0);
    for (let t = 4 * MIN; t < 60 * MIN; t += 4 * MIN) assert.equal(n.joined(here, "a.md", "Ana", t), false);
  });
});

describe("already there", () => {
  test("those present when the room was bound are not joining", () => {
    const n = new PresenceNews();
    n.opened("/mesa", "a.md", 0);
    n.present("/mesa", "a.md", ["Ana"], 0);
    assert.equal(n.joined(here, "a.md", "Ana", 100), false);
    assert.equal(n.joined(here, "a.md", "Bia", 100), false, "awareness arriving late, within the settle time");
    assert.equal(n.joined(here, "a.md", "Caio", PRESENCE_SETTLE_MS + 1), true);
  });
});
