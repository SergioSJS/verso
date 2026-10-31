// Walkthrough, section 10, steps 10 to 15: notifications in the window
// (ADR 0084). Each
// kind raised through the events the host sends — failure paths included:
// the server down, a revocation — said once per change of its state, kept
// in the centre's list, honoured by its setting, and announced. The
// system's notifications through the plugin's calls the harness answers
// (src/harness/notifications.ts).

import { test, expect } from "./fixtures.mjs";

const PHONE = 760;
const phone = (page) => page.viewportSize().width < PHONE;

const SYNC = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: "2026-10-14T12:00:00Z", message: null, problem: null, versions: null, revoked: null, cloud: null };
const FAILED = { ...SYNC, state: "error", problem: "failed", message: "boom" };

/** Say a sync status as the host would: the event, and the same status as
 *  the answer to `folder_sync` (sync.spec.mjs). */
async function say(app, status) {
  await app.page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
}

const toasts = (page) => page.locator("#notify-toasts .notify-toast, #notify-toasts-top .notify-toast");
const bell = (page) => page.locator(phone(page) ? ".notify-bell-phone" : ".notify-bell-bar");

async function openCentre(app) {
  await bell(app.page).click();
  const centre = app.page.getByRole("dialog", { name: "Notificações" });
  await expect(centre).toBeVisible();
  return centre;
}

async function notifySettings(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Notificações" }).click();
  await expect(app.page.locator(".settings-title")).toHaveText("Notificações");
}

test("a sync that fails is said once, kept in the list, and its coming back takes its place", async ({ app, page }) => {
  await app.open();
  await say(app, SYNC);
  await expect(page.locator("#sync-state")).toHaveText("Sincronizada");
  await expect(toasts(page)).toHaveCount(0);
  await say(app, FAILED);
  const toast = toasts(page);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("A sincronização falhou");
  // The level in a word and a mark, never the colour alone.
  await expect(toast.locator(".notify-level")).toHaveText("Erro");
  await expect(toast.locator(".notify-level svg")).toHaveCount(1);
  // An error is said at once to a screen reader.
  await expect(page.locator("#notify-assertive")).toHaveText(/^Erro: A sincronização falhou\./);
  // The same status again — by the event or by asking — says nothing.
  await say(app, FAILED);
  await page.waitForTimeout(300);
  await expect(toast).toHaveCount(1);
  await expect(bell(page)).toHaveAccessibleName("1 notificação não lida");
  // An error stays until closed or its state changes back.
  await page.waitForTimeout(6500);
  await expect(toast).toHaveCount(1);
  // Back: the error's toast goes, the success says so, and in the list it
  // takes the failure's place.
  await say(app, SYNC);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("A sincronização voltou");
  await expect(toast.locator(".notify-level")).toHaveText("Resolvido");
  await expect(page.locator("#notify-polite")).toHaveText(/^Resolvido: A sincronização voltou\./);
  const centre = await openCentre(app);
  await expect(centre.locator(".notify-item")).toHaveCount(1);
  await expect(centre.locator(".notify-item-title")).toHaveText("A sincronização voltou");
  // Opening the centre marked it read.
  await expect(bell(page)).toHaveAccessibleName("Notificações");
  await page.keyboard.press("Escape");
  // Paused and resumed by the person: nothing comes back, nothing to say.
  await say(app, { ...SYNC, state: "paused" });
  await say(app, SYNC);
  await page.waitForTimeout(300);
  await expect(bell(page)).toHaveAccessibleName("Notificações");
});

test("the toasts: three at most, newest on top; information leaves after 6 s, a hover holds it; a warning stays; Escape closes the focused one", async ({ app, page }) => {
  await app.open();
  for (const n of [1, 2, 3, 4]) {
    await app.emit("share-given", { id: `s${n}`, name: `Pasta ${n}`, role: "editor", by: "Ana", share: true, server: "https://notas.casa" });
  }
  await expect(toasts(page)).toHaveCount(3);
  await expect(toasts(page).locator(".notify-toast-sentence")).toHaveText([
    "Ana compartilhou Pasta 4 com você, em notas.casa (edita).",
    "Ana compartilhou Pasta 3 com você, em notas.casa (edita).",
    "Ana compartilhou Pasta 2 com você, em notas.casa (edita).",
  ]);
  // The fourth is in the list all the same.
  await expect(bell(page)).toHaveAccessibleName("4 notificações não lidas");
  // A pointer over the newest holds it while the others leave.
  await toasts(page).first().hover();
  await page.waitForTimeout(6800);
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText("Pasta 4");
  await page.mouse.move(5, 5);
  await expect(toasts(page)).toHaveCount(0, { timeout: 9000 });

  // A warning stays; the keyboard reaches it and Escape closes it, giving
  // the focus back where it was.
  await app.emit("server-gone", { url: "https://notas.casa", what: "connection", reason: null, address: null });
  await expect(toasts(page)).toHaveCount(1);
  await page.waitForTimeout(6500);
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText("Conexão com o servidor perdida");
  await expect(page.locator("#notify-polite")).toHaveText("Atenção: Conexão com o servidor perdida. A conexão com o servidor caiu; tentando de novo…");
  // Never takes the focus by itself.
  expect(await page.evaluate(() => document.activeElement?.closest("#notify-toasts") === null)).toBe(true);
  await toasts(page).getByRole("button", { name: "Fechar: Conexão com o servidor perdida" }).focus();
  await page.keyboard.press("Escape");
  await expect(toasts(page)).toHaveCount(0);
});

test("toasts sit above Settings and are never made inert: an action is reached with Settings open @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await expect(page.locator(".settings")).toBeVisible();
  await app.emit("share-given", { id: "s9", name: "Mesa", role: "reader", by: "Bia", share: true, server: "https://notas.casa" });
  const toast = toasts(page);
  await expect(toast).toContainText("Bia compartilhou Mesa com você, em notas.casa (só lê).");
  expect(await page.evaluate(() => document.getElementById("notify-toasts").inert)).toBe(false);
  // The action takes Settings to Servers, where a desktop opens a server's
  // folders.
  await toast.getByRole("button", { name: "Ver as pastas" }).click();
  await expect(page.locator(".settings-title")).toHaveText("Servidores");
  await expect(toast).toHaveCount(0);
  if (phone(page)) {
    // On a phone the toasts are at the bottom, above the bottom bar, the
    // whole width but the margins (T.6): never over the first line.
    await app.emit("share-given", { id: "s10", name: "Mapa", role: "editor", by: "Bia", share: true, server: "https://notas.casa" });
    const box = await toasts(page).first().boundingBox();
    const bar = await page.locator(".bottom-bar").boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    expect(box.y).toBeGreaterThan(page.viewportSize().height / 2);
    expect(Math.round(box.x)).toBe(16);
    expect(Math.round(box.width)).toBe(page.viewportSize().width - 32);
  }
});

test("the bell: always there, named with the count, opens the centre; the palette's Notificações too; Limpar empties it @layout", async ({ app, page }) => {
  await app.open();
  const b = bell(page);
  await expect(b).toBeVisible();
  await expect(b).toHaveAccessibleName("Notificações");
  if (phone(page)) {
    // At the top of the pane, where the failed line is.
    await expect(page.locator(".notify-bell-bar")).toBeHidden();
    const box = await b.boundingBox();
    expect(box.y).toBeLessThan(80);
  } else {
    // In the status bar, just before the report button.
    await expect(page.locator(".notify-bell-phone")).toBeHidden();
    expect(await page.evaluate(() => document.querySelector(".notify-bell-bar")?.nextElementSibling?.id)).toBe("report-bug");
  }
  // Empty, it opens to say so.
  let centre = await openCentre(app);
  await expect(centre.locator(".notify-empty")).toHaveText("Nenhuma notificação.");
  await expect(centre.getByRole("button", { name: "Limpar" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(centre).toBeHidden();

  await say(app, FAILED);
  await app.emit("share-given", { id: "s1", name: "Mesa", role: "editor", by: "Ana", share: true, server: "https://notas.casa" });
  await expect(b).toHaveAccessibleName("2 notificações não lidas");
  await expect(b.locator(".notify-count")).toHaveText("2");
  // The palette's command, by its name.
  await app.command("Notificações");
  centre = page.getByRole("dialog", { name: "Notificações" });
  await expect(centre).toBeVisible();
  const items = centre.locator(".notify-item");
  // Newest first, each with its time in the computer's zone and its kind.
  await expect(items.locator(".notify-item-title")).toHaveText(["Uma pasta foi compartilhada com você", "A sincronização falhou"]);
  await expect(items.first().locator("time")).toHaveText(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  await expect(items.first().locator(".notify-item-meta")).toContainText("Compartilhamento");
  await expect(b).toHaveAccessibleName("Notificações");
  // What is under it is inert while it is open.
  await centre.getByRole("button", { name: "Limpar" }).click();
  await expect(centre.locator(".notify-empty")).toBeVisible();
  await expect(page.locator("#status")).toHaveText("Notificações apagadas.");
  await centre.getByRole("button", { name: "Fechar" }).click();
  await expect(centre).toBeHidden();
  // Cleared, the states stay: the same failure is not said again.
  await say(app, FAILED);
  await page.waitForTimeout(300);
  await expect(b).toHaveAccessibleName("Notificações");
});

test("each kind as chosen: Só na lista lists without a toast; Desligado neither, and the status bar still says the state", async ({ app, page }) => {
  await app.open();
  await notifySettings(app);
  const rows = page.locator(".settings-body .setting");
  await expect(rows.locator(".setting-title")).toHaveText(["Sincronização", "Conflitos", "Compartilhamento", "Atualizações", "Cota", "Lixeira", "Presença", "Mesa", "Som da Mesa", "Volume do som da Mesa", "Também nas notificações do sistema"]);
  // Every kind starts as "Aviso e lista", but the Mesa, which starts off (ADR 0107 item 13), and
  // Presença, "Só na lista" (ADR 0084 item 8, 2026-10-28); the Mesa's chime is a sound, not a kind,
  // and starts as the soft one.
  const first = { Mesa: "off", Presença: "list", "Som da Mesa": "soft" };
  for (const s of await rows.locator("select").all()) await expect(s).toHaveValue(first[await s.evaluate((el) => el.closest(".setting")?.querySelector(".setting-title")?.textContent ?? "")] ?? "toast");
  const sync = page.getByRole("combobox", { name: "Sincronização" });
  await sync.selectOption("list");
  // The person's layer: the window's settings, synced to the account on a
  // server.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).notify)).toEqual({ sync: "list" });
  await page.keyboard.press("Escape");
  await say(app, SYNC);
  await say(app, FAILED);
  await expect(bell(page)).toHaveAccessibleName("1 notificação não lida");
  await expect(toasts(page)).toHaveCount(0);
  await notifySettings(app);
  await page.getByRole("combobox", { name: "Sincronização" }).selectOption("off");
  await page.keyboard.press("Escape");
  await say(app, { ...FAILED, state: "offline", problem: "unreachable", message: "notas.casa" });
  await page.waitForTimeout(300);
  await expect(toasts(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("1 notificação não lida");
  // Off is not silence: the status bar says the state.
  await expect(page.locator("#sync-state")).toHaveText("Servidor fora de alcance: notas.casa");
});

test("a window on a server's folder: dropped and back once each; a revoked share is said as a revocation, not as a drop", async ({ app, page }) => {
  await app.open();
  const gone = (what, extra = {}) => app.emit("server-gone", { url: "https://notas.casa", what, reason: null, address: null, ...extra });
  await gone("connection");
  await gone("unreachable", { address: "notas.casa" });
  await gone("connection");
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText("Conexão com o servidor perdida");
  await app.emit("server-back", { url: "https://notas.casa" });
  await expect(toasts(page)).toContainText("Servidor de volta");
  await expect(page.locator("#status")).toHaveText("Conectado ao servidor de novo.");
  const centre = await openCentre(app);
  await expect(centre.locator(".notify-item-title")).toHaveText(["Servidor de volta"]);
  await page.keyboard.press("Escape");

  // The owner revokes the share: said so — in the status line and as a
  // notification — and the connection's end that follows is no drop.
  await gone("folder", { reason: "revoked" });
  const said = "Quem compartilhou esta pasta, em notas.casa, revogou o seu acesso. A janela não mostra mais a pasta do servidor.";
  await expect(page.locator("#status")).toHaveText(said);
  await gone("connection");
  await page.waitForTimeout(300);
  await expect(page.locator("#status")).toHaveText(said);
  await expect(page.getByText("A conexão com o servidor caiu; tentando de novo…")).toHaveCount(0);
  await expect(toasts(page).first()).toContainText("Compartilhamento revogado");
  await expect(toasts(page).first()).toContainText(said);

  // The session ended: an error, with the way to connect again.
  await page.evaluate(() => dispatchEvent(new Event("verso:folder-shown")));
  await gone("session");
  await expect(toasts(page).first()).toContainText("Sessão encerrada");
  await expect(toasts(page).first().getByRole("button", { name: "Ir para Servidores" })).toBeVisible();
});

test("a synced folder's share revoked, its conflict copies and a live room's conflict: each said once", async ({ app, page }) => {
  await app.open();
  await say(app, SYNC);
  const copy = "Sessao (conflito, Mac, 2026-10-14 10.00).md";
  await say(app, { ...SYNC, conflicts: [copy] });
  await say(app, { ...SYNC, conflicts: [copy] });
  await expect(toasts(page)).toHaveCount(1);
  // The notice names the note both sides changed, not its copy (2026-10-23).
  await expect(toasts(page)).toContainText("Os dois lados mudaram Sessao.md; a versão deste computador ficou numa cópia ao lado.");
  await toasts(page).getByRole("button", { name: "Ver os conflitos" }).click();
  await expect(page.locator(".settings-title")).toHaveText("Sincronizar");
  await page.keyboard.press("Escape");
  await app.emit("collab-conflict", { path: "Sessao.md", revision: null });
  await expect(toasts(page).first()).toContainText("Sessao: uma edição foi recusada como conflito; a nota mostra as duas versões.");
  await app.emit("collab-conflict", { path: "Sessao.md", revision: null });
  await page.waitForTimeout(300);
  await expect(toasts(page)).toHaveCount(1);
  await say(app, { ...SYNC, on: false, state: "off", role: "", problem: "revoked", revoked: "2026-10-14T13:00:00Z" });
  await expect(toasts(page).first()).toContainText("Compartilhamento revogado");
  await expect(toasts(page).first()).toContainText("Quem compartilhou Campanha, em notas.casa, revogou o seu acesso em");
});

test("an update: a toast with its two actions, once per version, checked again every 24 h", async ({ app, page }) => {
  await page.clock.install();
  await app.open();
  // The check at start (2.5 s after the window's script) answered first,
  // with the harness's own answer: no new version.
  await expect.poll(() => app.calls("check_for_updates").then((c) => c.length)).toBe(1);
  const info = { current_version: "0.8.2", latest_version: "0.8.3", has_update: true, release_name: "0.8.3", release_notes: "", download_url: null, asset_url: null, asset_name: null, asset_size: null, published_at: null };
  await page.evaluate((i) => {
    window.__harness.core.handlers.check_for_updates = () => i;
  }, info);
  // The next, a day later, finds 0.8.3.
  await page.clock.fastForward("24:00:00");
  await expect(toasts(page)).toContainText("O Verso 0.8.3 está pronto para baixar.");
  await expect(toasts(page).locator(".notify-action")).toHaveText(["Baixar e atualizar", "Ver nos Ajustes"]);
  // Checked again by hand: the same version says nothing more.
  await toasts(page).getByRole("button", { name: "Ver nos Ajustes" }).click();
  await expect(page.locator(".settings-title")).toHaveText("Geral");
  await page.getByRole("button", { name: "Verificar atualizações" }).click();
  await expect(page.locator(".update-card")).toContainText("Nova versão disponível: v0.8.3");
  await page.waitForTimeout(300);
  await expect(toasts(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("1 notificação não lida");
  await expect.poll(() => app.calls("check_for_updates").then((c) => c.length)).toBeGreaterThanOrEqual(2);
});

test("the quota: said once at 90 %, again only after a daily measure found it under 90 % and it passed again", async ({ app, page }) => {
  await app.open();
  await app.emit("folder-quota", { used: 95, quota: 100 });
  await app.emit("folder-quota", { used: 96, quota: 100 });
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText("Pasta quase cheia");
  await expect(page.locator("#status")).toHaveText("Esta pasta usa 95 B de 100 B do espaço que o servidor dá a ela.");
  await toasts(page).getByRole("button", { name: "Fechar: Pasta quase cheia" }).click();
  await app.emit("folder-quota", { used: 97, quota: 100 });
  await page.waitForTimeout(300);
  await expect(toasts(page)).toHaveCount(0);
  // The server never says the folder fell under 90 %: the window measures
  // a folder said near once a day (folder_space, at the opening and every
  // 24 h). Still near: nothing changes.
  const space = (total) =>
    page.evaluate((t) => {
      window.__harness.core.handlers.folder_space = () => ({ total: t, notes: t, attachments: 0, files: 1, index: 0 });
      dispatchEvent(new Event("verso:folder-shown"));
    }, total);
  await space(95);
  await expect.poll(() => app.calls("folder_space").then((c) => c.length)).toBe(1);
  await app.emit("folder-quota", { used: 96, quota: 100 });
  await page.waitForTimeout(300);
  await expect(toasts(page)).toHaveCount(0);
  // Under 90 %: the next crossing is news again.
  await space(40);
  await expect.poll(() => app.calls("folder_space").then((c) => c.length)).toBe(2);
  await app.emit("folder-quota", { used: 92, quota: 100 });
  await expect(toasts(page)).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Esta pasta usa 92 B de 100 B do espaço que o servidor dá a ela.");
});

test("the trash: entries leaving within 3 days said at the folder's opening, once a day, with the way into the trash", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => {
    const bin = window.__harness.core.bin;
    const now = Math.floor(Date.now() / 1000);
    bin.days = 30;
    // Two deleted 28 days ago, leaving in 2 days; one deleted today.
    bin.kept.set(".trash/a.md", { original: "a.md", deleted: now - 28 * 86400, by: null, replaced: false, folder: false });
    bin.kept.set(".trash/b.md", { original: "b.md", deleted: now - 28 * 86400, by: null, replaced: false, folder: false });
    bin.kept.set(".trash/c.md", { original: "c.md", deleted: now, by: null, replaced: false, folder: false });
    dispatchEvent(new Event("verso:folder-shown"));
  });
  await expect(toasts(page)).toContainText("2 itens saem da lixeira em até 3 dias.");
  const asked = (await app.calls("trash_list")).length;
  // The same day: not asked, not said again.
  await page.evaluate(() => dispatchEvent(new Event("verso:folder-shown")));
  await page.waitForTimeout(300);
  expect((await app.calls("trash_list")).length).toBe(asked);
  await expect(toasts(page)).toHaveCount(1);
  await toasts(page).getByRole("button", { name: "Abrir a lixeira" }).click();
  await expect(page.locator(".settings-title")).toHaveText("Lixeira");
});

test("presence: by default someone joining is in the list and rings in the presence row, with no toast; leaving is not told", async ({ app, page }) => {
  const NOTE = "Sessao ao vivo.md";
  await app.open();
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await say(app, SYNC);
  await app.writeOutside(NOTE, "# Sessao\n\num\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Sessao ao vivo");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");
  // Joins in the first seconds after the tab bound its room are the people who were already there (PRESENCE_SETTLE_MS).
  await page.waitForTimeout(5_500);
  await page.evaluate((n) => window.__harness.rooms.present(n, "Bia"), NOTE);
  // No toast anywhere (it covered the chat's box and its last messages); the bell counts it.
  await expect(bell(page)).toHaveAccessibleName("1 notificação não lida");
  await expect(toasts(page)).toHaveCount(0);
  // The newcomer's mark in the presence row is ringed for a moment, and the line is said once.
  await expect(page.locator(".live-who-chip.is-new:visible")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Bia entrou na nota.");
  await expect(page.locator(".live-who-chip.is-new")).toHaveCount(0, { timeout: 6000 });
  await page.evaluate((n) => window.__harness.rooms.absent(n, "Bia"), NOTE);
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");
  const centre = await openCentre(app);
  await expect(centre.locator(".notify-item")).toContainText("Bia entrou na nota");
  await expect(centre.locator(".notify-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // The same person coming back within ten minutes is not news again (PRESENCE_AGAIN_MS).
  await page.evaluate((n) => window.__harness.rooms.present(n, "Bia"), NOTE);
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, com Bia");
  // The centre was opened (it marks everything read) and nothing new came: the bell stays at none unread.
  await expect(bell(page)).toHaveAccessibleName("Notificações");
  await expect(page.locator(".live-who-chip.is-new")).toHaveCount(0);
});

test("presence set back to \"Aviso e lista\": the toast comes back, at the top, with the ring", async ({ app, page }) => {
  const NOTE = "Sessao ao vivo.md";
  await app.open();
  await notifySettings(app);
  await page.getByRole("combobox", { name: "Presença" }).selectOption("toast");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await say(app, SYNC);
  await app.writeOutside(NOTE, "# Sessao\n\num\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Sessao ao vivo");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");
  await page.waitForTimeout(5_500);
  await page.evaluate((n) => window.__harness.rooms.present(n, "Bia"), NOTE);
  await expect(toasts(page)).toContainText("Bia entrou na nota");
  await expect(toasts(page)).toContainText("Bia está em Sessao ao vivo com você.");
  // Presence sits at the top, never over the table's chat and its box at the bottom right.
  const box = await page.locator("#notify-toasts-top").boundingBox();
  expect(box === null || box.y < 200).toBe(true);
});

test("the system's notifications: off at first; refused goes back to off and says why; granted, sent only while the window is behind; a click opens the centre on it", async ({ app, page }) => {
  await app.open();
  await notifySettings(app);
  const box = page.getByRole("checkbox", { name: "Também nas notificações do sistema" });
  await expect(box).not.toBeChecked();
  // Nothing asked before the person turns it on.
  expect(await app.calls("plugin:notification|request_permission")).toHaveLength(0);
  // The desktop asks nothing and says where the system may block them.
  await expect(page.locator(".notify-system-hint")).toContainText("O sistema pode bloqueá-las mesmo assim");
  // A browser's refusal (the desktop's plugin always answers "granted").
  await page.evaluate(() => (window.__harness.notifications.answer = "denied"));
  await box.click();
  await expect(page.locator(".notify-system-said")).toHaveText("O sistema recusou a permissão. Libere as notificações do Verso nos ajustes do sistema (ou do navegador) e ligue de novo.");
  await expect(box).not.toBeChecked();
  expect(await app.calls("plugin:notification|request_permission")).toHaveLength(1);
  // Allowed in the system's settings, and turned on again.
  await page.evaluate(() => {
    window.__harness.notifications.permission = "prompt";
    window.__harness.notifications.answer = "granted";
  });
  await box.click();
  await expect(page.locator(".notify-system-said")).toHaveText("Ligado.");
  await expect(box).toBeChecked();
  await page.keyboard.press("Escape");
  // In front: the toast only.
  await app.emit("share-given", { id: "s1", name: "Mesa", role: "editor", by: "Ana", share: true, server: "https://notas.casa" });
  await expect(toasts(page)).toHaveCount(1);
  expect(await page.evaluate(() => window.__harness.notifications.sent.length)).toBe(0);
  // Behind other windows: the system's too.
  await page.evaluate(() => (document.hasFocus = () => false));
  await app.emit("share-given", { id: "s2", name: "Mapa", role: "reader", by: "Bia", share: true, server: "https://notas.casa" });
  await expect.poll(() => page.evaluate(() => window.__harness.notifications.sent)).toEqual([{ title: "Uma pasta foi compartilhada com você", body: "Bia compartilhou Mapa com você, em notas.casa (só lê)." }]);
  // A kind set to "Só na lista" never reaches the system.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, notify: { quota: "list" } }));
    dispatchEvent(new StorageEvent("storage", { key: "verso.settings" }));
  });
  await app.emit("folder-quota", { used: 99, quota: 100 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__harness.notifications.sent.length)).toBe(1);
  // A click on it (where the system tells the page): the centre, on it.
  await page.evaluate(() => window.__harness.notifications.click());
  const centre = page.getByRole("dialog", { name: "Notificações" });
  await expect(centre).toBeVisible();
  await expect(centre.locator(".notify-here .notify-item-sentence")).toHaveText("Bia compartilhou Mapa com você, em notas.casa (só lê).");
  await expect(centre.locator(".notify-here")).toBeFocused();
});

test("a storage that refuses: the list lives in the window, and the centre says so", async ({ app, page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    const get = Storage.prototype.getItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith("verso.notify.")) throw new DOMException("refused", "QuotaExceededError");
      return set.call(this, k, v);
    };
    Storage.prototype.getItem = function (k) {
      if (String(k).startsWith("verso.notify.")) throw new DOMException("refused", "SecurityError");
      return get.call(this, k);
    };
  });
  await app.open();
  await app.emit("share-given", { id: "s1", name: "Mesa", role: "editor", by: "Ana", share: true, server: "https://notas.casa" });
  await expect(toasts(page)).toHaveCount(1);
  const centre = await openCentre(app);
  await expect(centre.locator(".notify-item")).toHaveCount(1);
  await expect(centre.getByRole("note")).toHaveText("Este computador não está guardando a lista (o armazenamento do navegador recusou): ela some quando a janela fecha.");
});
