// 3D dice (ADR 0101): a switch of its own, off by default even with
// "Tudo"; with it on a roll lays a transparent canvas over the window while
// the dice fall, the result is said at once and the card — always made —
// shows when they have rested or been skipped (a click, Esc, or the maximum
// time); at rest they stay on the table until the person touches something,
// as in Rolai; the engine is a chunk fetched only for the first 3D roll; reduced
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
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  const row = (title) => page.locator(".setting", { has: page.locator(".setting-title", { hasText: new RegExp(`^${title}$`) }) });
  const box = (title) => row(title).locator("input[type=checkbox]");
  await expect(box("Dados 3D")).not.toBeChecked();
  await expect(box("Dados")).toBeChecked();
  // "Tudo" says it does not turn the 3D dice on, and does not.
  await row("Oráculos").locator("label.switch").click();
  await expect(box("Oráculos")).not.toBeChecked();
  // The shortcuts are on the general page, "Recursos"; they cover the RPG ones.
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  await page.getByRole("button", { name: "Tudo", exact: true }).click();
  await expect(page.locator(".confirm-box p")).toContainText("Não liga: Dados 3D");
  await page.locator(".confirm-box button.save").click();
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
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
    // The canvas lays over the window; the dice rest at the latest at the maximum time and stay (Rolai) until Esc.
    await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
  // The card is always made, with the same result.
  await expect(card.locator(".dice-total")).toHaveText(String(said));
  // A second roll does not fetch the chunk again.
  await preview.getByRole("button", { name: "Rolar 2d6" }).click();
  await expect(page.locator(".dice-said")).toHaveText(/^2d6: \d+ — \d+, \d+$/);
  expect(chunk.length).toBe(1);
  // The dice rest and stay (Rolai) until Esc takes the canvas and its animation frame: the page is idle.
  if (hasGl) {
    await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
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
  // Anywhere on the canvas, which lies over the lower part of the pane.
  const box = await canvas(page).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(canvas(page)).toHaveCount(0);
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
});

test("more than twenty dice get only the 2D card", async ({ app, page }) => {
  await withSwitch(page);
  const chunk = watchChunk(page);
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 21d6" }).click();
  await expect(preview.locator('.dice[data-dice="21d6"] .dice-total')).toHaveText(/^\d+$/);
  await expect(canvas(page)).toHaveCount(0);
  expect(chunk).toEqual([]);
});

test("an exploding roll falls in 3D: the extra dice are thrown in waves, and the card shows the sum", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await joinRoom(app, page);
  if (!(await gl(page))) {
    info.annotations.push({ type: "webgl", description: "NOT available: fallback only" });
    test.skip(true, "no WebGL in this browser");
  }
  // 3d6! with the chain 6, then 6 (added), then 2 (added): five dice, total 6+4+1+6+2 = 19.
  // The stage measures the dice as it ends: a watcher keeps what it wrote.
  await page.evaluate(() => {
    new MutationObserver((records) => {
      for (const r of records) if (r.attributeName === "data-die-widths") window.__widths = r.target.dataset.dieWidths;
    }).observe(document.body, { subtree: true, attributes: true });
  });
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "3d6!", null, [6, 4, 1, 6, 2]), NOTE);
  await expect(page.locator(".dice-said")).toContainText("3d6!: 19");
  const c = canvas(page);
  await expect(c).toHaveCount(1);
  const widths = await page.waitForFunction(() => window.__widths ?? null, null, { timeout: 8000 });
  expect(JSON.parse(await widths.jsonValue())).toHaveLength(5);
  await expect(c).toHaveAttribute("data-state", "resting", { timeout: 9000 });
  await page.keyboard.press("Escape");
  await expect(c).toHaveCount(0);
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
  if (hasGl) {
    await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
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

// ---- Appearance (Rolai's model: three colour slots, presets, textures, materials, size) ----

/** The 3D switch on and a look stored, before the window loads. */
async function withLook(page, look) {
  await page.addInitScript((l) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, dice3dLook: s.dice3dLook ?? l }));
  }, look);
}

/** Store a look and load the window again with Mesa open. */
async function reloadWith(app, page, look) {
  await page.evaluate((l) => {
    const st = JSON.parse(localStorage.getItem("verso.settings"));
    st.dice3dLook = l;
    localStorage.setItem("verso.settings", JSON.stringify(st));
  }, look);
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await openNote(app);
}

/** Roll the note's 1d20+3 and read what the stage says about the resting dice. */
async function rolled(page) {
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: /^Rolar (1d20\+3|de novo)$/ }).first().click();
  // The dice stay only a moment once at rest (HOLD_MS): read on every frame.
  const read = await page.waitForFunction(
    () => {
      const el = document.querySelector("canvas.dice3d-canvas");
      if (!el || !el.dataset.dieWidths) return null;
      const r = el.getBoundingClientRect();
      return { widths: JSON.parse(el.dataset.dieWidths), slots: JSON.parse(el.dataset.slots), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, win: { w: innerWidth, h: innerHeight } };
    },
    null,
    { polling: "raf", timeout: 8000 },
  );
  return read.jsonValue();
}

const shot = async (page, name) => {
  if (process.env.DICE3D_SHOTS) await page.screenshot({ path: `${process.env.DICE3D_SHOTS}/${name}.png` });
};

async function needGl(page, info) {
  if (await gl(page)) return true;
  info.annotations.push({ type: "webgl", description: "NOT available" });
  test.skip(true, "no WebGL in this browser");
  return false;
}

test("size: the percent changes the die's size on the screen, and the dice fall on the lower part of the window", async ({ app, page }, info) => {
  await withLook(page, { size: 100 });
  await app.open();
  await needGl(page, info);
  const out = {};
  for (const size of [70, 100, 160]) {
    await reloadWith(app, page, { size, styles: { 1: { body: "#1d9e75" } } });
    out[size] = await rolled(page);
    await shot(page, `size-${size}pct`);
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
  const mean = (r) => r.widths.reduce((a, b) => a + b, 0) / r.widths.length;
  info.annotations.push({ type: "die px", description: JSON.stringify({ 70: mean(out[70]), 100: mean(out[100]), 160: mean(out[160]), win: out[100].win }) });
  expect(mean(out[70])).toBeLessThan(mean(out[100]));
  expect(mean(out[100])).toBeLessThan(mean(out[160]));
  // Modest: well under a quarter of the window's height, even at 160%.
  expect(mean(out[160])).toBeLessThan(out[160].win.h / 4);
  expect(mean(out[100])).toBeGreaterThan(40);
  expect(mean(out[100])).toBeLessThan(110);
  // The strip is the lower part of the window, not all of it.
  expect(out[100].rect.h).toBeLessThan(out[100].win.h * 0.6);
  expect(out[100].rect.y + out[100].rect.h).toBeGreaterThan(out[100].win.h * 0.9);
});

test("a preset sets the slot's colour, texture and material; 'Automático' takes the texture's own", async ({ app, page }, info) => {
  await withLook(page, { size: 100, styles: { 1: { body: "#8c1f2b", number: "#f7e8e2", outline: "#2b0a0e", texture: "marble", material: "plastic" } } });
  await app.open();
  await needGl(page, info);
  await openNote(app);
  let r = await rolled(page);
  expect(r.slots[0]).toEqual(["1", "#8c1f2b", "plastic", "marble"]);
  await shot(page, "preset-sangue");
  await page.keyboard.press("Escape");
  // Gelo: glass; Osso: the material is Automático and marble brings glass.
  await reloadWith(app, page, { size: 100, styles: { 1: { body: "#e8e0cd", number: "#3a3226", outline: "#3a3226", texture: "marble", material: "auto" } } });
  r = await rolled(page);
  expect(r.slots[0]).toEqual(["1", "#e8e0cd", "glass", "marble"]);
  await page.keyboard.press("Escape");
  // Do Verso: slot 1 follows the app's palette, not a preset colour.
  await reloadWith(app, page, { size: 100 });
  r = await rolled(page);
  expect(r.slots[0][1]).not.toBe("#1d9e75");
  expect(r.slots[0][1]).toBeTruthy();
});

test("the test roll draws a die in each of the three slots with that slot's style", async ({ app, page }, info) => {
  await withLook(page, { size: 100, styles: { 1: { body: "#1d9e75", texture: "dragon", material: "auto" }, 2: { body: "#14171c", texture: "speckles", material: "metal" }, 3: { body: "#7a4a22", texture: "tiger", material: "wood" } } });
  await app.open();
  await needGl(page, info);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  await page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Dados 3D: testar$/ }) }).getByRole("button", { name: "Rolar para testar" }).click();
  await expect(canvas(page)).toHaveCount(1);
  const slots = JSON.parse((await canvas(page).getAttribute("data-slots")) ?? "[]");
  expect(slots).toEqual([
    ["1", "#1d9e75", "none", "dragon"],
    ["2", "#14171c", "metal", "speckles"],
    ["3", "#7a4a22", "wood", "tiger"],
  ]);
  await shot(page, "slots-three-dice");
});

async function openFeatures(app, page) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  return (title) => page.locator(".setting", { has: page.locator(".setting-title", { hasText: new RegExp(`^${title}$`) }) });
}

test("settings: slots, presets, colours, contrast warning, texture, material and size are labelled and saved on this device @layout", async ({ app, page }) => {
  await app.open();
  const row = await openFeatures(app, page);
  const look = () => page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).dice3dLook);
  // Size.
  await row("Dados 3D: tamanho").getByRole("slider").fill("130");
  expect((await look()).size).toBe(130);
  await expect(row("Dados 3D: tamanho").locator("output")).toHaveText("130%");
  // Roll duration (Normal by default) and the sound switch (on by default, as in Rolai).
  const time = row("Duração da rolagem").getByRole("combobox");
  await expect(time.locator("option")).toHaveText(["Rápida", "Normal", "Lenta"]);
  await expect(time).toHaveValue("normal");
  await time.selectOption("slow");
  expect((await look()).time).toBe("slow");
  const sound = row("Som dos dados").locator("input[type=checkbox]");
  await expect(sound).toBeChecked();
  await row("Som dos dados").locator("label.switch").click();
  expect(await look()).toMatchObject({ sound: false, soundChosen: true });
  await expect(sound).not.toBeChecked();
  await row("Som dos dados").locator("label.switch").click();
  expect((await look()).sound).toBe(true);
  await expect(sound).toBeChecked();
  await row("Duração da rolagem").scrollIntoViewIfNeeded();
  await shot(page, `settings-${page.viewportSize().width}`);
  // Slots: tabs with arrow keys, and the preview tiles.
  const tabs = row("Dados 3D: cores").getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(row("Dados 3D: cores").locator(".dice3d-tile canvas")).toHaveCount(3);
  // The styles list holds Rolai's names, in Portuguese.
  const style = row("Dados 3D: estilo").getByRole("combobox");
  await expect(style.locator("option")).toHaveText(["Personalizado", "Do Verso", "Esmeralda", "Osso", "Obsidiana", "Sangue", "Abissal", "Gelo", "Escamas", "Taverna"]);
  await expect(style).toHaveValue("verso");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await style.selectOption("gelo");
  let l = await look();
  expect(l.styles["2"]).toMatchObject({ body: "#bfe6f2", number: "#123a4a", outline: "#0b2733", texture: "ice", material: "glass" });
  expect(l.styles["1"].app).toBe(true);
  await tabs.nth(1).press("ArrowRight");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await row("Dados 3D: cores").locator('.dice3d-tile[data-slot="1"]').click();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  // Slot 1: a colour edit leaves "Do Verso" and the style becomes Personalizado.
  const body = row("Dados 3D: corpo").getByRole("textbox", { name: "Dados 3D: corpo, em hexadecimal" });
  await body.fill("#224466");
  await body.press("Enter");
  l = await look();
  expect(l.styles["1"].body).toBe("#224466");
  expect(l.styles["1"].app).toBeUndefined();
  await expect(style).toHaveValue("custom");
  // The same colour for the number: the warning shows.
  const num = row("Dados 3D: número").getByRole("textbox", { name: "Dados 3D: número, em hexadecimal" });
  await num.fill("#254768");
  await num.press("Enter");
  await expect(page.locator(".dice3d-contrast")).toHaveAttribute("data-low", "true");
  await expect(page.locator(".dice3d-contrast")).toContainText("Atenção: contraste de");
  await expect(page.locator(".dice3d-contrast")).toHaveAttribute("role", "alert");
  await num.fill("#ffffff");
  await num.press("Enter");
  await expect(page.locator(".dice3d-contrast")).toHaveAttribute("data-low", "false");
  // Not a colour: flagged, nothing saved.
  await num.fill("banana");
  await num.press("Enter");
  await expect(num).toHaveAttribute("aria-invalid", "true");
  expect((await look()).styles["1"].number).toBe("#ffffff");
  await row("Dados 3D: contorno").getByRole("textbox", { name: "Dados 3D: contorno, em hexadecimal" }).fill("#000000");
  await row("Dados 3D: contorno").getByRole("textbox", { name: "Dados 3D: contorno, em hexadecimal" }).press("Enter");
  // The twenty textures and the six materials, by Rolai's names.
  const tex = row("Dados 3D: textura").getByRole("combobox");
  await expect(tex.locator("option")).toHaveText(["Lisa", "Mármore", "Pintas", "Glitter", "Estrelas", "Céu astral", "Nuvens", "Fogo", "Água", "Gelo", "Papel", "Madeira", "Aço", "Vitral", "Caveiras", "Dragão", "Leopardo", "Tigre", "Lagarto", "Pena"]);
  const mat = row("Dados 3D: material").getByRole("combobox");
  await expect(mat.locator("option")).toHaveText(["Automático (da textura)", "Plástico", "Metal", "Madeira", "Vidro", "Fosco"]);
  await tex.selectOption("dragon");
  await mat.selectOption("none");
  l = await look();
  expect([l.styles["1"].texture, l.styles["1"].material, l.styles["1"].outline]).toEqual(["dragon", "none", "#000000"]);
  if (process.env.DICE3D_SHOTS) await page.screenshot({ path: `${process.env.DICE3D_SHOTS}/settings-appearance.png` });
  // A reload keeps it, and the tile of slot 1 is painted.
  await page.keyboard.press("Escape");
});

test("settings: every texture paints something on the swatch", async ({ app, page }) => {
  await app.open();
  const row = await openFeatures(app, page);
  const tex = row("Dados 3D: textura").getByRole("combobox");
  const tile = row("Dados 3D: cores").locator('.dice3d-tile[data-slot="1"] canvas');
  // The tile's pixels, to tell one texture from another and from none.
  const pixels = () => tile.evaluate((c) => Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data));
  const differs = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
    return n / (a.length / 4);
  };
  await row("Dados 3D: estilo").getByRole("combobox").selectOption("esmeralda");
  await expect.poll(async () => (await pixels()).some((v) => v > 0)).toBe(true);
  const plain = await pixels();
  const seen = [];
  for (const id of ["marble", "speckles", "glitter", "stars", "astral", "cloudy", "fire", "water", "ice", "paper", "wood", "metal", "stainedglass", "skulls", "dragon", "leopard", "tiger", "lizard", "bird"]) {
    await tex.selectOption(id);
    // Different from the plain body on at least 2% of the swatch, and from the one before.
    await expect.poll(async () => differs(await pixels(), plain), { message: id }).toBeGreaterThan(0.02);
    seen.push(await pixels());
  }
  for (let i = 1; i < seen.length; i++) expect(differs(seen[i], seen[i - 1])).toBeGreaterThan(0.02);
});

test("settings: a texture's picture comes from the app (200), nothing from the network, and a missing one falls back to the drawn texture", async ({ app, page }) => {
  const seen = [];
  const outside = [];
  page.on("response", (r) => {
    if (/dice-textures\//.test(r.url())) seen.push([new URL(r.url()).pathname.split("/").pop(), r.status()]);
  });
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) outside.push(r.url());
  });
  await app.open();
  const row = await openFeatures(app, page);
  await row("Dados 3D: estilo").getByRole("combobox").selectOption("osso");
  await expect.poll(() => seen.some(([f]) => f === "marble.png")).toBe(true);
  expect(seen).toContainEqual(["marble.png", 200]);
  expect(outside).toEqual([]);
  // A picture that is not there: the swatch is still painted (by our painter).
  app.expectFault(/dragon\.png|ERR_FAILED/);
  await page.route("**/dice-textures/dragon.png", (r) => r.abort());
  const tex = row("Dados 3D: textura").getByRole("combobox");
  await tex.selectOption("dragon");
  const tile = row("Dados 3D: cores").locator('.dice3d-tile[data-slot="1"] canvas');
  await expect
    .poll(() => tile.evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 16) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); return seen.size; }))
    .toBeGreaterThan(8);
});

test("settings: 'Rolar para testar' says why it cannot play, and plays three dice when it can", async ({ app, page }, info) => {
  await app.open();
  const row = await openFeatures(app, page);
  const test3 = row("Dados 3D: testar").getByRole("button", { name: "Rolar para testar" });
  // Switch off: it says so and rolls nothing.
  await test3.click();
  await expect(page.locator(".dice3d-say")).toContainText('Os dados 3D estão desligados');
  await expect(canvas(page)).toHaveCount(0);
  // Switch on.
  await row("Dados 3D").locator("label.switch").click();
  const hasGl = await gl(page);
  info.annotations.push({ type: "webgl", description: hasGl ? "available" : "NOT available: only the fallback is checked" });
  await test3.click();
  if (hasGl) {
    await expect(canvas(page)).toHaveCount(1);
    await expect(canvas(page)).toHaveAttribute("aria-hidden", "true");
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
    // Esc only skipped: Settings is still open.
    await expect(test3).toBeVisible();
  }
  await expect(page.locator(".dice3d-say")).toHaveText(/^d20: \d+, d6: \d+, d6: \d+$/);
});

test("settings: under reduced motion the test says nothing is animated", async ({ app, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withSwitch(page);
  await app.open();
  const row = await openFeatures(app, page);
  await row("Dados 3D: testar").getByRole("button", { name: "Rolar para testar" }).click();
  await expect(page.locator(".dice3d-say")).toContainText("menos movimento");
  await expect(canvas(page)).toHaveCount(0);
});

test("the dice stay on the table like Rolai's: no timer, a control does not clear them, a click elsewhere does @layout", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await openNote(app);
  await needGl(page, info);
  const preview = page.locator(".preview:visible");
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  const rollBtn = preview.getByRole("button", { name: "Rolar 1d20+3" });
  await rollBtn.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await rollBtn.click();
  await expect(canvas(page)).toHaveCount(1);
  await expect(card).toBeHidden();
  // The card shows as soon as the dice rest...
  await expect(card).toBeVisible({ timeout: 6000 });
  const toCard = Date.now() - t0;
  // ...and the dice are still there, at rest, letting taps through.
  await expect(canvas(page)).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute("data-state", "resting");
  expect(await canvas(page).evaluate((c) => getComputedStyle(c).pointerEvents)).toBe("none");
  await shot(page, `linger-${page.viewportSize().width}`);
  // No timer takes them away: well past the old 2.8 s + fade they are there.
  await page.waitForTimeout(4000);
  await expect(canvas(page)).toHaveCount(1);
  // A click on a control is using the page, not touching the dice.
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "probe-control";
    b.textContent = "probe";
    b.style.cssText = "position:fixed;top:8px;left:8px;z-index:99999";
    document.body.append(b);
  });
  await page.locator("#probe-control").click();
  await expect(canvas(page)).toHaveCount(1);
  // The page is not blocked: the click reached it (and the dice listener did not swallow it).
  const reached = await page.evaluate(() => new Promise((r) => {
    document.addEventListener("click", () => r(true), { once: true });
    document.querySelector(".preview h1")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }));
  expect(reached).toBe(true);
  await expect(canvas(page)).toHaveCount(0);
  info.annotations.push({ type: "click to card (ms)", description: String(toCard) });
  expect(toCard).toBeLessThan(6000);
  // A real click on the page works under the dice and clears them too.
  await rollBtn.click();
  await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 6000 });
  await preview.locator("h1").first().click();
  await expect(canvas(page)).toHaveCount(0);
  // A new roll clears the dice of the one before.
  await rollBtn.click();
  await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 6000 });
  await rollBtn.click();
  await expect(canvas(page)).toHaveCount(1);
});

test("the roll duration setting: Slow takes longer to rest than Fast", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await openNote(app);
  await needGl(page, info);
  const timeTo = async (time) => {
    // The sound off: loading the recordings is not what is timed.
    await reloadWith(app, page, { time, sound: false, soundChosen: true });
    const btn = page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" });
    await btn.scrollIntoViewIfNeeded();
    const t0 = Date.now();
    await btn.click();
    await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    const ms = Date.now() - t0;
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
    return ms;
  };
  // The first roll of a fresh page pays for compiling the shaders and
  // uploading the textures, seconds on a software renderer (the replay clock
  // is capped per frame, FRAME_MAX_MS, so a slow draw stretches the roll).
  // Fast, rolled first, carried that cost and could rest later than Slow. A
  // discarded warm-up roll takes it out; the rule measured is unchanged.
  await timeTo("normal");
  const fast = await timeTo("fast");
  const slow = await timeTo("slow");
  info.annotations.push({ type: "fast / slow to rest (ms)", description: `${fast} / ${slow}` });
  expect(slow).toBeGreaterThan(fast + 150);
});

test("Esc clears the lingering dice at once @layout", async ({ app, page }, info) => {
  await withSwitch(page);
  await app.open();
  await openNote(app);
  await needGl(page, info);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 6000 });
  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveCount(0);
});

test("the dice sound: off by the person, no recording is fetched; on (the default), Web Audio is used (one context, buffers fetched and decoded), never an <audio> element", async ({ app, page }, info) => {
  await withSwitch(page);
  await page.addInitScript(() => {
    const w = window;
    w.__audio = { made: 0, decoded: 0, audioEls: 0 };
    const Orig = w.AudioContext || w.webkitAudioContext;
    if (Orig) {
      w.AudioContext = class extends Orig {
        constructor(...a) {
          super(...a);
          w.__audio.made++;
        }
        decodeAudioData(buf, ...rest) {
          w.__audio.decoded++;
          return super.decodeAudioData(buf, ...rest);
        }
      };
    }
    const orig = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      w.__audio.audioEls++;
      return orig.call(this);
    };
  });
  const seen = [];
  page.on("response", (r) => {
    if (/dice-sounds\//.test(r.url())) seen.push([new URL(r.url()).pathname.split("/").pop(), r.status()]);
  });
  await app.open();
  await openNote(app);
  await needGl(page, info);
  await reloadWith(app, page, { sound: false, soundChosen: true });
  // (The first load, with the sound on by default, preloaded the recordings; what counts is this one.)
  seen.length = 0;
  const preview = page.locator(".preview:visible");
  const rollBtn = preview.getByRole("button", { name: "Rolar 1d20+3" });
  await rollBtn.scrollIntoViewIfNeeded();
  await rollBtn.click();
  await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
  expect(seen).toEqual([]);
  await page.keyboard.press("Escape");
  // Nothing stored about the sound: it is on.
  await reloadWith(app, page, { size: 100 });
  const again = page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" });
  await again.scrollIntoViewIfNeeded();
  await again.click();
  await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
  expect(seen.length).toBeGreaterThan(0);
  const used = await page.evaluate(() => window.__audio);
  expect(used.audioEls).toBe(0);
  expect(used.made).toBe(1);
  // The WebKit build Playwright ships has no MP3 decoder: the files come (200 or a range's 206) and decoding fails; the app stays silent and the roll is unharmed.
  expect(used.decoded).toBeGreaterThan(0);
  const okStatus = (st) => st === 200 || st === 206;
  expect(seen.filter(([f, st]) => !(okStatus(st) && /^(dicehit_(plastic|wood|metal)|surface_felt)\d+\.mp3$/.test(f)))).toEqual([]);
});

test("the dice sound: the recordings are decoded before the first roll, and each hit is placed on the audio clock at its collision's frame (|audio - picture| < 50 ms; none after the rest) at Fast, Normal and Slow", async ({ app, page, browserName }, info) => {
  // Playwright's WebKit has no MP3 decoder: there is nothing to place there.
  test.setTimeout(120_000);
  await withSwitch(page);
  await page.addInitScript(() => {
    const w = window;
    w.__audio = { decoded: 0, ctx: null };
    const Orig = w.AudioContext || w.webkitAudioContext;
    w.AudioContext = class extends Orig {
      constructor(...a) {
        super(...a);
        w.__audio.ctx = this;
      }
      decodeAudioData(buf, ...rest) {
        return super.decodeAudioData(buf, ...rest).then((b) => {
          w.__audio.decoded++;
          return b;
        });
      }
    };
  });
  await app.open();
  test.skip(browserName !== "chromium", "needs MP3 decoding (Chromium)");
  await openNote(app);
  await needGl(page, info);
  // Preload: the 46 recordings (15 + 12 + 12 + 7) are decoded with no roll and no click.
  await reloadWith(app, page, {});
  await expect.poll(() => page.evaluate(() => window.__audio.decoded), { timeout: 20_000 }).toBe(46);
  const offsets = [];
  for (const time of ["normal", "fast", "slow"]) {
    await reloadWith(app, page, { time });
    // (A page loaded afresh has its own preload; a roll before it is done plays only the hits it can.)
    await expect.poll(() => page.evaluate(() => window.__audio.decoded), { timeout: 20_000 }).toBe(46);
    await page.evaluate(() => {
      window.__VERSO_TEST__.diceSound = { runs: [] };
    });
    const btn = page.locator(".preview:visible").getByRole("button", { name: "Rolar 2d6" });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(canvas(page)).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    const runs = await page.evaluate(() => window.__VERSO_TEST__.diceSound.runs);
    expect(runs).toHaveLength(1);
    const run = runs[0];
    const state = await page.evaluate(() => window.__audio.ctx?.state);
    expect(run.hits.length, `${time}: the roll made sound (audio context ${state})`).toBeGreaterThan(0);
    info.annotations.push({ type: `${time} run`, description: JSON.stringify({ ...run, hits: run.hits.length }) });
    // With the context running and the recordings decoded, no hit that should sound is lost.
    expect(run.lost, `${time}: hits lost (audio context ${state})`).toBe(0);
    for (const h of run.hits) {
      expect(h.visualMs, `${time}: frame ${h.frame} was seen`).not.toBeNull();
      offsets.push(`${time} f${h.frame} ${(h.audioMs - h.visualMs).toFixed(1)}`);
      // A software renderer's slow frame shows the picture late, not the sound: that frame is judged against the moment it was due.
      if (h.gapMs <= 50) expect(Math.abs(h.audioMs - h.visualMs), `${time}: frame ${h.frame}`).toBeLessThan(50);
      expect(Math.abs(h.audioMs - h.dueMs), `${time}: frame ${h.frame} against its due moment`).toBeLessThan(50);
      // Never later than its own moment by more than the lateness allowed, and none after the rest.
      expect(h.audioMs - h.dueMs, `${time}: frame ${h.frame} late`).toBeLessThanOrEqual(60);
      expect(h.dueMs, `${time}: frame ${h.frame} after the rest`).toBeLessThanOrEqual(run.settleMs);
    }
    await page.keyboard.press("Escape");
    await expect(canvas(page)).toHaveCount(0);
  }
  info.annotations.push({ type: "audio - picture (ms)", description: offsets.join("; ") });
});
