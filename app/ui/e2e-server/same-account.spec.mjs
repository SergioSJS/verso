// The same account on two devices (2026-10-24, the maintainer: "o que eu rolo
// de dado em um dispositivo não aparece no outro"): the entry the other
// device made is "Você" but it is NEWS here: counted unread when the panel is
// closed and its dice fall (the 3D stage loads). What this window made itself
// is not news. Against a real `verso serve`, in two browser contexts.

import { expect, test } from "@playwright/test";

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };
const RED = "#c0392b";
const LOOK = { body: RED, number: "#ffffff", outline: "#222222", texture: "none", material: "plastic" };

/** Press "Entrar" and answer the answer; wait when the limiter asks for it. */
async function enter(page) {
  for (let i = 0; ; i++) {
    const answer = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/signin" && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const res = await answer;
    if (res.status() !== 429 || i === 10) return res;
    const body = await res.json().catch(() => ({}));
    await page.waitForTimeout((body.retry ?? 1) * 1000);
  }
}

async function signedIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const res = await enter(page);
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

async function api(page, method, path, data) {
  const state = await (await page.request.get("/api/state")).json();
  const res = await page.request.fetch(path, { method, data, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** The player's own dice (red) and the 3D switch on, before the window loads. */
async function withDice(context) {
  await context.addInitScript(
    ([look]) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, dice3dLook: { styles: { 1: look, 2: look, 3: look } } }));
    },
    [LOOK],
  );
}

/** The Mesa panel of the window, open. */
async function mesa(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-compose")).toBeVisible({ timeout: 30_000 });
  return view;
}

const field = (view) => view.getByRole("textbox", { name: "Mensagem para a mesa" });
const invoke = (page, cmd, args = {}) => page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

async function openNote(page, name) {
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Rolar 1d20+3" }).first()).toBeVisible({ timeout: 30_000 });
}

test.use({ actionTimeout: 10_000 });

test("the same account on a phone and on a computer: what one rolls, the other sees, hears and counts as news", async ({ browser, page: a }, info) => {
  test.skip(info.project.name === "phone", "the panels are side by side");
  test.setTimeout(180_000);
  // The game master signs in on two devices (two browser contexts, one account).
  await signedIn(a, ADMIN.email, ADMIN.password);
  const folder = await api(a, "POST", "/api/folders", { name: `Mesa ${info.project.name}` });
  await a.goto(`/?folder=${folder.id}`);
  await expect(a.locator("#folder")).toHaveText(`Mesa ${info.project.name}`, { timeout: 30_000 });
  await invoke(a, "campaign_make", { root: "" });
  await invoke(a, "create_note", { name: "Ata", text: "# Ata\n\nAtaque: `dice: 1d20+3`.\n" });
  const context = await browser.newContext({ locale: "pt-BR" });
  try {
    await withDice(context);
    const b = await context.newPage();
    await signedIn(b, ADMIN.email, ADMIN.password);
    await b.goto(`/?folder=${folder.id}`);
    await expect(b.locator("#folder")).toHaveText(`Mesa ${info.project.name}`, { timeout: 30_000 });
    // The second device keeps its Mesa panel closed: what arrives is counted.
    await expect(b.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
    // Let the second device finish joining the table before the first rolls.
    await b.waitForLoadState("networkidle", { timeout: 30_000 });
    await b.waitForTimeout(2000);
    // First, from a note's die (a roll of the note's room, which the server also appends to the table),
    // with this device's panel CLOSED: its own roll is not news here, so nothing is counted.
    await openNote(a, "Ata");
    await a.evaluate(() => document.body.classList.add("no-right"));
    const first = b.waitForRequest((q) => /stage-[^/]*\.js/.test(q.url()), { timeout: 20_000 });
    await a.getByRole("button", { name: "Rolar 1d20+3" }).first().click();
    await expect(b.locator("body")).toHaveAttribute("data-table-unread", "1", { timeout: 20_000 });
    await first;
    await a.waitForTimeout(2000);
    await expect(a.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
    await a.keyboard.press("Escape");
    // Then from the tray of the Mesa panel.
    const g = await mesa(a);
    await field(g).fill("/r 1d6");
    await field(g).press("Enter");
    await a.keyboard.press("Escape");
    const mine = g.locator('.table-entry.mine[data-kind="roll"]');
    await expect(mine).toHaveCount(2);
    // The other device: the entry is news (counted, and its dice fall) ...
    await expect(b.locator("body")).toHaveAttribute("data-table-unread", "2", { timeout: 20_000 });
    // ... still the account's own ("Você") once the panel is opened ...
    const v = await mesa(b);
    await expect(v.locator('.table-entry.mine[data-kind="roll"]')).toHaveCount(2);
    await expect(b.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
    // ... and the device that rolled is told nothing of its own roll.
    await expect(a.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
    await expect(mine).toHaveCount(2);
    // The other way: the second device says and rolls, the first sees it (panel open: seen, not counted).
    await field(v).fill("/r 1d8");
    await field(v).press("Enter");
    await b.keyboard.press("Escape");
    await expect(g.locator('.table-entry.mine[data-kind="roll"] .table-notation', { hasText: /^1d8$/ })).toHaveCount(1);
  } finally {
    await context.close().catch(() => {});
  }
});
