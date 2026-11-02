// A note above 16 MiB stays out of the index (spec Q17, decided 2026-10-31;
// `INDEX_MOST` in the core): the note says so above its text, so that a
// search or a backlink that does not find it is understood.

import { test, expect } from "./fixtures.mjs";

const MiB = 1024 * 1024;
// Seventeen long lines: the size of a note, not the count of its lines.
const bigText = (mib) => Array.from({ length: mib }, () => "a".repeat(MiB - 1)).join("\n");

test("a note past 16 MiB says it is not in the index; a smaller one says nothing", async ({ app, page }) => {
  test.setTimeout(120_000);
  await app.open("?vault=empty");
  await app.writeOutside("Pequena.md", "# Pequena\n\ntexto\n");
  await app.writeOutside("Enorme.md", bigText(17));
  await app.folderChanged(["Pequena.md", "Enorme.md"], true);
  await page.locator('#notes li[data-path="Pequena.md"] > button').click();
  await expect(page.locator(".tab", { hasText: "Pequena" })).toHaveCount(1);
  await expect(page.locator(".sheet .flags")).not.toContainText("16 MiB");
  await page.locator('#notes li[data-path="Enorme.md"] > button').click();
  await expect(page.locator(".sheet .flags")).toContainText("fora do índice", { timeout: 60_000 });
  await expect(page.locator(".sheet .flags")).toContainText("16 MiB");
});
