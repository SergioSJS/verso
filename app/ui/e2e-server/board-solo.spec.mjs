// A board no game master's window is in (ADR 0113 H): the players who edit
// it between sessions. Ana draws a rectangle with no one else in the room:
// the file on disk gets it (every card, edge and key of the Obsidian canvas
// kept), Bruno, who edits too, sees it live, and the game master finds it
// when she opens the board later.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";


const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

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

/** A command of the contract, as the window sends it; the error, if it is one. */
const invoke = (page, cmd, args = {}) =>
  page.evaluate(
    async ([c, a]) => {
      try {
        return await window.__TAURI_INTERNALS__.invoke(c, a);
      } catch (e) {
        return { error: e };
      }
    },
    [cmd, args],
  );

/** An account made from an invitation link, in a context whose windows can be read (`__VERSO_TEST__`). */
async function account(browser, gm, { email, name, password, folder, role }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email, folder, role });
  const context = await browser.newContext({ locale: "pt-BR" });
  await context.addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const page = await context.newPage();
  await page.goto(made.link);
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Senha nova").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  return { context, page };
}

async function openBoard(page, folder, name) {
  await page.goto(`/?folder=${folder}`);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await page.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.board.getAppState().width > 0, null, { timeout: 30_000 });
}


/** A point of the board, on the page. */
async function onBoard(page, x, y) {
  const v = await page.evaluate(() => {
    const s = window.__VERSO_TEST__.board.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, left: s.offsetLeft, top: s.offsetTop };
  });
  return { x: (x + v.scrollX) * v.zoom + v.left, y: (y + v.scrollY) * v.zoom + v.top };
}

const FIXTURE = readFileSync(new URL("./fixtures/board-lost-cards.canvas", import.meta.url), "utf8");

test("players who edit a board with no game master in it: the drawing is written, the others see it live, the game master finds it", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name !== "chromium", "the board is read through the browser test hooks of one engine");
  test.setTimeout(240_000);
  const opened = [];
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: "Verso-teste-solo" });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText("Verso-teste-solo", { timeout: 30_000 });
    await invoke(gm, "create_note", { name: "Ruínas de Valdor/Lugares/Taverna do Corvo", text: "# Taverna\n" });
    const laid = await invoke(gm, "board_text", { json: FIXTURE });
    const path = "Ruínas de Valdor/Board do grupo.canvas";
    expect(await invoke(gm, "create_file", { path, base64: Buffer.from(laid).toString("base64") })).toBe(path);
    await invoke(gm, "campaign_make", { root: "Ruínas de Valdor" });
    const ana = await account(browser, gm, { email: "ana-solo@verso.test", name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    const bruno = await account(browser, gm, { email: "bruno-solo@verso.test", name: "Bruno", password: "a senha do bruno", folder: folder.id, role: "reader" });
    opened.push(ana.context, bruno.context);
    const status = await invoke(gm, "campaign_status", {});
    const id = (n) => status.players.find((p) => p.name === n).id;
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: [path], change: set("see", [{ account: id("Ana"), level: "edit" }, { account: id("Bruno"), level: "edit" }]) });
    const original = JSON.parse((await invoke(gm, "read_text", { path })).text);

    // Bruno and Ana on the board; the game master's window is not.
    await openBoard(bruno.page, folder.id, "Board do grupo");
    await openBoard(ana.page, folder.id, "Board do grupo");
    await ana.page.waitForTimeout(1500);
    const before = await ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().length);
    // She draws a rectangle with the pointer, as a person does.
    const from = await onBoard(ana.page, 900, 700);
    await ana.page.mouse.click(from.x, from.y);
    await ana.page.keyboard.press("r");
    const to = await onBoard(ana.page, 1100, 820);
    await ana.page.mouse.move(from.x, from.y);
    await ana.page.mouse.down();
    await ana.page.mouse.move(to.x, to.y, { steps: 8 });
    await ana.page.mouse.up();
    await expect.poll(() => ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length)).toBe(1);
    // Bruno sees it live.
    await expect
      .poll(() => bruno.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length), { timeout: 30_000 })
      .toBe(1);
    // The file on disk has it, and everything else of the canvas as it was.
    await expect
      .poll(async () => (JSON.parse((await invoke(gm, "read_text", { path })).text).verso?.drawing ?? []).some((d) => d.type === "rectangle"), { timeout: 30_000 })
      .toBe(true);
    const now = JSON.parse((await invoke(gm, "read_text", { path })).text);
    expect(now.nodes.map((n) => [n.id, n.file ?? n.text])).toEqual(original.nodes.map((n) => [n.id, n.file ?? n.text]));
    expect(now.edges).toEqual(original.edges);
    expect(before).toBeGreaterThan(0);

    // The game master opens the board later: it is there.
    await openBoard(gm, folder.id, "Board do grupo");
    await expect
      .poll(() => gm.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length), { timeout: 30_000 })
      .toBe(1);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});

test("a player who edits a board alone in it, with no game master: the drawing is written and the game master finds it", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name !== "chromium", "the board is read through the browser test hooks of one engine");
  test.setTimeout(240_000);
  const opened = [];
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: "Verso-teste-sozinha" });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText("Verso-teste-sozinha", { timeout: 30_000 });
    await invoke(gm, "create_note", { name: "Ruínas de Valdor/Lugares/Taverna do Corvo", text: "# Taverna\n" });
    const laid = await invoke(gm, "board_text", { json: FIXTURE });
    const path = "Ruínas de Valdor/Board do grupo.canvas";
    expect(await invoke(gm, "create_file", { path, base64: Buffer.from(laid).toString("base64") })).toBe(path);
    await invoke(gm, "campaign_make", { root: "Ruínas de Valdor" });
    const ana = await account(browser, gm, { email: "ana-sozinha@verso.test", name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    opened.push(ana.context);
    const status = await invoke(gm, "campaign_status", {});
    const id = (n) => status.players.find((p) => p.name === n).id;
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: [path], change: set("see", [{ account: id("Ana"), level: "edit" }]) });
    const original = JSON.parse((await invoke(gm, "read_text", { path })).text);

    // Bruno and Ana on the board; the game master's window is not.
    await openBoard(ana.page, folder.id, "Board do grupo");
    await ana.page.waitForTimeout(1500);
    const before = await ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().length);
    // She draws a rectangle with the pointer, as a person does.
    const from = await onBoard(ana.page, 900, 700);
    await ana.page.mouse.click(from.x, from.y);
    await ana.page.keyboard.press("r");
    const to = await onBoard(ana.page, 1100, 820);
    await ana.page.mouse.move(from.x, from.y);
    await ana.page.mouse.down();
    await ana.page.mouse.move(to.x, to.y, { steps: 8 });
    await ana.page.mouse.up();
    await expect.poll(() => ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length)).toBe(1);
    // The file on disk has it, and everything else of the canvas as it was.
    await expect
      .poll(async () => (JSON.parse((await invoke(gm, "read_text", { path })).text).verso?.drawing ?? []).some((d) => d.type === "rectangle"), { timeout: 30_000 })
      .toBe(true);
    const now = JSON.parse((await invoke(gm, "read_text", { path })).text);
    expect(now.nodes.map((n) => [n.id, n.file ?? n.text])).toEqual(original.nodes.map((n) => [n.id, n.file ?? n.text]));
    expect(now.edges).toEqual(original.edges);
    expect(before).toBeGreaterThan(0);

    // The game master opens the board later: it is there.
    await openBoard(gm, folder.id, "Board do grupo");
    await expect
      .poll(() => gm.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length), { timeout: 30_000 })
      .toBe(1);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});

test("on a slow link: the drawing is written all the same (the file is sent again once the updates are answered)", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name !== "chromium", "the board is read through the browser test hooks of one engine");
  test.setTimeout(240_000);
  const opened = [];
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: "Verso-teste-lenta" });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText("Verso-teste-lenta", { timeout: 30_000 });
    await invoke(gm, "create_note", { name: "Ruínas de Valdor/Lugares/Taverna do Corvo", text: "# Taverna\n" });
    const laid = await invoke(gm, "board_text", { json: FIXTURE });
    const path = "Ruínas de Valdor/Board do grupo.canvas";
    expect(await invoke(gm, "create_file", { path, base64: Buffer.from(laid).toString("base64") })).toBe(path);
    await invoke(gm, "campaign_make", { root: "Ruínas de Valdor" });
    const ana = await account(browser, gm, { email: "ana-lenta@verso.test", name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    opened.push(ana.context);
    // Every update of hers takes most of a second to be answered.
    await ana.context.addInitScript(() => {
      const wrap = () => {
        const t = window.__TAURI_INTERNALS__;
        if (!t || t.__slow) return false;
        const inv = t.invoke.bind(t);
        t.invoke = async (c, a, o) => {
          if (c === "collab_update") await new Promise((r) => setTimeout(r, 700));
          return inv(c, a, o);
        };
        t.__slow = true;
        return true;
      };
      const iv = setInterval(() => wrap() && clearInterval(iv), 5);
    });
    const status = await invoke(gm, "campaign_status", {});
    const id = (n) => status.players.find((p) => p.name === n).id;
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: [path], change: set("see", [{ account: id("Ana"), level: "edit" }]) });
    const original = JSON.parse((await invoke(gm, "read_text", { path })).text);

    // Bruno and Ana on the board; the game master's window is not.
    await openBoard(ana.page, folder.id, "Board do grupo");
    await ana.page.waitForTimeout(1500);
    const before = await ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().length);
    // She draws a rectangle with the pointer, as a person does.
    const from = await onBoard(ana.page, 900, 700);
    await ana.page.mouse.click(from.x, from.y);
    await ana.page.keyboard.press("r");
    const to = await onBoard(ana.page, 1100, 820);
    await ana.page.mouse.move(from.x, from.y);
    await ana.page.mouse.down();
    await ana.page.mouse.move(to.x, to.y, { steps: 8 });
    await ana.page.mouse.up();
    await expect.poll(() => ana.page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length)).toBe(1);
    // The file on disk has it, and everything else of the canvas as it was.
    await expect
      .poll(async () => (JSON.parse((await invoke(gm, "read_text", { path })).text).verso?.drawing ?? []).some((d) => d.type === "rectangle"), { timeout: 30_000 })
      .toBe(true);
    const now = JSON.parse((await invoke(gm, "read_text", { path })).text);
    expect(now.nodes.map((n) => [n.id, n.file ?? n.text])).toEqual(original.nodes.map((n) => [n.id, n.file ?? n.text]));
    expect(now.edges).toEqual(original.edges);
    expect(before).toBeGreaterThan(0);

    // The game master opens the board later: it is there.
    await openBoard(gm, folder.id, "Board do grupo");
    await expect
      .poll(() => gm.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.type === "rectangle").length), { timeout: 30_000 })
      .toBe(1);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
