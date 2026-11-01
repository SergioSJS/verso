// Music at the table (ADR 0116 section A, phase 1: files; the player's
// place as amended 2026-10-31: a Music tab of its own, and one slim row in
// the Table tab), in the harness (src/harness/tableSound.ts plays the
// server's rules): the game master's Music tab — the folders as lists, the
// now-playing card, previous, play/pause, next, stop, loop, the table's
// volume, the queue, the filter — the release question for a file some
// players do not see, a note as the soundboard, a player's tab with no
// controls but their own, a track a player does not see, the mini-player's
// one row, Hear the table, the switch off, the window alone, the status
// bar's item, and every control on a phone. The element's play() is the
// page's own stub: what is checked is what the window asks of it. The
// server's rules are tests_table_sound.rs; two people on a real server,
// e2e-server/table-sound.spec.mjs. Screenshots for the maintainer go to
// /logs/shots/music when the tests run in the Docker e2e.

import { existsSync, mkdirSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const SHOTS = "/logs/shots/music";

async function shot(page, name, info) {
  if (!existsSync("/logs")) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });
}

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

/** The element's play and pause, stubbed; with `gesture`, refused until the person touches the page. */
async function stubPlay(page, { gesture = false } = {}) {
  await page.addInitScript((refuse) => {
    let touched = !refuse;
    for (const t of ["pointerdown", "keydown"]) addEventListener(t, () => (touched = true), true);
    // A late joiner: the window opened (a tab clicked), the page then seen as untouched.
    window.__untouched = () => (touched = !refuse);
    window.__plays = [];
    HTMLMediaElement.prototype.play = function () {
      if (!touched) return Promise.reject(new DOMException("no gesture", "NotAllowedError"));
      window.__plays.push(this.getAttribute("src"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  }, gesture);
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

async function openTab(page, name) {
  if (phone(page)) {
    if (!(await page.locator("body.right-open").count())) await page.locator(".bar-right").click();
  } else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name }).click();
}

async function openMusic(page) {
  await openTab(page, /^Música/);
  const view = page.locator(".music-view");
  await expect(view).toBeVisible();
  return view;
}

async function openTable(page) {
  await openTab(page, /^Mesa/);
  await expect(page.locator(".table-view")).toBeVisible();
  return page.locator(".table-view .table-mini");
}

const audioSrc = (page) => page.evaluate(() => document.querySelector("audio.table-sound-audio")?.getAttribute("src") ?? null);
const now = (view) => view.getByRole("group", { name: "Tocando agora" });

test("the game master's Music tab: the folder's tracks as a list, play, pause, the table's volume, loop and stop; the element plays the file's own bytes", async ({ app, page }, info) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  // Nothing loaded until a track plays (item 30).
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(0);
  await expect(now(view)).toContainText("Nada tocando");
  const folders = view.locator(".music-folders");
  await expect(folders.getByRole("button", { name: /^Tocar “/ })).toHaveCount(3);
  await folders.getByRole("button", { name: "Tocar “estrada”" }).click();
  await expect.poll(() => app.calls("table_play")).toEqual([expect.objectContaining({ path: "Música/estrada.wav", channel: "music", ask: true })]);
  await expect(view.locator(".music-title")).toHaveText("estrada");
  await expect(view.locator(".music-from")).toHaveText("De: Música");
  await expect(folders.locator("li.music-track.playing")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/estrada.wav");
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);
  // The length the element read is told to the table once.
  await expect.poll(async () => (await app.calls("table_sound")).some((c) => c.wish === "duration" && c.value > 1500)).toBe(true);
  // The queue is the list it came from: next walks it.
  await expect(view.locator(".music-queue")).toContainText("Na fila · Música");
  await now(view).getByRole("button", { name: "Próxima faixa" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
  await shot(page, "music-tab-master", info);
  await now(view).getByRole("button", { name: "Pausar" }).click();
  await expect.poll(async () => (await app.calls("table_sound")).at(-1)).toEqual(expect.objectContaining({ wish: "pause" }));
  await expect(now(view).getByRole("button", { name: "Continuar" })).toBeVisible();
  await now(view).getByRole("button", { name: "Continuar" }).click();
  const master = view.getByRole("slider", { name: "Volume da mesa" });
  await master.fill("40");
  await master.dispatchEvent("change");
  await expect.poll(async () => (await app.calls("table_sound")).at(-1)).toEqual(expect.objectContaining({ wish: "master", value: 40 }));
  await now(view).getByRole("button", { name: "Repetir: desligado" }).click();
  await expect(now(view).getByRole("button", { name: "Repetir: esta faixa" })).toBeVisible();
  await now(view).getByRole("button", { name: "Repetir: esta faixa" }).click();
  await expect(now(view).getByRole("button", { name: "Repetir: a lista" })).toBeVisible();
  // The filter.
  const filter = view.getByRole("searchbox", { name: "Filtrar músicas" });
  await filter.fill("bat");
  await expect(folders.getByRole("button", { name: /^Tocar “/ })).toHaveCount(1);
  await filter.fill("nada assim");
  await expect(view).toContainText("Nenhuma faixa com “nada assim”.");
  await filter.fill("");
  await now(view).getByRole("button", { name: "Parar" }).click();
  await expect(now(view)).toContainText("Nada tocando");
});

test("a note is a playlist and the soundboard: a play button on each sound link, the heading the list next and previous walk", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  await expect(view.locator(".music-playlists")).toContainText("Trilha › Taverna");
  await app.quickOpen("Trilha");
  const preview = page.locator(".preview:visible");
  await expect(preview.getByRole("button", { name: /^Tocar “.*” na mesa$/ })).toHaveCount(3);
  await preview.getByRole("button", { name: "Tocar “taverna” na mesa" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
  await expect(view.locator(".music-from")).toHaveText("De: Trilha › Taverna");
  await expect(now(view).getByRole("button", { name: "Faixa anterior" })).toBeDisabled();
  await now(view).getByRole("button", { name: "Próxima faixa" }).click();
  await expect(view.locator(".music-title")).toHaveText("estrada");
  await expect(now(view).getByRole("button", { name: "Próxima faixa" })).toBeDisabled();
  await now(view).getByRole("button", { name: "Faixa anterior" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
  // Loop the list: off, the track, the list; then the last's next is the first.
  await now(view).getByRole("button", { name: "Repetir: desligado" }).click();
  await now(view).getByRole("button", { name: "Repetir: esta faixa" }).click();
  await now(view).getByRole("button", { name: "Próxima faixa" }).click();
  await now(view).getByRole("button", { name: "Próxima faixa" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
});

test("a file some players do not see: the game master is asked, names named, and the release plays it for them", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  await page.evaluate(() => {
    window.__harness.tableSound.unheardOf = (p) => (p.includes("batalha") && !window.__released ? ["Ana", "Bia"] : []);
    // The server's answer to the release (the harness's own refuses outside a campaign).
    window.__harness.core.handlers.access_set = () => {
      window.__released = true;
      return { changed: 1 };
    };
  });
  const view = await openMusic(page);
  const track = view.locator(".music-folders").getByRole("button", { name: "Tocar “batalha”" });
  await track.click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("2 jogadores não veem este arquivo (Ana, Bia)");
  await ask.getByRole("button", { name: "Cancelar" }).click();
  await expect(now(view)).toContainText("Nada tocando");
  expect((await app.calls("table_play")).filter((c) => c.ask === false)).toEqual([]);
  await track.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar e tocar" }).click();
  await expect.poll(() => app.calls("access_set")).toEqual([{ paths: ["Música/batalha.wav"], change: { kind: "set", set: { whole: "see", rows: [] }, secret_name: null } }]);
  await expect.poll(async () => (await app.calls("table_play")).at(-1)).toEqual(expect.objectContaining({ path: "Música/batalha.wav", ask: false }));
  await expect(view.locator(".music-title")).toHaveText("batalha");
  await expect(page.locator("#status")).toHaveText("“batalha” liberado para a mesa.");
});

test("a refusal is said in the window's language, never the server's English", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  await page.evaluate(() => {
    window.__harness.core.handlers.table_play = () => {
      throw { kind: "refused", message: "the table is a server's; a folder of this computer alone has none" };
    };
  });
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect(page.locator("#status")).toHaveText("Esta pasta não tem mesa: a música toca só nesta janela.");
});

test("a player's Music tab: no controls, their own volume, mute and Follow; a track they do not see is named as one, with why, and nothing is fetched", async ({ app, page }, info) => {
  await stubPlay(page);
  await atTable(app, page, "reader");
  const view = await openMusic(page);
  await expect(now(view)).toContainText("Nada tocando");
  await expect(view).toContainText("Só o mestre toca e troca as faixas");
  await expect(view.getByRole("button", { name: /^Tocar “/ })).toHaveCount(0);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav", { durationMs: 2000, looping: true }));
  await expect(view.locator(".music-title")).toHaveText("taverna");
  for (const name of ["Pausar", "Parar", "Próxima faixa", "Faixa anterior"]) await expect(now(view).getByRole("button", { name })).toBeHidden();
  await expect(view.getByRole("slider", { name: "Volume da mesa" })).toBeHidden();
  await expect(view.getByRole("slider", { name: "Seu volume" })).toBeVisible();
  await expect(view.getByRole("slider", { name: "Posição" })).toBeDisabled();
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/taverna.wav");
  await shot(page, "music-tab-player", info);
  await view.getByRole("checkbox", { name: "Seguir a mesa" }).uncheck();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio.table-sound-audio").muted)).toBe(true);
  expect(await app.calls("table_sound")).toEqual([]);
  await view.getByRole("checkbox", { name: "Seguir a mesa" }).check();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio.table-sound-audio").muted)).toBe(false);
  await now(view).getByRole("button", { name: "Silenciar" }).click();
  await expect(now(view).getByRole("button", { name: "Voltar o som" })).toBeVisible();
  await page.evaluate(() => window.__harness.tableSound.masterChanges("pause"));
  await expect(view.locator(".table-sound-said")).toHaveText("Pausado: taverna");
  await page.evaluate(() => {
    const s = window.__harness.tableSound;
    s.hidden.add("Música/batalha.wav");
    s.masterPlays("Música/batalha.wav");
  });
  await expect(view.locator(".music-title")).toHaveText("uma faixa que você não vê");
  await expect(view.locator(".music-why")).toContainText("O mestre não liberou este arquivo para você");
  await expect.poll(() => audioSrc(page)).toBe(null);
});

test("the Table tab's mini-player is one slim row, only while something plays; the name opens the Music tab, the volume a popover @layout", async ({ app, page }, info) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const mini = await openTable(page);
  await expect(mini).toBeHidden();
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/estrada.wav", { durationMs: 2000 }));
  await expect(mini).toBeVisible();
  await expect(mini.locator(".table-mini-name")).toHaveText("estrada");
  for (const name of ["Faixa anterior", "Pausar", "Próxima faixa", "Volume"]) await expect(mini.getByRole("button", { name, exact: true })).toBeVisible();
  const box = await mini.boundingBox();
  expect(box.height).toBeLessThanOrEqual(phone(page) ? 40 : 36);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await shot(page, "mini-player-master", info);
  await mini.getByRole("button", { name: "Pausar" }).click();
  await expect.poll(async () => (await app.calls("table_sound")).at(-1)).toEqual(expect.objectContaining({ wish: "pause" }));
  await mini.getByRole("button", { name: "Volume", exact: true }).click();
  const own = mini.getByRole("slider", { name: "Seu volume" });
  await expect(own).toBeFocused();
  await own.fill("30");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("verso:table-sound")).volume)).toBe(30);
  await page.keyboard.press("Escape");
  await expect(own).toBeHidden();
  await expect(mini.getByRole("button", { name: "Volume", exact: true })).toBeFocused();
  await mini.locator(".table-mini-name").click();
  await expect(page.locator(".music-view")).toBeVisible();
});

test("a player's mini-player: the name and their own volume only", async ({ app, page }, info) => {
  await stubPlay(page);
  await atTable(app, page, "reader");
  const mini = await openTable(page);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/estrada.wav", { durationMs: 2000 }));
  await expect(mini.locator(".table-mini-name")).toHaveText("estrada");
  for (const name of ["Faixa anterior", "Pausar", "Próxima faixa"]) await expect(mini.getByRole("button", { name, exact: true })).toBeHidden();
  await expect(mini.getByRole("button", { name: "Volume", exact: true })).toBeVisible();
  await shot(page, "mini-player-player", info);
});

test("a late joiner whose engine waits for a gesture is offered Hear the table, and the gesture plays it", async ({ app, page }) => {
  await stubPlay(page, { gesture: true });
  await atTable(app, page, "reader");
  const view = await openMusic(page);
  await page.evaluate(() => window.__untouched());
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/estrada.wav", { durationMs: 2000 }));
  const hear = view.getByRole("button", { name: "Ouvir a mesa" });
  await expect(hear).toBeVisible();
  await expect(hear).toBeFocused();
  await hear.click();
  await expect(hear).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);
});

test("alone in a folder of this computer: the Music tab plays for this window, with nothing sent", async ({ app, page }) => {
  await stubPlay(page);
  await atTable(app, page, "owner", false);
  const view = await openMusic(page);
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
  await expect(view).toContainText("Só nesta janela: a pasta não tem mesa.");
  await expect.poll(() => audioSrc(page)).toBe("/__vault/M%C3%BAsica/taverna.wav");
  await now(view).getByRole("button", { name: "Pausar" }).click();
  await expect(now(view).getByRole("button", { name: "Continuar" })).toBeVisible();
  expect(await app.calls("table_play")).toEqual([]);
  expect(await app.calls("table_sound")).toEqual([]);
});

test("with the Table and Music tabs closed the status bar names the track and opens the Music tab", async ({ app, page }, info) => {
  test.skip(phone(page), "the status bar is the desktop's");
  await stubPlay(page);
  await atTable(app, page, "reader");
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav", { durationMs: 2000 }));
  const item = page.locator(".status-bar .status-sound");
  await expect(item).toBeVisible();
  await expect(item).toContainText("taverna");
  await shot(page, "status-item", info);
  await item.click();
  await expect(page.locator(".music-view .music-title")).toHaveText("taverna");
  await expect(item).toBeHidden();
});

test("the switch off: no Music tab, no mini-player, no play button, no status item", async ({ app, page }) => {
  await withSwitch(page, false);
  await stubPlay(page);
  await atTable(app, page, "owner");
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/taverna.wav"));
  const mini = await openTable(page);
  await expect(mini).toBeHidden();
  await expect(page.locator("#right-tabs").getByRole("tab", { name: /^Música/ })).toBeHidden();
  await app.quickOpen("Trilha");
  await expect(page.locator(".preview:visible .table-sound-play")).toHaveCount(0);
  await expect(page.locator(".status-sound")).toBeHidden();
  expect(await page.evaluate(() => document.querySelectorAll("audio").length)).toBe(0);
});

test("every control of the Music tab is reachable, named and inside the screen; 44 px on a phone @layout", async ({ app, page }, info) => {
  await stubPlay(page);
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “taverna”" }).click();
  await expect(view.locator(".music-title")).toHaveText("taverna");
  if (phone(page)) await shot(page, "music-sheet-phone", info);
  const width = page.viewportSize().width;
  const controls = view.locator("button:visible, input:visible, summary:visible");
  const n = await controls.count();
  expect(n).toBeGreaterThan(10);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    await c.scrollIntoViewIfNeeded();
    const b = await c.boundingBox();
    const html = await c.evaluate((e) => e.outerHTML.slice(0, 200));
    expect(b, html).not.toBeNull();
    expect(b.x, html).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, html).toBeLessThanOrEqual(width + 1);
    const named = await c.evaluate((e) => e.getAttribute("aria-label") || e.textContent?.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || "");
    expect(named, html).not.toBe("");
    if (phone(page) && (await c.evaluate((e) => e.tagName === "BUTTON" || e.tagName === "SUMMARY"))) expect(b.height, html).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("screenshots: the soundboard's play button in a note, and the Music tab in the dark @layout", async ({ app, page }, info) => {
  test.skip(!existsSync("/logs"), "only in the Docker e2e");
  await stubPlay(page);
  await atTable(app, page, "owner");
  await app.quickOpen("Trilha");
  await expect(page.locator(".preview:visible .table-sound-play")).toHaveCount(3);
  await shot(page, "soundboard-note", info);
  const view = await openMusic(page);
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “estrada”" }).click();
  await expect(view.locator(".music-title")).toHaveText("estrada");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "music-tab-dark", info);
});
