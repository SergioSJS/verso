// A board a player edits (ADR 0113 section H, step S7), as the server's
// end-to-end test: a real `verso serve`, a game master and two players in
// their own browsers.
//
// - The game master gives Ana *Edits* on the group's board from the one
//   dialog; Bruno only sees it.
// - Ana draws on it, live: the game master's window gets her text and the
//   room writes the file with it.
// - Ana's board holds the card of the hidden note as a locked marker (same id,
//   the words every veiled card has) and no secret pin: nothing of the hidden
//   is in her window, and the file keeps all of it.
// - Bruno is not let into the room: he follows the saved file, and a text
//   drawn on his board is none.

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

/** The board's nodes; the file is laid out by the core (`board_text`), as Obsidian lays a canvas: a room is only for a board in that layout. */
const BOARD = JSON.stringify({
  nodes: [
    { id: "livre", type: "file", file: "Livre.md", x: 0, y: 0, width: 250, height: 60 },
    { id: "cripta", type: "file", file: "Segredo.md", x: 300, y: 0, width: 250, height: 60 },
    { id: "zqpin", type: "text", text: "zqpinboard", verso: { secret: true }, x: 600, y: 0, width: 80, height: 40 },
  ],
  edges: [{ id: "zqedge", fromNode: "livre", toNode: "zqpin" }],
});

test("Ana draws on the group's board live and the game master gets it; Bruno, who only sees, does not; the hidden card stays locked", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "the board is drawn with a pointer on a large screen");
  test.setTimeout(240_000);
  const tag = info.project.name;
  const opened = [];
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: `Quadro ${tag}` });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText(`Quadro ${tag}`, { timeout: 30_000 });
    await invoke(gm, "create_note", { name: "Livre", text: "# Livre\n\npara todos\n" });
    await invoke(gm, "create_note", { name: "Segredo", text: "# Segredo\n\nzqbody\n" });
    const laid = await invoke(gm, "board_text", { json: BOARD });
    expect(typeof laid).toBe("string");
    expect(await invoke(gm, "create_file", { path: "Quadro do grupo.canvas", base64: Buffer.from(laid).toString("base64") })).toBe("Quadro do grupo.canvas");
    await invoke(gm, "campaign_make", { root: "" });
    const ana = await account(browser, gm, { email: `ana-quadro-${tag}@verso.test`, name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    const bruno = await account(browser, gm, { email: `bruno-quadro-${tag}@verso.test`, name: "Bruno", password: "a senha do bruno", folder: folder.id, role: "reader" });
    opened.push(ana.context, bruno.context);
    const status = await invoke(gm, "campaign_status", {});
    const id = (name) => status.players.find((p) => p.name === name).id;
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: ["Livre.md"], change: set("see", []) });
    // The board: the table sees it; Ana edits it, from the one dialog.
    await invoke(gm, "access_set", { paths: ["Quadro do grupo.canvas"], change: set("see", []) });
    await openBoard(gm, folder.id, "Quadro do grupo");
    await gm.locator('#notes li[data-path="Quadro do grupo.canvas"] > button').click({ button: "right" });
    await gm.getByRole("menuitem", { name: /^Acesso…/ }).click();
    const dialog = gm.getByRole("dialog", { name: /^Acesso · Quadro do grupo/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Quem edita este board vê os cartões de texto inteiros");
    await dialog.getByRole("combobox", { name: "Ana", exact: true }).selectOption({ label: "Edita" });
    await expect(dialog).toContainText("Salvo");
    await gm.keyboard.press("Escape");
    await expect.poll(async () => (await invoke(gm, "access_get", { paths: ["Quadro do grupo.canvas"] }))[0].set.rows.find((r) => r.account === id("Ana"))?.level).toBe("edit");

    // Ana's board: her cards, the hidden card locked with its id, no pin.
    await openBoard(ana.page, folder.id, "Quadro do grupo");
    await expect.poll(async () => (await scene(ana.page)).find((e) => e.id === "cripta")?.locked).toBe(true);
    const hers = await scene(ana.page);
    expect(hers.map((e) => e.id).sort()).toEqual(["cripta", "livre"]);
    const lock = hers.find((e) => e.id === "cripta");
    expect(lock.canvas.type).toBe("text");
    expect(lock.canvas.text).toContain("🔒");
    expect(JSON.stringify(hers)).not.toMatch(/Segredo|zqpin|zqedge|zqbody/);
    // She draws a text; the game master's window gets it.
    const free = await onBoard(ana.page, 0, 300);
    await ana.page.mouse.click(free.x, free.y);
    await ana.page.keyboard.press("t");
    await ana.page.mouse.click(free.x, free.y);
    await ana.page.keyboard.type("da Ana");
    await ana.page.keyboard.press("Escape");
    // Let go of it, as a person does: the change is whole once it is not being edited.
    const away = await onBoard(ana.page, 500, 450);
    await ana.page.mouse.click(away.x, away.y);
    // In the game master's room. (WebKit leaves the room of a window that is not
    // in front, so there only the file is looked at, below.)
    if (tag === "chromium") {
      await expect
        .poll(() => gm.evaluate(() => [...(window.__VERSO_TEST__?.boardRoom?.resolved().values() ?? [])].some((e) => e.type === "text" && e.text === "da Ana")), { timeout: 30_000 })
        .toBe(true);
    }
    // The room writes the file with it — and with all that she does not see.
    await expect
      .poll(
        async () => {
          const doc = JSON.parse((await invoke(gm, "read_text", { path: "Quadro do grupo.canvas" })).text);
          return (doc.verso?.drawing ?? []).some((d) => d.type === "text" && d.text === "da Ana");
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const file = JSON.parse((await invoke(gm, "read_text", { path: "Quadro do grupo.canvas" })).text);
    expect(file.nodes.find((n) => n.id === "cripta").file).toBe("Segredo.md");
    expect(file.nodes.find((n) => n.id === "zqpin").verso.secret).toBe(true);
    expect(file.edges.map((e) => e.id)).toEqual(["zqedge"]);
    // And hers is still without it.
    expect(JSON.stringify(await scene(ana.page))).not.toMatch(/Segredo|zqpin|zqedge|zqbody/);

    if (tag === "chromium") {
      // The game master moves the hidden card: it moves on her board, locked.
      const cripta = (await scene(gm)).find((e) => e.id === "cripta");
      const from = await onBoard(gm, cripta.x + 120, cripta.y + 30);
      await gm.mouse.move(from.x, from.y);
      await gm.mouse.down();
      await gm.mouse.move(from.x + 40, from.y + 150, { steps: 8 });
      await gm.mouse.up();
      await expect.poll(async () => (await scene(ana.page)).find((e) => e.id === "cripta")?.y ?? 0, { timeout: 30_000 }).toBeGreaterThan(50);
      expect((await scene(ana.page)).find((e) => e.id === "cripta").locked).toBe(true);
      expect(JSON.stringify(await scene(ana.page))).not.toMatch(/Segredo|zqpin|zqedge|zqbody/);
    }

    // Bruno only sees: no room, and what he draws is none.
    await openBoard(bruno.page, folder.id, "Quadro do grupo");
    const joined = await invoke(bruno.page, "collab_join", { path: "Quadro do grupo.canvas" });
    expect(joined.error?.kind ?? joined.error?.message ?? "").toMatch(/refused|followed live/);
    const before = (await scene(bruno.page)).length;
    const spot = await onBoard(bruno.page, 0, 300);
    await bruno.page.mouse.click(spot.x, spot.y);
    await bruno.page.keyboard.press("t");
    await bruno.page.mouse.click(spot.x, spot.y);
    await bruno.page.keyboard.type("do Bruno");
    await bruno.page.keyboard.press("Escape");
    await bruno.page.waitForTimeout(1500);
    expect((await scene(bruno.page)).length).toBe(before);
    expect(JSON.stringify(await scene(bruno.page))).not.toMatch(/Segredo|zqpin|zqedge|zqbody|do Bruno/);
    const after = JSON.parse((await invoke(gm, "read_text", { path: "Quadro do grupo.canvas" })).text);
    expect(JSON.stringify(after)).not.toContain("do Bruno");
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
