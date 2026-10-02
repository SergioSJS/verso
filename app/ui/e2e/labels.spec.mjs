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
banner_y: "0.20"
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

  // Check that the file was updated with new banner_y
  await expect.poll(async () => {
    const text = await app.file(note);
    return text.includes("banner_y:");
  }).toBe(true);
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
