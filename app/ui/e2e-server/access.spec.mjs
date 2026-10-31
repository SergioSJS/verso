// The maintainer's live test of a table (2026-10-24), as a server's end-to-end
// test (ADR 0113 S9): a real `verso serve`, a game master and two players in
// their own browsers. What he met, and what must hold now:
//
// 1. Ana drops a roll of the table into her sheet, a note she edits: it is
//    inserted — not "Você só lê esta pasta".
// 2. She drags the crypt map from the chat into her sheet: the file that is
//    already in the folder is linked, nothing is uploaded.
// 3. EVERY entry of the chat is a drag source, whoever wrote it ("se eu posso
//    editar eu posso fazer isso"): Bruno's roll and the game master's message
//    go into her sheet; into Bruno's sheet, which she only sees, they do not,
//    and the notice names the note: "Você só lê esta nota".
// 4. The group's board: the game master's dialog says what a player who edits
//    a board sees of it, and gives *Edits* on it like on any file (the board's
//    own live test is board-players.spec.mjs).

import { deflateSync } from "node:zlib";

import { expect, test } from "@playwright/test";

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };
/** A 1x1 PNG, made here: the bytes are what the window checks, and the picture must decode. */
const PNG = (() => {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(1, 0);
  head.writeUInt32BE(1, 4);
  head[8] = 8;
  head[9] = 2;
  return [...Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.from([0, 200, 30, 30]))), chunk("IEND", Buffer.alloc(0))])];
})();

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

/** A command of the contract, as the window sends it. */
const invoke = (page, cmd, args = {}) =>
  page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);


/** An account made from an invitation link (folder and role in it, or none). */
async function account(browser, gm, { email, name, password, folder, role }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email, ...(folder ? { folder, role } : {}) });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await page.goto(made.link);
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Senha nova").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  return { context, page };
}

/** The folder on screen: by address for a member, from "Shared with me" for a share. */
async function openFolder(page, id, shareName) {
  if (!shareName) {
    await page.goto(`/?folder=${id}`);
  } else {
    await page.goto("/");
    await page.locator("#open").click();
    const dialog = page.getByRole("dialog", { name: "Trocar de pasta" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("region", { name: "Compartilhados comigo" }).getByRole("button", { name: shareName }).click();
  }
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
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

async function say(view, text) {
  await field(view).fill(text);
  await field(view).press("Enter");
}


const ENTRY = '.table-entry';
const sheetDoc = (page) => page.evaluate(() => document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView.state.doc.toString());
const files = async (gm) => (await invoke(gm, "list_files", {})).length;

/** `entry` dragged by the pointer to the middle of the editor's last line. */
async function dragIntoSheet(page, entry) {
  const line = page.locator(".cm-line").last();
  const box = await entry.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2 - 12, { steps: 3 });
  await page.mouse.move(700, 450, { steps: 6 });
  const at = await line.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height - 3, { steps: 12 });
  await page.mouse.up();
}

async function openSheet(page, name) {
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await expect(page.locator(".leaf:not([hidden]) .note-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".leaf:not([hidden]) .editor.live .cm-content")).toBeVisible();
}

test("the maintainer's repros: drop a roll, a message and the chat's picture into the sheet one edits; refused, by name, into one one only reads", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "the panels are side by side");
  test.setTimeout(240_000);
  const tag = info.project.name;
  const opened = [];
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name: `Acesso ${tag}` });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText(`Acesso ${tag}`, { timeout: 30_000 });
    for (const n of ["Fichas/Ana", "Fichas/Bruno"]) {
      const made = await invoke(gm, "create_note", { name: n, text: `# ${n.split("/")[1]}\n\nforça 12\n` });
      expect(made.path ?? made.status ?? "ok", JSON.stringify(made)).toBeTruthy();
    }
    const board = Buffer.from('{"nodes":[],"edges":[]}').toString("base64");
    await invoke(gm, "create_file", { path: "Quadro do grupo.canvas", base64: board });
    await invoke(gm, "campaign_make", { root: "" });
    const ana = await account(browser, gm, { email: `ana-${tag}@verso.test`, name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
    const bruno = await account(browser, gm, { email: `bruno-${tag}@verso.test`, name: "Bruno", password: "a senha do bruno", folder: folder.id, role: "reader" });
    opened.push(ana.context, bruno.context);
    const status = await invoke(gm, "campaign_status", {});
    const id = (name) => status.players.find((p) => p.name === name).id;
    // Ana edits her sheet and sees Bruno's; Bruno the other way; both see the board.
    const set = (whole, rows) => ({ kind: "set", set: { whole, rows }, secret_name: null });
    await invoke(gm, "access_set", { paths: ["Fichas/Ana.md"], change: set("none", [{ account: id("Ana"), level: "edit" }, { account: id("Bruno"), level: "see" }]) });
    await invoke(gm, "access_set", { paths: ["Fichas/Bruno.md"], change: set("none", [{ account: id("Bruno"), level: "edit" }, { account: id("Ana"), level: "see" }]) });
    await invoke(gm, "access_set", { paths: ["Quadro do grupo.canvas"], change: set("see", []) });
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    const [g, a, b] = [await mesa(gm), await mesa(ana.page), await mesa(bruno.page)];
    // The chat: the game master's message and picture, Bruno's roll.
    await say(g, "o mapa da cripta");
    await gm.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "cripta.png", { type: "image/png" }));
      document.querySelector(".table-view").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, Buffer.from(PNG).toString("base64"));
    await gm.keyboard.press("Escape");
    await gm.waitForTimeout(500);
    await field(g).press("Enter");
    await field(b).fill("/r 1d6");
    await field(b).press("Enter");
    await expect(a.locator('.table-entry[data-kind="image"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(a.locator('.table-entry[data-by="Bruno"][data-kind="roll"]')).toHaveCount(1);
    await expect(a.locator('.table-entry[data-kind="say"]', { hasText: "o mapa da cripta" })).toHaveCount(1);
    const before = await files(gm);

    // 1 and 3: Bruno's roll — not hers — into her sheet.
    await openSheet(ana.page, "Ana");
    expect(await ana.page.locator("#open .folder-lock").isVisible()).toBe(false);
    await dragIntoSheet(ana.page, a.locator('.table-entry[data-by="Bruno"][data-kind="roll"]'));
    await expect.poll(() => sheetDoc(ana.page)).toMatch(/```roll\nquem: Bruno/);
    // The game master's message, in the same sheet.
    await dragIntoSheet(ana.page, a.locator('.table-entry[data-kind="say"]', { hasText: "o mapa da cripta" }));
    await expect.poll(() => sheetDoc(ana.page)).toContain("o mapa da cripta");
    // 2: the picture is linked, the file that was there; nothing is uploaded.
    await dragIntoSheet(ana.page, a.locator('.table-entry[data-kind="image"]'));
    await expect.poll(() => sheetDoc(ana.page)).toMatch(/!\[\[[^\]]*mesa-\d+-\w+\.png\]\]/);
    expect(await files(gm)).toBe(before);
    // What she wrote reaches the file, by the server.
    await expect.poll(async () => (await invoke(gm, "read_note", { path: "Fichas/Ana.md" })).text).toContain("```roll");

    // 3: into Bruno's sheet, which she only sees, nothing lands and the notice names the note.
    await openSheet(ana.page, "Bruno");
    const bruno_before = await sheetDoc(ana.page);
    await dragIntoSheet(ana.page, a.locator('.table-entry[data-by="Bruno"][data-kind="roll"]'));
    await expect(ana.page.locator(".reader-notice")).toContainText("Você só lê esta nota");
    expect(await sheetDoc(ana.page)).toBe(bruno_before);
    expect((await invoke(gm, "read_note", { path: "Fichas/Bruno.md" })).text).not.toContain("```roll");

    // 4: the group's board, from the game master's one dialog.
    await gm.locator('#notes li[data-path="Quadro do grupo.canvas"] > button').click({ button: "right" });
    await gm.getByRole("menuitem", { name: /^Acesso…/ }).click();
    const dialog = gm.getByRole("dialog", { name: /^Acesso · Quadro do grupo/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Quem edita este board vê os cartões de texto inteiros");
    await expect(dialog.getByRole("combobox", { name: "Ana", exact: true })).toBeEnabled();
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
