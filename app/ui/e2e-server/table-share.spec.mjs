// A live share at the table (ADR 0116 section B, S5) against a real `verso
// serve`: the game master's connection is a raw WebSocket opened from the
// game master's signed-in page, which starts the share and sends binary
// frames with the 12-byte header as the host's encoder would (the recorded
// Opus tone of test/fixtures/opus, real time, 20 ms apart); the players are
// real windows (web/bridge.ts) that hear it through the lazy decoder and the
// AudioWorklet, the level read from the test hook. Ana is at the table from
// the start; a person with an account and no place at the folder is refused
// and sent no frame; Bruno joins late and hears the ring and the live
// frames, two listeners at once. Stop: silence.

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { account, mesa, openFolder, setup } from "./access-helpers.mjs";

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

test.use({ actionTimeout: 15_000 });

/** What a page's socket received in binary messages: how many. */
function countBinary(page) {
  const seen = { frames: 0 };
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      if (typeof f.payload !== "string") seen.frames++;
    }),
  );
  return seen;
}

const share = (page) => page.evaluate(() => window.__VERSO_TEST__.share?.() ?? null);
const level = async (page) => (await share(page))?.hearing?.level ?? 0;

/** The Music tab, opened: a person's gesture, which lets the sound start (item 25). */
async function music(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Música/ }).click();
  await expect(page.locator(".music-view")).toBeVisible({ timeout: 30_000 });
}

/** The loudest level the page's worklet reaches over `ms`. */
async function peak(page, ms) {
  let top = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    top = Math.max(top, await level(page));
    await page.waitForTimeout(50);
  }
  return top;
}

/** The game master's own connection, raw: joins the table, starts a share, sends frames. */
async function sharer(page) {
  await page.evaluate(async (frames) => {
    const bytes = frames.map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
    ws.binaryType = "arraybuffer";
    const waiting = new Map();
    ws.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      const m = JSON.parse(e.data);
      if (m.id !== undefined && waiting.has(m.id)) waiting.get(m.id)(m);
    });
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    let next = 1;
    const call = (cmd, args) =>
      new Promise((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        ws.send(JSON.stringify({ id, cmd, args }));
      });
    const folder = new URL(location.href).searchParams.get("folder");
    const sharerApi = {
      ws,
      call,
      id: 0,
      seq: 0,
      sent: 0,
      running: false,
      done: Promise.resolve(),
      async begin() {
        const opened = await call("open_server_folder", { id: folder });
        if (opened.err) throw new Error(JSON.stringify(opened));
        const joined = await call("table_join", { color: null, styles: null });
        if (joined.err) throw new Error(JSON.stringify(joined));
        const s = await call("table_share_start", { share: { name: "Tom de teste", kind: "system", bitrate_kbps: 96, replace: false } });
        if (s.err) throw new Error(JSON.stringify(s));
        sharerApi.id = s.ok.id;
      },
      pump() {
        sharerApi.running = true;
        sharerApi.done = (async () => {
          const start = performance.now();
          let n = 0;
          while (sharerApi.running) {
            const f = bytes[sharerApi.seq % bytes.length].slice();
            const v = new DataView(f.buffer);
            v.setUint32(0, sharerApi.id);
            v.setUint32(4, sharerApi.seq);
            v.setUint32(8, sharerApi.seq * 20);
            ws.send(f);
            sharerApi.seq++;
            sharerApi.sent++;
            n++;
            await new Promise((r) => setTimeout(r, Math.max(0, start + n * 20 - performance.now())));
          }
        })();
      },
      async halt() {
        sharerApi.running = false;
        await sharerApi.done;
      },
    };
    window.__sharer = sharerApi;
  }, FRAMES);
  await page.evaluate(() => window.__sharer.begin());
}

/** An outsider's raw connection: asks for the folder and to listen, and counts what it is sent. */
function outsiderAsks(page, folder) {
  return page.evaluate(async (f) => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
    ws.binaryType = "arraybuffer";
    const answers = [];
    let binary = 0;
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") answers.push(JSON.parse(e.data));
      else binary++;
    });
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    const asked = async (id, cmd, args) => {
      ws.send(JSON.stringify({ id, cmd, args }));
      for (let i = 0; i < 100 && !answers.some((a) => a.id === id); i++) await new Promise((r) => setTimeout(r, 50));
      return answers.find((a) => a.id === id);
    };
    const opened = await asked(1, "open_server_folder", { id: f });
    const listened = await asked(2, "table_share_listen", { listen: true });
    await new Promise((r) => setTimeout(r, 2000));
    ws.close();
    return { opened, listened, binary };
  }, folder);
}

test("the game master's live share reaches every listener at the table, a late joiner gets the ring, and stop is silence", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "three windows side by side");
  test.setTimeout(240_000);
  const s = await setup(browser, gm, info, "share", { "Trilha.md": "# Trilha\n" });
  try {
    const [ana, bruno] = [s.ana.page, s.bruno.page];
    const heardBy = countBinary(ana);
    await openFolder(ana, s.folder.id);
    await mesa(ana);
    await music(ana);
    await expect.poll(() => share(ana)).toEqual(expect.objectContaining({ live: null }));

    await sharer(gm);
    const id = await gm.evaluate(() => window.__sharer.id);
    await gm.evaluate(() => window.__sharer.pump());
    await expect.poll(() => share(ana)).toEqual(expect.objectContaining({ live: id, heard: true }));
    expect(await peak(ana, 3000), "Ana hears the tone").toBeGreaterThan(0.04);
    const stats = (await share(ana)).hearing;
    expect(stats.stream.frames).toBeGreaterThan(50);
    expect(stats.stream.broken).toBe(0);
    expect(stats.stream.foreign).toBe(0);

    // A person with an account and no place at this folder is refused and sent no frame.
    const out = await account(browser, gm, { email: `fora-share-${info.project.name}@verso.test`, name: "Fora", password: "a senha de fora" });
    const refused = await outsiderAsks(out.page, s.folder.id);
    expect(refused.opened?.err ?? refused.listened?.err, JSON.stringify(refused)).toBeTruthy();
    expect(refused.listened?.ok, JSON.stringify(refused)).toBeUndefined();
    expect(refused.binary, "no frame on the outsider's socket").toBe(0);
    await out.context.close();

    // Bruno comes to the table late: the ring, then live frames; two listeners at once.
    await openFolder(bruno, s.folder.id);
    await mesa(bruno);
    await music(bruno);
    await expect.poll(() => share(bruno)).toEqual(expect.objectContaining({ live: id, heard: true }));
    const [a, b] = await Promise.all([peak(ana, 3000), peak(bruno, 3000)]);
    expect(a, "Ana still hears").toBeGreaterThan(0.04);
    expect(b, "Bruno hears").toBeGreaterThan(0.04);
    expect((await share(bruno)).hearing.stream.frames).toBeGreaterThan(50);

    // Stop: both go silent and the share is gone from both windows.
    await gm.evaluate(() => window.__sharer.halt());
    const stopped = await gm.evaluate(() => window.__sharer.call("table_share_stop", {}));
    expect(stopped.err, JSON.stringify(stopped)).toBeUndefined();
    for (const p of [ana, bruno]) {
      await expect.poll(() => share(p)).toEqual(expect.objectContaining({ live: null }));
      await expect.poll(() => level(p), { timeout: 10_000 }).toBeLessThan(0.001);
    }
    const before = heardBy.frames;
    await ana.waitForTimeout(600);
    expect(heardBy.frames, "nothing after the stop").toBe(before);
  } finally {
    await gm.evaluate(() => window.__sharer?.ws.close()).catch(() => undefined);
    for (const c of s.contexts) await c.close();
  }
});
