// Walkthrough, section 11: sharing between people on one Universo (ADR
// 0081). The harness has no server: a test stands in for it by answering
// the share commands, the server's folders and a note's links as a server
// would — the window's part is what is tried here: the folder switcher's
// three groups, the owner's share dialog and the tree's mark, and a link
// out of what was shared.

import { test, expect } from "./fixtures.mjs";

/** The first folder of the tree: the one the owner shares. */
async function aFolder(app) {
  const folders = await app.folders();
  const top = folders.find((f) => !f.includes("/") && !f.startsWith("."));
  expect(top).toBeTruthy();
  return top;
}

test("the folder switcher groups this computer, mine and shared with me", async ({ app }) => {
  await app.open();
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "https://notas.casa", email: "sergio@casa.lan", name: "Sérgio" }];
    h.server_folders = () => [
      { id: "f1", name: "Diário", role: "owner", owner: null, share: false, missing: false },
      { id: "s1", name: "Campanha (Ana)", role: "editor", owner: "Ana", share: true, missing: false },
    ];
    // The server opens it: the harness's folder stands in for the share.
    h.server_open = () => h.current_folder({});
  });
  await app.page.locator("#open").click();
  const box = app.page.getByRole("dialog", { name: "Trocar de pasta" });
  await expect(box).toBeVisible();
  await expect(box.getByRole("region", { name: "Neste computador" })).toContainText("Abrir outra pasta…");
  await expect(box.getByRole("region", { name: "Meus" })).toContainText("Diário");
  const shared = box.getByRole("region", { name: "Compartilhados comigo" });
  await expect(shared).toContainText("Campanha (Ana)");
  await expect(shared).toContainText("edita");
  // A share opens as a folder of its own (item 6).
  await shared.getByRole("button", { name: /Campanha \(Ana\)/ }).click();
  await expect(box).toBeHidden();
  await expect.poll(async () => (await app.calls("server_open")).at(-1)).toMatchObject({ url: "https://notas.casa", folder: "s1" });
  // Escape closes it, the focus back on the button.
  await app.page.locator("#open").click();
  await expect(box).toBeVisible();
  await app.page.keyboard.press("Escape");
  await expect(box).toBeHidden();
});

test("the owner shares a folder: mark, people, roles and removal asked first", async ({ app }) => {
  await app.open();
  const folder = await aFolder(app);
  // Not on a server: nothing of sharing shows.
  const row = app.page.locator(`summary[data-folder="${folder}"]`);
  await row.click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: "Compartilhar…" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  // The server says the person owns it, and the folder is shared with Ana.
  await app.page.evaluate((path) => {
    const h = window.__harness.core.handlers;
    const ana = { id: "a1", name: "Ana", email: "ana@casa.lan", role: "reader" };
    window.__shares = { root: { id: null, path: "", people: [{ id: "o", name: "Sérgio", email: "sergio@casa.lan", role: "owner" }], attachments: null, missing: false }, it: { id: "s1", path, people: [ana], attachments: null, missing: false } };
    h.share_list = () => [window.__shares.root, ...(window.__shares.it.people.length ? [window.__shares.it] : [])];
    h.share_grant = (a) => {
      const it = window.__shares.it;
      const found = it.people.find((p) => p.email === a["email"]);
      if (found) found.role = a["role"];
      else it.people.push({ id: "b1", name: "Bruno", email: a["email"], role: a["role"] });
      return it;
    };
    h.share_revoke = (a) => {
      const it = window.__shares.it;
      it.people = a["account"] ? it.people.filter((p) => p.id !== a["account"]) : [];
      return { ...it, id: it.people.length ? it.id : null };
    };
    h.share_attachments = (a) => ({ ...window.__shares.it, attachments: a["attachments"] });
  }, folder);
  // The window learns it when the folder is shown again: from the
  // switcher, the folder of this computer.
  await app.page.locator("#open").click();
  await app.page.getByRole("dialog", { name: "Trocar de pasta" }).getByRole("region", { name: "Neste computador" }).getByRole("button").first().click();
  const mark = app.page.locator(`summary[data-folder="${folder}"] .share-mark`);
  await expect(mark).toHaveAttribute("aria-label", "compartilhada com 1 pessoa");
  await app.page.locator(`summary[data-folder="${folder}"]`).click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Compartilhar…" }).click();
  const dialog = app.page.getByRole("dialog", { name: /Compartilhar/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("fica com o que baixou");
  await expect(dialog.getByRole("list", { name: "Quem tem acesso" })).toContainText("ana@casa.lan");
  // A role changed by keyboard, named for a screen reader.
  const role = dialog.getByRole("combobox", { name: "Ana, lê; mudar o papel" });
  await role.selectOption("editor");
  await expect(dialog.getByRole("status")).toHaveText("Salvo.");
  // A person added by e-mail.
  await dialog.getByLabel("E-mail").fill("bruno@casa.lan");
  await dialog.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Compartilhada com bruno@casa.lan.");
  await expect(dialog.getByRole("list", { name: "Quem tem acesso" })).toContainText("bruno@casa.lan");
  // Removing asks first, in the dialog.
  await dialog.getByRole("button", { name: "Tirar Ana" }).click();
  await expect(dialog.getByText(/Tirar o acesso de Ana\?/)).toBeVisible();
  expect(await app.calls("share_revoke")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Sim, tirar" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Acesso tirado.");
  const revoked = await app.calls("share_revoke");
  expect(revoked).toEqual([{ path: folder, account: "a1" }]);
  await expect(dialog.getByRole("list", { name: "Quem tem acesso" })).not.toContainText("ana@casa.lan");
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
});

test("a link out of what was shared says so and makes no note", async ({ app }) => {
  await app.open();
  await app.writeOutside("Compartilhada.md", "# Compartilhada\n\nVer [[Segredo]] e [[Compartilhada]].\n\n![[mapa.png]]\n");
  await app.folderChanged(["Compartilhada.md"], true);
  // As a share answers: the name written, nothing else of it.
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    const own = h.links;
    h.links = (a) =>
      a["path"] === "Compartilhada.md"
        ? [
            { target: "Segredo", resolved: null, embed: false, heading: null, block: null, alias: null, line: 3, col: 5, outside: true },
            { target: "Compartilhada", resolved: "Compartilhada.md", embed: false, heading: null, block: null, alias: null, line: 3, col: 20, outside: false },
            { target: "mapa.png", resolved: null, embed: true, heading: null, block: null, alias: null, line: 5, col: 1, outside: true },
          ]
        : own(a);
  });
  await app.page.locator('#notes li[data-path="Compartilhada.md"] > button').click();
  const link = app.page.locator('.preview a.wikilink[data-target="Segredo"]');
  await expect(link).toHaveClass(/outside/);
  await expect(link).toHaveAttribute("title", "Não está no que foi compartilhado com você.");
  await expect(app.page.locator(".preview .embed-outside")).toHaveText("Não está no que foi compartilhado com você.");
  await link.click();
  await expect(app.page.locator("#status")).toHaveText("Não está no que foi compartilhado com você.");
  expect(await app.file("Segredo.md")).toBeNull();
});
