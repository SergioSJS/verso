// The accessibility items decided on 2026-10-21 (docs/review/accessibility.md,
// section 8): the status line's routine save is silent for a screen reader,
// the small targets reach 24 px, the graph's count waits for typing to pause,
// a press on a graph node leaves the view alone, and Alt+Enter follows the
// link under the caret.

import { test, expect } from "./fixtures.mjs";

test("a routine save is shown but not announced; a failure is both", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Nota.md", "# Nota\n\n");
  await app.folderChanged(["Nota.md"], true);
  await app.quickOpen("Nota");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type("texto");
  await expect(page.locator("#status")).toHaveText("Salvo.");
  // The live region exists, is polite, and stayed empty for the save.
  const live = page.locator("#status-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveText("");
  await expect(page.locator("#status")).not.toHaveAttribute("role", /.+/);
  // Anything else the line says is announced.
  await page.evaluate(() => { document.getElementById("status").textContent = "Nada gravado: o arquivo mudou em disco."; });
  await expect(live).toHaveText("Nada gravado: o arquivo mudou em disco.");
});

/** True when, at the corners and edge midpoints of a `size` px box around
 *  the centre of `mark`, the element found is `control` (or inside it). */
async function hitBox(page, control, mark = control, { size = 24, vertical = false } = {}) {
  return page.evaluate(
    ([ctl, mrk, size, vertical]) => {
      const c = document.querySelector(ctl);
      const m = (mrk === ctl ? c : c.querySelector(mrk)) ?? c;
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = size / 2 - 1;
      const pts = vertical ? [[0, -d], [0, d]] : [[-d, -d], [d, -d], [-d, d], [d, d], [0, -d], [0, d], [-d, 0], [d, 0]];
      return pts.map(([dx, dy]) => {
        const hit = document.elementFromPoint(cx + dx, cy + dy);
        return hit === c || c.contains(hit);
      });
    },
    [control, mark, size, vertical],
  );
}

test.describe("targets of 24 px", () => {
  test("a tab's close mark, the status bar's buttons", async ({ app, page }) => {
    await app.open();
    await app.quickOpen("01 - Guia");
    const tab = page.locator(".tab[aria-selected='true']");
    const before = await tab.boundingBox();
    expect(await hitBox(page, ".tab[aria-selected='true'] .tab-close")).toEqual(Array(8).fill(true));
    // The drawing and the bar keep their size.
    const mark = await page.locator(".tab[aria-selected='true'] .tab-close").boundingBox();
    expect(mark.width).toBe(17);
    expect(before.height).toBeLessThan(33);
    for (const id of ["#toggle-side", "#toggle-right", "#report-bug"]) {
      expect(await hitBox(page, id), id).toEqual(Array(8).fill(true));
    }
    for (const sel of [".status-keys button:first-child", ".status-keys button:last-child"]) {
      expect(await hitBox(page, sel, sel, { vertical: true }), sel).toEqual([true, true]);
    }
  });

  test("a list pill's remove mark", async ({ app, page }) => {
    await app.open("?vault=empty");
    await app.writeOutside("Pills.md", "---\ntags: [alfa, beta]\naliases: [um, dois]\n---\n# Pills\n");
    await app.folderChanged(["Pills.md"], true);
    await app.quickOpen("Pills");
    const x = page.locator(".pill-x").first();
    await expect(x).toBeVisible();
    const pill = page.locator(".pill").first();
    const before = await pill.boundingBox();
    expect(await hitBox(page, ".pill-x", ".pill-x .icon")).toEqual(Array(8).fill(true));
    expect(before.height).toBeLessThan(24);
  });
});
