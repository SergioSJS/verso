// Secret blocks (ADR 0087): a `[!secret]` callout is drawn for one who may
// write the note with a lock and what it does — "Visível para quem tiver o
// arquivo" in a folder of this computer, where nothing is hidden; "Oculto
// para leitores" on a server, which serves a reader the note without it.
// "Ver como leitor" shows the note as a reader receives it, from the
// core's projection, read-only, with the way back; a note with no secret
// block offers no toggle, and one who only reads is offered none. Opening
// the note writes nothing.

import { test, expect } from "./fixtures.mjs";

const TAVERNA = "# Taverna\n\nO barão governa o distrito norte.\n\n> [!secret] Segredo do mestre\n> O barão já está morto.\n\n- [ ] Visitar o porão\n\nFim da página.\n";

async function folder(app, files, query = "") {
  await app.open(query);
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

test("a writer sees the secret block marked, and the note as a reader sees it", async ({ app, page }) => {
  await folder(app, { "Taverna.md": TAVERNA, "Mercado Novo.md": "# Mercado Novo\n" });
  await app.quickOpen("Taverna");
  const preview = page.locator(".note-sheet > .preview:visible");
  const block = preview.locator(".callout.secret-block");
  await expect(block).toBeVisible();
  // In a folder of this computer nothing is hidden: it says so.
  await expect(block.locator(".secret-badge")).toHaveText("Visível para quem tiver o arquivo");
  const toggle = page.getByRole("button", { name: "Ver como leitor" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const banner = page.getByRole("status").filter({ hasText: "Vendo como um leitor" });
  await expect(banner).toBeVisible();
  await expect(preview).toContainText("O barão governa o distrito norte.");
  await expect(preview).not.toContainText("O barão já está morto.");
  await expect(preview.locator(".callout.secret-block")).toHaveCount(0);
  // Read-only: a task is not checked from here.
  const task = preview.locator('input[type="checkbox"]');
  if ((await task.count()) > 0) {
    await task.first().click({ force: true });
    expect(await app.calls("write_note")).toEqual([]);
  }
  // The way back, by the keyboard.
  const back = page.getByRole("button", { name: "Ver a nota inteira" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(banner).toBeHidden();
  await expect(preview).toContainText("O barão já está morto.");
  await expect(toggle).toBeFocused();
  // Edit mode is the whole note's: the reader's view is left.
  await toggle.click();
  await expect(banner).toBeVisible();
  await app.key("Mod+e");
  await expect(banner).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Another note without a secret block: no toggle.
  await app.quickOpen("Mercado Novo");
  await expect(page.getByRole("button", { name: "Ver como leitor" })).toBeHidden();
  expect(await app.calls("write_note")).toEqual([]);
  expect(await app.file("Taverna.md")).toBe(TAVERNA);
});

test("on a server the block says it is hidden from readers, and a reader is offered no toggle", async ({ app, page }) => {
  await folder(app, { "Taverna.md": TAVERNA }, "?side=server");
  await app.quickOpen("Taverna");
  const block = page.locator(".note-sheet > .preview:visible .callout.secret-block");
  await expect(block.locator(".secret-badge")).toHaveText("Oculto para leitores");
  await expect(page.getByRole("button", { name: "Ver como leitor" })).toBeVisible();
});

test("one who only reads is offered no toggle: the server serves it the projection", async ({ app, page }) => {
  await folder(app, { "Taverna.md": TAVERNA }, "?side=server&role=reader");
  await app.quickOpen("Taverna");
  await expect(page.locator(".note-sheet > .preview:visible")).toContainText("O barão governa");
  await expect(page.getByRole("button", { name: "Ver como leitor" })).toBeHidden();
});
