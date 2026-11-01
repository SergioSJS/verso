// Music at the table (ADR 0116 section A, phase 1: files), in the harness
// (src/harness/tableSound.ts plays the server's rules): the game master's
// strip — "Play a file…", play, pause, next and previous over a note's
// scene, loop, the table's volume — the release question for a file some
// players do not see, a player's strip with no controls but their own
// volume, mute and "Follow the table", a track a player does not see, the
// switch off, the window alone in a folder of this computer, the status
// bar's item, and every control on a phone. The element's play() is the
// page's own stub: what is checked is what the window asks of it, never a
// sound device the test machine may not have. The server's rules are
// tests_table_sound.rs; two people on a real server, server-sound.spec.mjs.

import { test, expect } from "./fixtures.mjs";

const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

/** A WAV of `seconds` of silence: what every engine of the tests decodes. */
function wav(seconds = 2) {
  const rate = 8000;
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

const SCENE = "# Trilha\n\n## Taverna\n\n- [[Música/taverna.wav]]\n- [[Música/estrada.wav]]\n\n## Batalha\n\n- [[Música/batalha.wav]]\n";

/** The element's play and pause, stubbed: a test reads what the window asked. */
async function stubPlay(page, { refuseFirst = false } = {}) {
  await page.addInitScript((refuse) => {
    let refused = !refuse;
    window.__plays = [];
    HTMLMediaElement.prototype.play = function () {
      if (!refused) {
        refused = true;
        return Promise.reject(new DOMException("no gesture", "NotAllowedError"));
      }
      window.__plays.push(this.getAttribute("src"));
      this.__on = true;
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      this.__on = false;
    };
  }, refuseFirst);
}

async function withSwitch(page, on) {
  await page.addInitScript((value) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), tableSound: value } }));
  }, on);
}

/** The folder with three tracks and the soundboard note; the table up as `role`. */
async function atTable(app, page, role, up = true) {
  await app.open("?vault=empty");
  await page.evaluate(
    ([b64, role, up]) => {
      const h = window.__harness;
      for (const name of ["taverna", "estrada", "batalha"]) h.core.handlers.create_file({ path: `Música/${name}.wav`, base64: b64 });
      const t = h.table;
      t.role = role;
      t.up = up;
    },
    [wav(), role, up],
  );
  await app.writeOutside("Trilha.md", SCENE);
  await app.folderChanged(["Trilha.md", "Música/taverna.wav", "Música/estrada.wav", "Música/batalha.wav"], true);
}

async function openTable(page) {
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view.locator(".table-sound");
}

const audioSrc = (page) => page.evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null);

test("the game master plays a file of the folder from an empty strip, pauses and resumes it; the element plays the file's own bytes", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const strip = await openTable(page);
  // Nothing loaded until a track plays (item 30).
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(0);
  await strip.getByRole("button", { name: "Tocar um arquivo…" }).click();
  const pick = page.getByRole("dialog", { name: "Arquivos de som da pasta" });
  await expect(pick.getByRole("button")).toHaveCount(4);
  await pick.getByRole("button", { name: "estrada" }).click();
  await expect.poll(() => app.calls("table_play")).toEqual([expect.objectContaining({ path: "Música/estrada.wav", channel: "music", ask: true })]);
  await expect(strip.locator(".table-sound-name")).toHaveText("estrada");
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/estrada.wav");
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);
  // The length the element read is told to the table once.
  await expect.poll(async () => (await app.calls("table_sound")).some((c) => c.wish === "duration" && c.value > 1500)).toBe(true);
  await strip.getByRole("button", { name: "Pausar" }).click();
  await expect.poll(async () => (await app.calls("table_sound")).at(-1)).toEqual(expect.objectContaining({ wish: "pause" }));
  await expect(strip.getByRole("button", { name: "Continuar" })).toBeVisible();
  await strip.getByRole("button", { name: "Continuar" }).click();
  await expect(strip.getByRole("button", { name: "Pausar" })).toBeVisible();
  // The table's volume, the game master's.
  const master = strip.getByRole("slider", { name: "Volume da mesa" });
  await master.fill("40");
  await master.dispatchEvent("change");
  await expect.poll(async () => (await app.calls("table_sound")).at(-1)).toEqual(expect.objectContaining({ wish: "master", value: 40 }));
  // Loop: the track.
  await strip.getByRole("button", { name: "Repetir: desligado" }).click();
  await expect(strip.getByRole("button", { name: "Repetir: esta faixa" })).toBeVisible();
  await strip.getByRole("button", { name: "Parar" }).click();
  await expect(strip.getByRole("button", { name: "Tocar um arquivo…" })).toBeVisible();
});

test("a note is the soundboard: a play button on each sound link, the heading the scene next and previous walk", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const strip = await openTable(page);
  await app.quickOpen("Trilha");
  const preview = page.locator(".preview:visible");
  await expect(preview.getByRole("button", { name: /^Tocar “.*” na mesa$/ })).toHaveCount(3);
  await preview.getByRole("button", { name: "Tocar “taverna” na mesa" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
  await expect(strip.getByRole("button", { name: "Faixa anterior da cena" })).toBeDisabled();
  await strip.getByRole("button", { name: "Próxima faixa da cena" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("estrada");
  // The scene ends there: the next is Batalha's, another scene.
  await expect(strip.getByRole("button", { name: "Próxima faixa da cena" })).toBeDisabled();
  await strip.getByRole("button", { name: "Faixa anterior da cena" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
  // Loop the scene: off, the track, the scene; then the last's next is the first.
  await strip.getByRole("button", { name: "Repetir: desligado" }).click();
  await strip.getByRole("button", { name: "Repetir: esta faixa" }).click();
  await expect(strip.getByRole("button", { name: "Repetir: a cena" })).toBeVisible();
  await strip.getByRole("button", { name: "Próxima faixa da cena" }).click();
  await strip.getByRole("button", { name: "Próxima faixa da cena" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
});

test("a file some players do not see: the game master is asked, names named, and the release plays it for them", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  await page.evaluate(() => {
    window.__harness.tableSound.unheardOf = (p) => (p.includes("batalha") && !window.__released ? ["Ana", "Bia"] : []);
    const set = window.__harness.core.handlers.access_set;
    window.__harness.core.handlers.access_set = (a) => {
      window.__released = true;
      return set ? set(a) : { changed: 1 };
    };
  });
  const strip = await openTable(page);
  await strip.getByRole("button", { name: "Tocar um arquivo…" }).click();
  await page.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: "batalha" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("2 jogadores não veem este arquivo (Ana, Bia)");
  // Cancel: nothing plays.
  await ask.getByRole("button", { name: "Cancelar" }).click();
  await expect(strip.getByRole("button", { name: "Tocar um arquivo…" })).toBeVisible();
  expect((await app.calls("table_play")).filter((c) => c.ask === false)).toEqual([]);
  // Release and play: the file seen by the whole table, then played.
  await strip.getByRole("button", { name: "Tocar um arquivo…" }).click();
  await page.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: "batalha" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar e tocar" }).click();
  await expect.poll(() => app.calls("access_set")).toEqual([{ paths: ["Música/batalha.wav"], change: { kind: "set", set: { whole: "see", rows: [] }, secret_name: null } }]);
  await expect.poll(async () => (await app.calls("table_play")).at(-1)).toEqual(expect.objectContaining({ path: "Música/batalha.wav", ask: false }));
  await expect(strip.locator(".table-sound-name")).toHaveText("batalha");
});

test("a player's strip: no controls, their own volume, mute and Follow; a track they do not see is named as one, and nothing is fetched", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "reader");
  const strip = await openTable(page);
  await expect(strip).toContainText("Nada tocando");
  await expect(strip.getByRole("button", { name: "Tocar um arquivo…" })).toHaveCount(0);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav", { durationMs: 2000, looping: true }));
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
  for (const name of ["Pausar", "Parar", "Próxima faixa da cena", "Faixa anterior da cena", "Tocar um arquivo…"]) await expect(strip.getByRole("button", { name })).toHaveCount(0);
  await expect(strip.getByRole("slider", { name: "Volume da mesa" })).toHaveCount(0);
  await expect(strip.getByRole("slider", { name: "Seu volume" })).toBeVisible();
  await expect(strip.getByRole("slider", { name: "Posição" })).toBeDisabled();
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/taverna.wav");
  // The person's own: follow off silences this window only.
  await strip.getByRole("checkbox", { name: "Seguir a mesa" }).uncheck();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio.table-sound-audio").muted)).toBe(true);
  expect(await app.calls("table_sound")).toEqual([]);
  await strip.getByRole("checkbox", { name: "Seguir a mesa" }).check();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio.table-sound-audio").muted)).toBe(false);
  await strip.getByRole("button", { name: "Silenciar" }).click();
  await expect(strip.getByRole("button", { name: "Voltar o som" })).toBeVisible();
  // The game master pauses: the window follows.
  await page.evaluate(() => window.__harness.tableSound.masterChanges("pause"));
  await expect(strip.locator(".table-sound-said")).toHaveText("Pausado: taverna");
  // A track the player does not see: told as one, no file asked for.
  await page.evaluate(() => {
    const s = window.__harness.tableSound;
    s.hidden.add("Música/batalha.wav");
    s.masterPlays("Música/batalha.wav");
  });
  await expect(strip.locator(".table-sound-name")).toHaveText("uma faixa que você não vê");
  await expect.poll(() => audioSrc(page)).toBe(null);
});

test("a late joiner whose engine waits for a gesture is offered Hear the table, and the gesture plays it", async ({ app, page }) => {
  await stubPlay(page, { refuseFirst: true });
  await atTable(app, page, "reader");
  const strip = await openTable(page);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/estrada.wav", { durationMs: 2000 }));
  const hear = strip.getByRole("button", { name: "Ouvir a mesa" });
  await expect(hear).toBeVisible();
  await expect(hear).toBeFocused();
  await hear.click();
  await expect(hear).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);
});

test("alone in a folder of this computer: the strip plays for this window, with nothing sent", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner", false);
  const strip = await openTable(page);
  await strip.getByRole("button", { name: "Tocar um arquivo…" }).click();
  await page.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: "taverna" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
  await expect(strip).toContainText("Só nesta janela: a pasta não tem mesa.");
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/taverna.wav");
  await strip.getByRole("button", { name: "Pausar" }).click();
  await expect(strip.getByRole("button", { name: "Continuar" })).toBeVisible();
  expect(await app.calls("table_play")).toEqual([]);
  expect(await app.calls("table_sound")).toEqual([]);
});

test("with the panel closed the status bar names the track and opens the panel", async ({ app, page }) => {
  test.skip(phone(page), "the status bar is the desktop's");
  await stubPlay(page);
  await atTable(app, page, "reader");
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav", { durationMs: 2000 }));
  const item = page.locator(".status-bar .status-sound");
  await expect(item).toBeVisible();
  await expect(item).toContainText("taverna");
  await item.click();
  await expect(page.locator(".table-view .table-sound .table-sound-name")).toHaveText("taverna");
  await expect(item).toBeHidden();
});

test("the switch off: no strip, no play button, no status item", async ({ app, page }) => {
  await withSwitch(page, false);
  await stubPlay(page);
  await atTable(app, page, "owner");
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav"));
  const strip = await openTable(page);
  await expect(strip).toBeHidden();
  await app.quickOpen("Trilha");
  await expect(page.locator(".preview:visible .table-sound-play")).toHaveCount(0);
  await expect(page.locator(".status-sound")).toBeHidden();
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(0);
});

test("every control of the game master's strip is reachable, named and inside the screen @layout", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const strip = await openTable(page);
  await strip.getByRole("button", { name: "Tocar um arquivo…" }).click();
  await page.getByRole("dialog", { name: "Arquivos de som da pasta" }).getByRole("button", { name: "taverna" }).click();
  await expect(strip.locator(".table-sound-name")).toHaveText("taverna");
  const width = page.viewportSize().width;
  const controls = strip.locator("button:visible, input:visible");
  const n = await controls.count();
  expect(n).toBeGreaterThan(8);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    const box = await c.boundingBox();
    expect(box, await c.evaluate((e) => e.outerHTML)).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    const named = await c.evaluate((e) => e.getAttribute("aria-label") || e.textContent?.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || "");
    expect(named, await c.evaluate((e) => e.outerHTML)).not.toBe("");
    if (phone(page)) expect(box.height, await c.evaluate((e) => e.outerHTML)).toBeGreaterThanOrEqual(24);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
