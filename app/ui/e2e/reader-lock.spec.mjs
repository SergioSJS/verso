// A folder one only reads (ADR 0076 item 11, amended 2026-10-23): no banner
// at the top of the window — the maintainer: "essa mensagem 'you can only
// read this folder' é inútil, remova, tem jeito melhor de fazer isso: se a
// pessoa tentar editar, … pode ter um cadeado fechado em algum lugar pra
// indicar isso". A closed lock beside the folder's name says it all the
// time, and a short notice near the place of the attempt says it when the
// person tries to change something — once every few seconds, not on every
// key. A note granted to the person edits normally.

import { test, expect } from "./fixtures.mjs";
import { shot } from "./shots.mjs";

const NOTE = "03 - Propriedades";
const notice = (page) => page.locator(".reader-notice");

test("a reader has a closed lock beside the folder's name and no banner; an owner has neither", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  await expect(page.locator(".read-only-line")).toHaveCount(0);
  const lock = page.locator("#open .folder-lock");
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute("role", "img");
  await expect(lock).toHaveAttribute("aria-label", "Você só lê esta pasta");
  await expect(lock).toHaveAttribute("title", "Você só lê esta pasta");
  // Beside the name: on the same row, right after it.
  const name = await page.locator("#folder").boundingBox();
  const mark = await lock.boundingBox();
  expect(mark.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
  expect(Math.abs(mark.y + mark.height / 2 - (name.y + name.height / 2))).toBeLessThan(name.height);
  await expect(notice(page)).toBeHidden();
  await page.locator(".side-head").screenshot({ path: shot("60-cadeado-leitor-desktop") });
  await page.screenshot({ path: shot("61-janela-leitor-desktop") });

  await page.evaluate(() => window.__harness.setRole("editor"));
  await expect(lock).toBeHidden();
  await expect(page.locator(".read-only-line")).toHaveCount(0);
});

test("trying to type in a note one only reads says so near the caret, once, not on every key", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  await app.quickOpen(NOTE);
  const before = await app.file("03 - Propriedades.md");
  await app.key("Mod+e");
  // Asking for Edit is itself an attempt (the next test): let its notice and its quiet time pass.
  await expect(notice(page)).toBeHidden({ timeout: 6000 });
  await page.waitForTimeout(3000);
  const editor = page.locator(".pane.focused .cm-content").first();
  await editor.click();
  await page.keyboard.type("abc");
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveText("Você só lê esta pasta.");
  await expect(notice(page)).toHaveAttribute("role", "status");
  // Near the editor, not at the foot of the window or in the corner.
  const box = await notice(page).boundingBox();
  const host = await editor.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(host.x - 400);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: shot("62-aviso-ao-editar-desktop") });
  expect(await app.file("03 - Propriedades.md")).toBe(before);
  // Gone by itself; typing again soon says nothing again.
  await expect(notice(page)).toBeHidden({ timeout: 6000 });
  await page.keyboard.type("def");
  await page.waitForTimeout(300);
  await expect(notice(page)).toBeHidden();
  expect(await app.file("03 - Propriedades.md")).toBe(before);
});

test("asking for Edit, a new note by key or a rename says so too", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  await app.quickOpen(NOTE);
  // The reading view, then Edit.
  await page.locator(".pane.focused").click({ position: { x: 300, y: 300 } });
  await app.key("Mod+e");
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toBeHidden({ timeout: 6000 });
  // Quiet for a few seconds after the last: wait them out, then ⌘N.
  await page.waitForTimeout(3500);
  await app.key("Mod+n");
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toBeHidden({ timeout: 6000 });
  await page.waitForTimeout(3500);
  const row = page.locator("#notes li[data-path$='.md'] > button:visible").first();
  await row.focus();
  await page.keyboard.press("F2");
  await expect(notice(page)).toBeVisible();
  await expect(page.locator("#notes input")).toHaveCount(0);
});

test("a note granted to a player edits normally, with no notice; the lock follows the note on screen", async ({ app, page }) => {
  await app.open("?vault=empty&table=player&side=server&role=reader");
  for (const [p, text] of Object.entries({ "Aberta.md": "# Aberta\n", "Livre.md": "# Livre\n" })) await app.writeOutside(p, text);
  await app.folderChanged(["Aberta.md", "Livre.md"], true);
  await page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Livre.md", { path: "Livre.md", released: true, secret_name: false, grant: { kind: "none" } });
    c.notes.set("Aberta.md", { path: "Aberta.md", released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await app.folderChanged(["Aberta.md"], true);
  const lock = page.locator("#open .folder-lock");
  // No note open: the folder is only read.
  await expect(lock).toBeVisible();
  await page.locator('#notes li[data-path="Aberta.md"] > button').click();
  // The granted note is theirs to edit: no lock while it is on screen.
  await expect(lock).toBeHidden();
  await app.key("Mod+e");
  const editor = page.locator(".cm-content:visible").first();
  await editor.click();
  await page.keyboard.type("ZZ");
  await expect(editor).toContainText("ZZ");
  await page.waitForTimeout(300);
  await expect(notice(page)).toBeHidden();
  // The other note, only read: the notice.
  await page.locator('#notes li[data-path="Livre.md"] > button').click();
  // A released note they only read: the lock is back.
  await expect(lock).toBeVisible();
  await app.key("Mod+e");
  await page.locator(".cm-content:visible").first().click();
  await page.keyboard.type("ZZ");
  await expect(notice(page)).toBeVisible();
  // Back to the granted note, then no note at all.
  await page.locator('#notes li[data-path="Aberta.md"] > button').click();
  await expect(lock).toBeHidden();
  await page.evaluate(() => window.__harness.emit("campaign-changed", { paths: [] }));
  await expect(lock).toBeHidden();
});
