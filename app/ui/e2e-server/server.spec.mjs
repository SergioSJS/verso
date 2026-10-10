// The window in a browser against a real `verso serve` (ADR 0073, 0074):
// the admin from the environment signs in, registers a folder on the disk
// and works in it over the WebSocket; an invited reader reads and cannot
// write; the pages are in the person's language and the console stays
// clean.

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
  await page.locator("#open").click();
  const dialog = page.getByRole("dialog", { name: "Abrir pasta" });
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
  await openDemo(reader);
  await expect(reader.locator("html")).toHaveAttribute("data-role", "reader");
  // The invitation is used, by whom.
  await page.goto("/admin/invitations");
  await expect(invite.locator(".console-table tr", { hasText: email })).toContainText("usado");
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

test("the administration console pages its lists and sets a folder's quota", async ({ page }) => {
  const errors = watch(page);
  await signedIn(page, ADMIN.email, ADMIN.password);
  await demoRegistered(page);
  await page.goto("/admin/folders");
  await page.locator(".console-table a", { hasText: "Demo" }).click();
  await expect(page.getByRole("heading", { name: "Demo", level: 1 })).toBeVisible();
  await page.getByLabel("Cota").fill("1GB");
  await page.getByRole("button", { name: "Definir" }).click();
  await expect(page.getByRole("meter")).toHaveAttribute("aria-label", /de 1 GB/);
  await page.getByRole("button", { name: "Sem limite" }).click();
  await expect(page.getByRole("meter")).toHaveCount(0);
  // The log has it, filtered by action.
  await page.goto("/admin/audit");
  await page.getByLabel("Ação", { exact: true }).selectOption("folder_quota");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.locator(".console-table tbody tr").first()).toContainText("folder_quota");
  // Settings › Account shows the way here; Settings has no administration.
  await page.goto("/account");
  await expect(page.locator(".settings-body a[href='/admin']")).toBeVisible();
  await expect(page.locator(".settings-nav-item", { hasText: "Administração" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
