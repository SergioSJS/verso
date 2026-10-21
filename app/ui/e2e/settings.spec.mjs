// Walkthrough, section 10: the settings and the bug report.

import { test, expect } from "./fixtures.mjs";

test("the settings have the sections the tutorial names", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  // The sections are grouped (Aplicação, Notas & Editor, RPG & Mesa Solo,
  // Rede & Conexões); the page names every one the tutorial points to, in
  // any order, so a new section does not break it.
  const names = [
    "Geral", "Aparência", "Recursos", "Notificações", "Atalhos", "Créditos e agradecimentos",
    "Editor", "Arquivos e links", "Organização", "Notas periódicas", "Lixeira", "Board",
    "Dados e RPG", "Oráculos e Solo RPG", "Fichas e Templates",
    "Terminal e agentes", "Servidores", "Transformar em servidor", "Sincronizar",
  ];
  const shown = await app.page.locator(".settings-nav-item").allTextContents();
  expect(shown.map((s) => s.trim())).toEqual(expect.arrayContaining(names));
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  for (const label of ["Tema", "Temas", "Tamanho da fonte", "Fonte do texto", "Cor de destaque dos títulos", "Largura do texto"]) {
    await expect(app.page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  for (const label of ["Figurinhas", "Capas", "Nome da nota da pasta (vazio: o nome da pasta)", "Ordenar arrastando na árvore"]) {
    await expect(app.page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

// The Editor's line numbers under one heading, the three together (the
// source mode's toggle came later and drew the heading a second time);
// the allowed sites' long explanation under the box, not beside it.
test("each settings group has one heading, and a long note goes under its control", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const heading = app.page.locator(".settings-body .settings-subheading", { hasText: "Números de linha" });
  await expect(heading).toHaveCount(1);
  const after = await heading.evaluate((h) => {
    const out = [];
    for (let n = h.nextElementSibling; n && n.classList.contains("setting"); n = n.nextElementSibling) out.push(n.querySelector(".setting-title")?.textContent ?? "");
    return out;
  });
  expect(after).toHaveLength(3);
  await app.page.locator(".settings-nav-item", { hasText: "Geral" }).click();
  const sites = app.page.getByLabel("Sites permitidos nas notas");
  await expect(sites).toBeVisible();
  const row = app.page.locator(".setting", { has: sites });
  await expect(row.locator(".setting-desc")).not.toContainText("*");
  const note = row.locator(".setting-note");
  await expect(note).toContainText("*");
  // Under the box, as wide as the row, not in the column beside it.
  const [box, said] = await Promise.all([sites.boundingBox(), note.boundingBox()]);
  expect(said.y).toBeGreaterThan(box.y + box.height - 1);
  expect(said.width).toBeGreaterThan(box.width * 0.5);
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  await expect(app.page.getByText("Manter os focos iguais aos do make.md", { exact: true })).toBeVisible();
});

test("the bug report opens with no error of the session", async ({ app }) => {
  await app.open();
  await app.page.locator("#report-bug").click();
  const dialog = app.page.getByRole("dialog", { name: "Relatar problema" });
  await expect(dialog).toBeVisible();
  // The report is composed after the dialog shows: wait for the section,
  // do not read the box once.
  await expect(dialog.locator("textarea")).toHaveValue(/## Erros desta sessão\s+nenhum/);
  // The computer's time and zone, once (the suite runs in São Paulo's,
  // playwright.config.mjs): the log's lines below are in UTC.
  await expect(dialog.locator("textarea")).toHaveValue(/- Hora deste computador: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \(UTC−03:00\)\. .*UTC \(Z\)/);
});

// A long answer beside a setting wraps under it, and the setting's own text
// keeps its width: "Adicionado… Cópia do anterior: …" squeezed the MCP
// row's description into a column a word wide (2026-10-08).
test("adding to Claude Desktop leaves the row readable", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Terminal e agentes" }).click();
  await app.page.getByRole("button", { name: "Adicionar ao Claude Desktop" }).click();
  await app.page.getByRole("button", { name: "Adicionar", exact: true }).click();
  const row = app.page.locator(".setting", { hasText: "Cópia do anterior" });
  await expect(row).toBeVisible();
  const widths = await row.evaluate((r) => ({ text: r.querySelector(".setting-text").getBoundingClientRect().width, row: r.getBoundingClientRect().width }));
  expect(widths.text).toBeGreaterThan(widths.row * 0.35);
});

// One server for all of Verso (ADR 0054, 2026-10-08): the mode changes what
// goes into Claude Desktop, and the open folder stays hidden until marked.
test("the server for all of Verso writes --all and starts with the folder hidden", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Terminal e agentes" }).click();
  await app.page.locator(".setting", { hasText: "Agentes: uma pasta ou todo o Verso" }).locator("select").selectOption("all");
  const visible = app.page.locator(".setting", { hasText: "Esta pasta é visível para agentes" }).locator("input");
  await expect(visible).toBeEnabled();
  await expect(visible).not.toBeChecked();
  await visible.locator("..").click();
  await expect(visible).toBeChecked();
  await expect(app.page.locator(".setting-code").first()).toContainText("claude mcp add verso -- /usr/local/bin/verso mcp --all");
  await app.page.getByRole("button", { name: "Adicionar ao Claude Desktop" }).click();
  // The question on screen: the last dialog shown (the notification
  // centre, hidden, is one of the page's too).
  await expect(app.page.locator(".dialog, [role=dialog]").filter({ visible: true }).last()).toContainText("--all");
});

// What opens last is on top (the maintainer, 2026-10-14: ⌘⇧P with the
// settings open opened the palette behind them): the palette above the
// settings, with the focus, the settings inert under it; Escape closes the
// palette alone, and the settings are alive again.
test("the palette opens above the settings, and Escape closes the palette only", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  // By its class: inert, it is out of the accessibility tree, and so out
  // of reach of a role.
  const settings = app.page.locator(".quick.settings");
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute("aria-label", "Ajustes");
  // The focus on a section of the settings, as after a click on it.
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await app.key("Mod+Shift+p");
  const palette = app.page.locator(".quick.palette");
  const field = palette.getByRole("combobox");
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  // On top: what is under the middle of the palette's field is the field.
  const onTop = await field.evaluate((f) => {
    const r = f.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(at && f.closest(".quick.palette")?.contains(at));
  });
  expect(onTop).toBe(true);
  // The settings under it take no focus and are read by no screen reader.
  await expect(settings).toHaveJSProperty("inert", true);
  await app.page.keyboard.press("Escape");
  await expect(field).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(settings).toHaveJSProperty("inert", false);
  // The focus is back in the settings: where it was, or — WebKit gives a
  // clicked button no focus — their first field.
  expect(await app.page.evaluate(() => document.querySelector(".quick.settings").contains(document.activeElement))).toBe(true);
  // A second Escape closes the settings.
  await app.page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});
