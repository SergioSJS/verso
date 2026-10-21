// End-to-end tests for make.md labels: stickers, colors, covers (ADR 0060 S1).

import { test, expect } from "./fixtures.mjs";

test("sticker in frontmatter appears in tree row and tab", async ({ app }) => {
  await app.open();
  const note = "StickerNote.md";
  await app.writeOutside(
    note,
    `---
sticker: emoji//1f3b2
color: "#ff5555"
---
# Sticker Note
`,
  );
  await app.folderChanged([note], true);

  const row = app.page.locator(`#notes li[data-path="${note}"] > button`);
  await expect(row).toBeVisible();
  const sticker = row.locator(".entry-sticker");
  await expect(sticker).toHaveText("🎲");
  await expect(row.locator(".row-name")).toHaveCSS("color", "rgb(255, 85, 85)");

  await row.click();
  const tab = app.page.locator(".tab", { hasText: "StickerNote" });
  await expect(tab).toBeVisible();
  await expect(tab.locator(".entry-sticker")).toHaveText("🎲");
});

test("folder note with sticker and color displays on folder row in tree", async ({ app }) => {
  await app.open();
  const folderNote = "MinhaPasta/MinhaPasta.md";
  const child = "MinhaPasta/Item.md";
  await app.writeOutside(
    folderNote,
    `---
sticker: lucide//folder-heart
color: "#10b981"
---
# Minha Pasta
`,
  );
  await app.writeOutside(child, "# Sub item\n");
  await app.folderChanged([folderNote, child], true);

  const summary = app.page.locator('#notes summary[data-folder="MinhaPasta"]');
  await expect(summary).toBeVisible();
  const sticker = summary.locator(".entry-sticker svg");
  await expect(sticker).toBeVisible();
  await expect(summary.locator(".folder-label")).toHaveCSS("color", "rgb(16, 185, 129)");
});

test("note cover banner displays and drag repositioning updates banner_y", async ({ app, page }) => {
  await app.open();
  const note = "CoverNote.md";
  await app.writeOutside(
    note,
    `---
banner: assets/diagrama.svg
banner_y: "20"
---
# Note with Cover
`,
  );
  await app.folderChanged([note], true);

  const row = app.page.locator(`#notes li[data-path="${note}"] > button`);
  await row.click();

  const coverBox = app.page.locator(".note-cover-box");
  await expect(coverBox).toBeVisible();
  const img = coverBox.locator("img.note-cover-img");
  await expect(img).toBeVisible();
  await expect(img).toHaveCSS("object-position", "50% 20%");

  // Reposition
  const btnReposition = coverBox.locator(".note-cover-btn", { hasText: "Reposicionar" });
  await btnReposition.click();

  const hint = coverBox.locator(".note-cover-drag-hint");
  await expect(hint).toBeVisible();

  const box = await coverBox.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50, { steps: 5 });
    await page.mouse.up();
  }

  // Click hint to save position
  await hint.click();
  await expect(hint).toHaveCount(0);

  // A new position, written as make.md writes it: a percentage, as text.
  // The file already holds "20" before the save lands, so the wait is for a
  // number other than the old one, not for any number.
  const bannerY = async () => /^banner_y: "(\d+)"$/m.exec(await app.file(note))?.[1];
  await expect.poll(bannerY).toMatch(/^\d+$/);
  await expect.poll(bannerY).not.toBe("20");
  const dragged = await bannerY();

  // From the keyboard: the slider takes ↓ three times, 5% each, and Enter.
  await btnReposition.click();
  const slider = coverBox.locator(".note-cover-slider");
  await expect(slider).toBeFocused();
  for (let i = 0; i < 3; i++) await slider.press("ArrowDown");
  await slider.press("Enter");
  await expect.poll(async () => /^banner_y: "(\d+)"$/m.exec(await app.file(note))?.[1]).toBe(String(Math.min(100, Number(dragged) + 15)));
});

test("wikilinks show sticker when stickerInLinks is enabled", async ({ app, page }) => {
  await page.addInitScript(() => {
    const raw = localStorage.getItem("verso.settings") || "{}";
    const s = JSON.parse(raw);
    s.stickerInLinks = true;
    localStorage.setItem("verso.settings", JSON.stringify(s));
  });
  await app.open();
  const target = "TargetNote.md";
  const source = "SourceNote.md";
  await app.writeOutside(
    target,
    `---
sticker: emoji//2b50
---
# Target Note
`,
  );
  await app.writeOutside(
    source,
    `# Source Note
See [[TargetNote]] here.
`,
  );
  await app.folderChanged([target, source], true);

  const row = app.page.locator(`#notes li[data-path="${source}"] > button`);
  await row.click();

  // In preview, the wikilink should display the sticker
  const link = app.page.locator('.preview a.wikilink[data-target="TargetNote"]');
  await expect(link).toBeVisible();
  const linkSticker = link.locator(".wikilink-sticker");
  await expect(linkSticker).toBeVisible();
  await expect(linkSticker).toHaveText("⭐");
});

test("sticker picker popover opens, switches tabs, searches, selects sticker and color", async ({ app }) => {
  await app.open();
  const note = "PickerTest.md";
  await app.writeOutside(note, "# Picker Test\n");
  await app.folderChanged([note], true);

  const row = app.page.locator(`#notes li[data-path="${note}"] > button`);
  await row.click();

  const stickerBtn = app.page.locator(".note-sticker-btn");
  await expect(stickerBtn).toBeVisible();
  await stickerBtn.click();

  const popover = app.page.locator(".sticker-picker-popover");
  await expect(popover).toBeVisible();

  // Assert popover is positioned fixed with 320px width per CSS
  const popoverBox = await popover.boundingBox();
  expect(popoverBox).not.toBeNull();
  expect(popoverBox.width).toBeGreaterThanOrEqual(300);

  // Switch to Icons tab
  const iconsTab = popover.locator(".picker-tab", { hasText: /Ícones|Icons/ });
  await iconsTab.click();
  await expect(iconsTab).toHaveClass(/active/);

  // Search for an icon
  const searchInput = popover.locator(".sticker-picker-search");
  await searchInput.fill("heart");

  // Pick first icon in the grid
  const firstItem = popover.locator(".sticker-item-btn").first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();

  // Popover closes after selecting sticker
  await expect(popover).toHaveCount(0);

  // Check file frontmatter updated with sticker
  await expect.poll(async () => {
    const text = await app.file(note);
    return text.includes("sticker: lucide//");
  }).toBe(true);

  // Re-open picker to pick a color
  await stickerBtn.click();
  await expect(popover).toBeVisible();

  const swatch = popover.locator(".color-swatch").first();
  await swatch.click();
  await expect(popover).toHaveCount(0);

  // Check file frontmatter updated with color
  await expect.poll(async () => {
    const text = await app.file(note);
    // A hex, quoted: bare, YAML would read the `#` as a comment.
    return /^color: "#[0-9a-f]{6}"$/m.test(text);
  }).toBe(true);

  // Tab shows the sticker
  const tab = app.page.locator(".tab", { hasText: "PickerTest" });
  await expect(tab.locator(".entry-sticker")).toBeVisible();
});

test("a sticker picked from the picker is written as make.md writes it, and an unknown one falls back", async ({ app }) => {
  await app.open();
  const note = "EmojiPick.md";
  const odd = "OddSticker.md";
  await app.writeOutside(note, "# Emoji\n");
  await app.writeOutside(odd, "---\nsticker: not-a-sticker\n---\n# Odd\n");
  await app.folderChanged([note, odd], true);

  // An unknown value is no sticker: the row keeps its own icon, and the
  // text is not shown in its place (ADR 0060 S1).
  const oddRow = app.page.locator(`#notes li[data-path="${odd}"] > button`);
  await expect(oddRow).toBeVisible();
  await expect(oddRow.locator(".entry-sticker")).toHaveCount(0);
  await expect(oddRow).not.toContainText("not-a-sticker");

  await app.page.locator(`#notes li[data-path="${note}"] > button`).click();
  await app.page.locator(".note-sticker-btn").click();
  const popover = app.page.locator(".sticker-picker-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute("aria-label", "Figurinhas e cores");
  await popover.locator(".sticker-item-btn").first().click();
  await expect(popover).toHaveCount(0);
  await expect.poll(async () => await app.file(note)).toMatch(/^sticker: emoji\/\/[0-9a-f]+(-[0-9a-f]+)*$/m);
});

test("the folder note name setting names the note a folder's labels come from", async ({ app }) => {
  await app.open();
  await app.writeOutside("Docs/README.md", "---\nsticker: emoji//1f4d8\n---\n# Docs\n");
  await app.writeOutside("Docs/Guide.md", "# Guide\n");
  await app.folderChanged(["Docs/README.md", "Docs/Guide.md"], true);
  const folderSticker = app.page.locator('#notes summary[data-folder="Docs"] .entry-sticker');
  await expect(folderSticker).toHaveCount(0);

  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  const field = app.page.getByRole("textbox", { name: "Nome da nota da pasta (vazio: o nome da pasta)" });
  await field.fill("README");
  await field.press("Enter");
  await app.key("Escape");
  await expect(folderSticker).toHaveCount(1);
  // The folder's setting since ADR 0070 items 1–2: written into the
  // folder's `.verso/settings.json`, created by this first change.
  expect((await app.calls("set_folder_settings")).at(-1)).toEqual({
    change: { bookmarks: null, folder_note_name: "README", ignore_build_dirs: null, respect_gitignore: null, periodic: null, oracle: null, recommended_theme: null },
    revision: null,
  });
  expect(JSON.parse(await app.file(".verso/settings.json"))).toEqual({ folderNoteName: "README" });
});
