// Music at the table (ADR 0116 section A) against a real `verso serve`: the
// game master and two players, Ana and Bruno, each in their own browser.
// The game master plays a file the table sees: both players' windows show
// it and fetch its bytes from /f/; pauses: they follow; they have no
// controls. Then a file no player sees: the game master is asked, names
// named, and plays it without them — the players are told a track plays
// and NOTHING of it reaches them: not its name in any frame of their
// socket, not a request for its bytes (the visibility rule, BLOCKING). The
// element's play() is stubbed: what is checked is what each window asks.

import { expect, test } from "@playwright/test";

import { invoke, mesa, openFolder, setup } from "./access-helpers.mjs";

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

const SECRET = "zqsegredo";

async function stub(context) {
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
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

test.use({ actionTimeout: 15_000 });

test("the game master's music reaches the players who see the file, and nothing of a hidden one reaches anyone else", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "three windows side by side");
  test.setTimeout(240_000);
  await stub(gm.context());
  const s = await setup(browser, gm, info, "sound", { "Trilha.md": "# Trilha\n" });
  try {
    for (const path of ["Música/taverna.wav", `Cripta/${SECRET}.wav`]) expect(await invoke(gm, "create_file", { path, base64: WAV })).toBe(path);
    await invoke(gm, "reindex", {});
    await s.set(["Trilha.md", "Música/taverna.wav"], "see");
    for (const c of s.contexts) await stub(c);
    const players = [s.ana.page, s.bruno.page];
    const seen = players.map(watch);
    for (const p of players) await openFolder(p, s.folder.id);
    await openFolder(gm, s.folder.id);
    const gmStrip = (await mesa(gm)).locator(".table-sound");
    const strips = [];
    for (const p of players) strips.push((await mesa(p)).locator(".table-sound"));
    for (const strip of strips) {
      await expect(strip).toContainText("Nada tocando");
      await expect(strip.getByRole("button", { name: "Tocar um arquivo…" })).toHaveCount(0);
    }

    // A file the table sees: everyone's window plays it from /f/.
    await gmStrip.getByRole("button", { name: "Tocar um arquivo…" }).click();
    await gm.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: "taverna" }).click();
    await expect(gmStrip.locator(".table-sound-name")).toHaveText("taverna");
    for (const [i, strip] of strips.entries()) {
      await expect(strip.locator(".table-sound-name")).toHaveText("taverna", { timeout: 20_000 });
      for (const name of ["Pausar", "Parar", "Próxima faixa da cena"]) await expect(strip.getByRole("button", { name })).toHaveCount(0);
      await expect(strip.getByRole("slider", { name: "Seu volume" })).toBeVisible();
      await expect.poll(() => players[i].evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null)).toBe(`/f/${s.folder.id}/M%C3%BAsica/taverna.wav`);
    }
    await gmStrip.getByRole("button", { name: "Pausar" }).click();
    for (const strip of strips) await expect(strip.locator(".table-sound-said")).toHaveText("Pausado: taverna", { timeout: 20_000 });
    // A player's control is refused by the server, whatever the window shows.
    const refused = await players[0].evaluate(async () => {
      try {
        await window.__TAURI_INTERNALS__.invoke("table_sound", { wish: "resume", revision: 99, channel: "music", value: null, looping: null, table: "" });
        return "accepted";
      } catch (e) {
        return String(e?.message ?? e);
      }
    });
    expect(refused).toContain("only the game master");

    // A file no player sees: the game master is asked, and plays it without them.
    await gmStrip.getByRole("button", { name: "Tocar um arquivo…" }).click();
    await gm.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: SECRET }).click();
    const ask = gm.getByRole("alertdialog");
    await expect(ask).toContainText("2 jogadores não veem este arquivo");
    await expect(ask).toContainText("Ana");
    await expect(ask).toContainText("Bruno");
    await ask.getByRole("button", { name: "Tocar sem eles" }).click();
    await expect(gmStrip.locator(".table-sound-name")).toHaveText(SECRET);
    await expect(gmStrip).toContainText("Não ouvem (não veem o arquivo): ");
    for (const [i, strip] of strips.entries()) {
      await expect(strip.locator(".table-sound-name")).toHaveText("uma faixa que você não vê", { timeout: 20_000 });
      await expect.poll(() => players[i].evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null)).toBe(null);
    }
    // A player who joins late is told the same, and nothing more.
    await players[1].reload();
    await expect(players[1].locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
    const late = (await mesa(players[1])).locator(".table-sound");
    await expect(late.locator(".table-sound-name")).toHaveText("uma faixa que você não vê", { timeout: 20_000 });
    await players[1].waitForTimeout(1500);
    for (const { heard, asked } of seen) {
      for (const frame of heard) expect(frame, "a frame a player received").not.toContain(SECRET);
      for (const frame of heard) expect(frame, "a frame a player received").not.toContain("Cripta");
      expect(asked.filter((a) => a.includes(SECRET) || a.includes("Cripta")), "a request a player made").toEqual([]);
    }
  } finally {
    for (const c of s.contexts) await c.close();
  }
});
