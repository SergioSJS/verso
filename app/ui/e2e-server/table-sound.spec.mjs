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

/** The Music tab of the window, open (ADR 0116 as amended 2026-10-31). */
async function music(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Música/ }).click();
  const view = page.locator(".music-view");
  await expect(view).toBeVisible({ timeout: 30_000 });
  return view;
}

const title = (view) => view.locator(".music-title");

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
    await mesa(gm);
    const gmView = await music(gm);
    const views = [];
    for (const p of players) {
      await mesa(p);
      views.push(await music(p));
    }
    for (const view of views) {
      await expect(view).toContainText("Nada tocando");
      await expect(view.getByRole("button", { name: /^Tocar “/ })).toHaveCount(0);
    }

    // A file the table sees: everyone's window plays it from /f/.
    await gmView.locator(".music-folders").getByRole("button", { name: "Tocar “taverna”" }).click();
    await expect(title(gmView)).toHaveText("taverna");
    for (const [i, view] of views.entries()) {
      await expect(title(view)).toHaveText("taverna", { timeout: 20_000 });
      for (const name of ["Pausar", "Parar", "Próxima faixa"]) await expect(view.getByRole("button", { name })).toBeHidden();
      await expect(view.getByRole("slider", { name: "Seu volume" })).toBeVisible();
      await expect.poll(() => players[i].evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null)).toBe(`/f/${s.folder.id}/M%C3%BAsica/taverna.wav`);
    }
    // The Table tab's one row: the name and the player's own volume.
    await players[0].locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
    const mini = players[0].locator(".table-view .table-mini");
    await expect(mini.locator(".table-mini-name")).toHaveText("taverna");
    await expect(mini.getByRole("button", { name: "Pausar" })).toBeHidden();
    await expect(mini.getByRole("button", { name: "Volume", exact: true })).toBeVisible();
    views[0] = await music(players[0]);
    await gmView.getByRole("button", { name: "Pausar" }).click();
    for (const view of views) await expect(view.locator(".table-sound-said")).toHaveText("Pausado: taverna", { timeout: 20_000 });
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
    await gmView.locator(".music-folders").getByRole("button", { name: `Tocar “${SECRET}”` }).click();
    const ask = gm.getByRole("alertdialog");
    await expect(ask).toContainText("2 jogadores não veem este arquivo");
    await expect(ask).toContainText("Ana");
    await expect(ask).toContainText("Bruno");
    await ask.getByRole("button", { name: "Tocar sem eles" }).click();
    await expect(title(gmView)).toHaveText(SECRET);
    await expect(gmView).toContainText("Não ouvem (não veem o arquivo): ");
    for (const [i, view] of views.entries()) {
      await expect(title(view)).toHaveText("uma faixa que você não vê", { timeout: 20_000 });
      await expect(view.locator(".music-why")).toBeVisible();
      await expect.poll(() => players[i].evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null)).toBe(null);
    }
    // A player who joins late is told the same, and nothing more.
    await players[1].reload();
    await expect(players[1].locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
    await mesa(players[1]);
    const late = await music(players[1]);
    await expect(title(late)).toHaveText("uma faixa que você não vê", { timeout: 20_000 });
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
