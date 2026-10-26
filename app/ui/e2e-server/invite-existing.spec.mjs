// An account that already exists accepts an invitation to another folder
// (ADR 0074 item 4, 2026-10-23): signed in already, one button as
// themselves; not signed in, the sign-in fields on the invitation's page,
// then the join. Against a real `verso serve`.

import { expect, test as base } from "@playwright/test";

import { leakFixtures } from "../e2e/leaks.mjs";

const test = base.extend(leakFixtures);

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };
const PASSWORD = "a senha da ana ana";

async function adminPage(browser) {
  const ctx = await browser.newContext({ locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  const answer = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/signin", { timeout: 30_000 });
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await answer).status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.goto("/admin/folders");
  const adopt = page.getByRole("button", { name: "Registrar: Demo" });
  const listed = page.locator(".console-table a", { hasText: "Demo" });
  await expect(adopt.or(listed)).toBeVisible();
  if (await adopt.isVisible()) await adopt.click();
  await expect(listed).toBeVisible();
  return page;
}

async function makeLink(page, email, role) {
  await page.goto("/admin/invitations");
  const invite = page.locator(".console-content");
  if (email) await invite.getByLabel("E-mail (opcional)").fill(email);
  await invite.getByLabel("Pasta (opcional)").selectOption({ label: "Demo" });
  await invite.getByLabel("Papel").selectOption(role);
  await invite.getByRole("button", { name: "Convidar" }).click();
  const link = (await invite.locator(".web-snippet .setting-code").first().textContent()) ?? "";
  expect(link).toContain("/invite/");
  return link;
}

test("an account joins a second invitation, signed in or signing in on the page", async ({ browser }, info) => {
  const admin = await adminPage(browser);
  const email = `conta-ana-${info.project.name}@verso.test`;
  // The first invitation makes Ana's account.
  const first = await makeLink(admin, email, "reader");
  const ana = await browser.newContext({ locale: "pt-BR" });
  const page = await ana.newPage();
  await page.goto(first);
  // Both paths are offered to someone not signed in.
  await expect(page.getByRole("button", { name: "Já tenho conta — entrar e aceitar" })).toBeVisible();
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("Senha nova").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  // A new account lands in the folder the link carried, not on the empty home.
  await expect(page.locator("#folder")).toHaveText("Demo", { timeout: 30_000 });

  // Signed in as Ana, a second table's invitation is one button.
  const second = await makeLink(admin, "", "editor");
  await page.goto(second);
  await expect(page.getByRole("button", { name: "Entrar na mesa como Ana" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Não sou eu" })).toBeVisible();
  await page.getByRole("button", { name: "Entrar na mesa como Ana" }).click();
  await expect(page).not.toHaveURL(/invite/);
  await expect(page.locator("#folder")).toHaveText("Demo", { timeout: 30_000 });
  // (A used link answers as gone; the unit tests hold that — a visit here would count against this address's link allowance.)

  // Not signed in: sign in on the invitation's own page, then join.
  const third = await makeLink(admin, "", "editor");
  const guest = await browser.newContext({ locale: "pt-BR" });
  const g = await guest.newPage();
  await g.goto(third);
  const block = g.locator(".web-block", { hasText: "Já tenho conta neste servidor" });
  await block.getByLabel("E-mail").fill(email);
  await block.getByLabel("Senha").fill(PASSWORD);
  await block.getByRole("button", { name: "Já tenho conta — entrar e aceitar" }).click();
  await expect(g).not.toHaveURL(/invite/, { timeout: 30_000 });
  await expect(g.locator("#folder")).toHaveText("Demo", { timeout: 30_000 });

  // The administration says who used them.
  await admin.goto("/admin/invitations");
  await expect(admin.locator(".console-table tr", { hasText: "usado" }).filter({ hasText: email }).first()).toBeVisible();
  await admin.context().close();
  await ana.close();
  await guest.close();
});

test("an invitation made for another e-mail is not taken by a signed-in account", async ({ browser }, info) => {
  const admin = await adminPage(browser);
  const email = `conta-bia-${info.project.name}@verso.test`;
  const own = await makeLink(admin, email, "reader");
  const bia = await browser.newContext({ locale: "pt-BR" });
  const page = await bia.newPage();
  await page.goto(own);
  await page.getByLabel("Nome").fill("Bia");
  await page.getByLabel("Senha nova").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  const other = await makeLink(admin, `outra-${info.project.name}@verso.test`, "reader");
  await page.goto(other);
  await expect(page.getByText("Este convite é para", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar na mesa como Bia" })).toHaveCount(0);
  await page.getByRole("button", { name: "Não sou eu" }).click();
  await expect(page.getByRole("button", { name: "Já tenho conta — entrar e aceitar" })).toBeVisible();
  await admin.context().close();
  await bia.close();
});
