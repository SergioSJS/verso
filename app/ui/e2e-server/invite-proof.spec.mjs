// The game master's invitation in a browser asks to confirm who they are
// (ADR 0083 item 6) when the session's proof is older than ten minutes
// (2026-10-23: "Convidar pede que você confirme que é você; nada foi
// gerado" with no way to confirm). The proof is aged in the server's own
// database, as no route does it.

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

const invoke = (page, cmd, args = {}) => page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

/** Every session's last proof moved to a long time ago. */
function ageProofs() {
  const base = readFileSync(join(tmpdir(), "verso-e2e-server-base"), "utf8");
  const db = new DatabaseSync(join(base, "data", "server.sqlite"));
  db.exec("UPDATE sessions SET proved_at = 1");
  db.close();
}

test("an invitation whose proof is old asks to confirm, then the link is shown", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the panel is side by side");
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  expect((await enter(page)).status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  const state = await (await page.request.get("/api/state")).json();
  const made = await page.request.fetch("/api/folders", { method: "POST", data: { name: `Mesa convite ${info.project.name}` }, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  const folder = await made.json();
  await page.goto(`/?folder=${folder.id}`);
  await expect(page.locator("#folder")).toHaveText(`Mesa convite ${info.project.name}`, { timeout: 30_000 });
  await invoke(page, "campaign_make", { root: "" });

  // The window of the table.
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  await page.getByRole("button", { name: "Abrir a janela da Mesa" }).click();
  const dialog = page.locator(".campaign-overlay");
  await expect(dialog).toBeVisible();

  ageProofs();
  await dialog.getByRole("button", { name: "Gerar link" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirme que é você" });
  await expect(confirm).toBeVisible();
  await confirm.getByLabel("Senha").fill(ADMIN.password);
  await confirm.getByRole("button", { name: "Confirmar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Link do convite" })).toHaveValue(/\/invite\//, { timeout: 15_000 });
  await expect(dialog.getByText("nada foi gerado")).toHaveCount(0);
});
