// A board whose file cards name paths that are not there (the maintainer's
// real board, made where the table root was ""), edited by a player
// (ADR 0113 S7). The rule: an element the window only repeats is no change,
// so nothing is refused; and a refusal never resets the view. Ana opens the
// board, pans and zooms, and waits: her view stays, no update is refused,
// the room is never joined again.

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


const FIXTURE = readFileSync(new URL("./fixtures/board-lost-cards.canvas", import.meta.url), "utf8");

test("a player's board of cards to paths that are not there stays still: view kept, nothing refused, no rejoin", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name !== "chromium", "the board is read through the browser test hooks of one engine");
  test.setTimeout(240_000);
  const opened = [];
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: "Verso-teste-mesa" });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText("Verso-teste-mesa", { timeout: 30_000 });
    await invoke(gm, "create_note", { name: "Ruínas de Valdor/Lugares/Taverna do Corvo", text: "# Taverna\n" });
    await invoke(gm, "create_note", { name: "Ruínas de Valdor/Sessões/Sessão 01", text: "# Sessão\n" });
    const laid = await invoke(gm, "board_text", { json: FIXTURE });
    expect(typeof laid).toBe("string");
    const path = "Ruínas de Valdor/Board do grupo.canvas";
    expect(await invoke(gm, "create_file", { path, base64: Buffer.from(laid).toString("base64") })).toBe(path);
    await invoke(gm, "campaign_make", { root: "Ruínas de Valdor" });
    const ana = await account(browser, gm, { email: "ana-perdidos@verso.test", name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    opened.push(ana.context);
    const status = await invoke(gm, "campaign_status", {});
    const id = status.players.find((p) => p.name === "Ana").id;
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: [path], change: set("see", [{ account: id, level: "edit" }]) });
    // Count what the window sends to the room, and what the room refuses.
    await ana.context.addInitScript(() => {
      window.__ROOM_CALLS__ = { join: 0, refused: 0 };
      const wrap = () => {
        const t = window.__TAURI_INTERNALS__;
        if (!t || t.__wrapped) return false;
        const inv = t.invoke.bind(t);
        t.invoke = async (c, a, o) => {
          if (c === "collab_join") window.__ROOM_CALLS__.join++;
          try {
            return await inv(c, a, o);
          } catch (e) {
            if (c === "collab_update") window.__ROOM_CALLS__.refused++;
            throw e;
          }
        };
        t.__wrapped = true;
        return true;
      };
      const iv = setInterval(() => wrap() && clearInterval(iv), 5);
    });
    await openBoard(ana.page, folder.id, "Board do grupo");
    await ana.page.waitForTimeout(1500);
    // Pan and zoom as a person does.
    await ana.page.evaluate(() => window.__VERSO_TEST__.board.updateScene({ appState: { scrollX: 240, scrollY: -130, zoom: { value: 0.6 } } }));
    const view = () => ana.page.evaluate(() => {
      const s = window.__VERSO_TEST__.board.getAppState();
      return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value };
    });
    const before = await view();
    expect(before.zoom).toBeCloseTo(0.6, 2);
    const joins = await ana.page.evaluate(() => window.__ROOM_CALLS__.join);
    await ana.page.waitForTimeout(5000);
    expect(await view()).toEqual(before);
    const calls = await ana.page.evaluate(() => window.__ROOM_CALLS__);
    expect(calls.refused).toBe(0);
    expect(calls.join).toBe(joins);

    // A forbidden change: the text card becomes a card of a file she does not see.
    await openBoard(gm, folder.id, "Board do grupo");
    const card = "a7f0d48c77f456f0";
    const gmX = () => gm.evaluate((cid) => window.__VERSO_TEST__.boardRoom?.resolved().get(cid)?.x ?? null, card);
    const sendAs = (patch) =>
      ana.page.evaluate(
        ([cid, p]) => {
          const t = window.__VERSO_TEST__;
          const els = t.board.getSceneElementsIncludingDeleted().map((e) => {
            if (e.id !== cid) return e;
            const next = { ...e, version: e.version + 10, versionNonce: Math.floor(Math.random() * 1e9), ...(p.x !== undefined ? { x: p.x } : {}) };
            if (p.file) next.customData = { ...e.customData, canvas: { ...e.customData.canvas, type: "file", file: p.file } };
            return next;
          });
          t.board.updateScene({ elements: els });
          t.boardRoom.scene(els, "transparent", true);
          t.boardRoom.push();
        },
        [card, patch],
      );
    await sendAs({ file: "Ruínas de Valdor/Segredo.md" });
    // Said once, the card back as the table has it, the view kept, one rejoin.
    await expect(ana.page.locator("#status")).toContainText(/recusou|refused/, { timeout: 15_000 });
    await expect
      .poll(() => ana.page.evaluate((cid) => window.__VERSO_TEST__.board.getSceneElements().find((e) => e.id === cid)?.customData?.canvas?.type, card))
      .toBe("text");
    expect(await view()).toEqual(before);
    expect((await ana.page.evaluate(() => window.__ROOM_CALLS__)).join).toBe(joins + 1);
    // And the next, allowed, change reaches the game master.
    const x0 = await gmX();
    await sendAs({ x: (x0 ?? 0) + 77 });
    await expect.poll(gmX, { timeout: 15_000 }).toBe((x0 ?? 0) + 77);
    expect(await view()).toEqual(before);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
