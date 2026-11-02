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

/** Say a status as the sync would: the event, and the same status as the
 *  answer to `folder_sync`. The section asks for the status whenever it is
 *  drawn and after each of its buttons; the harness's own answer (the
 *  status before the event) landing after the event would undo it. */
async function say(app, status) {
  await app.page.evaluate((st) => {
    const h = window.__harness.core.handlers;
    window.__ownFolderSync ??= h.folder_sync;
    h.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
}

/** The harness answers `folder_sync` with its own status again. */
async function unsay(app) {
  await app.page.evaluate(() => {
    if (!window.__ownFolderSync) return;
    window.__harness.core.handlers.folder_sync = window.__ownFolderSync;
    delete window.__ownFolderSync;
  });
}

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
    h.server_folders = () => ({ folders: [{ id: "f1", name: "Campanha", role: "editor" }], may_create: false });
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
  await say(app, { ...status, state: "paused", deletions: 12, conflicts: [COPY, NESTED, IMAGE, BYTES], refused: [{ path: "video.mov", reason: "quota", message: "" }] });
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
  await unsay(app);

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
  await say(app, { ...running, state: "offline" });
  await expect(app.page.locator(".sync-sentence")).toHaveText(/^Sem conexão\./);
  await expect(row(app).first()).toHaveText("Sincronizar agora");
  await expect(row(app).first()).not.toHaveClass(/primary/);
  // Signed out of the server: a pass cannot work; signing in again, in
  // Servers, is the thing to do — said as a sentence, and the first button.
  await say(app, { ...running, state: "error", problem: "signed_out", message: null });
  await expect(app.page.locator(".sync-problem")).toHaveText(/^O servidor encerrou a sessão deste computador/);
  await expect(row(app)).toHaveText(["Abrir Servidores", "Sincronizar agora", "Desligar…"]);
  await expect(row(app).first()).toHaveClass(/primary/);
  await expect(row(app).nth(1)).not.toHaveClass(/primary/);
  await row(app).first().click();
  await expect(app.page.locator('.settings-nav-item[aria-current="true"]', { hasText: "Servidores" })).toBeVisible();
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  await say(app, running);
  // Another build of the same version on the server: both builds are
  // named, in the window's language (the contracts only in the log).
  const versions = { server_version: "0.7.0-beta.1", server_build: "d416898", server_contract: "0589761", app_version: "0.7.0-beta.1", app_build: "f9a91d6", app_contract: "3f2a9c1" };
  await say(app, { ...running, state: "error", problem: "version", message: "the server runs Verso 0.7.0-beta.1 (build d416898, …)", versions });
  await expect(app.page.locator(".sync-problem")).toHaveText(/o servidor tem outro build do Verso 0\.7\.0-beta\.1 \(servidor d416898, este app f9a91d6\): atualize os dois para o mesmo/i);
  // The status bar says it in a few words and keeps its buttons in view
  // (2026-10-16: the whole sentence pushed them out); the title has it all.
  await expect(app.page.locator("#sync-state")).toHaveText("Erro: o servidor está numa versão diferente deste app: atualize o que estiver atrás");
  await expect(app.page.locator("#sync-state")).toHaveAttribute("title", /servidor d416898, este app f9a91d6/);
  await expect(app.page.locator(".status-keys")).toBeVisible();
  await expect(app.page.locator("#report-bug")).toBeInViewport();
  await say(app, running);
  await unsay(app);

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
    h.server_folders = () => ({
      folders: [
        { id: "f1", name: "Campanha", role: "owner" },
        { id: "f2", name: "Regras", role: "reader" },
      ],
      may_create: false,
    });
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

test("Servers names this computer: the system's name by default, the person's when set", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).click();
  const name = app.page.getByLabel("Nome deste aparelho");
  await expect(name).toHaveValue("");
  await expect(name).toHaveAttribute("placeholder", "Mac de Teste");
  await name.fill("Estúdio da Ana");
  await app.page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(app.page.locator(".srv-device [role=status]")).toHaveText("Salvo.");
  // The name a conflict's copy and the servers take now.
  const info = await app.page.evaluate(() => window.__harness.core.handlers.app_info({}));
  expect(info.device).toBe("Estúdio da Ana");
  // A server that did not answer is said, with what that means.
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    const own = h.set_device_name;
    h.set_device_name = (a) => ({ ...own(a), unreached: ["https://notas.casa"] });
  });
  await app.page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(app.page.locator(".srv-device [role=status]")).toHaveText("Salvo. notas.casa não respondeu agora: lá, o nome antigo fica até você conectar de novo.");
  // Emptied: the system's again.
  await name.fill("");
  await app.page.getByRole("button", { name: "Salvar nome" }).click();
  await expect.poll(() => app.page.evaluate(() => window.__harness.core.handlers.device_name({}))).toEqual({ name: "Mac de Teste", system: "Mac de Teste", custom: false });
  await expect(name).toHaveValue("");
});

test("a conflict's copy whose note was renamed or deleted says so, and offers only to open or discard it", async ({ app }) => {
  await app.open();
  // `Lista.md` was renamed to `Lista nova.md` by the person after the copy
  // was made: the copy has no note to be compared with or kept over.
  const orphan = "Lista (conflito, MacBook Pro de Sérgio, 2026-10-10 20.59).md";
  await app.writeOutside("Lista nova.md", "# Lista\n\nrenomeada\n");
  await app.writeOutside(orphan, "# Lista\n\nversão deste computador\n");
  await app.page.evaluate((copy) => {
    const core = window.__harness.core;
    core.sync = { ...core.sync, on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "idle", conflicts: [copy] };
  }, orphan);
  await openSync(app);
  const item = app.page.locator(".sync-item", { has: app.page.locator(".sync-item-title", { hasText: /^Lista\.md$/ }) });
  await expect(item.locator(".sync-item-why").first()).toHaveText("A nota desta cópia não existe mais (renomeada ou apagada). Abra a cópia, ou descarte-a.");
  // Never said as content that is not text: a failed read is not bytes.
  await expect(item.getByText("Não é texto")).toBeHidden();
  await expect(item.getByRole("button")).toHaveText(["Abrir", "Descartar cópia"]);
  // Open: the copy alone, no read of the note that is not there.
  await item.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect.poll(() => app.calls("read_note").then((c) => c.map((a) => a.path))).toContain(orphan);
  expect((await app.calls("read_note")).map((a) => a.path)).not.toContain("Lista.md");
});

test("a share revoked by its owner turns sync off and says so, in the bar and the section (ADR 0081 item 8)", async ({ app }) => {
  await app.open();
  const on = { ...(await app.page.evaluate(() => window.__harness.core.sync)), on: true, server: "https://notas.casa", folder: "s1", folder_name: "Mesa (Ana)", role: "editor", state: "synced", last: "2026-10-12T20:00:00Z" };
  await say(app, on);
  const bar = app.page.locator("#sync-state");
  await expect(bar).toHaveText("Sincronizada");
  await openSync(app);
  // The owner revokes it: off, with when and why.
  await say(app, { ...on, on: false, state: "off", role: "", last: null, problem: "revoked", message: "the folder's owner revoked the share: sync is off", revoked: "2026-10-12T21:30:00Z" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveText(/^Desligada: quem compartilhou revogou o acesso em /);
  await expect(bar).toHaveClass(/warn/);
  // Said as a notification (ADR 0084 item 7): a warning, whose toast stays
  // until it is closed.
  await expect(app.page.locator("#notify-toasts .notify-toast", { hasText: "Compartilhamento revogado" })).toContainText("Quem compartilhou Mesa (Ana), em notas.casa, revogou o seu acesso em");
  const notice = app.page.locator(".sync-revoked");
  await expect(notice.getByRole("heading", { name: "Compartilhamento revogado" })).toBeVisible();
  await expect(notice).toContainText("A sincronização desta pasta foi desligada; os arquivos continuam neste computador, como estavam.");
  // The form to sync again is below it.
  await expect(app.page.locator(".sync-off .sync-sentence")).toBeVisible();
  await unsay(app);
});
