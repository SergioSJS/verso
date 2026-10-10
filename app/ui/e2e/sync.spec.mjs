// Walkthrough, section 10: a folder of this computer syncs with a folder
// of a server (ADR 0079). The harness has no server: a test signs it in to
// one, and says what the sync would (`sync-status`).

import { test, expect } from "./fixtures.mjs";

const COPY = "Sessao (conflito, Mac, 2026-10-10 15.34).md";
// A copy of a copy: named after the first copy, its own group last.
const NESTED = "Sessao (conflito, Mac, 2026-10-10 15.34) (conflict, VERSO-WIN, 2026-10-10 16.42).md";
// Copies that are not text: by their kind, and by their bytes alone.
const IMAGE = "Mapa (conflito, Mac, 2026-10-10 15.34).png";
const BYTES = "dados (conflito, Mac, 2026-10-10 15.34).bin";

/** The texts of the Sync section's top row of buttons. */
const row = (app) => app.page.locator(".sync-top .sync-buttons button");

async function openSync(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
}

test("a folder syncs with a server, says its state, asks before deleting and shows a conflict", async ({ app }) => {
  await app.open();
  await openSync(app);
  // Not signed in to any server: the section says where to begin.
  await expect(app.page.getByText("Conecte a um servidor em Servidores primeiro.")).toBeVisible();
  await expect(app.page.locator("#sync-state")).toBeHidden();

  // Signed in to one, with a folder there.
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "https://notas.casa", email: "ana@casa.lan", name: "Ana" }];
    h.server_folders = () => [{ id: "f1", name: "Campanha", role: "editor" }];
  });
  await app.page.locator(".settings-nav-item", { hasText: "Geral" }).click();
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  const where = app.page.locator(".setting", { hasText: "Pasta no servidor" }).locator("select");
  await expect(where.locator("option")).toHaveText([/^Uma pasta nova: /, "Campanha · edita"]);
  // The space is shown before anything crosses (ADR 0075 item 5).
  await expect(app.page.locator(".sync-space")).toContainText("Esta pasta tem");
  await app.page.getByRole("button", { name: "Sincronizar esta pasta" }).click();
  const bar = app.page.locator("#sync-state");
  await expect(bar).toHaveText("Sincronizada");
  const started = await app.calls("folder_sync_start");
  expect(started).toHaveLength(1);
  expect(started[0].url).toBe("https://notas.casa");
  expect(started[0].folder).toBeNull();
  expect(started[0].name).toBeTruthy();

  // At a glance: all is well, and nothing waits for the person.
  await expect(app.page.locator(".sync-sentence")).toHaveText("Tudo em dia.");
  await expect(app.page.locator(".sync-calm").first()).toContainText("Nada esperando por você");

  // A pass paused for many deletions, with a conflict and a file left out.
  await app.writeOutside("Sessao.md", "# Sessao\n\nversão do servidor\n");
  await app.writeOutside(COPY, "# Sessao\n\nversão deste computador\n");
  await app.writeOutside(NESTED, "# Sessao\n\nversão do Windows\n");
  await app.writeOutside("Mapa.png", "\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR servidor");
  await app.writeOutside(IMAGE, "\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR aqui");
  await app.writeOutside("dados.bin", "\u0000\u0001servidor");
  await app.writeOutside(BYTES, "\u0000\u0002aqui");
  const status = await app.page.evaluate(() => window.__harness.core.sync);
  await app.emit("sync-status", { ...status, state: "paused", deletions: 12, conflicts: [COPY, NESTED, IMAGE, BYTES], refused: [{ path: "video.mov", reason: "quota", message: "" }] });
  await expect(bar).toHaveText("Pausada · 12 a apagar · 4 conflitos");
  await expect(app.page.locator(".sync-sentence")).toHaveText("Parada antes de apagar 12 arquivos.");
  await expect(app.page.getByRole("alert")).toContainText("12 arquivos seriam apagados");
  // Paused before deleting: the red box decides; the row only compares
  // again or turns off — no pause or resume beside a pause.
  await expect(row(app)).toHaveText(["Sincronizar agora", "Desligar…"]);
  await expect(row(app).first()).not.toHaveClass(/primary/);
  // The conflict is under its note, with who made the copy and when.
  const conflict = app.page.locator(".sync-item", { has: app.page.locator(".sync-item-title", { hasText: /^Sessao\.md$/ }) });
  await expect(conflict).toContainText("Cópia de Mac");
  // A copy of that copy is under the first copy, said as the other
  // device's.
  const nested = app.page.locator(".sync-item", { has: app.page.locator(".sync-item-title", { hasText: COPY }) });
  await expect(nested.locator(".sync-copy-label")).toHaveText(/^Cópia de VERSO-WIN, /);
  // A copy that is not text is not compared line by line: said, and the
  // two opened instead — by its kind, and by its bytes.
  for (const [note, copy] of [["Mapa.png", IMAGE], ["dados.bin", BYTES]]) {
    const item = app.page.locator(".sync-item", { has: app.page.locator(".sync-item-title", { hasText: note }) });
    await expect(item.getByText("Não é texto: abra as duas para comparar.")).toBeVisible();
    await expect(item.getByRole("button", { name: "Comparar" })).toHaveCount(0);
    await expect(item.getByRole("button", { name: "Abrir as duas" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Descartar cópia" })).toBeVisible();
    await expect(item.locator(".sync-copy-label")).toHaveAttribute("title", copy);
  }
  // The file left out says why and what to do.
  const quota = app.page.locator(".sync-item", { hasText: "video.mov" });
  await expect(quota).toContainText("não cabe na cota da pasta");
  await expect(quota).toContainText("Libere espaço");
  // History is folded, apart from what needs the person.
  await expect(app.page.locator(".sync-history")).not.toHaveAttribute("open", "");

  // The conflict's difference: the server's version, then the copy.
  await conflict.getByRole("button", { name: "Comparar" }).click();
  await expect(conflict.locator(".diff .del")).toContainText("versão do servidor");
  await expect(conflict.locator(".diff .add")).toContainText("versão deste computador");

  // The deletions go ahead only on an explicit yes.
  await app.page.getByRole("alert").getByRole("button", { name: "Apagar os 12" }).click();
  await app.page.getByRole("alertdialog").getByRole("button", { name: "Apagar os 12" }).click();
  await expect.poll(() => app.calls("folder_sync_confirm").then((c) => c.length)).toBe(1);
  await expect(bar).toHaveText("Sincronizada");

  // Running: sync now is the thing to do, and it may be paused.
  await expect(row(app)).toHaveText(["Sincronizar agora", "Pausar", "Desligar…"]);
  await expect(row(app).first()).toHaveClass(/primary/);
  // Paused by the person: Resume, nothing that would find it paused.
  await app.page.getByRole("button", { name: "Pausar" }).click();
  await expect(app.page.locator(".sync-sentence")).toHaveText("Pausada. Nada cruza até você retomar.");
  await expect(row(app)).toHaveText(["Retomar", "Desligar…"]);
  await expect(row(app).first()).toHaveClass(/primary/);
  await app.page.getByRole("button", { name: "Retomar" }).click();
  await expect(row(app)).toHaveText(["Sincronizar agora", "Pausar", "Desligar…"]);
  expect((await app.calls("folder_sync_pause")).map((c) => c.paused)).toEqual([true, false]);
  // Offline: sync now is a try, not the thing to do.
  const running = await app.page.evaluate(() => window.__harness.core.sync);
  await app.emit("sync-status", { ...running, state: "offline" });
  await expect(app.page.locator(".sync-sentence")).toHaveText(/^Sem conexão\./);
  await expect(row(app).first()).toHaveText("Sincronizar agora");
  await expect(row(app).first()).not.toHaveClass(/primary/);
  // Signed out of the server: a pass cannot work; signing in again, in
  // Servers, is the thing to do — said as a sentence, and the first button.
  await app.emit("sync-status", { ...running, state: "error", problem: "signed_out", message: null });
  await expect(app.page.locator(".sync-problem")).toHaveText(/^O servidor encerrou a sessão deste computador/);
  await expect(row(app)).toHaveText(["Abrir Servidores", "Sincronizar agora", "Desligar…"]);
  await expect(row(app).first()).toHaveClass(/primary/);
  await expect(row(app).nth(1)).not.toHaveClass(/primary/);
  await row(app).first().click();
  await expect(app.page.locator('.settings-nav-item[aria-current="true"]', { hasText: "Servidores" })).toBeVisible();
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  await app.emit("sync-status", running);

  // The bar opens the section; turning sync off asks, then the bar goes.
  await app.key("Escape");
  await bar.click();
  await expect(app.page.locator('.settings-nav-item[aria-current="true"]', { hasText: "Sincronizar" })).toBeVisible();
  await app.page.getByRole("button", { name: "Desligar…" }).click();
  await app.page.getByRole("alertdialog").getByRole("button", { name: "Desligar" }).click();
  await expect(bar).toBeHidden();
  await expect(app.page.getByRole("button", { name: "Sincronizar esta pasta" })).toBeVisible();
});

test("Servers lists each server with its folders, the role in each, and what to do with them", async ({ app }) => {
  await app.open();
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "https://notas.casa", email: "ana@casa.lan", name: "Ana" }];
    h.server_folders = () => [
      { id: "f1", name: "Campanha", role: "owner" },
      { id: "f2", name: "Regras", role: "reader" },
    ];
  });
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).click();
  // Connecting: a labelled field and a button.
  await expect(app.page.getByLabel("Endereço do servidor")).toBeVisible();
  await expect(app.page.getByRole("button", { name: "Conectar" })).toBeVisible();
  // The server: who signs in, and its folders with their roles.
  const server = app.page.getByRole("region", { name: "notas.casa" });
  await expect(server).toContainText("Você entra como Ana · ana@casa.lan");
  const folders = server.getByRole("list", { name: "Pastas em notas.casa" });
  await expect(folders.getByRole("listitem")).toHaveCount(2);
  await expect(folders.getByRole("listitem").first()).toContainText("Campanha");
  await expect(folders.getByRole("listitem").first()).toContainText("dona");
  await expect(folders.getByRole("listitem").nth(1)).toContainText("só lê");
  // This computer's folder may sync with one, said once above the rows;
  // each row's button is short, its name whole for a screen reader. The
  // Sync section opens on the folder chosen.
  await expect(server.locator(".srv-pair")).toHaveCount(1);
  const pair = folders.getByRole("listitem").first().getByRole("button", { name: /^Sincronizar .+ com Campanha$/ });
  await expect(pair).toHaveText("Sincronizar");
  await pair.click();
  await expect(app.page.locator('.settings-nav-item[aria-current="true"]', { hasText: "Sincronizar" })).toBeVisible();
  const where = app.page.locator(".setting", { hasText: "Pasta no servidor" }).locator("select");
  await expect(where).toHaveValue("f1");
});
