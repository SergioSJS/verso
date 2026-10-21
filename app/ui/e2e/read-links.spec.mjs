// Read links (ADR 0105), the owner's side in the window: "Copiar link de
// leitura…" in a note's menu, the folder's panel, the warning of secrets,
// the tree's mark, a link made and revoked — with the server stood in for by
// the handlers of a test, as shares.spec.mjs does. The window of a visitor
// is tried against a real server, in e2e-server/read-links.spec.mjs; here,
// only what its page does with a link out of what was shared.

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

/** The server, in the handlers: the person owns the folder, the links are
 *  on (or off), and `notes` hold secrets. */
async function asOwner(app, { on = true, secrets = 2 } = {}) {
  await app.open();
  await app.page.evaluate(
    ([on, secrets]) => {
      const h = window.__harness.core.handlers;
      window.__links = { on, secrets, list: [], n: 0 };
      h.share_list = () => [{ id: null, path: "", people: [], attachments: null, missing: false }];
      h.read_link_list = () => ({ enabled: window.__links.on, links: window.__links.list });
      h.read_link_secrets = () => window.__links.secrets;
      h.read_link_create = (a) => {
        const l = window.__links;
        const link = { id: `l${++l.n}`, kind: a["kind"], path: a["path"], made_by: "Sérgio", made_at: 1_760_000_000, expires: a["expires_days"] ? 1_760_000_000 + a["expires_days"] * 86_400 : (a["expires_at"] ?? null), has_password: Boolean(a["password"]), last_opened: null, open: 0 };
        l.list.push(link);
        return { url: `https://notas.casa/r/TOKEN${l.n}`, link };
      };
      h.read_link_revoke = (a) => {
        window.__links.list = window.__links.list.filter((x) => x.id !== a["id"]);
        return null;
      };
    },
    [on, secrets],
  );
  // The window learns it is the owner when the folder is shown again.
  await app.page.locator("#open").click();
  await app.page.getByRole("dialog", { name: "Trocar de pasta" }).getByRole("region", { name: "Neste computador" }).getByRole("button").first().click();
}

async function aNote(app) {
  const files = await app.files();
  const path = files.find((f) => f.endsWith(".md") && !f.includes("/") && !f.startsWith("."));
  expect(path).toBeTruthy();
  return path;
}

test("a note's menu makes a read link: the warning of secrets, the address once, the mark, the revocation asked first", async ({ app, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await asOwner(app);
  const note = await aNote(app);
  const row = app.page.locator(`#notes li[data-path="${note}"] > button`);
  await row.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  const dialog = app.page.getByRole("dialog", { name: /Link de leitura de/ });
  await expect(dialog).toBeVisible();
  // The warning comes before the link is made (item 7); the focus is in
  // the form, and Tab stays in the dialog.
  await expect(dialog).toContainText("2 notas têm segredos; leitores não as verão.");
  await expect(dialog.getByRole("combobox", { name: "Validade" })).toBeFocused();
  await expect(dialog.getByRole("list", { name: "Links ativos" })).toContainText("Nenhum link ativo.");
  // Options of the expiry, and a date only when it is chosen.
  const expiry = dialog.getByRole("combobox", { name: "Validade" });
  await expect(expiry.locator("option")).toHaveText(["Sem validade", "1 dia", "7 dias", "30 dias", "Até uma data"]);
  await expect(dialog.getByLabel("Data de término")).toBeHidden();
  await expiry.selectOption("date");
  await expect(dialog.getByLabel("Data de término")).toBeVisible();
  await dialog.getByRole("button", { name: "Criar link" }).click();
  await expect(dialog.getByRole("status").last()).toHaveText("Escolha a data de término.");
  await expiry.selectOption("7");
  await dialog.getByLabel("Senha (opcional)").fill("abra cadabra");
  await dialog.getByRole("button", { name: "Criar link" }).click();
  // Made: the address shows once, in a field to copy.
  await expect(dialog.getByRole("textbox", { name: "Endereço do link" })).toHaveValue("https://notas.casa/r/TOKEN1");
  await expect(dialog.getByText("O servidor guarda só uma marca do endereço")).toBeVisible();
  const made = (await app.calls("read_link_create")).at(-1);
  expect(made).toMatchObject({ kind: "note", path: note, expiresDays: 7, password: "abra cadabra" });
  const live = dialog.getByRole("list", { name: "Links ativos" });
  await expect(live).toContainText("Criado por Sérgio");
  await expect(live).toContainText("com senha");
  await expect(live).toContainText("ainda não aberto");
  await expect(live.getByRole("button", { name: "Copiar o endereço" })).toBeEnabled();
  // The tree marks the note, named for a screen reader.
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  const mark = row.locator(".read-link-mark");
  await expect(mark).toHaveAttribute("aria-label", "Aberta a quem tiver um link de leitura");
  // Revoking asks first, in the dialog.
  await row.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  const again = app.page.getByRole("dialog", { name: /Link de leitura de/ });
  await again.getByRole("button", { name: /^Revogar o link de nota/ }).click();
  await expect(again.getByText("Revogar este link?")).toBeVisible();
  expect(await app.calls("read_link_revoke")).toHaveLength(0);
  await again.getByRole("button", { name: "Sim, revogar" }).click();
  await expect(again.getByRole("status").last()).toHaveText("Link revogado.");
  expect(await app.calls("read_link_revoke")).toHaveLength(1);
  await expect(again.getByRole("list", { name: "Links ativos" })).toContainText("Nenhum link ativo.");
  await app.page.keyboard.press("Escape");
  await expect(again).toBeHidden();
  await expect(mark).toHaveCount(0);
});

test("the folder's sharing panel opens the folder's read links, and the tree marks the folder", async ({ app }) => {
  await asOwner(app, { secrets: 0 });
  const folders = await app.folders();
  const folder = folders.find((f) => !f.includes("/") && !f.startsWith("."));
  expect(folder).toBeTruthy();
  await app.page.locator(`summary[data-folder="${folder}"]`).click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Link de leitura…" }).click();
  const dialog = app.page.getByRole("dialog", { name: /Link de leitura de/ });
  // No secrets: no warning.
  await expect(dialog.locator(".read-link-warn")).toHaveText("");
  await dialog.getByRole("button", { name: "Criar link" }).click();
  await expect(dialog.getByRole("list", { name: "Links ativos" })).toContainText("Criado por Sérgio");
  await app.page.keyboard.press("Escape");
  await expect(app.page.locator(`summary[data-folder="${folder}"] .read-link-mark`)).toHaveAttribute("aria-label", "Aberta a quem tiver um link de leitura");
  expect((await app.calls("read_link_create")).at(-1)).toMatchObject({ kind: "folder", path: folder, expiresDays: null, expiresAt: null, password: null });
});

test("with the links off the panel says so and offers no form", async ({ app }) => {
  await asOwner(app, { on: false });
  const note = await aNote(app);
  await app.page.locator(`#notes li[data-path="${note}"] > button`).click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  const dialog = app.page.getByRole("dialog", { name: /Link de leitura de/ });
  await expect(dialog).toContainText("Os links de leitura estão desligados neste servidor.");
  await expect(dialog.getByRole("button", { name: "Criar link" })).toBeHidden();
  await app.page.keyboard.press("Escape");
});

test("not the owner, or not on a server: nothing of read links shows", async ({ app }) => {
  await app.open();
  const note = await aNote(app);
  await app.page.locator(`#notes li[data-path="${note}"] > button`).click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: "Copiar link de leitura…" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
});

test("in a read link's window a link to what was not shared is plain text that says so", async ({ app }) => {
  await app.open();
  await app.page.evaluate(() => (document.documentElement.dataset.visitor = "link"));
  await app.writeOutside("Compartilhada.md", "# Compartilhada\n\nVer [[Segredo]] e [[Compartilhada]].\n");
  await app.folderChanged(["Compartilhada.md"], true);
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    const own = h.links;
    h.links = (a) =>
      a["path"] === "Compartilhada.md"
        ? [
            { target: "Segredo", resolved: null, embed: false, heading: null, block: null, alias: null, line: 3, col: 5, outside: true },
            { target: "Compartilhada", resolved: "Compartilhada.md", embed: false, heading: null, block: null, alias: null, line: 3, col: 20, outside: false },
          ]
        : own(a);
  });
  await app.page.locator('#notes li[data-path="Compartilhada.md"] > button').click();
  const plain = app.page.locator(".preview .link-outside");
  await expect(plain).toHaveText(/Segredo/);
  await expect(plain).toContainText("(não compartilhado)");
  // Not a link at all: nothing to follow, nothing made.
  await expect(app.page.locator('.preview a.wikilink[data-target="Segredo"]')).toHaveCount(0);
  await expect(app.page.locator('.preview a.wikilink[data-target="Compartilhada"]')).toHaveCount(1);
  expect(await app.file("Segredo.md")).toBeNull();
});
