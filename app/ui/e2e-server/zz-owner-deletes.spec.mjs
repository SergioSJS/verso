// Outside a table only the folder's owner deletes (ADR 0113 section B,
// amended 2026-10-31, B8: "apenas o dono da pasta pode apagar"), and a move
// that takes a file out of a shared folder is a deletion for that share, the
// owner's too. Against a real `verso serve`: the owner and an editor of the
// folder, each in a browser, through the real window — the tree's menu, the
// Delete key, the selection's bar — and the contract the window sends.
// Named to run after server.spec, which reads the admin console's first page.

import { expect, test } from "@playwright/test";

import { account, api, entries, invoke, openFolder, tryInvoke } from "./access-helpers.mjs";

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

async function signedIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/, { timeout: 30_000 });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  for (let i = 0; ; i++) {
    const answer = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/signin" && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const res = await answer;
    if (res.status() !== 429 || i === 10) break;
    const body = await res.json().catch(() => ({}));
    await page.waitForTimeout((body.retry ?? 1) * 1000);
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

test.use({ actionTimeout: 15_000 });

test("an editor is offered no delete, is told why, and moves nothing out of a shared folder; the owner does both", async ({ browser, page: owner }, info) => {
  test.skip(info.project.name === "phone", "the tree and the menus side by side");
  test.setTimeout(240_000);
  const tag = info.project.name;
  await owner.context().addInitScript(() => {
    window.__VERSO_TEST__ = {};
  });
  await signedIn(owner, ADMIN.email, ADMIN.password);
  const folder = await api(owner, "POST", "/api/folders", { name: `Zz apagar ${tag}` });
  await owner.goto(`/?folder=${folder.id}`);
  await expect(owner.locator("#folder")).toHaveText(`Zz apagar ${tag}`, { timeout: 30_000 });
  for (const [name, text] of [
    ["Solta", "# Solta\n"],
    ["Mesa/Carta", "# Carta\n"],
  ]) {
    await invoke(owner, "create_note", { name, text });
  }
  const ed = await account(browser, owner, { email: `ed-b8-${tag}@verso.test`, name: "Edu", password: "a senha do edu", folder: folder.id, role: "editor" });
  const guest = await account(browser, owner, { email: `ana-b8-${tag}@verso.test`, name: "Ana", password: "a senha da ana" });
  await api(owner, "PUT", `/api/folders/${folder.id}/shares`, { path: "Mesa", email: `ana-b8-${tag}@verso.test`, role: "editor" });
  try {
    const page = ed.page;
    await openFolder(page, folder.id);
    const row = page.locator('#notes li[data-path="Solta.md"]');
    await expect(row).toBeVisible({ timeout: 30_000 });

    // The tree's menu: rename, no bin.
    await row.locator("> button").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Renomear", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Mover para a lixeira", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The Delete key: the reason, and the note stays.
    await row.locator("> button").focus();
    await page.keyboard.press("Delete");
    await expect(page.locator("#status")).toContainText("Só o dono da pasta apaga aqui", { timeout: 15_000 });
    expect(await entries(owner)).toContain("Solta.md");

    // The contract says the same, worded as the owner's rule.
    const refused = await tryInvoke(page, "delete_entry", { path: "Solta.md" });
    expect(JSON.stringify(refused.error ?? null)).toContain("only the folder's owner deletes here");

    // Edits, renames and moves are still the editor's; the bin too.
    const renamed = await tryInvoke(page, "rename_entry", { from: "Solta.md", to: "Renomeada.md" });
    expect(renamed.error, JSON.stringify(renamed)).toBeFalsy();
    const moved = await tryInvoke(page, "move_entries", { paths: ["Renomeada.md"], folder: "Mesa" });
    expect(moved.error, JSON.stringify(moved)).toBeFalsy();
    const bin = await tryInvoke(page, "trash_list", {});
    expect(bin.error, JSON.stringify(bin)).toBeFalsy();

    // Out of the shared folder: refused, said why; nothing moved.
    const out = await tryInvoke(page, "move_entries", { paths: ["Mesa/Carta.md"], folder: "" });
    expect(JSON.stringify(out.error ?? null)).toContain("only the folder's owner moves files out of a shared folder");
    expect(await entries(owner)).toContain("Mesa/Carta.md");

    // The owner does both.
    const ownMove = await tryInvoke(owner, "move_entries", { paths: ["Mesa/Carta.md"], folder: "" });
    expect(ownMove.error, JSON.stringify(ownMove)).toBeFalsy();
    const ownDelete = await tryInvoke(owner, "delete_entry", { path: "Carta.md" });
    expect(ownDelete.error, JSON.stringify(ownDelete)).toBeFalsy();
    await expect.poll(async () => (await entries(owner)).includes("Carta.md"), { timeout: 30_000 }).toBe(false);
  } finally {
    for (const c of [ed.context, guest.context]) await c.close().catch(() => {});
  }
});
