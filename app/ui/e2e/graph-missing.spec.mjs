// The graph's notes that do not exist yet (spec Q14, decision B): hidden by
// default, shown by turning "Só arquivos existentes" off, drawn hollow and
// dashed with a name that says so, reached by the keyboard, and made on Enter.

import { test, expect } from "./fixtures.mjs";

const EXISTING = "Só arquivos existentes";

async function vault(app, page) {
  await app.open("?vault=empty");
  await app.writeOutside("A.md", "# A\n\nVeja [[Goblin Rei]] e [[B]].\n");
  await app.writeOutside("B.md", "# B\n\nO [[Goblin Rei]] de novo.\n");
  await app.writeOutside("pasta/C.md", "# C\n\nSem link.\n");
  await app.folderChanged(["A.md", "B.md", "pasta/C.md"], true);
  await app.command("Grafo do cofre");
  await expect(page.locator("svg.graph .node").first()).toBeVisible();
}

test.describe("the graph with notes that do not exist yet", () => {
  test("hidden by default; turning the filter off shows one node per name, with its edges", async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await vault(app, page);
    const filter = page.getByLabel(EXISTING);
    await expect(filter).toBeChecked();
    await expect(page.locator("svg.graph .node.missing")).toHaveCount(0);
    await expect(page.locator("svg.graph .node")).toHaveCount(3);
    await expect(page.locator(".graph-count")).toHaveText("3 notas · 1 link");

    await filter.uncheck();
    const missing = page.locator("svg.graph .node.missing");
    await expect(missing).toHaveCount(1);
    await expect(missing).toHaveAttribute("aria-label", "Goblin Rei — nota que ainda não existe");
    // Two notes link to it: two more edges.
    await expect(page.locator("svg.graph line.edge")).toHaveCount(3);
    await expect(page.locator(".graph-count")).toHaveText("3 notas · 3 links · 1 ainda não existe");
    // Not by colour alone: hollow, dashed, and named in the legend.
    const circle = missing.locator("circle");
    expect(await circle.evaluate((c) => getComputedStyle(c).strokeDasharray)).not.toBe("none");
    expect(await circle.evaluate((c) => getComputedStyle(c).fill)).toMatch(/^(none|rgba\(0, 0, 0, 0\))$/);
    await expect(page.locator(".graph-legend")).toContainText("Nota que ainda não existe");

    // The choice is kept like the graph's other filters.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("verso.graph")).existingOnly)).toBe(false);
  });

  test("the keyboard reaches it and Enter makes the note", async ({ app, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await vault(app, page);
    await page.getByLabel(EXISTING).uncheck();
    const missing = page.locator("svg.graph .node.missing");
    await expect(missing).toHaveCount(1);
    // The graph is one Tab stop; the arrows walk the nodes.
    await page.locator("svg.graph").focus();
    const arrows = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (let i = 0; i < 24 && !(await missing.evaluate((n) => n.classList.contains("current"))); i++) await page.keyboard.press(arrows[i % 4]);
    await expect(missing).toHaveClass(/current/);
    expect(await app.file("Goblin Rei.md")).toBeNull();
    await page.keyboard.press("Enter");
    // It asks first; Cancel leaves everything as it was, and Enter on the
    // question's own button is not the graph's Enter.
    const ask = page.getByRole("alertdialog");
    await expect(ask).toContainText("Criar a nota \"Goblin Rei\"?");
    await ask.getByRole("button", { name: "Cancelar" }).click();
    await expect(ask).toHaveCount(0);
    expect(await app.file("Goblin Rei.md")).toBeNull();
    await page.locator("svg.graph").focus();
    await page.keyboard.press("Enter");
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Criar" }).click();
    await expect.poll(() => app.file("Goblin Rei.md")).toContain("# Goblin Rei");
  });

  test("with the filter on, nothing asks the core for them", async ({ app, page }) => {
    await vault(app, page);
    expect(await app.calls("graph_unresolved")).toHaveLength(0);
    await page.getByLabel(EXISTING).uncheck();
    await expect.poll(async () => (await app.calls("graph_unresolved")).length).toBe(1);
  });
});

test("in a shared folder, which will not name missing notes, turning the filter off says why nothing appears", async ({ app, page }) => {
  await vault(app, page);
  // A share refuses graph_unresolved (ADR 0081 item 11).
  await page.evaluate(() => {
    window.__harness.core.handlers["graph_unresolved"] = () => {
      throw { kind: "not_found", message: "not allowed in a share" };
    };
  });
  await page.getByLabel(EXISTING).uncheck();
  await expect(page.locator("svg.graph .node.missing")).toHaveCount(0);
  await expect(page.locator(".graph-count")).toContainText("numa pasta compartilhada, notas que não existem não aparecem");
});
