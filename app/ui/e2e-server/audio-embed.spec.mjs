// Audio embeds with a player (ADR 0116, amendment of 2026-11-01) against a
// real `verso serve`: the game master and two players, Ana and Bruno. A
// note the table sees embeds a track the table sees and a track no player
// sees (`![[…]]` and `![](…)`); a board the table sees has a card of each.
// Ana's note shows ONE player — the track she sees, which plays for her
// alone from /f/ — and the locked placeholder for the other; her board shows
// the card she sees as a player and the other locked. NOTHING of the hidden
// file reaches her: not its name in the page, in any frame of her socket,
// nor a request for its bytes (the visibility rule, BLOCKING). The game
// master's embed of the hidden file offers "Tocar para a mesa", which asks
// the release question, names named. The element's play() is stubbed.

import { expect, test } from "@playwright/test";

import { invoke, mesa, openFolder, openNoteBy, setup, traces } from "./access-helpers.mjs";

/** A WAV of a second of silence. */
const WAV = (() => {
  const n = 8000;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(n, 24);
  b.writeUInt32LE(n, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b.toString("base64");
})();

const SECRET = "zqsomoculto";

async function stub(context) {
  await context.addInitScript(() => {
    window.__plays = [];
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get() { return this.__paused ?? true; } });
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push(this.getAttribute("src"));
      this.__paused = false;
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      if (this.__paused === false) {
        this.__paused = true;
        this.dispatchEvent(new Event("pause"));
      }
    };
  });
}

/** Everything a page's socket received, as text, and every address it asked for. */
function watch(page) {
  const heard = [];
  const asked = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => heard.push(typeof f.payload === "string" ? f.payload : Buffer.from(f.payload).toString("latin1"))));
  page.on("request", (r) => asked.push(decodeURIComponent(new URL(r.url()).pathname)));
  return { heard, asked };
}

const NOTE = `# Trilha\n\n## Taverna\n\n![[taverna.wav]]\n\nA cripta: ![[${SECRET}.wav]]\n\nDe novo: ![](Cripta/${SECRET}.wav)\n`;
const BOARD = JSON.stringify({
  nodes: [
    { id: "som", type: "file", file: "Música/taverna.wav", x: 0, y: 0, width: 380, height: 132 },
    { id: "cripta", type: "file", file: `Cripta/${SECRET}.wav`, x: 0, y: 200, width: 380, height: 132 },
  ],
  edges: [],
});

test.use({ actionTimeout: 15_000 });

test("a player's note and board play the sound file they see, and the one they do not see is the locked placeholder: nothing of it reaches them", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "three windows side by side");
  test.setTimeout(240_000);
  await stub(gm.context());
  const s = await setup(browser, gm, info, "embeds", { "Trilha.md": NOTE, "Mesa.canvas": BOARD });
  try {
    for (const path of ["Música/taverna.wav", `Cripta/${SECRET}.wav`]) expect(await invoke(gm, "create_file", { path, base64: WAV })).toBe(path);
    await invoke(gm, "reindex", {});
    await s.set(["Trilha.md", "Mesa.canvas", "Música/taverna.wav"], "see");
    // An attachment with no access of its own follows the notes that embed it
    // (ADR 0113 K.3): this one the game master keeps hidden, explicitly.
    await s.set([`Cripta/${SECRET}.wav`], "none");
    for (const c of s.contexts) await stub(c);
    const ana = s.ana.page;
    const seen = watch(ana);
    await openFolder(ana, s.folder.id);
    await mesa(ana);

    // Her note: one player, the placeholder twice, no name of the hidden file.
    await openNoteBy(ana, "Trilha");
    const preview = ana.locator(".leaf:not([hidden]) .preview:visible");
    await expect(preview.locator(".audio-embed")).toHaveCount(1, { timeout: 30_000 });
    const taverna = preview.getByRole("group", { name: "Áudio: taverna.wav" });
    await expect(taverna).toBeVisible();
    await expect(preview).toContainText("🔒 (ainda não revelado)");
    expect(await preview.evaluate((p) => (p.textContent.match(/ainda não revelado/g) ?? []).length)).toBe(2);
    // Hers alone: no table button, the bytes from /f/.
    await expect(taverna.getByRole("button", { name: "Tocar para a mesa" })).toHaveCount(0);
    await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
    await expect.poll(() => ana.evaluate(() => window.__plays.slice())).toEqual([`/f/${s.folder.id}/M%C3%BAsica/taverna.wav`]);

    // Her board: the card she sees is a player, the other locked.
    await openNoteBy(ana, "Mesa");
    await expect(ana.locator(".board-card-audio .audio-embed")).toHaveCount(1, { timeout: 30_000 });
    await expect(ana.locator(".board-card-audio").getByRole("group", { name: "Áudio: taverna.wav" })).toBeVisible();
    // The other card: the locked text every hidden card is, no player, no name.
    await expect(ana.locator(".board-card", { hasText: "🔒 (ainda não revelado)" })).toHaveCount(1);

    // The game master: every embed a player, and the hidden one asks before it plays for the table.
    await openFolder(gm, s.folder.id);
    await mesa(gm);
    await openNoteBy(gm, "Trilha");
    const gmPreview = gm.locator(".leaf:not([hidden]) .preview:visible");
    await expect(gmPreview.locator(".audio-embed")).toHaveCount(3, { timeout: 30_000 });
    const secret = gmPreview.getByRole("group", { name: `Áudio: ${SECRET}.wav` }).first();
    await secret.getByRole("button", { name: "Tocar para a mesa" }).click();
    const ask = gm.getByRole("alertdialog");
    await expect(ask).toContainText("2 jogadores não veem este arquivo");
    await ask.getByRole("button", { name: "Tocar sem eles" }).click();
    await expect.poll(() => gm.evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null)).toContain(SECRET);

    await ana.waitForTimeout(1500);
    expect(await traces(ana, [SECRET, "Cripta"]), "the hidden file's name in her page").toEqual([]);
    for (const frame of seen.heard) {
      expect(frame, "a frame Ana received").not.toContain(SECRET);
      expect(frame, "a frame Ana received").not.toContain("Cripta");
    }
    expect(seen.asked.filter((a) => a.includes(SECRET) || a.includes("Cripta")), "a request Ana made").toEqual([]);
  } finally {
    for (const c of s.contexts) await c.close();
  }
});
