// Share audio, the sharer's window and the people at the table (ADR 0116
// section B, items 16, 21, 26, 27; task S6), in the harness: the game master
// sees "Compartilhar áudio…" in the Music tab (empty state and header) only
// where the desktop host lists `audio_share` AND the table lets them
// broadcast; the picker lists the host's sources (an empty list says capture
// comes with an update); the first start shows the notice once; the start
// goes server share, then capture under its number; a failed capture undoes
// the server's share and says why; a second share asks before replacing the
// first; while sharing the Music tab, the Table tab's mini-player and the
// status bar all offer Stop, and the card shows the level meter with its
// words, the listeners and the rate; a player sees none of the button, and
// "<master> is sharing <source>" with their own controls. Shots go to
// /logs/shots/share when the Docker run mounts /logs.

import { existsSync, mkdirSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const SHOTS = "/logs/shots/share";
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

async function shot(page, name, info) {
  if (!existsSync("/logs")) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });
}

/** The folder's table up, this window the game master's (`owner`) or a player's (`reader`). */
async function atTable(app, page, role) {
  await app.open("?vault=empty");
  await page.evaluate((role) => {
    const t = window.__harness.table;
    t.role = role;
    t.up = true;
  }, role);
  await app.writeOutside("Sessao.md", "# Sessão\n");
  await app.folderChanged(["Sessao.md"], true);
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

const harness = (page, fn, arg) => page.evaluate(fn, arg);
const shareOf = (page) => page.evaluate(() => window.__harness.audioShare.share);
const captures = (page) => page.evaluate(() => window.__harness.audioShare.captures);

/** Click the start through the picker, accepting the notice when it shows. */
async function startThroughPicker(page, view) {
  await view.getByRole("button", { name: /^Compartilhar áudio/ }).first().click();
  const picker = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Começar a compartilhar" }).click();
}

async function acceptNotice(page) {
  const notice = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(notice).toContainText("O som do que você compartilha vai para todos desta mesa");
  await notice.getByRole("button", { name: "Entendi, compartilhar" }).click();
}

test("@layout the game master shares: the button in the empty state and the header, the picker, the notice once, the server's share then the capture, the card with its meter, Stop in the tab, the mini-player and the status bar", async ({ app, page }, info) => {
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  // The empty state and the header both lead to it (ADR 0116 item 16).
  await expect(view.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(2);
  await shot(page, "1-master-empty", info);
  await view.getByRole("button", { name: /^Compartilhar áudio/ }).first().click();
  const picker = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(picker.getByRole("radio", { name: /Spotify/ })).toBeChecked();
  await expect(picker.getByText("Aplicativo")).toBeVisible();
  // The quality is folded; 96 is the default (item: 64/96/128).
  await picker.locator("summary").click();
  await expect(picker.locator("select")).toHaveValue("96");
  await shot(page, "2-picker", info);
  await picker.getByRole("button", { name: "Começar a compartilhar" }).click();
  // The first share shows the notice, once.
  await acceptNotice(page);
  await expect(view.locator(".music-sharing-title")).toContainText("Compartilhando Spotify");
  // The server's share first, the capture under the number it gave.
  const share = await shareOf(page);
  expect(share.name).toBe("Spotify");
  expect(await captures(page)).toEqual([{ id: "test:spotify", kbps: 96, share: share.id }]);
  // The sharer never asks for its own stream.
  expect(await page.evaluate(() => window.__harness.audioShare.asked)).not.toContain(true);
  // The meter and its words; the listeners and the rate.
  await expect(view.locator(".music-meter-state")).toHaveText("Som chegando");
  await expect(view.getByRole("meter", { name: "Nível do som" })).toHaveAttribute("aria-valuetext", "Som chegando");
  await expect(view.locator(".music-sharing-stats")).toHaveText("2 ouvintes · 96 kbit/s");
  await expect(view.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(0);
  await shot(page, "3-sharing", info);
  // The status bar's Stop is there whichever tab is on screen (a phone has no status bar to look at).
  if (!phone(page)) await expect(page.locator(".status-sound-stop")).toBeVisible();
  // The Table tab's one-row mini-player names the share and has Stop.
  const mini = await openTable(page);
  await expect(mini.locator(".table-mini-name")).toHaveText("Compartilhando Spotify");
  await expect(mini.getByRole("button", { name: "Parar de compartilhar" })).toBeVisible();
  await shot(page, "4-mini", info);
  // Stop from the mini-player: the capture and the server's share end, the button is back.
  await mini.getByRole("button", { name: "Parar de compartilhar" }).click();
  await expect.poll(() => shareOf(page)).toBeNull();
  await expect(page.locator(".status-sound-stop")).toBeHidden();
  const again = await openMusic(page);
  await expect(again.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(2);
  // The notice is not asked again.
  await startThroughPicker(page, again);
  await expect(again.locator(".music-sharing-title")).toContainText("Compartilhando Spotify");
  await again.getByRole("button", { name: "Parar de compartilhar" }).click();
  await expect.poll(() => shareOf(page)).toBeNull();
});

test("a source that captures nothing is seen at once: the meter says silence", async ({ app, page }, info) => {
  await atTable(app, page, "owner");
  await harness(page, () => (window.__harness.audioShare.level = 0));
  const view = await openMusic(page);
  await startThroughPicker(page, view);
  await acceptNotice(page);
  await expect(view.locator(".music-meter-state")).toContainText("Verificando o som", { timeout: 5000 });
  await expect(view.locator(".music-meter-state")).toContainText("Silêncio: nada está sendo captado", { timeout: 8000 });
  await shot(page, "5-silence", info);
  await harness(page, () => (window.__harness.audioShare.level = 0.4));
  await expect(view.locator(".music-meter-state")).toHaveText("Som chegando");
  await view.getByRole("button", { name: "Parar de compartilhar" }).click();
});

test("a capture that fails undoes the server's share and says why", async ({ app, page }) => {
  await atTable(app, page, "owner");
  await harness(page, () => (window.__harness.audioShare.captureFails = "this source cannot be captured"));
  const view = await openMusic(page);
  await startThroughPicker(page, view);
  await acceptNotice(page);
  await expect(page.locator("body")).toContainText("O compartilhamento não começou");
  await expect(page.locator("body")).toContainText("this source cannot be captured");
  // The server's share is gone, nothing is sharing, the button is still there.
  await expect.poll(() => shareOf(page)).toBeNull();
  await expect(view.locator(".music-sharing")).toBeHidden();
  await expect(view.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(2);
});

test("a second share asks before it replaces the first", async ({ app, page }) => {
  await atTable(app, page, "owner");
  const view = await openMusic(page);
  const first = await harness(page, () => window.__harness.audioShare.masterShares({ name: "Navegador", by: "Ana" }));
  await startThroughPicker(page, view);
  await acceptNotice(page);
  const ask = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(ask).toContainText("Ana já está compartilhando Navegador");
  // No is no: the first stays.
  await ask.getByRole("button", { name: "Cancelar" }).click();
  expect((await shareOf(page)).id).toBe(first.id);
  expect(await captures(page)).toEqual([]);
  // Yes replaces it.
  await startThroughPicker(page, view);
  await expect(ask).toContainText("Ana já está compartilhando Navegador");
  await ask.getByRole("button", { name: "Substituir" }).click();
  await expect(view.locator(".music-sharing-title")).toContainText("Compartilhando Spotify");
  expect((await shareOf(page)).id).not.toBe(first.id);
  expect(await page.evaluate(() => window.__harness.audioShare.starts.map((s) => s.replace))).toEqual([false, false, true]);
  await view.getByRole("button", { name: "Parar de compartilhar" }).click();
});

test("a host with nothing to capture says so, with no dead end", async ({ app, page }, info) => {
  await atTable(app, page, "owner");
  await harness(page, () => (window.__harness.audioShare.sources = []));
  const view = await openMusic(page);
  await view.getByRole("button", { name: /^Compartilhar áudio/ }).first().click();
  const picker = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(picker.getByRole("status")).toContainText("A captura de som chega numa próxima atualização");
  await expect(picker.getByRole("button", { name: "Começar a compartilhar" })).toBeDisabled();
  await shot(page, "6-no-sources", info);
  // Escape leaves it and the focus returns.
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});

test("the picker is keyboard-driven: arrows choose, Tab stays inside, Escape cancels", async ({ app, page }) => {
  await atTable(app, page, "owner");
  await harness(page, () => (window.__harness.audioShare.sources = [{ id: "a", name: "Spotify", kind: "app" }, { id: "b", name: "Tudo", kind: "system" }]));
  const view = await openMusic(page);
  await view.getByRole("button", { name: /^Compartilhar áudio/ }).first().click();
  const picker = page.getByRole("dialog", { name: "Compartilhar áudio" });
  await expect(picker.getByRole("radio", { name: /Spotify/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("radio", { name: /Tudo/ })).toBeChecked();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest(".share-pick") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  expect(await captures(page)).toEqual([]);
});

/** The Music tab shown by script, not by a finger: no pointer or key event, so the audio engine still waits for a gesture. */
async function openMusicQuietly(page) {
  await page.evaluate(() => {
    if (window.innerWidth <= 760) document.querySelector(".bar-right")?.click();
    else document.body.classList.remove("no-right");
  });
  const tab = page.locator("#right-tabs").getByRole("tab", { name: /^Música/ });
  await tab.waitFor({ state: "attached", timeout: 15000 });
  await tab.evaluate((el) => el.click());
  const view = page.locator(".music-view");
  await expect(view).toBeVisible();
  return view;
}

test("@layout a player sees no way to share, and hears who shares what, with their own controls", async ({ app, page }, info) => {
  // An engine that waits for a gesture (a browser's autoplay policy): its audio context stays suspended until a touch.
  await page.addInitScript(() => {
    let touched = false;
    for (const t of ["pointerdown", "keydown"]) addEventListener(t, () => (touched = true), true);
    Object.defineProperty((window.AudioContext ?? window.webkitAudioContext).prototype, "state", { get: () => (touched ? "running" : "suspended"), configurable: true });
  });
  await atTable(app, page, "reader");
  const view = await openMusicQuietly(page);
  await expect(view.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(0);
  await harness(page, () => window.__harness.audioShare.masterShares({ name: "Spotify", by: "Ana" }));
  await expect(view.locator(".music-shared-by")).toHaveText("Ana está compartilhando Spotify");
  // Their own volume, mute and Follow the table; the table's volume is the master's.
  await expect(view.getByRole("slider", { name: "Seu volume" })).toBeVisible();
  await expect(view.getByRole("checkbox", { name: "Seguir a mesa" })).toBeChecked();
  await expect(view.getByRole("slider", { name: "Volume da mesa" })).toBeHidden();
  // The sound waits for a tap: the control that lets it start.
  await expect(view.getByRole("button", { name: "Ouvir a mesa" })).toBeVisible();
  await shot(page, "7-listener", info);
  const mini = await openTable(page);
  await expect(mini.locator(".table-mini-name")).toHaveText("Ana está compartilhando Spotify");
  await expect(mini.getByRole("button", { name: "Parar de compartilhar" })).toBeHidden();
  await expect(mini.getByRole("button", { name: "Volume" })).toBeVisible();
  await expect(page.locator(".status-sound-stop")).toBeHidden();
  // The end is said, and the line goes.
  await harness(page, () => window.__harness.audioShare.masterStops());
  await expect(mini).toBeHidden();
});

test("a window whose host cannot capture draws no button, though the person is the game master", async ({ app, page }) => {
  await atTable(app, page, "owner");
  await harness(page, () => {
    window.__harness.core.handlers["capabilities"] = () => ({ host: "server", can: ["write", "table"], latency_ms: null });
    window.dispatchEvent(new Event("verso:role"));
  });
  const view = await openMusic(page);
  await expect(view.getByRole("button", { name: /^Compartilhar áudio/ })).toHaveCount(0);
});
