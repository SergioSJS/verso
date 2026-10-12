// The window in a browser against a real `verso serve` (ADR 0073, 0074):
// the admin from the environment signs in, registers a folder on the disk
// and works in it over the WebSocket; an invited reader reads and cannot
// write; the pages are in the person's language and the console stays
// clean.

import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

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

async function signIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function signedIn(page, email, password) {
  await signIn(page, email, password);
  await expect(page).not.toHaveURL(/signin/);
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

async function openDemo(page) {
  await page.goto("/");
  // On a phone the side bar is a drawer: opened first (ADR 0076).
  if (!(await page.locator("#open").isVisible()) || (page.viewportSize()?.width ?? 1000) < 760) {
    await page.locator(".bottom-bar .bar-files").click();
  }
  // The folder button opens the folder switcher (ADR 0081 item 5).
  await page.locator("#open").click();
  const dialog = page.getByRole("dialog", { name: "Trocar de pasta" });
  await dialog.getByRole("button", { name: /Demo/ }).click();
  await expect(page.locator("#notes li").first()).toBeVisible();
  await expect(page).toHaveURL(/folder=/);
}

test("the admin signs in, registers a folder and works in it", async ({ page }) => {
  const errors = watch(page);
  await signIn(page, ADMIN.email, "senha errada!!");
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha errados.");
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  // The wrong passwords of the three browsers come from one address: the
  // limiter may ask for a second's wait, and the person tries again.
  await expect(async () => {
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).not.toHaveURL(/signin/, { timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await demoRegistered(page);
  await openDemo(page);
  await expect(page.locator("#folder")).toHaveText("Demo");
  // The owner writes: no reader's line.
  await expect(page.locator(".read-only-line")).toBeHidden();
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
  await expect(reader.getByLabel("E-mail")).toHaveValue(email);
  await reader.getByLabel("Nome").fill("Leitor");
  await reader.getByLabel("Senha nova").fill("a senha do leitor");
  await reader.getByRole("button", { name: "Criar conta" }).click();
  await expect(reader).not.toHaveURL(/invite/);
  // No folder yet: the start page says to choose one of the server's
  // folders, not the desktop's keys, and no role is said.
  await expect(reader.getByRole("heading", { name: "Escolha uma pasta deste servidor." })).toBeVisible();
  await expect(reader.getByRole("button", { name: "Escolher uma pasta" })).toBeVisible();
  await expect(reader.locator(".lesson .keys")).toHaveCount(0);
  await expect(reader.locator(".web-notice", { hasText: "Você só lê" })).toHaveCount(0);
  await expect(reader.locator(".read-only-line")).toBeHidden();
  await expect(reader.locator("html")).not.toHaveAttribute("data-role", "reader");
  await openDemo(reader);
  await expect(reader.locator("html")).toHaveAttribute("data-role", "reader");
  // With the folder on screen, the reader is told once.
  await expect(reader.locator(".web-notice")).toHaveText("Você só lê esta pasta.");
  await expect(reader.locator(".read-only-line")).toBeVisible();
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
  if ((other.viewportSize()?.width ?? 1000) < 760) await other.locator(".bottom-bar .bar-files").click();
  await other.locator("#notes").getByRole("button", { name: `${name}.md` }).click();
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
  expect(m.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
  const page = await (await request.get("/")).text();
  expect(page).toContain('rel="manifest"');
});

test("signing in follows only this server's own paths", async ({ page }) => {
  // `/\host` is another origin to the browser's URL parser.
  await page.goto("/signin?next=" + encodeURIComponent("/\\evil.example/x"));
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  await expect(async () => {
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).not.toHaveURL(/signin/, { timeout: 1500 });
  }).toPass({ timeout: 15000 });
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
  // Its page in the console: the session listed, ended with a confirm.
  await page.goto("/admin/accounts");
  await page.locator(".console-table a", { hasText: `Perdido ${project}` }).click();
  await expect(page.getByRole("heading", { name: `Perdido ${project}`, level: 1 })).toBeVisible();
  await expect(page.locator(".console-list li")).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Encerrar sessões e tokens" }).click();
  await expect(page.locator(".web-said")).toHaveText("1 sessão encerrada · 0 tokens revogados.");
  await expect(page.getByRole("button", { name: "Encerrar sessões e tokens" })).toBeDisabled();
  // The lost browser is signed out; the admin's own session stays.
  await lost.goto("/");
  await expect(lost).toHaveURL(/\/signin/);
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
  const email = `ana-${tag}@verso.test`;
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
  await dialog.getByLabel("Papel").selectOption("editor");
  await dialog.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(`Compartilhada com ${email}.`);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(folder.locator(".share-mark")).toHaveAttribute("aria-label", "compartilhada com 1 pessoa");
  // Ana finds it under "Shared with me", named after the folder and its
  // owner, and it opens as a folder of its own: its notes, nothing above.
  await ana.goto("/");
  if ((ana.viewportSize()?.width ?? 1000) < 760) await ana.locator(".bottom-bar .bar-files").click();
  await ana.locator("#open").click();
  const switcher = ana.getByRole("dialog", { name: "Trocar de pasta" });
  const shared = switcher.getByRole("region", { name: "Compartilhados comigo" });
  await shared.getByRole("button", { name: /Personagens \(Admin\)/ }).click();
  await expect(ana.locator("#folder")).toHaveText("Personagens (Admin)");
  await expect(ana.locator("#notes")).toContainText("Lia Torres.md");
  await expect(ana.locator("#notes")).not.toContainText("00 - Bem-vindo");
  // And back: Ana, let make folders, shares hers whole with the admin to
  // read.
  const anaAccount = (await (await ana.request.get("/api/me")).json()).account;
  await asPage(page, "PATCH", `/api/admin/accounts/${anaAccount.id}`, { admin: false, mayCreate: true });
  const mine = await asPage(ana, "POST", "/api/folders", { name: `Ana ${tag}` });
  await asPage(ana, "PUT", `/api/folders/${mine.id}/shares`, { path: "", email: ADMIN.email, role: "reader" });
  if ((page.viewportSize()?.width ?? 1000) < 760) await page.locator(".bottom-bar .bar-files").click();
  await page.locator("#open").click();
  const back = page.getByRole("dialog", { name: "Trocar de pasta" }).getByRole("region", { name: "Compartilhados comigo" });
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
