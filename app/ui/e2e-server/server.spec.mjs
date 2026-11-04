// The window in a browser against a real `verso serve` (ADR 0073, 0074):
// the admin from the environment signs in, registers a folder on the disk
// and works in it over the WebSocket; an invited reader reads and cannot
// write; the pages are in the person's language and the console stays
// clean.

import { createHash } from "node:crypto";

import { expect, test as base, webkit } from "@playwright/test";

import { leakFixtures } from "../e2e/leaks.mjs";

/** Every test ends with nothing of its own left open (e2e/leaks.mjs). */
const test = base.extend(leakFixtures);

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

/** Console errors of the page, read at the end of each test. */
function watch(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/** Press "Entrar" and answer the server's answer to it. The password is
 *  checked slowly in a debug build — seconds on a slow machine — so the
 *  answer is waited for, never a fixed time. The wrong passwords of the
 *  three browsers come from one address: when the limiter asks for a wait
 *  (429), the person waits what it says and presses again. */
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

/** Signed in: the server said yes, and the page went where it sends the
 *  person — out of /signin, loaded. */
async function landed(page) {
  const res = await enter(page);
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await settled(page);
}

/** The page the person landed on has finished loading: its script has
 *  asked the server who is signed in (`/api/state`) and fetched its chunks.
 *  A test that goes elsewhere before that cancels those requests, and WebKit
 *  logs each cancelled fetch as a console error ("Fetch API cannot load ...
 *  due to access control checks") — the page is not at fault, a person does
 *  not leave a page in the middle of the first frame. */
async function settled(page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

async function signIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
}

async function signedIn(page, email, password) {
  await signIn(page, email, password);
  await landed(page);
}

/** The demo folder registered once, owned by the admin, from the
 *  administration console's folders (ADR 0077). */
async function demoRegistered(page) {
  await page.goto("/admin/folders");
  await expect(page.getByRole("heading", { name: "Pastas", level: 1 })).toBeVisible();
  const adopt = page.getByRole("button", { name: "Registrar: Demo" });
  const listed = page.locator(".console-table a", { hasText: "Demo" });
  // Either still on the disk with no owner, or registered already (another
  // test of the same server).
  await expect(adopt.or(listed)).toBeVisible();
  if (await adopt.isVisible()) await adopt.click();
  await expect(listed).toBeVisible();
}

/** The folder switcher open (ADR 0081 item 5), from the folder button —
 *  on a phone in the side bar's drawer (ADR 0076). One press: the page's
 *  `load` comes before the window's own script, and a press made before
 *  it is kept and made once the button is wired (`earlyClicks.ts`). */
async function openSwitcher(page) {
  await showTree(page);
  const dialog = page.getByRole("dialog", { name: "Trocar de pasta" });
  await page.locator("#open").click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function openDemo(page) {
  await page.goto("/");
  const dialog = await openSwitcher(page);
  await dialog.getByRole("button", { name: /Demo/ }).click();
  await expect(page.locator("#notes li").first()).toBeVisible();
  await expect(page).toHaveURL(/folder=/);
}

test("a click on the folder button before the window's script has loaded opens the switcher", async ({ page }) => {
  // The phone's folder button is in the side's drawer, which the window's
  // script opens: nothing of it can be pressed before.
  test.skip((page.viewportSize()?.width ?? 1000) < 760, "the folder button is in the drawer on a phone");
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  // A slow machine: the window's script arrives two seconds after the page.
  await page.route(/\/main\.js(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "load" });
  const open = page.locator("#open");
  // Not ready, and it says so.
  await expect(open).toHaveAttribute("aria-busy", "true");
  // One press, right after `load`, never again: kept, then made.
  await open.click();
  await expect(page.getByRole("dialog", { name: "Trocar de pasta" })).toBeVisible({ timeout: 30_000 });
  await expect(open).not.toHaveAttribute("aria-busy");
  expect(errors).toEqual([]);
});

test("the admin signs in, registers a folder and works in it", async ({ page }) => {
  const errors = watch(page);
  await signIn(page, ADMIN.email, "senha errada!!");
  expect((await enter(page)).status()).toBe(401);
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha errados.");
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  await landed(page);
  await demoRegistered(page);
  await openDemo(page);
  await expect(page.locator("#folder")).toHaveText("Demo");
  // The owner writes: no reader's lock.
  await expect(page.locator("#open .folder-lock")).toBeHidden();
  // A reload comes back to the same folder.
  await page.reload();
  await expect(page.locator("#folder")).toHaveText("Demo");
  await expect(page.locator("#notes li").first()).toBeVisible();
  // A note made through the window lands on the server's disk: after a
  // reload, the tree still has it.
  const name = `Web ${test.info().project.name}`;
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.locator("input.title-input")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  const blank = page.locator(".template-picker").getByRole("button", { name: "Em branco", exact: true });
  await blank.click();
  await expect(page.locator("#notes")).toContainText(`${name}.md`);
  await page.reload();
  await expect(page.locator("#notes")).toContainText(`${name}.md`);
  expect(errors).toEqual([]);
});

/** A new account made from an invitation that names no folder. */
async function bareAccount(admin, browser, email) {
  await admin.goto("/admin/invitations");
  const invite = admin.locator(".console-content");
  await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").first().textContent()) ?? "";
  expect(link).toContain("/invite/");
  const ctx = await browser.newContext({ locale: "pt-BR" });
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByLabel("Nome").fill("Sem pasta");
  await p.getByLabel("Senha nova").fill("a senha sem pasta");
  await p.getByRole("button", { name: "Criar conta" }).click();
  await expect(p).not.toHaveURL(/invite/);
  await settled(p);
  return p;
}

test("an invited reader reads and cannot write", async ({ page, browser }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  const email = `leitor-${test.info().project.name}@verso.test`;
  await page.goto("/admin/invitations");
  const invite = page.locator(".console-content");
  await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByLabel("Pasta (opcional)").selectOption({ label: "Demo" });
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").textContent()) ?? "";
  expect(link).toContain("/invite/");
  const other = await browser.newContext({ locale: "pt-BR" });
  const reader = await other.newPage();
  const readerErrors = watch(reader);
  await reader.goto(link);
  await expect(reader.getByRole("heading", { name: "Convite" })).toBeVisible();
  await expect(reader.locator("form", { hasText: "Senha nova" }).getByLabel("E-mail")).toHaveValue(email);
  await reader.getByLabel("Nome").fill("Leitor");
  await reader.getByLabel("Senha nova").fill("a senha do leitor");
  await reader.getByRole("button", { name: "Criar conta" }).click();
  await expect(reader).not.toHaveURL(/invite/);
  await settled(reader);
  // The invitation carried a folder: the new account lands in it (2026-10-23),
  // not on the empty start page.
  await expect(reader.locator("#folder")).toHaveText("Demo", { timeout: 30_000 });
  await expect(reader.locator("html")).toHaveAttribute("data-role", "reader");
  // An account whose invitation carries no folder lands on the start page: it
  // says to choose one of the server's folders, not the desktop's keys, and no
  // role is said.
  const bare = await bareAccount(page, browser, `sem-pasta-${test.info().project.name}@verso.test`);
  await expect(bare.getByRole("heading", { name: "Escolha uma pasta deste servidor." })).toBeVisible();
  await expect(bare.getByRole("button", { name: "Escolher uma pasta" })).toBeVisible();
  await expect(bare.locator(".lesson .keys")).toHaveCount(0);
  await expect(bare.locator(".web-notice", { hasText: "Você só lê" })).toHaveCount(0);
  await expect(bare.locator("#open .folder-lock")).toBeHidden();
  await expect(bare.locator("html")).not.toHaveAttribute("data-role", "reader");
  await bare.context().close();
  // With the folder on screen, the reader has the closed lock beside its name (no banner, no notice).
  await expect(reader.locator(".web-notice", { hasText: "Você só lê" })).toHaveCount(0);
  await expect(reader.locator("#open .folder-lock")).toHaveAttribute("aria-label", "Você só lê esta pasta");
  await expect(reader.locator("#open .folder-lock")).toBeVisible();
  // The invitation is used, by whom.
  await page.goto("/admin/invitations");
  await expect(invite.locator(".console-table tr", { hasText: email })).toContainText("usado");
  await expect(invite.locator(".console-table th")).toContainText(["E-mail", "Pasta", "Estado", "Criada", "Expira", "Usado por"]);
  // The log says it in words, and whom it was for — the code kept in the
  // line's title.
  await page.goto("/admin/audit");
  const used = page.locator(".console-table tbody tr", { hasText: `convite para ${email}` }).first();
  await expect(used).toContainText("usou o convite");
  await expect(used.locator("[data-action]")).toHaveAttribute("title", "invitation_used");
  await expect(page.locator(".console-table tbody")).not.toContainText("invitation_used");
  // Used once: the link is gone.
  const third = await browser.newContext({ locale: "pt-BR" });
  const late = await third.newPage();
  await late.goto(link);
  await expect(late.getByText("Este link já foi usado ou expirou.", { exact: false })).toBeVisible();
  await other.close();
  await third.close();
  expect(errors).toEqual([]);
  expect(readerErrors).toEqual([]);
});

test("two windows edit one note at once and the file follows", async ({ page, browser }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  // A note of its own for this engine, made in the first window.
  const name = `Junto ${test.info().project.name}`;
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.locator("input.title-input")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await page.locator(".template-picker").getByRole("button", { name: "Em branco", exact: true }).click();
  const mine = page.locator(".cm-content:visible").first();
  await expect(mine).toBeVisible();
  // The second window, another tab of the same person, on the same note.
  const other = await page.context().newPage();
  const otherErrors = watch(other);
  await other.goto(`/?folder=${folder}`);
  await expect(other.locator("#notes")).toContainText(`${name}.md`);
  await showTree(other);
  await other.locator("#notes").getByRole("treeitem", { name: `${name}.md` }).click();
  const theirs = other.locator(".cm-content:visible").first();
  // Edit mode in the second window, if it opened in reading.
  if (!(await theirs.isVisible())) await other.getByRole("button", { name: "Editar" }).first().click();
  await expect(theirs).toBeVisible();
  // One types; the other sees it, without saving.
  await mine.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("linha da primeira janela");
  await expect(theirs).toContainText("linha da primeira janela");
  await theirs.click();
  await other.keyboard.press("ControlOrMeta+End");
  await other.keyboard.type(" e da segunda");
  await expect(mine).toContainText("linha da primeira janela e da segunda");
  // The server wrote the file: a third window reads it from the disk.
  await page.waitForTimeout(1500);
  const third = await page.context().newPage();
  await third.goto(`/?folder=${folder}`);
  await expect(third.locator("#folder")).toHaveText("Demo");
  const read = await third.evaluate(async (path) => {
    const internals = window.__TAURI_INTERNALS__;
    return internals.invoke("read_note", { path });
  }, `${name}.md`);
  expect(read.text).toContain("linha da primeira janela e da segunda");
  await other.close();
  await third.close();
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
});

/** A device of the same person, as the app that syncs a local folder
 *  speaks to the server (ADR 0079): its own connection, the folder
 *  opened, the file's hash as the server lists it for the base, then the
 *  command. Answers the command's answer. */
async function asDevice(page, folder, cmd, args) {
  return page.evaluate(
    async ({ folder, cmd, args }) => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      const waiting = new Map();
      let id = 0;
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (typeof m.id === "number") waiting.get(m.id)?.(m);
      });
      await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
      });
      const call = (c, a) => new Promise((resolve) => {
        const n = ++id;
        waiting.set(n, resolve);
        ws.send(JSON.stringify({ id: n, cmd: c, args: a }));
      });
      await call("open_server_folder", { id: folder });
      const state = await call("sync_state", {});
      const path = args.from ?? args.path;
      const base = state.ok.files.find((f) => f.path === path)?.hash;
      // Left open, as a device's is: closed with the page (WebKit says a
      // connection closed under it on the console).
      return call(cmd, { ...args, base });
    },
    { folder, cmd, args },
  );
}

test("a device's rename and deletion reach the window's tree and tab", async ({ page }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const project = test.info().project.name;
  const name = `Lista ${project}`;
  const renamed = `Compras ${project}`;
  // The note, made and open in a tab of the window.
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.locator("input.title-input")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await page.locator(".template-picker").getByRole("button", { name: "Em branco", exact: true }).click();
  await expect(page.locator("#notes")).toContainText(`${name}.md`);
  await expect(page.locator(".tab", { hasText: name })).toHaveCount(1);
  // Renamed on a device: the tree has the new name, not the old, and the
  // tab followed the note — no failure, no system text.
  const moved = await asDevice(page, folder, "sync_rename", { from: `${name}.md`, to: `${renamed}.md` });
  expect(moved.ok, JSON.stringify(moved)).toBeTruthy();
  await expect(page.locator("#notes")).toContainText(`${renamed}.md`);
  await expect(page.locator("#notes")).not.toContainText(`${name}.md`);
  await expect(page.locator(".tab", { hasText: renamed })).toHaveCount(1);
  await expect(page.locator(".tab", { hasText: name })).toHaveCount(0);
  await expect(page.locator(".load-failure")).toHaveCount(0);
  // Deleted on a device: gone from the tree; the tab keeps its text and
  // says, in words, where it may have gone.
  const gone = await asDevice(page, folder, "sync_delete", { path: `${renamed}.md` });
  expect(gone.ok !== undefined, JSON.stringify(gone)).toBe(true);
  await expect(page.locator("#notes")).not.toContainText(`${renamed}.md`);
  const leaf = page.locator(".leaf", { has: page.locator(".flags", { hasText: "Apagada ou movida em outro aparelho" }) });
  await expect(leaf).toHaveCount(1);
  await expect(page.locator(".load-failure")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("os error");
  expect(errors).toEqual([]);
});

test("the window installs on a phone's home screen", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const m = await manifest.json();
  expect(m.display).toBe("standalone");
  // Each size twice: as it is, and maskable — the tile is edge to edge with
  // the book inside the safe zone (the new icon, 2026-10-15).
  expect(m.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "192x192 maskable", "512x512 maskable"]);
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
  const page = await (await request.get("/")).text();
  expect(page).toContain('rel="manifest"');
});

test("signing in follows only this server's own paths", async ({ page }) => {
  // `/\host` is another origin to the browser's URL parser.
  await page.goto("/signin?next=" + encodeURIComponent("/\\evil.example/x"));
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  await landed(page);
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL ?? page.url()).host);
});

test("an admin ends another account's sessions and tokens from its page", async ({ page, browser }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  // An account signed in in a browser of its own, as a lost phone's.
  const project = test.info().project.name;
  const email = `perdido-${project}@verso.test`;
  await page.goto("/admin/invitations");
  const invite = page.locator(".console-content");
  await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").textContent()) ?? "";
  const other = await browser.newContext({ locale: "pt-BR" });
  const lost = await other.newPage();
  await lost.goto(link);
  await lost.getByLabel("Nome").fill(`Perdido ${project}`);
  await lost.getByLabel("Senha nova").fill("a senha do perdido");
  await lost.getByRole("button", { name: "Criar conta" }).click();
  await expect(lost).not.toHaveURL(/invite/);
  await settled(lost);
  // Its page in the console: the session listed, ended with a confirm.
  await page.goto("/admin/accounts");
  // The list is paged and sorted by name, and this server has met many
  // accounts by now: the account is found by the console's own search.
  await page.getByRole("searchbox", { name: "Buscar por nome ou e-mail" }).fill(email);
  await page.locator(".console-table a", { hasText: `Perdido ${project}` }).click();
  await expect(page.getByRole("heading", { name: `Perdido ${project}`, level: 1 })).toBeVisible();
  await expect(page.locator(".console-list li")).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Encerrar sessões e tokens" }).click();
  await expect(page.locator(".web-said")).toHaveText("1 sessão encerrada · 0 tokens revogados.");
  await expect(page.getByRole("button", { name: "Encerrar sessões e tokens" })).toBeDisabled();
  // The lost browser is signed out: its window, told by the server, goes
  // to the sign-in page by itself — waited for, not navigated over — and
  // the address opened again asks to sign in. The admin's session stays.
  await expect(lost).toHaveURL(/\/signin/, { timeout: 30_000 });
  await lost.waitForLoadState("load");
  // The window may be told twice (the server's message, then the socket
  // closing) and land on the sign-in page twice: a goto in between is
  // interrupted (seen once on the phone project), so it is tried again.
  await expect(async () => {
    await lost.goto("/");
    await expect(lost).toHaveURL(/\/signin/);
  }).toPass({ timeout: 15_000 });
  await other.close();
  // The log says it, about whom.
  await page.goto("/admin/audit");
  const ended = page.locator(".console-table tbody tr", { hasText: "encerrou as sessões e os tokens da conta" }).first();
  await expect(ended).toContainText(email);
  await expect(ended.locator("[data-action]")).toHaveAttribute("title", "account_sessions_ended");
  expect(errors).toEqual([]);
});

test("the administration console pages its lists and sets a folder's quota", async ({ page }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  // The overview counts in words, never "conta(s)".
  await page.goto("/admin");
  const totals = page.locator(".console-card", { hasText: "Totais" }).locator(".console-big");
  await expect(totals).toHaveText(/^\d+ contas? · \d+ pastas? · /);
  await expect(page.locator(".console-cards")).not.toContainText("(s)");
  // The connection said for a person: on loopback, what that means and
  // what to do.
  await expect(page.locator(".console-card", { hasText: "Conexão segura" })).toContainText("só escuta nesta máquina (localhost)");
  // A new invitation's folder is its own labelled choice, "none" first.
  await page.goto("/admin/invitations");
  const folderChoice = page.getByLabel("Pasta (opcional)");
  await expect(folderChoice.locator("option").first()).toHaveText("— nenhuma —");
  await page.goto("/admin/folders");
  await page.locator(".console-table a", { hasText: "Demo" }).click();
  await expect(page.getByRole("heading", { name: "Demo", level: 1 })).toBeVisible();
  await page.getByLabel("Cota").fill("1GB");
  await page.getByRole("button", { name: "Definir" }).click();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-label", /de 1 GB/);
  await page.getByRole("button", { name: "Sem limite" }).click();
  await expect(page.getByRole("meter")).toHaveCount(0);
  // The folder's own log, read again, has it in words, and no column
  // repeating the folder.
  await page.reload();
  const folderLog = page.locator(".console-table").last();
  await expect(folderLog.locator("tbody tr").first()).toContainText("definiu a cota");
  await expect(folderLog.locator("th", { hasText: "Quem" })).toHaveCount(1);
  await expect(folderLog.locator("th").filter({ hasText: /^Pastas?$/ })).toHaveCount(0);
  // The log has it, filtered by action — the filter lists the actions by
  // their words.
  await page.goto("/admin/audit");
  const action = page.getByLabel("Ação", { exact: true });
  await expect(action.locator("option", { hasText: "definiu a cota" })).toHaveAttribute("value", "folder_quota");
  await action.selectOption({ label: "definiu a cota" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  const first = page.locator(".console-table tbody tr").first();
  await expect(first).toContainText("definiu a cota");
  await expect(first).toContainText("sem limite");
  await expect(first.locator("[data-action]")).toHaveAttribute("title", "folder_quota");
  // The whole log names the folder of each line.
  await expect(page.locator(".console-table th").filter({ hasText: /^Pasta$/ })).toHaveCount(1);
  // Settings › Account shows the way here; Settings has no administration.
  await page.goto("/account");
  await expect(page.locator(".settings-body a[href='/admin']")).toBeVisible();
  await expect(page.locator(".settings-nav-item", { hasText: "Administração" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** A request of the page's own session, with its CSRF token. */
async function asPage(page, method, path, data) {
  const state = await (await page.request.get("/api/state")).json();
  const res = await page.request.fetch(path, { method, data, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

test("two people share folders on one server, both ways (ADR 0081)", async ({ page, browser }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  const tag = test.info().project.name;
  const email = `ana-shares-${tag}@verso.test`;
  // Ana, invited to no folder.
  await page.goto("/admin/invitations");
  const invite = page.locator(".console-content");
  await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").textContent()) ?? "";
  const other = await browser.newContext({ locale: "pt-BR" });
  const ana = await other.newPage();
  const anaErrors = watch(ana);
  await ana.goto(link);
  await ana.getByLabel("Nome").fill("Ana");
  await ana.getByLabel("Senha nova").fill("a senha da ana");
  await ana.getByRole("button", { name: "Criar conta" }).click();
  await expect(ana).not.toHaveURL(/invite/);
  await settled(ana);
  // The admin shares the folder "Personagens" of Demo with her, editing,
  // from the folder's menu in the tree.
  await openDemo(page);
  const folder = page.locator('summary[data-folder="Personagens"]');
  await expect(async () => {
    await page.keyboard.press("Escape");
    await folder.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "Compartilhar…" }).click({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  const dialog = page.getByRole("dialog", { name: "Compartilhar “Personagens”" });
  await dialog.getByLabel("E-mail").fill(email);
  // "Papel" alone: each person already in the list has a select of their
  // own, named after them ("Ana, edita; mudar o papel").
  await dialog.getByLabel("Papel", { exact: true }).selectOption("editor");
  await dialog.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(`Compartilhada com ${email}.`);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(folder.locator(".share-mark")).toHaveAttribute("aria-label", "compartilhada com 1 pessoa");
  // Ana finds it under "Shared with me", named after the folder and its
  // owner, and it opens as a folder of its own: its notes, nothing above.
  await ana.goto("/");
  const switcher = await openSwitcher(ana);
  const shared = switcher.getByRole("region", { name: "Compartilhados comigo" });
  // The owner's name: the admin made from VERSO_ADMIN_EMAIL is called
  // after the e-mail's local part, "admin".
  await shared.getByRole("button", { name: /Personagens \(admin\)/ }).click();
  await expect(ana.locator("#folder")).toHaveText("Personagens (admin)");
  await expect(ana.locator("#notes")).toContainText("Lia Torres.md");
  await expect(ana.locator("#notes")).not.toContainText("00 - Bem-vindo");
  // And back: Ana, let make folders, shares hers whole with the admin to
  // read.
  const anaAccount = (await (await ana.request.get("/api/me")).json()).account;
  await asPage(page, "PATCH", `/api/admin/accounts/${anaAccount.id}`, { admin: false, mayCreate: true });
  const mine = await asPage(ana, "POST", "/api/folders", { name: `Ana ${tag}` });
  await asPage(ana, "PUT", `/api/folders/${mine.id}/shares`, { path: "", email: ADMIN.email, role: "reader" });
  const back = (await openSwitcher(page)).getByRole("region", { name: "Compartilhados comigo" });
  await expect(back).toContainText(`Ana ${tag}`);
  await expect(back).toContainText("lê");
  await page.keyboard.press("Escape");
  // The admin takes Ana out: her window closes the folder at once.
  await asPage(page, "POST", `/api/folders/${(await (await page.request.get("/api/folders")).json()).folders.find((f) => f.name === "Demo").id}/shares/revoke`, { path: "Personagens", account: email });
  await expect(ana.locator("#notes")).not.toContainText("Lia Torres.md");
  await other.close();
  expect(errors).toEqual([]);
  expect(anaErrors.filter((e) => !/folder|pasta/i.test(e))).toEqual([]);
});

test("a device's write keeps what it replaced in the trash, restored from the window", async ({ page }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const name = `Lixo ${test.info().project.name}`;
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.locator("input.title-input")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await page.locator(".template-picker").getByRole("button", { name: "Em branco", exact: true }).click();
  await expect(page.locator("#notes")).toContainText(`${name}.md`);
  // A device writes other bytes over it (ADR 0080 item 12): the version
  // it replaced goes to the folder's trash.
  const bytes = Buffer.from("de outro programa\n");
  const put = await asDevice(page, folder, "sync_put", {
    path: `${name}.md`,
    offset: 0,
    size: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
    data: bytes.toString("base64"),
  });
  expect(put.ok?.done, JSON.stringify(put)).toBe(true);
  // The trash, from the command palette.
  await page.keyboard.press("ControlOrMeta+Shift+p");
  await page.keyboard.type("Abrir a lixeira");
  await page.keyboard.press("Enter");
  const body = page.locator(".settings-body");
  await expect(body.locator(".settings-title")).toHaveText("Lixeira");
  const row = body.locator("tbody tr", { hasText: name }).first();
  await expect(row).toContainText("substituído por");
  await row.getByRole("button", { name: `Restaurar ${name}.md` }).click();
  await expect(body.locator(".trash-said")).toContainText(`${name}.md já existia: restaurado ao lado, como ${name} (restaurado `);
  await page.keyboard.press("Escape");
  await expect(page.locator("#notes")).toContainText(`${name} (restaurado `);
  // The console's folder page shows the trash, not counted in the quota.
  await page.goto("/admin/folders");
  await page.locator(".console-table a", { hasText: "Demo" }).click();
  await expect(page.locator("[data-trash]")).toContainText("Os arquivos apagados ficam 30 dias.");
  expect(errors).toEqual([]);
});

test("the page that approves a device says who asked, and refuses (threat model, gap 12)", async ({ page, request }) => {
  // Every start, and every lookup of a code, counts for the limiter of the
  // address (ADR 0083 items 8 and 17), and the three projects ask from one:
  // past its free tries the page says it waits — up to a minute — and asks
  // again by itself, so what follows a lookup is given that long.
  test.setTimeout(300_000);
  const waited = { timeout: 90_000 };
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  // A start told to wait asks again, as the app does.
  const ask = async (device) => {
    for (let i = 0; ; i++) {
      const res = await request.post("/api/device/start", { data: { device } });
      const body = await res.json();
      if (res.status() !== 429 || i === 5) {
        expect(res.ok(), JSON.stringify(body)).toBeTruthy();
        return body;
      }
      await new Promise((r) => setTimeout(r, (body.retry ?? 1) * 1000));
    }
  };
  // The person enters the code from the app's screen (decided 2026-10-14,
  // ADR 0083 As built): a code in the page's address is never taken, so a
  // link someone else sent approves nothing with one click.
  const enter = async (code) => {
    const field = page.getByLabel("Código do aplicativo");
    await expect(field).toHaveValue("");
    await field.fill(code);
    await page.getByRole("button", { name: "Continuar" }).click();
  };
  // Refused: the app that asked hears the code gone. The old link's shape,
  // with the code in it, shows the empty field all the same.
  const first = await ask("Verso · Estranho");
  await page.goto(`/device?code=${first.code}`);
  await expect(page.getByRole("region", { name: "Quem pediu" })).toHaveCount(0);
  await enter(first.code);
  const who = page.getByRole("region", { name: "Quem pediu" });
  await expect(who).toContainText("Verso · Estranho", waited);
  await expect(who).toContainText("127.0.0.1");
  const question = page.getByRole("heading", { name: "Foi você quem pediu, neste aparelho?", level: 2 });
  await expect(question).toBeVisible();
  // The question names the form; its buttons come after it.
  const form = page.getByRole("form", { name: "Foi você quem pediu, neste aparelho?" });
  const approveButton = form.getByRole("button", { name: "Aprovar este aparelho: Verso · Estranho" });
  await expect(approveButton).toBeVisible();
  // One sentence that wraps, not two columns of a flex row: the label is a
  // single child of the button, and the device's name sits inside it.
  await expect(approveButton.locator("> *")).toHaveCount(1);
  await expect(approveButton.locator("> .web-btn-text bdi")).toHaveText("Verso · Estranho");
  await form.getByRole("button", { name: "Não fui eu: recusar" }).click();
  // The answer replaces the question's two paragraphs with one.
  await expect(page.getByText("Recusado. O aplicativo que pediu não entra na sua conta.")).toBeVisible(waited);
  await expect(page.locator(".web-lead")).toHaveCount(1);
  await expect(page.locator(".web-lead")).toHaveText("Recusado. O aplicativo que pediu não entra na sua conta.");
  const polled = await request.post("/api/device/poll", { data: { code: first.code, poll: first.poll } });
  expect(polled.status()).toBe(410);
  // Approved: by the button named for the device.
  const second = await ask("Verso · MacBook");
  await page.goto("/device");
  await enter(second.code.replace("-", "").toLowerCase());
  const approve = page.getByRole("button", { name: "Aprovar este aparelho: Verso · MacBook" });
  await expect(approve).toBeVisible(waited);
  await approve.click();
  await expect(page.getByText("Pronto. Pode voltar ao aplicativo.")).toBeVisible(waited);
  await expect(page.locator(".web-lead")).toHaveCount(1);
  await expect(page.locator(".web-lead")).toHaveText("Pronto. Pode voltar ao aplicativo.");
  // And a way on to the window from this browser.
  await expect(page.getByRole("link", { name: "Abrir o Verso aqui" })).toHaveAttribute("href", "/");
  const done = await (await request.post("/api/device/poll", { data: { code: second.code, poll: second.poll } })).json();
  expect(typeof done.token).toBe("string");
  expect(errors).toEqual([]);
});

/** The folder's layer of settings as the window on `page` reads it from
 *  the server (`.verso/settings.json`, ADR 0070): whether the file is
 *  there, its revision and its bookmarks. With `kept`, the file is made
 *  to hold that bookmark first, if it does not yet — once for the three
 *  browsers, which share the server. */
function folderSettings(page, kept = null) {
  return page.evaluate(async (k) => {
    const internals = window.__TAURI_INTERNALS__;
    let layer = await internals.invoke("get_folder_settings", {});
    const have = layer.settings.bookmarks ?? [];
    if (k && !(layer.exists && have.includes(k))) {
      const change = { bookmarks: [...have, k], folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null };
      layer = await internals.invoke("set_folder_settings", { change, revision: layer.exists ? layer.revision : null });
    }
    return { exists: layer.exists, revision: layer.revision, bookmarks: layer.settings.bookmarks };
  }, kept);
}

/** The tree on screen: on a phone, in its drawer — its button pressed
 *  again while the drawer stays shut (a press before the window's script
 *  has loaded does nothing), never once it opened. */
async function showTree(page) {
  if ((page.viewportSize()?.width ?? 1000) >= 760) return;
  const open = page.locator("body.side-open");
  await expect(async () => {
    if ((await open.count()) === 0) await page.locator(".bottom-bar .bar-files").click();
    await expect(open).toHaveCount(1, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

/** The bookmarks' line of Settings › Organização: where they are kept,
 *  and how many. */
async function bookmarksLine(page) {
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  return page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Favoritos$/ }) });
}

test("a reader's star stays in this browser, and the folder's settings are left as they were", async ({ page, browser }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  // The owner's window on the folder again, after the console.
  const backToFolder = async () => {
    await page.goto(`/?folder=${folder}`);
    await expect(page.locator("#folder")).toHaveText("Demo");
  };
  // The folder's own settings hold a bookmark of its owner's: the folder's
  // layer is there — a reader's star must leave it alone.
  const before = await folderSettings(page, "09 - Busca e Navegação.md");
  expect(before.exists).toBe(true);
  expect(before.bookmarks).toContain("09 - Busca e Navegação.md");
  // A reader of the folder, invited to it.
  const email = `estrela-${test.info().project.name}@verso.test`;
  await page.goto("/admin/invitations");
  const invite = page.locator(".console-content");
  await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByLabel("Pasta (opcional)").selectOption({ label: "Demo" });
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").textContent()) ?? "";
  expect(link).toContain("/invite/");
  const other = await browser.newContext({ locale: "pt-BR" });
  const reader = await other.newPage();
  const readerErrors = watch(reader);
  await reader.goto(link);
  await reader.getByLabel("Nome").fill("Estrela");
  await reader.getByLabel("Senha nova").fill("a senha da leitora");
  await reader.getByRole("button", { name: "Criar conta" }).click();
  await expect(reader).not.toHaveURL(/invite/);
  await settled(reader);
  await openDemo(reader);
  await expect(reader.locator("html")).toHaveAttribute("data-role", "reader");
  // The window knows it only reads before anything is starred.
  await expect(reader.locator("#open .folder-lock")).toBeVisible();
  const NOTE = "07 - Arquivos e Pastas.md";
  const star = reader.locator(".title-row:visible", { has: reader.locator(".note-title", { hasText: /^07 - Arquivos e Pastas$/ }) }).locator("button.star");
  await showTree(reader);
  await reader.locator(`#notes li[data-path="${NOTE}"] > button`).click();
  await expect(star).toBeVisible();
  // Not among the folder's bookmarks, nor this browser's yet.
  await expect(star).not.toHaveClass(/\bon\b/);
  await star.click();
  await expect(star).toHaveClass(/\bon\b/);
  // Settings say where the reader's bookmarks are kept: this browser.
  const line = await bookmarksLine(reader);
  await expect(line.locator(".setting-scope")).toHaveText("Desta máquina");
  await expect(line.locator(".setting-value")).toHaveText("1");
  await reader.locator(".settings-close").click();
  // The server's `.verso/settings.json` is as it was.
  await backToFolder();
  expect(await folderSettings(page)).toEqual(before);
  // A reload: the star is still there, kept by this browser.
  await reader.reload();
  await expect(reader.locator("#folder")).toHaveText("Demo");
  await expect(reader.locator("#open .folder-lock")).toBeVisible();
  await showTree(reader);
  await reader.locator(`#notes li[data-path="${NOTE}"] > button`).click();
  await expect(star).toBeVisible();
  await expect(star).toHaveClass(/\bon\b/);
  const again = await bookmarksLine(reader);
  await expect(again.locator(".setting-scope")).toHaveText("Desta máquina");
  await expect(again.locator(".setting-value")).toHaveText("1");
  await reader.locator(".settings-close").click();
  expect(await folderSettings(page)).toEqual(before);
  await other.close();
  expect(errors).toEqual([]);
  expect(readerErrors).toEqual([]);
});

/* ---------- Every file a person edits co-edits live (ADR 0082 item 12) ---------- */

/** A file made in the folder through the window's own contract. */
async function made(page, path, text) {
  const r = await page.evaluate(
    async ({ path, text }) => {
      let bin = "";
      for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
      return window.__TAURI_INTERNALS__.invoke("create_file", { path, base64: btoa(bin) });
    },
    { path, text },
  );
  expect(r).toBe(path);
}

/** The file as the server's disk holds it. */
function onDisk(page, path) {
  return page.evaluate(async (p) => (await window.__TAURI_INTERNALS__.invoke("read_text", { path: p })).text, path);
}

/** A window on the folder with `path` open in a tab, the board's scene
 *  readable (`__VERSO_TEST__`, as the harness's). */
async function windowOn(page, folder, path) {
  await page.goto(`/?folder=${folder}`);
  await expect(page.locator("#folder")).toHaveText("Demo");
  await showTree(page);
  await expect(page.locator("#notes")).toContainText(path);
  await page.locator("#notes").getByRole("treeitem", { name: path }).click();
}

/** The board's scene in a window, as a test reads it. */
function sceneOf(page) {
  return page.evaluate(() =>
    (window.__VERSO_TEST__?.board?.getSceneElements() ?? []).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, text: e.text })),
  );
}

/** A point of the board, on the page. */
async function onBoard(page, x, y) {
  const v = await page.evaluate(() => {
    const s = window.__VERSO_TEST__.board.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, left: s.offsetLeft, top: s.offsetTop };
  });
  return { x: (x + v.scrollX) * v.zoom + v.left, y: (y + v.scrollY) * v.zoom + v.top };
}

/** Nothing beside the file but itself: an edit made in a room is never a
 *  conflict's copy. */
async function noCopies(page, stem) {
  const files = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("list_files", {}));
  return files.filter((f) => f.startsWith(stem) && !/\.(canvas|txt|base)$/.test(f.replace(stem, "")));
}

/** A phone shows a joined window's "entered the note" toast along the top,
 *  over the editor's first line and the board's first row, and the emulated
 *  pointer resting there pauses its clock for good; a click or a drag
 *  aimed under it never lands. These two tests are about the files and the
 *  scene, not the toast (the notifications' own tests are in e2e/), so it
 *  takes no pointer here. */
async function toastsTakeNoPointer(context) {
  await context.addInitScript(() => {
    const style = () => {
      const s = document.createElement("style");
      s.textContent = ".notify-toasts, .notify-toasts * { pointer-events: none !important; }";
      document.documentElement.append(s);
    };
    if (document.documentElement) style();
    else document.addEventListener("DOMContentLoaded", style);
  });
}

/** Two cards, as Obsidian writes a canvas. */
const TWO_CARDS = '{\n\t"nodes":[\n\t\t{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"},\n\t\t{"id":"b","x":400,"y":0,"width":250,"height":60,"type":"text","text":"Beta"}\n\t],\n\t"edges":[]\n}';

test("two windows on one board: a card moved in one and a text added in the other land in both and in the file", async ({ page }) => {
  await toastsTakeNoPointer(page.context());
  await page.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const stem = `Mesa junto ${test.info().project.name}`;
  const path = `${stem}.canvas`;
  await made(page, path, TWO_CARDS);
  await windowOn(page, folder, path);
  const other = await page.context().newPage();
  const otherErrors = watch(other);
  await windowOn(other, folder, path);
  for (const p of [page, other]) await p.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.board.getAppState().width > 0);

  // The first window drags card "b" by its middle, as a person does.
  const b = (await sceneOf(page)).find((e) => e.id === "b");
  const from = await onBoard(page, b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 140, { steps: 8 });
  await page.mouse.up();
  // At the same time the second adds a text, with the text tool.
  const free = await onBoard(other, 0, 300);
  await other.mouse.click(free.x, free.y);
  await other.keyboard.press("t");
  await other.mouse.click(free.x, free.y);
  await other.keyboard.type("olá junto");
  await other.keyboard.press("Escape");

  // Each sees both.
  await expect.poll(async () => (await sceneOf(page)).some((e) => e.type === "text" && e.text === "olá junto"), { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await sceneOf(other)).find((e) => e.id === "b")?.y ?? 0, { timeout: 20_000 }).toBeGreaterThan(50);
  // The room wrote the file, both in it, laid as a board is laid.
  await expect
    .poll(
      async () => {
        const doc = JSON.parse(await onDisk(page, path));
        const moved = doc.nodes.find((n) => n.id === "b").y > 50;
        const text = (doc.verso?.drawing ?? []).some((d) => d.type === "text" && d.text === "olá junto");
        return moved && text;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  expect(await noCopies(page, stem)).toEqual([]);
  for (const p of [page, other]) await expect(p.locator(".conflict:visible")).toHaveCount(0);

  // The other window is there: its pointer, with its name, on this one's
  // board, and its name in words in the tab.
  const spot = await onBoard(other, 100, 100);
  await other.mouse.move(spot.x, spot.y);
  await other.mouse.move(spot.x + 20, spot.y + 10, { steps: 3 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const people = [...window.__VERSO_TEST__.board.getAppState().collaborators.values()];
          return people.some((c) => /admin/i.test(c.username ?? "") && c.pointer && Number.isFinite(c.pointer.x));
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(page.locator(".live-mark:visible").first()).toContainText(/ao vivo, com admin/i);
  await other.close();
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
});

test("two windows on a text file and on a base's settings edit them together, and the files follow", async ({ page }) => {
  await toastsTakeNoPointer(page.context());
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const stem = `Lista junto ${test.info().project.name}`;

  // A text file: what one types, the other sees, without saving.
  const txt = `${stem}.txt`;
  await made(page, txt, "um\n");
  await windowOn(page, folder, txt);
  const other = await page.context().newPage();
  const otherErrors = watch(other);
  await windowOn(other, folder, txt);
  const mine = page.locator(".editor.source .cm-content:visible").first();
  const theirs = other.locator(".editor.source .cm-content:visible").first();
  await expect(mine).toContainText("um");
  await expect(theirs).toContainText("um");
  await mine.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("dois");
  await expect(theirs).toContainText("dois");
  await theirs.click();
  await other.keyboard.press("ControlOrMeta+End");
  await other.keyboard.type(" e três");
  await expect(mine).toContainText("dois e três");
  await expect.poll(() => onDisk(page, txt), { timeout: 20_000 }).toBe("um\ndois e três");

  // A base: a sort added from the view's settings in one window goes into
  // the room, and the other's base has it.
  const base = `${stem}.base`;
  await made(page, base, "views:\n  - type: table\n    name: Tabela\n");
  await windowOn(page, folder, base);
  await windowOn(other, folder, base);
  await page.locator(".base-tool[aria-label='Ordenar']:visible").first().click();
  await page.getByRole("button", { name: "+ Adicionar ordenação" }).click();
  await expect
    .poll(() => other.evaluate(() => [...document.querySelectorAll(".editor.source .cm-content")].map((e) => e.textContent).join("\n")), { timeout: 20_000 })
    .toContain("sort:");
  await expect.poll(() => onDisk(page, base), { timeout: 20_000 }).toContain("sort:");
  expect(await noCopies(page, stem)).toEqual([]);
  for (const p of [page, other]) await expect(p.locator(".conflict:visible")).toHaveCount(0);
  await other.close();
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
});

/* ---------- A board edited hard in three windows at once (ADR 0082 item 12) ---------- */

/** A seeded generator: the seed says every window's run. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

/** For `ms`, a person working on the board as fast as a person does:
 *  dragging, drawing, writing, deleting, rewriting a text. */
async function workOnBoard(page, next, ms) {
  const until = Date.now() + ms;
  const box = await page.locator(".board-canvas, .excalidraw canvas.interactive").first().boundingBox();
  const spot = () => ({ x: box.x + 80 + (next() % Math.max(1, box.width - 160)), y: box.y + 80 + (next() % Math.max(1, box.height - 160)) });
  // An element is pressed only where `spot` draws: its centre on the board,
  // away from the board's edges. One dragged off the board's view has its
  // centre over the window around it — the tree, the tabs, the status
  // bar's "new note" — and a press there opened other files, until the
  // window drew on another board (2026-10-14).
  const inside = (p) => p.x >= box.x + 80 && p.x <= box.x + box.width - 80 && p.y >= box.y + 80 && p.y <= box.y + box.height - 80;
  while (Date.now() < until) {
    const scene = await sceneOf(page);
    const centres = await page.evaluate((els) => {
      const s = window.__VERSO_TEST__.board.getAppState();
      return els.map((e) => ({ x: (e.x + e.width / 2 + s.scrollX) * s.zoom.value + s.offsetLeft, y: (e.y + e.height / 2 + s.scrollY) * s.zoom.value + s.offsetTop }));
    }, scene);
    const live = scene.map((e, i) => ({ ...e, at: centres[i] })).filter((e) => e.type !== "embeddable" && inside(e.at));
    const pick = live.length ? live[next() % live.length] : null;
    const what = next() % 100;
    try {
      if (what < 30 && pick) {
        const at = pick.at;
        await page.mouse.move(at.x, at.y);
        await page.mouse.down();
        await page.mouse.move(at.x + (next() % 160) - 80, at.y + (next() % 160) - 80, { steps: 4 + (next() % 6) });
        await page.mouse.up();
      } else if (what < 55) {
        const a = spot();
        await page.mouse.click(a.x, a.y);
        await page.keyboard.press(next() % 2 ? "r" : "o");
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(a.x + 40 + (next() % 80), a.y + 30 + (next() % 60), { steps: 4 });
        await page.mouse.up();
        await page.keyboard.press("Escape");
      } else if (what < 72) {
        const a = spot();
        await page.mouse.click(a.x, a.y);
        await page.keyboard.press("t");
        await page.mouse.click(a.x, a.y);
        await page.keyboard.type(`t${next() % 1000}`);
        await page.keyboard.press("Escape");
      } else if (what < 87 && pick) {
        const at = pick.at;
        await page.mouse.click(at.x, at.y);
        await page.keyboard.press("Delete");
      } else if (pick && pick.type === "text") {
        const at = pick.at;
        await page.mouse.dblclick(at.x, at.y);
        await page.keyboard.type(` +${next() % 100}`);
        await page.keyboard.press("Escape");
      } else {
        await page.keyboard.press("ControlOrMeta+z");
      }
    } catch {
      // An element gone under the pointer meanwhile: the next change.
    }
    await page.waitForTimeout(next() % 120);
  }
  await page.keyboard.press("Escape");
}

/** What a window holds of the room: the winning version of every element,
 *  the file it would make, and the version of every element it draws. */
function roomOf(page) {
  return page.evaluate(() => {
    const room = window.__VERSO_TEST__.boardRoom;
    const board = window.__VERSO_TEST__.board;
    const ranks = (els) => Object.fromEntries([...els].map((e) => [e.id, `${e.version}:${e.versionNonce}:${e.isDeleted === true}`]).sort(([a], [b]) => (a < b ? -1 : 1)));
    return { room: ranks(room.resolved().values()), scene: ranks(board.getSceneElementsIncludingDeleted()), canvas: room.canvas(), waiting: room.waiting };
  });
}

test("three windows, two engines, edit one board hard for a minute: one board everywhere, and the file holds it", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "one run drives both engines");
  test.setTimeout(240_000);
  await page.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const path = `Mesa em tres ${Date.now()}.canvas`;
  await made(page, path, TWO_CARDS);
  // A second Chromium window, and a WebKit one signed in as the same person.
  const other = await page.context().newPage();
  const browser = await webkit.launch();
  const wk = await browser.newContext({ storageState: await page.context().storageState(), baseURL: info.project.use.baseURL ?? `http://localhost:${process.env.SERVER_PORT ?? 4174}`, viewport: { width: 1400, height: 900 }, locale: "pt-BR" });
  await wk.addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const third = await wk.newPage();
  const windows = [page, other, third];
  const errs = [errors, watch(other), watch(third)];
  for (const p of windows) {
    await windowOn(p, folder, path);
    await p.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.boardRoom);
  }
  const seed = Number(process.env.BOARD_E2E_SEED ?? 20261012);
  console.log(`board three windows: seed ${seed}`);
  await Promise.all(windows.map((p, i) => workOnBoard(p, seeded(seed + i * 7919), 60_000)));
  // Every window still on the board edited: one that drew on another board
  // would hold none of the others' elements.
  for (const p of windows) expect(await p.evaluate(() => window.__VERSO_TEST__.boardRoom.path)).toBe(path);
  // Quiet: every window draws the room's board, and each makes the same file.
  let last = null;
  const quietAt = Date.now();
  const waited = [];
  // On a failure: every element some window holds otherwise than another,
  // as each window's room and board hold it.
  const diff = async () => {
    const full = await Promise.all(windows.map((p) => p.evaluate(() => {
      const room = window.__VERSO_TEST__.boardRoom;
      const pick = (e) => ({ v: e.version, n: e.versionNonce, i: e.index, d: e.isDeleted === true, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), t: e.text });
      return { room: Object.fromEntries([...room.resolved().values()].map((e) => [e.id, pick(e)])), scene: Object.fromEntries(window.__VERSO_TEST__.board.getSceneElementsIncludingDeleted().map((e) => [e.id, pick(e)])), sel: window.__VERSO_TEST__.board.getAppState().selectedElementIds };
    })));
    const ids = new Set(full.flatMap((w) => [...Object.keys(w.room), ...Object.keys(w.scene)]));
    for (const id of ids) {
      const vals = full.flatMap((w) => [JSON.stringify(w.room[id]), JSON.stringify(w.scene[id])]);
      if (new Set(vals).size > 1) console.log(`DIFF ${id}\n  ` + full.map((w, k) => `w${k} room ${JSON.stringify(w.room[id])}\n  w${k} scene ${JSON.stringify(w.scene[id])}`).join("\n  "));
    }
  };
  await expect
    .poll(
      async () => {
        const all = await Promise.all(windows.map(roomOf));
        last = all;
        // How many elements each window still holds otherwise than the
        // first window's room, as the wait goes: where the time goes.
        const off = all.map((w) => Object.keys({ ...w.room, ...w.scene, ...all[0].room }).filter((id) => w.scene[id] !== all[0].room[id] || w.room[id] !== all[0].room[id]).length);
        waited.push(`${((Date.now() - quietAt) / 1000).toFixed(1)}s:${off.join("/")}`);
        const same = all.every((w) => JSON.stringify(w.room) === JSON.stringify(all[0].room) && JSON.stringify(w.scene) === JSON.stringify(w.room));
        return same && all.every((w) => JSON.stringify(w.canvas) === JSON.stringify(all[0].canvas));
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toBe(true)
    .catch(async (e) => {
      console.log(`board three windows: elements still different, per window: ${waited.slice(-6).join(" ")}`);
      await diff();
      throw e;
    });
  console.log(`board three windows: agreed ${((Date.now() - quietAt) / 1000).toFixed(1)} s after the edits stopped (elements still different, per window: ${waited.join(" ")})`);
  // The file on the server's disk: a JSON Canvas, and that board.
  await windows[0].evaluate(async (p) => window.__TAURI_INTERNALS__.invoke("collab_save", { path: p }), path).catch(() => undefined);
  await expect.poll(async () => JSON.stringify(JSON.parse(await onDisk(page, path))), { timeout: 30_000 }).toBe(JSON.stringify(last[0].canvas));
  const file = JSON.parse(await onDisk(page, path));
  const ids = new Set();
  for (const n of file.nodes) {
    expect(typeof n.id === "string" && typeof n.type === "string" && [n.x, n.y, n.width, n.height].every(Number.isFinite)).toBe(true);
    expect(ids.has(n.id)).toBe(false);
    ids.add(n.id);
  }
  const nodes = new Set(ids);
  for (const e of file.edges) {
    expect(nodes.has(e.fromNode) && nodes.has(e.toNode)).toBe(true);
    ids.add(e.id);
  }
  for (const d of file.verso?.drawing ?? []) {
    expect(ids.has(d.id)).toBe(false);
    ids.add(d.id);
  }
  const elements = Object.keys(last[0].room).length;
  console.log(`board three windows: ${elements} elements, ${file.nodes.length} cards, ${(file.verso?.drawing ?? []).length} drawn, file of ${JSON.stringify(file).length} bytes`);
  expect(elements).toBeGreaterThan(10);
  expect(await noCopies(page, path.replace(/\.canvas$/, ""))).toEqual([]);
  await other.close();
  await third.close();
  await wk.close();
  await browser.close();
  for (const e of errs) expect(e).toEqual([]);
});

test("an element another window deletes while this one presses it, selected, is deleted here once let go, and not left selected", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const path = `Mesa premida ${test.info().project.name} ${Date.now()}.canvas`;
  await made(page, path, TWO_CARDS);
  await windowOn(page, folder, path);
  const other = await page.context().newPage();
  const otherErrors = watch(other);
  await windowOn(other, folder, path);
  for (const p of [page, other]) await p.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.board.getAppState().width > 0);
  // A rectangle drawn here, and seen there.
  const a = await onBoard(page, 0, 250);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press("r");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const id = await page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().find((e) => e.type === "rectangle").id);
  await expect.poll(async () => (await sceneOf(other)).some((e) => e.id === id), { timeout: 20_000 }).toBe(true);
  // Selected here, then pressed again, the pointer held: Excalidraw holds
  // the pressed element across the press, and selects it alone when the
  // pointer goes up with no drag.
  const r = (await sceneOf(page)).find((e) => e.id === id);
  const at = await onBoard(page, r.x + 4, r.y + r.height / 2);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate((i) => window.__VERSO_TEST__.board.getAppState().selectedElementIds[i] === true, id)).toBe(true);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // Deleted there meanwhile.
  await other.evaluate((i) => {
    const b = window.__VERSO_TEST__.board;
    b.updateScene({ elements: b.getSceneElementsIncludingDeleted().map((e) => (e.id === i ? { ...e, isDeleted: true, version: e.version + 1, versionNonce: e.versionNonce + 1 } : e)) });
  }, id);
  await expect
    .poll(() => page.evaluate((i) => window.__VERSO_TEST__.boardRoom.resolved().get(i)?.isDeleted === true, id), { timeout: 20_000 })
    .toBe(true);
  await page.waitForTimeout(300);
  await page.mouse.up();
  // Deleted here too once let go, and not selected.
  await expect
    .poll(() => page.evaluate((i) => window.__VERSO_TEST__.board.getSceneElementsIncludingDeleted().find((e) => e.id === i)?.isDeleted === true, id), { timeout: 20_000 })
    .toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate((i) => window.__VERSO_TEST__.board.getAppState().selectedElementIds[i] === true, id)).toBe(false);
  await other.close();
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
});

test("an element another window deletes leaves this window's selection at once, before a key or a pointer reads it", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await openDemo(page);
  const folder = new URL(page.url()).searchParams.get("folder");
  const path = `Mesa selecionada ${test.info().project.name} ${Date.now()}.canvas`;
  await made(page, path, TWO_CARDS);
  await windowOn(page, folder, path);
  await page.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.boardRoom && window.__VERSO_TEST__.board.getAppState().width > 0);
  // A rectangle drawn here, in the room, and selected.
  const a = await onBoard(page, 0, 250);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press("r");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const id = await page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().find((e) => e.type === "rectangle").id);
  await expect.poll(() => page.evaluate((i) => window.__VERSO_TEST__.boardRoom.resolved().has(i), id), { timeout: 20_000 }).toBe(true);
  const r = (await sceneOf(page)).find((e) => e.id === id);
  const at = await onBoard(page, r.x + 4, r.y + r.height / 2);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate((i) => window.__VERSO_TEST__.board.getAppState().selectedElementIds[i] === true, id)).toBe(true);
  // The room hands the board another window's deletion of it; in the same
  // task, before React renders, a key is pressed: what the board reads then
  // must not select the deleted element (Excalidraw: "[NONDELETED]
  // [INVARIANT] getSelectedElements skipping deleted selected element").
  const seen = await page.evaluate((i) => {
    const b = window.__VERSO_TEST__.board;
    const room = window.__VERSO_TEST__.boardRoom;
    const remote = [...room.resolved().values()].map((e) => (e.id === i ? { ...e, isDeleted: true, version: e.version + 1_000_000, versionNonce: 1 } : e));
    for (const pane of room.panes) pane.apply(remote, undefined);
    const selected = b.getAppState().selectedElementIds[i] === true;
    const deleted = b.getSceneElementsIncludingDeleted().find((e) => e.id === i)?.isDeleted === true;
    document.querySelector(".excalidraw")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true }));
    return { selected, deleted };
  }, id);
  expect.soft(seen).toEqual({ selected: false, deleted: true });
  await page.waitForTimeout(500);
  expect(await page.evaluate((i) => window.__VERSO_TEST__.board.getAppState().selectedElementIds[i] === true, id)).toBe(false);
  // The deletion written into the file before the test lets go: a board
  // left with edits not written yet is said to every later window.
  await page.evaluate(async (p) => window.__TAURI_INTERNALS__.invoke("collab_save", { path: p }), path).catch(() => undefined);
  await expect.poll(() => page.evaluate(() => window.__VERSO_TEST__.boardRoom.waiting), { timeout: 20_000 }).toBe(false);
  await expect.poll(async () => JSON.stringify(JSON.parse(await onDisk(page, path))).includes(id), { timeout: 20_000 }).toBe(false);
  expect(errors).toEqual([]);
});
