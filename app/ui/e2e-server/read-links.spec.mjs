// Read links (ADR 0105) against a real `verso serve`: the administrator
// turns them on, the owner makes a link, and someone with no account —
// a browser of its own, no cookie — reads what it points at, in the
// reader's view: no secret block, a link out of what was shared as plain
// text, dice that roll in the browser and write nothing, a passphrase when
// the link has one, and a page that ends the moment the link is revoked.

import { expect, test as base } from "@playwright/test";

import { leakFixtures } from "../e2e/leaks.mjs";

const test = base.extend(leakFixtures);

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };
const NOTE = "22 - Dados e Tabelas Sorteadas.md";

/** Console errors of the page, read at the end of each test. */
function watch(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  // The window's events in a tab warned "[TAURI] Couldn't find callback id"
  // (a console warning, not an error: it slipped past; events.ts).
  page.on("console", (m) => {
    if (m.type() === "warning" && /\[TAURI\]/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function signedIn(page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  for (let i = 0; ; i++) {
    const answer = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/signin" && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const res = await answer;
    if (res.status() !== 429 || i === 10) {
      expect(res.status()).toBe(200);
      break;
    }
    const body = await res.json().catch(() => ({}));
    await page.waitForTimeout((body.retry ?? 1) * 1000);
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  // The page landed on asks the server before it is left (see `settled` in server.spec.mjs).
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

/** The demo folder registered once, owned by the admin. */
async function demoRegistered(page) {
  await page.goto("/admin/folders");
  await expect(page.getByRole("heading", { name: "Pastas", level: 1 })).toBeVisible();
  const adopt = page.getByRole("button", { name: "Registrar: Demo" });
  const listed = page.locator(".console-table a", { hasText: "Demo" });
  await expect(adopt.or(listed)).toBeVisible();
  if (await adopt.isVisible()) await adopt.click();
  await expect(listed).toBeVisible();
}

/** A request of the server's API from the admin's page, with its session
 *  and CSRF token, as the window makes one. */
function api(page, method, path, body) {
  return page.evaluate(
    async ([method, path, body]) => {
      const state = await (await fetch("/api/state")).json();
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json", "x-verso-csrf": state.csrf },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [method, path, body],
  );
}

/** The admin signed in, the links on, and the id of the Demo folder. */
async function ready(page) {
  await signedIn(page);
  await demoRegistered(page);
  expect((await api(page, "PUT", "/api/admin/read-links", { enabled: true })).status).toBe(200);
  const folders = await api(page, "GET", "/api/folders");
  return folders.body.folders.find((f) => f.name === "Demo").id;
}

/** A link to the Demo folder, made through the owner's API: its address. */
async function linkTo(page, id, body) {
  const made = await api(page, "POST", `/api/folders/${id}/readlinks`, body);
  expect(made.status).toBe(200);
  return { url: new URL(made.body.path, page.url()).href, id: made.body.link.id };
}

/** A browser of its own: no cookie of the server's. */
async function stranger(browser, locale = "pt-BR") {
  const context = await browser.newContext({ locale });
  return { context, page: await context.newPage() };
}

test("the administrator turns the links on in the console, and the owner makes one from a note's menu", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) < 760, "the tree is the drawer's on a phone; the API makes the link there");
  const errors = watch(page);
  await signedIn(page);
  await demoRegistered(page);
  await page.goto("/admin/server");
  const sw = page.getByRole("checkbox", { name: "Links de leitura" });
  await expect(sw).toBeVisible();
  // Starts off on a new server (a test server that was turned on by an
  // earlier test of the same run starts on): turned off, then on.
  if (await sw.isChecked()) await sw.uncheck({ force: true });
  await expect(page.getByText("Desligados: nenhum link abre.")).toBeVisible();
  await sw.check({ force: true });
  await expect(page.getByText("Ligados: os donos das pastas podem criar links de leitura.")).toBeVisible();
  // The owner's window: the note's menu.
  await page.goto("/");
  await page.locator("#open").click();
  await page.getByRole("dialog", { name: "Trocar de pasta" }).getByRole("button", { name: /Demo/ }).click();
  const row = page.locator(`#notes li[data-path="${NOTE}"] > button`);
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  const dialog = page.getByRole("dialog", { name: /Link de leitura de/ });
  await expect(dialog).toContainText("1 nota tem segredos; leitores não a verão.");
  await dialog.getByRole("button", { name: "Criar link" }).click();
  const address = dialog.getByRole("textbox", { name: "Endereço do link" });
  await expect(address).toHaveValue(/\/r\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  // The tree says the note is open to anyone with the link.
  await expect(row.locator(".read-link-mark")).toHaveAttribute("aria-label", "Aberta a quem tiver um link de leitura");
  expect(errors).toEqual([]);
});

test("someone with no account reads the note: no secret, a link out of it as text, dice that write nothing", async ({ page, browser }) => {
  const errors = watch(page);
  const id = await ready(page);
  const { url } = await linkTo(page, id, { kind: "note", path: NOTE });
  const { context, page: reader } = await stranger(browser);
  const readerErrors = watch(reader);
  const sent = [];
  const apiRequests = [];
  reader.on("websocket", (ws) => ws.on("framesent", (f) => sent.push(String(f.payload))));
  reader.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());
  });
  await reader.goto(url);
  const preview = reader.locator(".preview:visible");
  await expect(preview.getByRole("heading", { name: "Dados e Tabelas Sorteadas", level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(reader.locator("html")).toHaveAttribute("data-visitor", "link");
  // The reader's view: the secret block is not there.
  await expect(preview).not.toContainText("estalajadeira");
  await expect(preview).not.toContainText("O que os jogadores não sabem");
  // The note links to one that was not shared: plain text that says so.
  const plain = preview.locator(".link-outside", { hasText: "UniVerso" }).first();
  await expect(plain).toContainText("(não compartilhado)");
  await expect(preview.locator('a.wikilink[data-target^="30 - Verso num Servidor"]')).toHaveCount(0);
  // Only what was shared: the note, and what it embeds.
  await expect(reader.locator("#notes li[data-path]").first()).toBeVisible();
  const shown = await reader.locator("#notes li[data-path]").evaluateAll((li) => li.map((x) => x.dataset.path));
  expect(shown).toContain(NOTE);
  expect(shown.some((p) => /Bem-vindo|Guia de Markdown|Verso num Servidor/.test(p))).toBe(false);
  // The window is a reader's: it says so, and nothing it can ask changes a
  // note (the server's tests refuse every write).
  await expect(reader.locator("html")).toHaveAttribute("data-role", "reader");
  await expect(reader.locator("html")).toHaveClass(/cannot-write/);
  await expect(reader.locator("#open .folder-lock")).toBeVisible();
  // A die rolls in the browser.
  await preview.getByRole("button", { name: "Rolar 1d20+5" }).click();
  await expect(preview.locator('.dice[data-dice="1d20+5"] .dice-total')).toHaveText(/^\d+$/);
  // Nothing the window sent is a write, a room, sync or a roll for the
  // server; and it never touched the server's API (no account, no state).
  const commands = sent.map((s) => JSON.parse(s).cmd);
  expect(commands.length).toBeGreaterThan(0);
  for (const cmd of commands) expect(cmd, cmd).not.toMatch(/^(write_|create_|delete_|rename_|move_|collab_|sync_|history_|trash_|set_folder_settings)/);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(readerErrors).toEqual([]);
  await context.close();
});

test("a link to a folder shows that folder alone, and search finds nothing outside it", async ({ page, browser }) => {
  const id = await ready(page);
  const { url } = await linkTo(page, id, { kind: "folder", path: "Lugares" });
  const { context, page: reader } = await stranger(browser);
  await reader.goto(url);
  await expect(reader.locator("#notes li[data-path]").first()).toBeVisible({ timeout: 30_000 });
  await expect(reader.locator("#folder")).toHaveText("Lugares");
  const rows = await reader.locator("#notes li[data-path]").evaluateAll((li) => li.map((x) => x.dataset.path));
  expect(rows.length).toBeGreaterThan(0);
  expect(rows).toContain("Porto Cinzento.md");
  expect(rows.some((p) => /Bem-vindo|Guia de Markdown/.test(p))).toBe(false);
  await context.close();
});

test("a link with a password asks for it, in the reader's language, and refuses a wrong one", async ({ page, browser }) => {
  const id = await ready(page);
  const { url } = await linkTo(page, id, { kind: "note", path: NOTE, password: "abra cadabra" });
  const { context, page: reader } = await stranger(browser);
  await reader.goto(url);
  await expect(reader.getByRole("heading", { name: "Este link pede uma senha" })).toBeVisible({ timeout: 30_000 });
  const field = reader.getByLabel("Senha", { exact: true });
  await expect(field).toBeFocused();
  // A note shown before the password: none.
  await expect(reader.locator(".preview")).toHaveCount(0);
  await field.fill("errada errada");
  await field.press("Enter");
  await expect(reader.getByRole("alert")).toHaveText("Senha incorreta.");
  await field.fill("abra cadabra");
  await field.press("Enter");
  await expect(reader.locator(".preview:visible").getByRole("heading", { name: "Dados e Tabelas Sorteadas", level: 1 })).toBeVisible({ timeout: 30_000 });
  await context.close();
  // In English, for an English browser.
  const en = await stranger(browser, "en-US");
  await en.page.goto(url);
  await expect(en.page.getByRole("heading", { name: "This link asks for a password" })).toBeVisible({ timeout: 30_000 });
  await en.context.close();
});

test("revoking ends the page that is open, and the address opens nothing", async ({ page, browser }) => {
  const id = await ready(page);
  const { url, id: linkId } = await linkTo(page, id, { kind: "note", path: NOTE });
  const { context, page: reader } = await stranger(browser);
  await reader.goto(url);
  await expect(reader.locator(".preview:visible").getByRole("heading", { name: "Dados e Tabelas Sorteadas", level: 1 })).toBeVisible({ timeout: 30_000 });
  const revoked = await api(page, "DELETE", `/api/folders/${id}/readlinks/${linkId}`);
  expect(revoked.status).toBe(200);
  await expect(reader.getByRole("heading", { name: "O acesso a esta página acabou" })).toBeVisible({ timeout: 15_000 });
  await expect(reader.locator(".preview")).toHaveCount(0);
  await reader.goto(url);
  await expect(reader.getByRole("heading", { name: "Este link não abre" })).toBeVisible();
  // An address that was never a link says the same, in English too.
  const en = await stranger(browser, "en-US");
  await en.page.goto("/r/nunca-existiu");
  await expect(en.page.getByRole("heading", { name: "This link does not open" })).toBeVisible();
  await en.context.close();
  await context.close();
});

// The re-test of 2026-11-04 (VM 104): a WebKit visitor on a quick link a
// minute old saw "Nenhuma pasta / Escolha uma pasta deste servidor" before
// the note, with no error. A visitor has one folder, its link's: until its
// connection is up it sees the folder opening, never the start page's
// choice of a folder — not while the socket is slow, not when the first
// one drops with the folder asked.
test("a visitor whose connection comes late sees the folder opening, never the choice of a folder", async ({ page, browser }) => {
  const id = await ready(page);
  const { url } = await linkTo(page, id, { kind: "note", path: NOTE });
  const { context, page: reader } = await stranger(browser);
  // Anything ever shown of the start page's choice of a folder.
  await reader.addInitScript(() => {
    window.__chooser = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll(".lesson h1, .lesson button")].some((e) => /Escolha uma pasta|Escolher uma pasta/.test(e.textContent ?? ""))) window.__chooser = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  // The first connection is slow, then drops when the folder is asked; the
  // next one is the server's.
  let first = true;
  let asked = () => undefined;
  const folderAsked = new Promise((resolve) => (asked = resolve));
  await reader.routeWebSocket(/\/r\/[^/]+\/ws$/, (ws) => {
    if (!first) {
      ws.connectToServer();
      return;
    }
    first = false;
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      if (String(m).includes('"open_server_folder"')) {
        asked();
        setTimeout(() => ws.close(), 1500);
        return;
      }
      server.send(m);
    });
  });
  await reader.goto(url);
  await folderAsked;
  expect(await reader.evaluate(() => window.__chooser), "the choice of a folder, before the folder opened").toBe(false);
  // While it waits: the folder opening, in words.
  await expect(reader.locator(".lesson").getByRole("status")).toHaveText(/Abrindo pasta/);
  await expect(reader.locator(".preview:visible").getByRole("heading", { name: "Dados e Tabelas Sorteadas", level: 1 })).toBeVisible({ timeout: 30_000 });
  expect(await reader.evaluate(() => window.__chooser), "the choice of a folder, after the drop").toBe(false);
  await context.close();
});
