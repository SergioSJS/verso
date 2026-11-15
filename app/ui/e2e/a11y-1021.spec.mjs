// The accessibility items decided on 2026-10-21 (docs/review/accessibility.md,
// section 8): the status line's routine save is silent for a screen reader,
// the small targets reach 24 px, the graph's count waits for typing to pause,
// a press on a graph node leaves the view alone, and Alt+Enter follows the
// link under the caret.

import { test, expect, modeOn } from "./fixtures.mjs";

test("a routine save is shown but not announced; a failure is both", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Nota.md", "# Nota\n\n");
  await app.folderChanged(["Nota.md"], true);
  await app.quickOpen("Nota");
  await modeOn(page, "Editar");
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
        return hit === c || c.contains(hit) ? true : `${dx},${dy}: ${hit?.tagName}.${hit?.className?.baseVal ?? hit?.className}`;
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

test.describe("the graph", () => {
  test("the count is announced after typing pauses, drawn at once", async ({ app, page }) => {
    await app.open();
    await app.command("Grafo do cofre");
    const live = page.locator(".graph-head .sr-only[role='status']");
    await expect(live).toContainText(/\d/);
    const first = await live.textContent();
    await page.locator(".graph-filter").pressSequentially("guia", { delay: 40 });
    // The drawn count changes at once; the announced one waits.
    await expect(page.locator(".graph-count")).not.toHaveText(first);
    expect(await live.textContent()).toBe(first);
    await expect(live).not.toHaveText(first, { timeout: 4000 });
    expect(await live.textContent()).toBe(await page.locator(".graph-count").textContent());
  });

  test("a press on a node at the view's edge does not move the view", async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await app.open();
    await app.command("Grafo do cofre");
    const svg = page.locator("svg.graph");
    await expect(page.locator("svg.graph .node circle").first()).toBeVisible();
    const view = () => page.locator("svg.graph > g").first().getAttribute("transform");
    // Pan the graph until its leftmost node is 10 px from the view's edge.
    const box = await svg.boundingBox();
    const leftmost = () => page.locator("svg.graph .node circle").evaluateAll((cs) => Math.min(...cs.map((c) => c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2)));
    for (let i = 0; i < 6; i++) {
      const want = box.x + 10 - (await leftmost());
      if (Math.abs(want) < 2) break;
      // One drag inside the view; a longer pan takes another.
      const room = box.width - 24;
      const dx = Math.max(-room, Math.min(room, want));
      const from = { x: dx < 0 ? box.x + box.width - 8 : box.x + 8, y: box.y + 8 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + dx, from.y, { steps: 6 });
      await page.mouse.up();
    }
    const target = page.locator("svg.graph .node circle").filter({}).evaluateAll((cs) => {
      let best = null;
      for (const c of cs) {
        const r = c.getBoundingClientRect();
        const x = r.left + r.width / 2;
        if (!best || x < best.x) best = { x, y: r.top + r.height / 2 };
      }
      return best;
    });
    const at = await target;
    expect(at.x - box.x).toBeLessThan(24);
    const before = await view();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const during = await view();
    await page.mouse.up();
    expect(during).toBe(before);
  });
});

test.describe("Alt+Enter follows the link under the caret", () => {
  const FILES = {
    "Origem.md": "Veja [[Porto#Cais]] e ![[Mesa]] e [texto](Rota.md) e https://exemplo.org/x agora.\n\nSem link aqui.\n",
    "Porto.md": "# Porto\n\n## Cais\n\nTexto do cais.\n",
    "Mesa.md": "# Mesa\n",
    "Rota.md": "# Rota\n",
  };
  async function seeded(app, mode = "Editar") {
    await app.open("?vault=empty");
    for (const [p, text] of Object.entries(FILES)) await app.writeOutside(p, text);
    await app.folderChanged(Object.keys(FILES), true);
    await app.quickOpen("Origem");
    if (mode === "Fonte") await modeOn(app.page, "Fonte");
    else await modeOn(app.page, "Editar");
    await app.page.locator(".pane.focused .cm-content").filter({ visible: true }).click();
  }
  /** The caret `n` characters into the first line. */
  async function caretAt(page, n) {
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < n; i++) await page.keyboard.press("ArrowRight");
  }
  const active = (page) => page.locator(".tab[aria-selected='true']").first();

  for (const mode of ["Editar", "Fonte"]) {
    test(`a wikilink with a heading, an embed and a Markdown link open their notes (${mode})`, async ({ app, page }) => {
      await seeded(app, mode);
      await caretAt(page, 9); // inside "[[Porto#Cais]]"
      await page.keyboard.press("Alt+Enter");
      await expect(active(page)).toContainText("Porto");
      // Back to the origin; the embed.
      await app.quickOpen("Origem");
      await page.locator(".pane.focused .cm-content").filter({ visible: true }).click();
      await caretAt(page, 24); // inside "![[Mesa]]"
      await page.keyboard.press("Alt+Enter");
      await expect(active(page)).toContainText("Mesa");
      await app.quickOpen("Origem");
      await page.locator(".pane.focused .cm-content").filter({ visible: true }).click();
      await caretAt(page, 40); // inside "[texto](Rota.md)"
      await page.keyboard.press("Alt+Enter");
      await expect(active(page)).toContainText("Rota");
    });
  }

  test("a bare address goes to the external opener; elsewhere the status says there is no link", async ({ app, page }) => {
    await seeded(app);
    await caretAt(page, 62);
    await page.keyboard.press("Alt+Enter");
    await expect.poll(() => app.calls("open_url")).toEqual([{ url: "https://exemplo.org/x" }]);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Alt+Enter");
    await expect(page.locator("#status")).toHaveText("Nenhum link sob o cursor.");
  });

  test("the command is in the palette and in Settings › Atalhos, with its key", async ({ app, page }) => {
    await seeded(app);
    await caretAt(page, 9);
    await app.command("Abrir link sob o cursor");
    await expect(active(page)).toContainText("Porto");
    await app.key("Mod+,");
    await page.locator(".settings-nav-item", { hasText: "Atalhos" }).click();
    await expect(page.locator(".settings-body").getByText("Abrir link sob o cursor").first()).toBeVisible();
    await expect(page.locator(".hotkey kbd", { hasText: /Alt\+Enter|⌥Enter/ }).first()).toBeVisible();
  });
});
