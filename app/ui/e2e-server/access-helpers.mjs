// Helpers of the access scenarios (ADR 0113 S9, access-scenarios.spec.mjs):
// a real `verso serve`, a game master and two players in their own browsers.
// Not a spec (testMatch is *.spec.mjs).

import { deflateSync } from "node:zlib";

import { expect } from "@playwright/test";

export const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

/** A 1x1 PNG, made here: the bytes are what the window checks, and the picture must decode. */
export const PNG = (() => {
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
  return Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.from([0, 200, 30, 30]))), chunk("IEND", Buffer.alloc(0))]);
})();

/** A small PDF: what the table checks is its first bytes. */
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");

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

export async function signedIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/, { timeout: 30_000 }); // the redirect follows the session check, which is slow when the server is busy
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const res = await enter(page);
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

export async function api(page, method, path, data) {
  const state = await (await page.request.get("/api/state")).json();
  const res = await page.request.fetch(path, { method, data, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** A command of the contract, as the window sends it. */
export const invoke = (page, cmd, args = {}) => page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

/** The same, but a refusal is the answer: `{ error }`. */
export const tryInvoke = (page, cmd, args = {}) =>
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
export async function account(browser, gm, { email, name, password, folder, role }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email, ...(folder ? { folder, role } : {}) });
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

/**
 * A table of a folder of its own, with `files` (path -> text, or a board's
 * JSON for a `.canvas`), a game master in `gm` and two players, Ana and
 * Bruno, in their own browsers. Nothing is released: the table's default
 * hides every file.
 */
export async function setup(browser, gm, info, label, files) {
  const tag = `${label}-${info.project.name}`;
  await gm.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  await signedIn(gm, ADMIN.email, ADMIN.password);
  const folder = await api(gm, "POST", "/api/folders", { name: `Zz cenario ${tag}` });
  await gm.goto(`/?folder=${folder.id}`);
  await expect(gm.locator("#folder")).toHaveText(`Zz cenario ${tag}`, { timeout: 30_000 });
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith(".canvas")) {
      const laid = await invoke(gm, "board_text", { json: text });
      expect(await invoke(gm, "create_file", { path, base64: Buffer.from(laid).toString("base64") })).toBe(path);
    } else {
      await invoke(gm, "create_note", { name: path.replace(/\.md$/, ""), text });
    }
  }
  await invoke(gm, "campaign_make", { root: "" });
  const ana = await account(browser, gm, { email: `ana-s9-${tag}@verso.test`, name: "Ana", password: "a senha da ana", folder: folder.id, role: "reader" });
  const bruno = await account(browser, gm, { email: `bruno-s9-${tag}@verso.test`, name: "Bruno", password: "a senha do bruno", folder: folder.id, role: "reader" });
  const status = await invoke(gm, "campaign_status", {});
  const id = (name) => status.players.find((p) => p.name === name).id;
  const set = async (paths, whole, rows = {}) =>
    invoke(gm, "access_set", {
      paths,
      change: { kind: "set", set: { whole, rows: Object.entries(rows).map(([who, level]) => ({ account: id(who), level })) }, secret_name: null },
    });
  return { folder, ana, bruno, id, set, contexts: [ana.context, bruno.context] };
}

/** The folder on screen, for a member. */
export async function openFolder(page, id) {
  await page.goto(`/?folder=${id}`);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
}

/** The Mesa panel of the window, open. */
export async function mesa(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-compose")).toBeVisible({ timeout: 30_000 });
  return view;
}

export const field = (view) => view.getByRole("textbox", { name: "Mensagem para a mesa" });

export async function say(view, text) {
  await field(view).fill(text);
  await field(view).press("Enter");
}

/** `bytes` pasted into the Mesa's panel as a file, then sent with Enter. */
export async function sendFile(page, view, name, type, bytes) {
  await page.evaluate(
    ([b64, n, ty]) => {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([raw], n, { type: ty }));
      document.querySelector(".table-view").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    [Buffer.from(bytes).toString("base64"), name, type],
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await field(view).press("Enter");
}

export const sheetDoc = (page) => page.evaluate(() => document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView.state.doc.toString());

/** `entry` dragged by the pointer to the middle of the editor's last line. */
export async function dragIntoSheet(page, entry) {
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

/** The quick switcher asked for `text`: what it lists, as texts. It stays open. */
export async function switcher(page, text) {
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(text);
  await page.waitForTimeout(600);
  return page.locator(".quick:not([hidden]) .quick-list li").allInnerTexts();
}

/** A note opened by the quick switcher (a sheet one edits, or only reads). */
export async function openNoteBy(page, name) {
  const listed = await switcher(page, name);
  expect(listed.join("|"), `the switcher lists ${name}`).toContain(name);
  await page.getByRole("combobox", { name: "Abrir…" }).press("Enter");
  await expect(page.locator(".leaf:not([hidden])")).toBeVisible({ timeout: 30_000 });
}

/** A note opened and put in edit mode, as the sheets of the table are. */
export async function openSheet(page, name) {
  await openNoteBy(page, name);
  await expect(page.locator(".leaf:not([hidden]) .note-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".leaf:not([hidden]) .editor.live .cm-content")).toBeVisible();
}

/** Which of `words` are anywhere in the page: its text, its attributes (paths, labels), what is open. */
export const traces = (page, words) =>
  page.evaluate((ws) => {
    const html = document.documentElement.outerHTML;
    return ws.filter((w) => html.includes(w));
  }, words);

/** The folder of the tree opened (clicked open if it is closed). */
export async function reveal(page, folder) {
  const parts = folder.split("/");
  for (let k = 1; k <= parts.length; k++) {
    const summary = page.locator(`#notes summary[data-folder="${parts.slice(0, k).join("/")}"]`);
    await expect(summary).toBeVisible({ timeout: 30_000 });
    // A click on a folder opens its page as well, and the tree may draw again closed: look again.
    for (let i = 0; i < 4 && !(await summary.evaluate((s) => s.parentElement.open)); i++) {
      await summary.click();
      await page.waitForTimeout(400);
    }
  }
}

/** A file of the tree, in view (its folders opened). */
export async function fileRow(page, path) {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (dir) await reveal(page, dir);
  return page.locator(`#notes li[data-path="${path}"]`);
}

/** The Access dialog of a file or a folder, from the game master's tree: right-click, "Acesso…". */
export async function accessDialog(gm, path, folder = false) {
  if (folder) {
    await reveal(gm, path);
    await gm.locator(`#notes summary[data-folder="${path}"]`).click({ button: "right" });
  } else {
    const row = await fileRow(gm, path);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator("> button").click({ button: "right" });
  }
  await gm.getByRole("menuitem", { name: /^Acesso…/ }).click();
  const dialog = gm.getByRole("dialog", { name: folder ? /^Acesso · pasta/ : /^Acesso · / });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A choice in the dialog: `who` is a player's name or "Toda a mesa"; `level` "Não vê", "Vê" or "Edita". */
export const choose = (dialog, who, level) => dialog.getByRole("combobox", { name: who, exact: true }).selectOption({ label: level });

/** A folder's dialog, second view: the files with an access of their own (the list), opened from the summary line. */
export async function exceptionsOf(dialog) {
  await dialog.getByRole("button", { name: /com acesso próprio/ }).click();
  const list = dialog.getByRole("list", { name: "Arquivos com acesso próprio" });
  await expect(list).toBeVisible();
  return list;
}

/** A folder's dialog: the choices made, then "Aplicar". */
export async function applyFolder(gm, path, choices) {
  const dialog = await accessDialog(gm, path, true);
  for (const [who, level] of choices) await choose(dialog, who, level);
  await dialog.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(dialog).toContainText("Aplicado", { timeout: 30_000 });
  return dialog;
}

/** Every path of the folder the core lists for a window (notes, boards, files and folders; not the tree). */
export const entries = async (page) => (await invoke(page, "list_entries", {})).map((e) => e.path);

/** Where `word` stands in the page (for a failure's message): the markup around it. */
export const where = (page, word) =>
  page.evaluate((w) => {
    const html = document.documentElement.outerHTML;
    const out = [];
    for (let i = html.indexOf(w); i >= 0 && out.length < 3; i = html.indexOf(w, i + 1)) out.push(html.slice(Math.max(0, i - 160), i + 80));
    return out.join("\n---\n");
  }, word);
