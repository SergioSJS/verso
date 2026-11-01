// A live share heard at the table (ADR 0116 section B, the listener: items
// 16, 18, 22, 25, 30), in the harness (src/harness/audioShare.ts plays the
// server's relay): a player's window hears of the game master's share when
// it starts, asks for its frames, loads the decoder only then (a lazy
// chunk), waits for a gesture, and plays the recorded Opus frames of
// test/fixtures/opus through the AudioWorklet — the level that comes out is
// read; Follow the table off stops asking and on asks again, "behind" asks
// again, and the share's end lets the sound go. Under the app's own
// Content-Security-Policy (e2e/serve.mjs), so the WASM decoder must be
// allowed by it. The sharer's side, and two people on a real server, are
// later steps (S4, S5).

import { readFileSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

/** The recorded frames (make.mjs): the wire's bytes, base64. */
const FRAMES = (() => {
  const b = readFileSync(new URL("../test/fixtures/opus/tone.frames", import.meta.url));
  const out = [];
  for (let at = 0; at < b.length; ) {
    const n = b.readUInt16BE(at);
    out.push(b.subarray(at + 2, at + 2 + n).toString("base64"));
    at += 2 + n;
  }
  return out;
})();

/** A WAV of a minute of silence, for a track to play beside the share. */
function wav(seconds = 60) {
  const rate = 4000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b.toString("base64");
}

/** The folder's table up, this window a player's. */
async function atTable(app, page) {
  await app.open("?vault=empty");
  await page.evaluate((b64) => {
    window.__harness.core.handlers.create_file({ path: "Música/taverna.wav", base64: b64 });
    const t = window.__harness.table;
    t.role = "reader";
    t.up = true;
  }, wav());
  await app.writeOutside("Sessao.md", "# Sessão\n");
  await app.folderChanged(["Sessao.md", "Música/taverna.wav"], true);
}

const share = (page) => page.evaluate(() => window.__VERSO_TEST__.share?.() ?? null);
const asked = (page) => page.evaluate(() => [...window.__harness.audioShare.asked]);
const loaded = (page) => page.evaluate(() => performance.getEntriesByType("resource").some((e) => /chunks\/listener-/.test(e.name)));
/** The Music tab opened: a person's gesture, like any other (item 25: the first gesture anywhere lets the sound start). */
async function openMusic(page) {
  if ((page.viewportSize()?.width ?? 1500) <= 760) {
    if (!(await page.locator("body.right-open").count())) await page.locator(".bar-right").click();
  } else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Música/ }).click();
  const view = page.locator(".music-view");
  await expect(view).toBeVisible();
  return view;
}

/** The game master's frames for `seconds`, 20 ms apart: the recording looped, its sequence going on. */
function streams(page, seconds) {
  return page.evaluate(
    async ([frames, n]) => {
      const bytes = frames.map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
      const id = window.__harness.audioShare.share.id;
      const start = performance.now();
      for (let seq = 0; seq < n; seq++) {
        const f = bytes[seq % bytes.length].slice();
        const v = new DataView(f.buffer);
        v.setUint32(0, id);
        v.setUint32(4, seq);
        v.setUint32(8, seq * 20);
        window.__harness.audioShare.send([f]);
        // On the sharer's clock, not the timers' drift.
        const due = start + (seq + 1) * 20;
        await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
      }
    },
    [FRAMES, Math.round((seconds * 1000) / 20)],
  );
}

/** The loudest the worklet's output got while `during` ran. */
async function peakWhile(page, during) {
  let peak = 0;
  let done = false;
  const run = during.finally(() => (done = true));
  while (!done) {
    peak = Math.max(peak, (await share(page))?.hearing?.level ?? 0);
    await page.waitForTimeout(50);
  }
  await run;
  return peak;
}

test("a player hears the game master's live share: asked for, the decoder loaded only then, after a gesture, the tone out of the worklet", async ({ app, page }) => {
  await atTable(app, page);
  await expect.poll(() => share(page)).toEqual(expect.objectContaining({ live: null, heard: false }));
  expect(await loaded(page), "nothing of the decoder before a share (item 30)").toBe(false);
  // The game master shares: the window asks for the frames.
  const id = await page.evaluate(() => window.__harness.audioShare.masterShares({ name: "Spotify", by: "Ana" }).id);
  await expect.poll(() => asked(page)).toEqual([true]);
  // No gesture yet: the sound waits (Hear the table, item 25).
  await expect.poll(() => share(page)).toEqual(expect.objectContaining({ live: id, heard: true, waiting: true }));
  expect(await loaded(page)).toBe(false);
  // The first gesture lets it start; the frames that come are heard.
  await openMusic(page);
  await expect.poll(() => share(page)).toEqual(expect.objectContaining({ waiting: false }));
  const peak = await peakWhile(page, streams(page, 4));
  expect(await loaded(page)).toBe(true);
  const heard = await share(page);
  expect(heard.hearing.stream.frames, JSON.stringify(heard)).toBeGreaterThan(100);
  expect(heard.hearing.stream.foreign).toBe(0);
  expect(heard.hearing.stream.broken).toBe(0);
  // ffmpeg's sine at 1/8 of full scale: an RMS near 0.088, before the gain.
  expect(peak, JSON.stringify(heard)).toBeGreaterThan(0.04);
  expect(peak).toBeLessThan(0.2);
  // The stream over, the worklet goes quiet.
  await expect.poll(async () => (await share(page)).hearing.level).toBeLessThan(0.001);
});

test("Follow the table off stops asking, on asks again; behind asks again; the share's end lets the sound go", async ({ app, page }) => {
  // A track plays beside the share: the Music tab shows the person's own controls with it.
  app.expectFault(/request failed: \/__vault\/Música\//);
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await atTable(app, page);
  const view = await openMusic(page);
  await page.evaluate(() => window.__harness.audioShare.masterShares());
  await expect.poll(() => asked(page)).toEqual([true]);
  await page.evaluate(() => window.__harness.audioShare.behind());
  await expect.poll(() => asked(page)).toEqual([true, true]);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav"));
  const follow = view.getByRole("checkbox", { name: "Seguir a mesa" });
  await follow.uncheck();
  await expect.poll(() => asked(page)).toEqual([true, true, false]);
  await expect.poll(() => share(page)).toEqual(expect.objectContaining({ heard: false, hearing: null }));
  await follow.check();
  await expect.poll(() => asked(page)).toEqual([true, true, false, true]);
  // The share ends: nothing plays.
  await page.evaluate(() => window.__harness.audioShare.masterStops());
  await expect.poll(() => share(page)).toEqual(expect.objectContaining({ live: null, hearing: null }));
});
