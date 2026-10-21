// 3D dice (ADR 0101): a switch of its own, off by default even with
// "Tudo"; with it on a roll lays a transparent canvas over the window while
// the dice fall, the result is said at once and the card — always made —
// shows when they have rested or been skipped (a click, Esc, or the maximum
// time); the engine is a chunk fetched only for the first 3D roll; reduced
// motion never animates; in a room each person animates only if their own
// switch is on, and a roll heard twice falls once.
//
// WebGL in a headless browser may be software or missing. The tests that
// need the canvas ask `gl()` first: where there is no WebGL they check the
// fallback instead — the chunk is fetched, no canvas stays, the card shows
// the result — and say so in their annotations.

import { test, expect } from "./fixtures.mjs";

const NOTE = "Mesa.md";
const TEXT = ["# Mesa", "", "Ataque: `dice: 1d20+3` e dano `dice: 2d6`.", "", "Muitos: `dice: 21d6` e explosivo `dice: 1d6!`.", ""].join("\n");

/** The 3D switch on, as a person's stored settings, before the window loads. */
async function withSwitch(page, on = true) {
  await page.addInitScript((value) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: value } }));
  }, on);
}

/** Every request for the 3D chunk. */
function watchChunk(page) {
  const seen = [];
  page.on("request", (r) => {
    if (/\/(harness-)?chunks\/stage-[^/]*\.js/.test(r.url())) seen.push(r.url());
  });
  return seen;
}

/** Whether this browser can make a WebGL context at all. */
const gl = (page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  });

async function openNote(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Mesa");
}

const canvas = (page) => page.locator("canvas.dice3d-canvas");

test("the 3D dice switch is off by default, 'Tudo' leaves it off, and a person can turn it on", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const row = (title) => page.locator(".setting", { has: page.locator(".setting-title", { hasText: new RegExp(`^${title}$`) }) });
  const box = (title) => row(title).locator("input[type=checkbox]");
  await expect(box("Dados 3D")).not.toBeChecked();
  await expect(box("Dados")).toBeChecked();
  // "Tudo" says it does not turn the 3D dice on, and does not.
  await row("Oráculos").locator("label.switch").click();
  await expect(box("Oráculos")).not.toBeChecked();
  await page.getByRole("button", { name: "Tudo", exact: true }).click();
  await expect(page.locator(".confirm-box p")).toContainText("Não liga: Dados 3D");
  await page.locator(".confirm-box button.save").click();
  await expect(box("Oráculos")).toBeChecked();
  await expect(box("Dados 3D")).not.toBeChecked();
  await row("Dados 3D").locator("label.switch").click();
  await expect(box("Dados 3D")).toBeChecked();
  await expect(page.locator("#status")).toHaveText("Dados 3D: ligado");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).features.dice3d)).toBe(true);
  await page.keyboard.press("Escape");
});

test("switch off: a roll shows the card at once, with no canvas and no chunk", async ({ app, page }) => {
  const chunk = watchChunk(page);
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(preview.locator('.dice[data-dice="1d20+3"] .dice-total')).toHaveText(/^\d+$/);
  await expect(canvas(page)).toHaveCount(0);
  expect(chunk).toEqual([]);
});

test("switch on: the chunk loads on the first roll only, the result is said at once, the card shows after the fall", async ({ app, page }, info) => {
  await withSwitch(page);
  const chunk = watchChunk(page);
  await app.open();
  await openNote(app);
  const hasGl = await gl(page);
  info.annotations.push({ type: "webgl", description: hasGl ? "available" : "NOT available in this browser: only the fallback is checked" });
  // Nothing of the engine until the first 3D roll.
  expect(chunk).toEqual([]);
  const preview = page.locator(".preview:visible");
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  // Said at once, with the card still held back while the dice fall.
  await expect(page.locator(".dice-said")).toHaveText(/^1d20\+3: \d+ — \d+ mais 3$/);
  const said = Number(/^1d20\+3: (\d+)/.exec((await page.locator(".dice-said").textContent()) ?? "")?.[1]);
  expect(chunk.length).toBe(1);
  if (hasGl) {
    await expect(canvas(page)).toHaveCount(1);
    await expect(canvas(page)).toHaveAttribute("aria-hidden", "true");
    await expect(card).toBeHidden();
    // The canvas lays over the window and is cleared by itself, at the latest at the maximum time.
    await expect(canvas(page)).toHaveCount(0, { timeout: 9000 });
  }
  // The card is always made, with the same result.
  await expect(card.locator(".dice-total")).toHaveText(String(said));
  // A second roll does not fetch the chunk again.
  await preview.getByRole("button", { name: "Rolar 2d6" }).click();
  await expect(page.locator(".dice-said")).toHaveText(/^2d6: \d+ — \d+, \d+$/);
  expect(chunk.length).toBe(1);
  // The canvas is gone and so is every animation frame: the page is idle.
  if (hasGl) await expect(canvas(page)).toHaveCount(0, { timeout: 9000 });
});

test("Esc and a click skip the fall; the card shows the result they held back", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await openNote(app);
  if (!(await gl(page))) {
    info.annotations.push({ type: "webgl", description: "NOT available: skip not verifiable here" });
    test.skip(true, "no WebGL in this browser");
  }
  const preview = page.locator(".preview:visible");
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(canvas(page)).toHaveCount(1);
  await expect(card).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveCount(0);
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
  // A click anywhere on the canvas.
  await preview.getByRole("button", { name: "Rolar de novo" }).click();
  await expect(canvas(page)).toHaveCount(1);
  await page.mouse.click(300, 300);
  await expect(canvas(page)).toHaveCount(0);
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
});

test("more than twenty dice and exploding dice get only the 2D card", async ({ app, page }) => {
  await withSwitch(page);
  const chunk = watchChunk(page);
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 21d6" }).click();
  await expect(preview.locator('.dice[data-dice="21d6"] .dice-total')).toHaveText(/^\d+$/);
  await preview.getByRole("button", { name: "Rolar 1d6!" }).click();
  await expect(preview.locator('.dice[data-dice="1d6!"] .dice-total')).toHaveText(/^\d+$/);
  await expect(canvas(page)).toHaveCount(0);
  expect(chunk).toEqual([]);
});

test("reduced motion: the switch on, no canvas and no chunk", async ({ app, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withSwitch(page);
  const chunk = watchChunk(page);
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(preview.locator('.dice[data-dice="1d20+3"] .dice-total')).toHaveText(/^\d+$/);
  await expect(canvas(page)).toHaveCount(0);
  expect(chunk).toEqual([]);
});

test("the palette's roller: said at once, shown after the fall, never twice", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  const hasGl = await gl(page);
  info.annotations.push({ type: "webgl", description: hasGl ? "available" : "NOT available: fallback only" });
  await app.command("Rolar dados");
  const dialog = page.getByRole("dialog", { name: "Rolar dados" });
  await dialog.getByRole("textbox", { name: "Notação, como 1d20+3" }).fill("3d6");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dice-said")).toHaveText(/^3d6: \d+ — \d+, \d+, \d+$/);
  if (hasGl) {
    await expect(canvas(page)).toHaveCount(1);
    await expect(dialog.locator(".dice-roller-out")).toHaveText("");
    await page.keyboard.press("Escape");
    // Esc only skipped the fall: the roller stays open.
    await expect(canvas(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
  }
  await expect(dialog.locator(".dice-roller-out")).toHaveText(/^\d+3d6: \d+ — \d+, \d+, \d+$/);
});

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

async function joinRoom(app, page) {
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, SYNCED);
  await app.emit("sync-status", SYNCED);
  await openNote(app);
}

test("in a room: another member's roll falls only for a person whose switch is on, and heard twice it falls once", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await joinRoom(app, page);
  const hasGl = await gl(page);
  info.annotations.push({ type: "webgl", description: hasGl ? "available" : "NOT available: fallback only" });
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect.poll(async () => (await app.calls("collab_roll")).length).toBe(1);
  if (hasGl) await expect(canvas(page)).toHaveCount(0, { timeout: 9000 });
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
  // Bia rolls: the event the server relays.
  const roll = await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d20+3", null, [14]), NOTE);
  await expect(page.locator(".dice-said")).toHaveText("Bia rolou 1d20+3: 17 — 14 mais 3");
  if (hasGl) {
    await expect(canvas(page)).toHaveCount(1);
    await expect(card.locator(".dice-who")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
  await expect(card.locator(".dice-who")).toHaveText("Bia rolou");
  await expect(card.locator(".dice-total")).toHaveText("17");
  // The same event again (a reconnection): no second fall.
  await app.emit("collab-roll", { path: NOTE, roll });
  await page.waitForTimeout(600);
  await expect(canvas(page)).toHaveCount(0);
});

test("in a room with the switch off: another member's roll shows at once, no canvas", async ({ app, page }) => {
  const chunk = watchChunk(page);
  await app.open();
  await joinRoom(app, page);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d20+3", null, [14]), NOTE);
  await expect(card.locator(".dice-total")).toHaveText("17");
  await expect(canvas(page)).toHaveCount(0);
  expect(chunk).toEqual([]);
});
