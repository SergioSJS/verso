// Audio embeds with a player (ADR 0116, amendment of 2026-11-01), in the
// harness: `![[taverna.wav]]` and `![](Música/estrada.wav)` drawn as
// Verso's player in Leitura and Editar, the text in Fonte, the note never
// rewritten; play and pause, the bar and its time, the person's own volume
// and mute, one embed at a time, the name that opens the file; on a board, a
// card of a sound file is the same player; at a table, the game master's
// "Tocar para a mesa" hands the file to the table's music, the table's music
// is lowered while a local embed plays, and the table's music starting
// pauses the local one; every control 44 px on a phone. The element's play()
// is the page's own stub: what is checked is what the window asks of it.
// A file a player does not see: e2e-server/audio-embed.spec.mjs.
// Screenshots for the maintainer go to /logs/shots/embeds in the Docker e2e.

import { existsSync, mkdirSync, readFileSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const SHOTS = "/logs/shots/embeds";
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

async function shot(page, name, info, target = page) {
  if (!existsSync("/logs")) return;
  mkdirSync(SHOTS, { recursive: true });
  await target.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });
}

/** A WAV of `seconds` of silence: what every engine of the tests decodes. */
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

/** The demo vault's CC0 sample, for the screenshots (a real length and name). */
const SAMPLE = new URL("../../../demo-vault/assets/sons/taverna.mp3", import.meta.url);

const NOTE = "# Sons\n\n## Taverna\n\n![[taverna.wav]]\n\nNa estrada: ![](Música/estrada.wav)\n";

/** play() and pause() stubbed, with `paused` as an engine keeps it. */
async function stubPlay(page) {
  await page.addInitScript(() => {
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

/** The folder with two tracks and the note that embeds them; with `role`, a table up. */
async function folder(app, page, { role = null, sample = false } = {}) {
  // An element let go while its bytes load cancels the load: that is the engine's, not a fault.
  app.expectFault(/request failed: \/__vault\/Música\//);
  await app.open("?vault=empty");
  const bytes = sample ? readFileSync(SAMPLE).toString("base64") : wav();
  const name = sample ? "mp3" : "wav";
  await page.evaluate(
    ([b64, role, name]) => {
      const h = window.__harness;
      for (const track of ["taverna", "estrada"]) h.core.handlers.create_file({ path: `Música/${track}.${name}`, base64: b64 });
      if (role) {
        h.table.role = role;
        h.table.up = true;
      }
    },
    [bytes, role, name],
  );
  const text = sample ? NOTE.replaceAll(".wav", ".mp3") : NOTE;
  await app.writeOutside("Sons.md", text);
  await app.folderChanged(["Sons.md", `Música/taverna.${name}`, `Música/estrada.${name}`], true);
  return text;
}

const players = (page) => page.locator(".preview:visible .audio-embed");
const plays = (page) => page.evaluate(() => window.__plays.slice());

test("an audio embed in a note is Verso's player: play, pause, the bar and its time, the own volume and mute, one at a time; the note is never rewritten @layout", async ({ app, page }) => {
  await stubPlay(page);
  const text = await folder(app, page);
  await app.quickOpen("Sons");
  await expect(players(page)).toHaveCount(2);
  const taverna = page.getByRole("group", { name: "Áudio: taverna.wav" });
  const estrada = page.getByRole("group", { name: "Áudio: estrada.wav" });
  await expect(taverna).toBeVisible();
  await expect(estrada).toBeVisible();
  // The engine's own controls are not shown; the length, once read.
  await expect(page.locator(".preview:visible audio[controls]")).toHaveCount(0);
  await expect(taverna.locator(".audio-embed-time")).toHaveText("0:00 / 1:00");
  await expect(taverna.getByRole("slider", { name: "Posição" })).toHaveAttribute("aria-valuetext", "0:00 de 1:00");

  await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect.poll(() => plays(page)).toEqual(["/__vault/M%C3%BAsica/taverna.wav"]);
  await expect(taverna.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();
  // One at a time: the other starts, this one pauses.
  await estrada.getByRole("button", { name: "Tocar “estrada”" }).click();
  await expect(taverna.getByRole("button", { name: "Tocar “taverna”" })).toBeVisible();
  await expect(estrada.getByRole("button", { name: "Pausar “estrada”" })).toBeVisible();
  await estrada.getByRole("button", { name: "Pausar “estrada”" }).click();
  await expect(estrada.getByRole("button", { name: "Tocar “estrada”" })).toBeVisible();

  // The bar seeks; its words follow.
  const bar = taverna.getByRole("slider", { name: "Posição" });
  await bar.fill("30");
  await expect(taverna.locator(".audio-embed-time")).toHaveText("0:30 / 1:00");
  await expect(bar).toHaveAttribute("aria-valuetext", "0:30 de 1:00");

  // Mute, for every embed; the volume is the device's own on a phone.
  const audioOf = (name) => page.evaluate((n) => { const a = [...document.querySelectorAll(".audio-embed audio")].find((x) => x.getAttribute("src").includes(n)); return { volume: a.dataset.gain === undefined ? a.volume : Number(a.dataset.gain), muted: a.muted }; }, name);
  await taverna.getByRole("button", { name: "Silenciar" }).click();
  await expect(taverna.getByRole("button", { name: "Tirar do silêncio" })).toHaveAttribute("aria-pressed", "true");
  await expect(estrada.getByRole("button", { name: "Tirar do silêncio" })).toBeVisible();
  expect((await audioOf("estrada")).muted).toBe(true);
  await taverna.getByRole("button", { name: "Tirar do silêncio" }).click();
  expect((await audioOf("taverna")).muted).toBe(false);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    await expect(taverna.getByRole("slider", { name: "Volume" })).toBeHidden();
    // Every control a finger's size.
    for (const b of await taverna.getByRole("button").all()) {
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      expect(box.height, await b.getAttribute("aria-label")).toBeGreaterThanOrEqual(44);
    }
  } else {
    const volume = taverna.getByRole("slider", { name: "Volume" });
    await volume.fill("40");
    await expect(volume).toHaveAttribute("aria-valuetext", "Volume 40%");
    expect((await audioOf("estrada")).volume).toBeCloseTo(0.4, 2);
  }

  // The keyboard: Tab reaches the play button, Space plays.
  await taverna.getByRole("button", { name: "Tocar “taverna”" }).focus();
  await page.keyboard.press("Space");
  await expect(taverna.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();

  // The name opens the file.
  await taverna.getByRole("button", { name: "Abrir taverna.wav" }).click();
  // In a tab of its own: the player, never a text tab that cannot read it.
  await expect(page.getByRole("tab", { name: /taverna\.wav/ }).first()).toBeVisible();
  await expect(page.locator(".audio-leaf:visible").getByRole("group", { name: "Áudio: taverna.wav" })).toBeVisible();
  expect(await app.file("Sons.md")).toBe(text);
});

const playing = (page) => page.evaluate(() => [...document.querySelectorAll("audio")].filter((a) => !a.paused).map((a) => a.closest(".audio-embed")?.isConnected ?? false));

test("the sound goes on while the note is drawn again: the playing element moves to the player in its place", async ({ app, page }) => {
  await stubPlay(page);
  await folder(app, page);
  await app.quickOpen("Sons");
  await page.getByRole("group", { name: "Áudio: taverna.wav" }).getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect.poll(() => playing(page)).toEqual([true]);
  // The paragraph of the embed changed on disk: the block is drawn anew.
  await app.writeOutside("Sons.md", NOTE.replace("![[taverna.wav]]", "Na taverna: ![[taverna.wav]]"));
  await app.folderChanged(["Sons.md"]);
  await expect(page.locator(".preview:visible p", { hasText: "Na taverna:" })).toBeVisible();
  const again = page.locator(".preview:visible p", { hasText: "Na taverna:" }).getByRole("group", { name: "Áudio: taverna.wav" });
  await expect(again.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();
  await page.waitForTimeout(2500);
  expect(await playing(page)).toEqual([true]);
  expect(await plays(page)).toHaveLength(1);
});

test("Editar draws the player where the embed is written; Fonte shows the text, and the player gone stops its sound", async ({ app, page }) => {
  await stubPlay(page);
  const text = await folder(app, page);
  await app.quickOpen("Sons");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content:visible");
  await expect(editor.locator(".audio-embed")).toHaveCount(2);
  const taverna = editor.getByRole("group", { name: "Áudio: taverna.wav" });
  await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect.poll(() => plays(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Fonte", exact: true }).click();
  await expect(editor).toContainText("![[taverna.wav]]");
  await expect(editor).toContainText("![](Música/estrada.wav)");
  await expect(editor.locator(".audio-embed")).toHaveCount(0);
  // The player left with the text shown: its sound stops a moment later.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("audio")].filter((a) => !a.paused).length), { timeout: 6000 }).toBe(0);
  await page.getByRole("button", { name: "Leitura", exact: true }).click();
  await expect.poll(() => app.file("Sons.md")).toBe(text);
});

test("a board's card of a sound file is the same player, in its card's size", async ({ app, page }) => {
  await stubPlay(page);
  await folder(app, page);
  const board = JSON.stringify({ nodes: [{ id: "s", type: "file", file: "Música/taverna.wav", x: 0, y: 0, width: 380, height: 132 }], edges: [] });
  await app.writeOutside("Trilha.canvas", board);
  await app.folderChanged(["Trilha.canvas"], true);
  await app.quickOpen("Trilha");
  await app.boardReady();
  const card = page.locator(".board-card-audio .audio-embed");
  await expect(card).toBeVisible();
  await expect(card.locator(".audio-embed-time")).toHaveText("0:00 / 1:00");
  // Under Excalidraw's selection canvas, as a person presses it: by where it is.
  const press = async (loc) => {
    const box = await loc.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await press(card.getByRole("button", { name: "Tocar “taverna”" }));
  await expect.poll(() => plays(page)).toEqual(["/__vault/M%C3%BAsica/taverna.wav"]);
  await expect(card.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();
  // The bar is dragged through the board too: half-way is 0:30.
  const bar = card.getByRole("slider", { name: "Posição" });
  const box = await bar.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(card.locator(".audio-embed-time")).toHaveText(/^0:(29|30|31) \/ 1:00$/);
  await press(card.getByRole("button", { name: "Pausar “taverna”" }));
  await expect(card.getByRole("button", { name: "Tocar “taverna”" })).toBeVisible();
  // Pressing the player is not a drag of the card, nor a write of the board.
  expect(await app.calls("write_board")).toEqual([]);
  expect(await page.evaluate(() => window.__VERSO_TEST__.board.getAppState().selectedElementIds)).toEqual({});
});

test("the game master's embed plays for the table; the table's music is lowered while a local embed plays, and starting pauses it", async ({ app, page }) => {
  await stubPlay(page);
  await folder(app, page, { role: "owner" });
  await app.quickOpen("Sons");
  const taverna = page.getByRole("group", { name: "Áudio: taverna.wav" });
  const estrada = page.getByRole("group", { name: "Áudio: estrada.wav" });
  // The soundboard's own button is the player's now: not drawn twice.
  await expect(page.locator(".preview:visible .table-sound-play")).toHaveCount(0);
  await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect(taverna.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();
  // Handed to the table: the local one stops, the table plays it, from its scene.
  await taverna.getByRole("button", { name: "Tocar para a mesa" }).click();
  await expect.poll(() => app.calls("table_play")).toEqual([expect.objectContaining({ path: "Música/taverna.wav", channel: "music" })]);
  // From then on the embed is the table's player of the track (the
  // maintainer, 2026-11-02): it shows the table playing, and its table
  // button is gone while it is bound.
  await expect(taverna.getByRole("button", { name: "Pausar “taverna”" })).toBeVisible();
  await expect(taverna.getByRole("button", { name: "Tocar para a mesa" })).toBeHidden();
  // A local embed while the table plays: the table is lowered, and it is said.
  await estrada.getByRole("button", { name: "Tocar “estrada”" }).click();
  await expect(estrada.locator(".audio-embed-note")).toHaveText("A música da mesa fica mais baixa enquanto isto toca.");
  // The table's music starting again pauses the local one, and says why.
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Música/ }).click();
  const view = page.locator(".music-view");
  await expect(view).toBeVisible();
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “estrada”" }).click();
  await expect(estrada.getByRole("button", { name: "Tocar “estrada”" })).toBeVisible();
  await expect(estrada.locator(".audio-embed-note")).toHaveText("Pausado: a música da mesa começou.");
});

test("a player at a table has no table button: the embed plays for them alone", async ({ app, page }) => {
  await stubPlay(page);
  await folder(app, page, { role: "player" });
  await app.quickOpen("Sons");
  const taverna = page.getByRole("group", { name: "Áudio: taverna.wav" });
  await expect(taverna).toBeVisible();
  await expect(taverna.getByRole("button", { name: "Tocar para a mesa" })).toHaveCount(0);
  await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect.poll(() => plays(page)).toHaveLength(1);
  expect(await app.calls("table_play")).toEqual([]);
});

test("alone in a folder of this computer, the embed offers the Music tab", async ({ app, page }) => {
  await stubPlay(page);
  await folder(app, page);
  await app.quickOpen("Sons");
  await expect(page.getByRole("group", { name: "Áudio: taverna.wav" }).getByRole("button", { name: "Tocar na aba Música" })).toBeVisible();
});

test("screenshots: the player in a note, light and dark, on a board, and the game master's Play for the table @layout", async ({ app, page }, info) => {
  test.skip(!existsSync("/logs"), "only in the Docker e2e");
  await stubPlay(page);
  await folder(app, page, { role: "owner", sample: true });
  await app.quickOpen("Sons");
  const taverna = page.getByRole("group", { name: "Áudio: taverna.mp3" });
  await expect(taverna.locator(".audio-embed-time")).toContainText(" / ");
  await taverna.getByRole("button", { name: "Tocar “taverna”" }).click();
  await shot(page, "note-player-light", info);
  await shot(page, "player-close-light", info, taverna);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "note-player-dark", info);
  await shot(page, "player-close-dark", info, taverna);
  await page.emulateMedia({ colorScheme: "light" });
  await taverna.getByRole("button", { name: "Tocar para a mesa" }).hover();
  await shot(page, "master-play-for-table", info, taverna);
  if (phone(page)) return;
  const board = JSON.stringify({ nodes: [{ id: "s", type: "file", file: "Música/taverna.mp3", x: 0, y: 0, width: 380, height: 132 }, { id: "t", type: "text", text: "## Cena 1\nA taverna do Corvo", x: -320, y: 0, width: 260, height: 132 }], edges: [] });
  await app.writeOutside("Trilha.canvas", board);
  await app.folderChanged(["Trilha.canvas"], true);
  await app.quickOpen("Trilha");
  await app.boardReady();
  await expect(page.locator(".board-card-audio .audio-embed-time")).toContainText(" / ");
  await shot(page, "board-card", info);
});
