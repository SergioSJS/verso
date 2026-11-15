// A board of a folder shared with another account, live (V.49, ADR 0081
// item 11), as the server's end-to-end test: a real `verso serve`, the owner
// and the person the folder "Sub" is shared with, in their own browsers, in
// a folder with no table.
//
// - Ana's board (the share's window) holds the card of a note in the share
//   by its path in the share, and the card of a note outside it as a locked
//   card: nothing names "Fora", "Segredo" or the owner's "Sub/".
// - She draws a text on it live: the owner's window gets it, and the room
//   writes the file with it, the owner's paths and the outside card intact.
// - The owner moves the outside card: it moves on her board, still locked.

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

/** An account made from an invitation to no folder, in a context whose windows can be read (`__VERSO_TEST__`). */
async function account(browser, gm, { email, name, password }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email });
  const context = await browser.newContext({ locale: "pt-BR" });
  await context.addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const page = await context.newPage();
  const link = made.link ?? made.url ?? "";
  await page.goto(link.startsWith("http") ? link : new URL(link, gm.url()).toString());
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Senha nova").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  return { context, page };
}

/** The board `name` of the folder `folder`, or of the share named `shareName` (opened from the folder switcher, as a person does). */
async function openBoard(page, folder, name, shareName = null) {
  if (!shareName) {
    await page.goto(`/?folder=${folder}`);
  } else {
    await page.goto("/");
    await page.locator("#open").click();
    const dialog = page.getByRole("dialog", { name: "Trocar de pasta" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("region", { name: "Compartilhados comigo" }).getByRole("button", { name: shareName }).click();
  }
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await page.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.board.getAppState().width > 0, null, { timeout: 30_000 });
}

/** The board's scene in a window, as a test reads it. */
const scene = (page) =>
  page.evaluate(() => (window.__VERSO_TEST__?.board?.getSceneElements() ?? []).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, locked: e.locked === true, text: e.text, canvas: e.customData?.canvas ?? null })));

/** A point of the board, on the page. */
async function onBoard(page, x, y) {
  const v = await page.evaluate(() => {
    const s = window.__VERSO_TEST__.board.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, left: s.offsetLeft, top: s.offsetTop };
  });
  return { x: (x + v.scrollX) * v.zoom + v.left, y: (y + v.scrollY) * v.zoom + v.top };
}

/** The board: a card of a note in the share, one of a note beside it. Laid out by the core (`board_text`), as a room wants it. */
const BOARD = JSON.stringify({
  nodes: [
    { id: "livre", type: "file", file: "Sub/Livre.md", x: 0, y: 0, width: 250, height: 60 },
    { id: "fora", type: "file", file: "Fora/Segredo.md", x: 300, y: 0, width: 250, height: 60 },
  ],
  edges: [],
});

/** What the share's window must never hold. */
const LEAKS = /Fora|Segredo|zqbody|Sub\//;

test("a board of a shared folder is live for the person it is shared with, cut to the share", async ({ browser, page: owner }, info) => {
  test.skip(info.project.name === "phone", "the board is drawn with a pointer on a large screen");
  test.setTimeout(240_000);
  const tag = info.project.name;
  const opened = [];
  await owner.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(owner, ADMIN.email, ADMIN.password);
    const email = `ana-partilha-${tag}@verso.test`;
    const ana = await account(browser, owner, { email, name: "Ana", password: "a senha da ana" });
    opened.push(ana.context);
    const folder = await api(owner, "POST", "/api/folders", { name: `Partilha ${tag}` });
    await owner.goto(`/?folder=${folder.id}`);
    await expect(owner.locator("#folder")).toHaveText(`Partilha ${tag}`, { timeout: 30_000 });
    await invoke(owner, "create_note", { name: "Sub/Livre", text: "# Livre\n\npara todos\n" });
    await invoke(owner, "create_note", { name: "Fora/Segredo", text: "# Segredo\n\nzqbody\n" });
    const laid = await invoke(owner, "board_text", { json: BOARD });
    expect(typeof laid).toBe("string");
    expect(await invoke(owner, "create_file", { path: "Sub/Quadro.canvas", base64: Buffer.from(laid).toString("base64") })).toBe("Sub/Quadro.canvas");
    await api(owner, "PUT", `/api/folders/${folder.id}/shares`, { path: "Sub", email, role: "editor" });

    // Ana's board: her card by the share's path, the other locked.
    await openBoard(ana.page, null, "Quadro", /Sub \(admin\)/);
    await expect.poll(async () => (await scene(ana.page)).find((e) => e.id === "fora")?.locked, { timeout: 30_000 }).toBe(true);
    const hers = await scene(ana.page);
    expect(hers.find((e) => e.id === "livre").canvas.file).toBe("Livre.md");
    const lock = hers.find((e) => e.id === "fora");
    expect(lock.canvas.type).toBe("text");
    expect(lock.canvas.text).toContain("🔒");
    expect(JSON.stringify(hers)).not.toMatch(LEAKS);

    // The owner opens it too; Ana draws a text, live.
    await openBoard(owner, folder.id, "Quadro");
    const free = await onBoard(ana.page, 0, 300);
    await ana.page.mouse.click(free.x, free.y);
    await ana.page.keyboard.press("t");
    await ana.page.mouse.click(free.x, free.y);
    await ana.page.keyboard.type("da Ana");
    await ana.page.keyboard.press("Escape");
    const away = await onBoard(ana.page, 500, 450);
    await ana.page.mouse.click(away.x, away.y);
    if (tag === "chromium") {
      await expect
        .poll(() => owner.evaluate(() => [...(window.__VERSO_TEST__?.boardRoom?.resolved().values() ?? [])].some((e) => e.type === "text" && e.text === "da Ana")), { timeout: 30_000 })
        .toBe(true);
    }
    // The room writes the file with it, in the owner's paths, the card beside the share as it was.
    await expect
      .poll(
        async () => {
          const doc = JSON.parse((await invoke(owner, "read_text", { path: "Sub/Quadro.canvas" })).text);
          return (doc.verso?.drawing ?? []).some((d) => d.type === "text" && d.text === "da Ana");
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const file = JSON.parse((await invoke(owner, "read_text", { path: "Sub/Quadro.canvas" })).text);
    expect(file.nodes.find((n) => n.id === "livre").file).toBe("Sub/Livre.md");
    expect(file.nodes.find((n) => n.id === "fora").file).toBe("Fora/Segredo.md");
    expect(JSON.stringify(await scene(ana.page))).not.toMatch(LEAKS);

    if (tag === "chromium") {
      // The owner moves the card beside the share: it moves on her board, locked.
      const fora = (await scene(owner)).find((e) => e.id === "fora");
      const from = await onBoard(owner, fora.x + 120, fora.y + 30);
      await owner.mouse.move(from.x, from.y);
      await owner.mouse.down();
      await owner.mouse.move(from.x + 40, from.y + 150, { steps: 8 });
      await owner.mouse.up();
      await expect.poll(async () => (await scene(ana.page)).find((e) => e.id === "fora")?.y ?? 0, { timeout: 30_000 }).toBeGreaterThan(50);
      expect((await scene(ana.page)).find((e) => e.id === "fora").locked).toBe(true);
      expect(JSON.stringify(await scene(ana.page))).not.toMatch(LEAKS);
    }
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
