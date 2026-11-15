// The English screenshots of the demo vault's server lesson (ADR 0058, B6;
// roadmap V.31): the three pictures `demo-vault/assets/servidor-*.png` show
// in Portuguese, made again in English, same scene and size. Run only with
// SHOTS=<dir>, by `scripts/demo-vault-shots.sh` (Docker, Playwright's Linux
// image) through `node scripts/demo-vault.mjs shots`; never in the suite's
// own run and never on a Mac. Asserts nothing about looks: the author reads
// the pictures. The server's pages (`web.html`) get their API from the
// test, as local-signin.spec.mjs does; the settings page is the harness's.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const OUT = process.env.SHOTS;
test.skip(!OUT, "SHOTS not set");
test.use({ locale: "en-US", timezoneId: "America/Sao_Paulo" });

const webPage = join(fileURLToPath(new URL(".", import.meta.url)), ".site", "web.html");
const ANA = { id: "a1", email: "ana@example.com", name: "Ana Souza", lang: "en", admin: true, mayCreate: true };

/** A server's page: `state` is what `/api/state` says, the rest is `api`'s. */
async function serverPage(page, path, state, api = {}) {
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/state") {
      return route.fulfill({ json: { version: "0.9.0", contract: null, secure: true, web: true, mail: false, passkeys: true, setup: false, account: null, csrf: null, ...state } });
    }
    return api[p] ? route.fulfill({ json: api[p] }) : route.fulfill({ status: 404, json: { error: "not_found", message: p } });
  });
  await page.route((url) => url.pathname === path, (route) => route.fulfill({ path: webPage, contentType: "text/html; charset=utf-8" }));
}

test("first access", async ({ page }) => {
  await page.setViewportSize({ width: 431, height: 638 });
  await serverPage(page, "/setup", { setup: true });
  await page.goto("/setup?token=demo");
  await page.getByLabel("E-mail").fill("ana@example.com");
  await page.getByLabel("Name").fill("Ana Souza");
  await page.getByLabel("New password").fill("a long passphrase");
  await expect(page.getByRole("heading", { name: "First start" })).toBeVisible();
  await page.screenshot({ path: join(OUT, "server-first-access.png") });
});

test("approve a device", async ({ page }) => {
  await page.setViewportSize({ width: 431, height: 679 });
  const asked = { code: "KBZM-JMDH", device: "Verso · Ana's MacBook", address: "203.0.113.42", asked: "2026-10-15T21:04:12Z" };
  await serverPage(page, "/device", { account: ANA, csrf: "x" }, { "/api/device/describe": asked });
  await page.goto("/device");
  await page.getByRole("textbox").first().fill("KBZM-JMDH");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByRole("heading", { name: "Who asked", exact: true })).toBeVisible();
  await page.screenshot({ path: join(OUT, "server-approve-device.png") });
});

test("app connected", async ({ page }) => {
  await page.setViewportSize({ width: 1053, height: 786 });
  await page.goto("/harness.html");
  await page.waitForFunction(() => window.__harness?.ready === true);
  await page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "https://notes.example.com", email: "ana@example.com", name: "Ana Souza", paired: false }];
    // The computer and the open folder named as the Portuguese picture's.
    h.device_name = () => ({ name: "Ana's MacBook", system: "Ana's MacBook", custom: false });
    const was = h.current_folder;
    h.current_folder = (a) => ({ ...was(a), name: "Campaign" });
    h.server_folders = () => ({ folders: [{ id: "f1", name: "Campaign", role: "editor" }], may_create: false });
  });
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".settings-nav-item", { hasText: "Servers" }).click();
  await expect(page.getByRole("region", { name: "notes.example.com" })).toBeVisible();
  await expect(page.getByText("Campaign")).toBeVisible();
  // The page is longer than the box: bring the connected account up under the top.
  await page.getByRole("region", { name: "notes.example.com" }).evaluate((e) => {
    const body = e.closest(".settings-body") ?? e.parentElement;
    body.scrollTop += e.getBoundingClientRect().top - body.getBoundingClientRect().top - 40;
  });
  await page.screenshot({ path: join(OUT, "server-app-connected.png"), clip: await page.locator(".settings-box").evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
});
