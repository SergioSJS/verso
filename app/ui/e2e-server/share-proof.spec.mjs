// Sharing a folder in a browser asks for a fresh proof (ADR 0083 item 6)
// when the session's last one is older than ten minutes (2026-10-26: the
// share's PUT answered 403 `prove_first` and the dialog showed nothing).
// The proof is aged in the server's own database, as no route does it.

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

/** Every session's last proof moved to a long time ago. */
function ageProofs() {
  const base = readFileSync(join(tmpdir(), "verso-e2e-server-base"), "utf8");
  const db = new DatabaseSync(join(base, "data", "server.sqlite"));
  db.exec("UPDATE sessions SET proved_at = 1");
  db.close();
}

async function api(page, method, path, data) {
  const state = await (await page.request.get("/api/state")).json();
  const res = await page.request.fetch(path, { method, data, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

test("sharing with an old proof asks the password; wrong says so; right shares", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const tag = info.project.name;
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  expect((await enter(page)).status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });

  // Ana, invited to no folder.
  const email = `ana-proof-${tag}@verso.test`;
  const made = await api(page, "POST", "/api/admin/invitations", { email });
  const link = made.link ?? made.url ?? "";
  const other = await browser.newContext({ locale: "pt-BR" });
  const ana = await other.newPage();
  await ana.goto(link.startsWith("http") ? link : new URL(link, page.url()).toString());
  await ana.getByLabel("Nome").fill("Ana");
  await ana.getByLabel("Senha nova").fill("a senha da ana");
  await ana.getByRole("button", { name: "Criar conta" }).click();
  await expect(ana).not.toHaveURL(/invite/);

  const folder = await api(page, "POST", "/api/folders", { name: `Mesa prova ${tag}` });
  await page.goto(`/?folder=${folder.id}`);
  await expect(page.locator("#folder")).toHaveText(`Mesa prova ${tag}`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });

  ageProofs();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await page.locator("#tree-root").dispatchEvent("contextmenu", { bubbles: true, cancelable: true });
    await page.getByRole("menuitem", { name: "Compartilhar a pasta toda…" }).click({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const dialog = page.getByRole("dialog", { name: `Pessoas da pasta “Mesa prova ${tag}”` });
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Compartilhar", exact: true }).click();

  // The password is asked; a wrong one is said, in the question.
  const confirm = page.getByRole("dialog", { name: "Confirme que é você" });
  await expect(confirm).toBeVisible();
  await confirm.getByLabel("Senha").fill("senha errada!!");
  await confirm.getByRole("button", { name: "Confirmar" }).click();
  await expect(confirm).toContainText("Senha errada.");
  // The right one: the share goes through.
  await confirm.getByLabel("Senha").fill(ADMIN.password);
  await confirm.getByRole("button", { name: "Confirmar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveText(`Compartilhada com ${email}.`);

  // Cancelling the question shows the server's reason in the share dialog.
  ageProofs();
  await dialog.getByLabel("E-mail").fill(`outra-${email}`);
  await dialog.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirme que é você" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Dar ou mudar um papel pede que você confirme que é você; nada mudou.");
  await other.close();
});
