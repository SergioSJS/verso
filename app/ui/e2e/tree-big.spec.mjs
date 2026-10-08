// A big folder stays cheap in the tree (measured on 5,000 notes on Windows,
// 2026-10-08): its top-level folders open closed, each row is a few
// elements with no inline SVG, a closed folder lets go of its rows, the
// open note marks one row, and the folders left open come back as left
// (the maintainer, 2026-10-08). Counts, not times: they hold in both
// engines.

import { test, expect } from "./fixtures.mjs";

const folder = (app, name) => app.page.locator(`#notes summary[data-folder="${name}"]`);
// The chevron toggles a folder; its name opens the folder's page.
const toggle = (app, name) => folder(app, name).locator(".chev").click();
const rowsIn = (app, name) => app.page.locator(`#notes summary[data-folder="${name}"] + ul > li[data-path]`);

test("a big folder opens with its top-level folders closed and cheap rows", async ({ app }) => {
  await app.open("?vault=big");
  await expect(app.page.locator("#notes > li")).toHaveCount(37);
  await expect(app.page.locator("#notes li[data-path]")).toHaveCount(0);
  await toggle(app, "pasta-00");
  await expect(rowsIn(app, "pasta-00")).toHaveCount(136);
  const shape = await app.page.evaluate(() => {
    const rows = document.querySelectorAll("#notes li[data-path]");
    let elements = 0;
    for (const r of rows) elements += 1 + r.getElementsByTagName("*").length;
    return { rows: rows.length, elements, svgs: document.querySelectorAll("#notes li[data-path] svg").length };
  });
  expect(shape.svgs).toBe(0);
  // li, button, the icon, the name: four, where there were five.
  expect(shape.elements).toBeLessThanOrEqual(4 * shape.rows);
  // Closed, the folder lets go of its rows.
  await toggle(app, "pasta-00");
  await expect(app.page.locator("#notes li[data-path]")).toHaveCount(0);
});

test("the open note marks one row, and the folders left open come back", async ({ app }) => {
  await app.open("?vault=big");
  await toggle(app, "pasta-03");
  await app.page.locator('#notes li[data-path="pasta-03/nota-3.md"] > button').click();
  await expect(app.page.locator('#notes [aria-current="true"]')).toHaveCount(1);
  await app.page.locator('#notes li[data-path="pasta-03/nota-40.md"] > button').click();
  await expect(app.page.locator('#notes [aria-current="true"]')).toHaveCount(1);
  await expect(app.page.locator('#notes li[data-path="pasta-03/nota-40.md"] > button')).toHaveAttribute("aria-current", "true");
  // The app opened again: pasta-03 as it was left, the others closed.
  await app.open("?vault=big");
  await expect(rowsIn(app, "pasta-03")).toHaveCount(136);
  await expect(app.page.locator("#notes details[open]")).toHaveCount(1);
});

test("a long name ends in an ellipsis inside its row", async ({ app }) => {
  await app.open();
  const long = `${"Uma nota de nome muito comprido ".repeat(4).trim()}.md`;
  await app.writeOutside(long, "# Longa\n");
  await app.folderChanged([long], true);
  const row = app.page.locator(`#notes li[data-path="${long}"] > button`);
  await expect(row).toBeVisible();
  const fit = await row.evaluate((b) => {
    const name = b.querySelector(".row-name");
    const r = b.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    return { inside: n.right <= r.right + 0.5, cut: name.scrollWidth > name.clientWidth };
  });
  // `overflow: clip` without `min-width: 0` let the name spill past the row.
  expect(fit).toEqual({ inside: true, cut: true });
});
