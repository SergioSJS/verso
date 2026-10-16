// Walkthrough, section 10: a new server has no folder, and the person who
// signed the app in must still be able to sync (the maintainer, 2026-10-16:
// "Eu não posso simplesmente sincronizar?"). Settings › Servers offers ONE
// action — "Sincronizar ‘<pasta>’" — that makes the server's folder and
// starts the sync; an empty folder can be made apart. The harness has no
// server: a test signs it in to one.

import { test, expect } from "./fixtures.mjs";

/** Signed in to a server whose folders are `folders`, with or without the
 *  right to make new ones. */
async function signedIn(app, { folders, mayCreate }) {
  await app.page.evaluate(
    ([f, may]) => {
      const h = window.__harness.core.handlers;
      window.__serverFolders = f;
      h.server_accounts = () => [{ url: "https://notas.casa", email: "ana@casa.lan", name: "Ana" }];
      h.server_folders = () => ({ folders: window.__serverFolders, may_create: may });
      h.server_create_folder = ({ name }) => {
        const made = { id: `n${window.__serverFolders.length + 1}`, name, role: "owner" };
        window.__serverFolders = [...window.__serverFolders, made];
        return made;
      };
    },
    [folders, mayCreate],
  );
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).click();
  return app.page.getByRole("region", { name: "notas.casa" });
}

test("an empty server and an account that may make folders: one click syncs the open folder", async ({ app }) => {
  await app.open();
  const server = await signedIn(app, { folders: [], mayCreate: true });
  await expect(server).toContainText("Nenhuma pasta neste servidor ainda.");
  await expect(server).not.toContainText("Peça um convite");
  const send = server.getByRole("button", { name: /^Sincronizar .+ com notas\.casa, numa pasta nova do servidor$/ });
  await expect(send).toHaveText(/^Sincronizar ‘.+’$/);
  await expect(send).toHaveClass(/primary/);
  await send.click();
  // The server's folder is made for it, named like the open one, by the
  // sync's own start; nothing else was asked first.
  await expect.poll(() => app.calls("folder_sync_start").then((c) => c.length)).toBe(1);
  const started = (await app.calls("folder_sync_start"))[0];
  expect(started.url).toBe("https://notas.casa");
  expect(started.folder).toBeNull();
  expect(started.name).toBeTruthy();
  await expect(app.page.locator("#sync-state")).toHaveText("Sincronizada");
  // The button is gone (it syncs now) and focus is on the server, not lost.
  await expect(server.locator(".srv-send")).toHaveCount(0);
  await expect(app.page.getByRole("heading", { name: "notas.casa" })).toBeFocused();
});

test("an account that may not make folders keeps the invitation text and no way to make one", async ({ app }) => {
  await app.open();
  const server = await signedIn(app, { folders: [], mayCreate: false });
  await expect(server).toContainText("Nenhuma pasta para você neste servidor ainda. Peça um convite a quem o administra.");
  await expect(server.locator(".srv-send")).toHaveCount(0);
  await expect(server.getByRole("button", { name: "Criar pasta vazia…" })).toHaveCount(0);
});

test("a server with folders still offers a new one beside the rows, and an empty one apart", async ({ app }) => {
  await app.open();
  const server = await signedIn(app, { folders: [{ id: "f1", name: "Campanha", role: "owner" }], mayCreate: true });
  const folders = server.getByRole("list", { name: "Pastas em notas.casa" });
  await expect(folders.getByRole("listitem")).toHaveCount(1);
  // Pairing with the folder that is there stays the row's own button.
  await expect(folders.getByRole("button", { name: /^Sincronizar .+ com Campanha$/ })).toBeVisible();
  await expect(server.locator(".srv-send")).toBeVisible();

  await server.getByRole("button", { name: "Criar pasta vazia…" }).click();
  const name = server.getByLabel("Nome da pasta nova");
  await expect(name).toBeFocused();
  await name.fill("Diário");
  await server.getByRole("button", { name: "Criar", exact: true }).click();
  await expect.poll(() => app.calls("server_create_folder").then((c) => c.map((x) => x.name))).toEqual(["Diário"]);
  await expect(server.locator("[role=status]").last()).toHaveText("Pasta Diário criada.");
  await expect(folders.getByRole("listitem")).toHaveCount(2);
  await expect(folders.getByRole("listitem").nth(1)).toContainText("Diário");
  // Nothing was synced by making it.
  expect(await app.calls("folder_sync_start")).toHaveLength(0);
});

test("a sync that could not start is said under the button, with a try again", async ({ app }) => {
  await app.open();
  const server = await signedIn(app, { folders: [], mayCreate: true });
  // The folders came (the button is there) before the server goes down:
  // flipping it while the list is still being asked made the list the
  // failure and the button never drawn.
  await expect(server.locator(".srv-send")).toBeVisible();
  // The server out of reach: the host's own answer (src/harness.ts).
  await app.page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  await server.locator(".srv-send").click();
  await expect(server.getByRole("alert")).toContainText("Não foi possível alcançar o servidor localhost:7351");
  await expect(server.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(server.locator(".srv-send")).toBeEnabled();
  // Back: the try again syncs.
  await app.page.evaluate(() => window.__harness.serverDown(null));
  await server.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(app.page.locator("#sync-state")).toHaveText("Sincronizada");
});
