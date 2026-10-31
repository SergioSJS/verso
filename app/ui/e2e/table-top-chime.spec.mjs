// The table's panel top in ONE row, the chime for others' messages, and a roll's dice going out as the roller's
// colours (ADR 0107, 2026-10-23, the second feedback round).

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/table2-shots`;
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

async function showMesa(app, query) {
  const page = app.page;
  await app.open(query);
  await app.writeOutside("A.md", "# A\n");
  await app.folderChanged(["A.md"], true);
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view;
}

test("the roster, the owner's Mesa window button and hide + menu are in one row @layout", async ({ app }) => {
  const page = app.page;
  await app.open("?table=owner");
  await app.writeOutside("A.md", "# A\n");
  await app.folderChanged(["A.md"], true);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.role = "owner";
    t.up = true;
    t.join("Bia", "#1565c0", "editor");
  });
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  const make = view.getByRole("button", { name: "Tornar esta pasta uma mesa" });
  if (await make.isVisible()) {
    await make.click();
    await page.getByRole("dialog", { name: /^Mesa da pasta/ }).getByRole("button", { name: "Fechar" }).click();
  }
  const win = view.getByRole("button", { name: "Abrir a janela da Mesa" });
  await expect(win).toBeVisible();
  const ys = async (loc) => (await loc.boundingBox()).y;
  const roster = view.locator(".table-roster-button");
  const hide = view.getByRole("button", { name: "Ocultar daqui pra trás" });
  const menu = view.locator(".table-menu-button");
  const y0 = await ys(roster);
  for (const l of [win, hide, menu]) expect(Math.abs((await ys(l)) - y0)).toBeLessThan(8);
  const xs = [roster, win, hide, menu];
  const x = [];
  for (const l of xs) x.push((await l.boundingBox()).x);
  expect(x).toEqual([...x].sort((a, b) => a - b));
  if (existsSync(SHOTS)) {
    const tag = phone(page) ? "phone" : "desktop";
    await page.screenshot({ path: `${SHOTS}/top-${tag}.png` });
    await view.locator(".table-top").screenshot({ path: `${SHOTS}/top-row-${tag}.png` });
    if (!phone(page)) {
      await page.evaluate(() => document.querySelector("aside.right")?.style.setProperty("width", "260px"));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/top-260.png` });
      await view.locator(".table-top").screenshot({ path: `${SHOTS}/top-row-260.png` });
    }
  }
});

test("a roll goes out with colours, never the follow-the-app flag, so the others draw the roller's dice", async ({ app }) => {
  const page = app.page;
  const view = await showMesa(app, "?table=owner");
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.role = "owner";
    t.up = true;
  });
  await view.getByRole("textbox", { name: "Mensagem para a mesa" }).fill("/r 1d20");
  await view.getByRole("textbox", { name: "Mensagem para a mesa" }).press("Enter");
  await expect.poll(async () => (await app.calls("table_roll")).length).toBeGreaterThan(0);
  const [call] = await app.calls("table_roll");
  for (const slot of ["1", "2", "3"]) {
    expect(call.styles[slot].app).toBeFalsy();
    expect(call.styles[slot].body).toMatch(/^#[0-9a-f]{6}$/);
  }
});

test("another person's message plays the chime; typing in the box keeps it silent", async ({ app }) => {
  const page = app.page;
  await page.addInitScript(() => {
    window.__chimes = 0;
    const node = () => ({ connect: (n) => n ?? node(), start: () => window.__chimes++, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 1 } });
    window.AudioContext = class {
      state = "running";
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      createOscillator() { return node(); }
      createGain() { return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
      createBufferSource() { return { ...node(), buffer: null, loop: false }; }
      resume() { return Promise.resolve(); }
      decodeAudioData() { return Promise.reject(new Error("no")); }
    };
  });
  const view = await showMesa(app, "?table=owner");
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.role = "owner";
    t.up = true;
    t.join("Bia", "#1565c0", "editor");
  });
  // A gesture makes the context.
  await page.mouse.click(5, 5);
  const count = () => page.evaluate(() => window.__chimes);
  const before = await count();
  await page.evaluate(() => window.__harness.table.say("Bia", "oi"));
  await expect.poll(count).toBeGreaterThan(before);
  const after = await count();
  expect(after - before).toBe(2); // the "soft" chime: two notes
  // Typing in the box: silent.
  await view.getByRole("textbox", { name: "Mensagem para a mesa" }).focus();
  await page.evaluate(() => window.__harness.table.say("Bia", "de novo"));
  await page.waitForTimeout(300);
  expect(await count()).toBe(after);
});
