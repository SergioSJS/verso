// The "Acesso…" dialog as a person, a keyboard and a screen reader meet it
// (ADR 0113 section F, table J row S6): opened from a note's, a board's and a
// folder's menu; "Toda a mesa" and one row per player, each a labelled radio
// group of Não vê / Vê / Edita; a folder's exception shown in the folder's
// dialog with its way back; the access indicator of the file following; the
// keyboard alone; 1500, 820 and 390 px wide (the phone's is a sheet with
// everything reachable); and the dark theme with nothing invisible. The
// server's commands are played by the harness (`src/harness/campaign.ts`).

import { test, expect } from "./fixtures.mjs";

const PLAYERS = [
  { id: "acc-ana", name: "Ana" },
  { id: "acc-bia", name: "Bia" },
  { id: "acc-caio", name: "Caio" },
  { id: "acc-dora", name: "Dora" },
];
const TABLE = { root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 };
const NAMES = ["Bia", "Caio", "Dora"];

test.beforeEach(async ({}, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "the widths are set by the test itself");
});

async function setup(app, width = 1500) {
  await app.page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await app.open("?vault=empty&table=owner");
  const paths = ["Mundo/Cripta.md", "Mundo/Diario.md", "Mundo/Quadro.canvas"];
  for (const p of paths) await app.writeOutside(p, `# ${p.split("/").pop().replace(/\.\w+$/, "")}\n\nUm lugar frio.\n`);
  await app.folderChanged(paths, true);
  await app.page.evaluate(
    ([table, players]) => {
      const c = window.__harness.campaign;
      c.tables = [table];
      c.players = players;
      window.__harness.emit("campaign-changed", { paths: [] });
    },
    [TABLE, PLAYERS],
  );
  await app.folderChanged(paths, true);
  // On a phone the tree is in the side panel.
  if (width <= 760) await app.page.getByRole("button", { name: "Arquivos" }).click();
  const folder = app.page.locator('#notes summary[data-folder="Mundo"]');
  await expect(folder).toBeVisible();
  if ((await folder.getAttribute("aria-expanded")) !== "true") await folder.click();
  await expect(app.page.locator('#notes li[data-path="Mundo/Cripta.md"]')).toBeVisible();
}

const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);
const folderRow = (app) => app.page.locator('#notes summary[data-folder="Mundo"]');
const dialogOf = (app, name = /^Acesso · /) => app.page.getByRole("dialog", { name });
const VALUE = { "Não vê": "none", Vê: "see", Edita: "edit" };
/** The select of a row: one per person, named after them. */
const select = (d, who) => d.getByRole("combobox", { name: who, exact: true });
/** Choose a level the way a person does: from the select. */
const choose = (d, who, word) => select(d, who).selectOption({ label: word });
const expectLevel = (d, who, word) => expect(select(d, who)).toHaveValue(VALUE[word]);
const lastSet = async (app) => (await app.calls("access_set")).at(-1);

async function fromMenu(app, target) {
  await target.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: /^Acesso…/ }).click();
}

test("opened from a note's, a board's and a folder's menu: the whole table and one labelled select per player", async ({ app }) => {
  await setup(app);
  const cases = [
    [row(app, "Mundo/Cripta.md"), /^Acesso · Cripta/],
    [row(app, "Mundo/Quadro.canvas"), /^Acesso · Quadro/],
    [folderRow(app), /^Acesso · pasta “Mundo”/],
  ];
  for (const [target, name] of cases) {
    await fromMenu(app, target);
    const d = dialogOf(app, name);
    await expect(d).toBeVisible();
    // A screen reader hears a dialog with a name, and a labelled select per row.
    await expect(d).toHaveAccessibleName(name);
    await expect(d.getByRole("combobox")).toHaveCount(1 + NAMES.length);
    for (const who of ["Toda a mesa", ...NAMES]) {
      await expect(select(d, who)).toBeVisible();
      await expect(select(d, who).getByRole("option")).toHaveText(["Não vê", "Vê", "Edita"]);
      // The hidden default is the choice made.
      await expectLevel(d, who, "Não vê");
    }
    await expect(d.getByRole("button", { name: "Fechar" })).toBeVisible();
    // The master's note is the file's footer; a folder has Cancelar / Aplicar there.
    if (name.source.includes("pasta")) {
      await expect(d.getByRole("button", { name: "Cancelar" })).toBeVisible();
      await expect(d.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    } else await expect(d).toContainText("O mestre sempre vê e edita.");
    await app.page.keyboard.press("Escape");
    await expect(d).toBeHidden();
  }
});

test("a file saves at once with Salvo and Desfazer, and Desfazer puts back what was there", async ({ app }) => {
  await setup(app);
  await fromMenu(app, row(app, "Mundo/Cripta.md"));
  const d = dialogOf(app, /^Acesso · Cripta/);
  await expect(d.getByRole("button", { name: "Aplicar" })).toHaveCount(0);
  await expect(d.getByText("segue a mesa")).toHaveCount(NAMES.length);
  await choose(d, "Bia", "Edita");
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Cripta.md"], change: { set: { rows: [{ account: "acc-bia", level: "edit" }] } } });
  await expect(d.getByRole("status")).toContainText("Salvo ✓");
  await expect(d.getByText("acesso próprio", { exact: true })).toHaveCount(1);
  await d.getByRole("button", { name: "Desfazer" }).click();
  // It had no set of its own: the way back is to follow again.
  await expect.poll(() => lastSet(app)).toEqual({ paths: ["Mundo/Cripta.md"], change: { kind: "follow" } });
  await expectLevel(d, "Bia", "Não vê");
  await expect(d.getByText("acesso próprio", { exact: true })).toHaveCount(0);
});

test("a folder is set with Aplicar; a file under it gets an exception, which the folder's second view lists with its way back", async ({ app }) => {
  await setup(app);
  await fromMenu(app, folderRow(app));
  const f = dialogOf(app, /^Acesso · pasta “Mundo”/);
  await choose(f, "Toda a mesa", "Vê");
  // Nothing is written until Aplicar, which says how many files change.
  expect((await app.calls("access_set")).filter((c) => c.paths[0] === "Mundo")).toHaveLength(0);
  await expect(f).toContainText("Altera 3 arquivos");
  await f.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo"], change: { set: { whole: "see" } } });
  await expect(f.getByRole("status")).toContainText("Aplicado a 3 arquivos.");
  await expect(f.getByRole("button", { name: /Ver/ })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  // The note: all three see it, by the folder.
  await row(app, "Mundo/Cripta.md").click();
  const indicator = app.page.locator(".note-access-btn");
  await expect(indicator.locator(".note-access-count")).toHaveText("3/3");
  // A file exception: Bia does not see this one.
  await indicator.click();
  const d = dialogOf(app, /^Acesso · Cripta/);
  await expect(d).toContainText("Segue a pasta Mundo");
  await choose(d, "Bia", "Não vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Cripta.md"], change: { set: { whole: "see", rows: [{ account: "acc-bia", level: "none" }] } } });
  await expect(d).toContainText("Acesso próprio (exceção de “Mundo”).");
  await expect(indicator.locator(".note-access-count")).toHaveText("2/3");
  await app.page.keyboard.press("Escape");
  // The folder's dialog: one summary line, and the overwrite question only after a change.
  await fromMenu(app, folderRow(app));
  const again = dialogOf(app, /^Acesso · pasta “Mundo”/);
  await expect(again.getByRole("button", { name: /1 arquivo com acesso próprio/ })).toBeVisible();
  await expect(again.getByText(/aqui dentro/)).toHaveCount(0);
  await choose(again, "Caio", "Edita");
  await expect(again.getByText("1 arquivo aqui dentro tem acesso próprio.")).toBeVisible();
  await expect(again.getByRole("radio", { name: "Manter" })).toBeChecked();
  // The second view: search, the sum of who sees it, and the way back.
  await again.getByRole("button", { name: /1 arquivo com acesso próprio/ }).click();
  const list = again.getByRole("list", { name: "Arquivos com acesso próprio" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("2 veem");
  await again.getByRole("searchbox", { name: "Buscar arquivos com acesso próprio" }).fill("nada");
  await expect(list).toContainText("Nenhum arquivo com esse nome.");
  await again.getByRole("searchbox").fill("cripta");
  await again.getByRole("button", { name: "↺ Seguir a pasta: Mundo/Cripta.md" }).click();
  await expect.poll(() => lastSet(app)).toEqual({ paths: ["Mundo/Cripta.md"], change: { kind: "follow" } });
  // No exception is left: the dialog is back on its first view, with its choice kept.
  await expect(again.getByRole("button", { name: /com acesso próprio/ })).toHaveCount(0);
  await expectLevel(again, "Caio", "Edita");
  await app.page.keyboard.press("Escape");
  // And the file's indicator is back to the folder's.
  await expect(indicator.locator(".note-access-count")).toHaveText("3/3");
});

test("a folder with exceptions: Manter is one write that keeps them; Seguir a pasta em todos asks first and does not", async ({ app }) => {
  await setup(app);
  await fromMenu(app, row(app, "Mundo/Diario.md"));
  const n = dialogOf(app, /^Acesso · Diario/);
  await choose(n, "Dora", "Edita");
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Diario.md"] });
  await app.page.keyboard.press("Escape");
  await fromMenu(app, folderRow(app));
  const f = dialogOf(app, /^Acesso · pasta “Mundo”/);
  await choose(f, "Toda a mesa", "Vê");
  await f.getByRole("button", { name: "Aplicar" }).click();
  // One write, with the server told to keep what has its own access: no write-back, no moment when the file follows the folder.
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo"], change: { set: { whole: "see" }, keep_exceptions: true } });
  expect((await app.calls("access_set")).map((c) => c.paths.join(","))).toEqual(["Mundo/Diario.md", "Mundo"]);
  // The second view: "Seguir a pasta em todos" asks, with the count.
  await f.getByRole("button", { name: /1 arquivo com acesso próprio/ }).click();
  await f.getByRole("button", { name: "Seguir a pasta em todos" }).click();
  await expect(app.page.getByText("Todos os 1 arquivos passam a seguir a pasta. Continuar?")).toBeVisible();
  await app.page.getByRole("button", { name: "Seguir a pasta", exact: true }).click();
  await expect.poll(() => lastSet(app)).toEqual({ paths: ["Mundo/Diario.md"], change: { kind: "follow" } });
});

test("keyboard only: Tab stays in the dialog, the select changes with the keys, Enter applies, Escape closes and the focus returns to the opener", async ({ app }) => {
  await setup(app);
  const page = app.page;
  const opener = row(app, "Mundo/Cripta.md");
  await opener.focus();
  await page.keyboard.press("Shift+F10");
  let item = page.getByRole("menuitem", { name: /^Acesso…/ });
  if (!(await item.isVisible())) {
    // No keyboard way to the menu on this engine: the pointer opens it, the keys do the rest.
    await opener.click({ button: "right" });
    item = page.getByRole("menuitem", { name: /^Acesso…/ });
  }
  await expect(item).toBeVisible();
  await item.focus();
  await page.keyboard.press("Enter");
  const d = dialogOf(app);
  await expect(d).toBeVisible();
  // The focus is inside, on the first select.
  await expect(select(d, "Toda a mesa")).toBeFocused();
  // Tab walks the selects, then the close button, then wraps: never leaves.
  const stops = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await d.evaluate((el) => el.contains(document.activeElement));
    const where = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} ${document.activeElement?.textContent?.trim().slice(0, 20)}`);
    expect(inside, `Tab ${i + 1} landed on ${where}; stops so far: ${stops.join(" | ")}`).toBe(true);
    stops.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? ""));
  }
  expect(stops).toContain("Fechar");
  // Shift+Tab goes back through the dialog too.
  await page.keyboard.press("Shift+Tab");
  expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The keys choose, and the choice is saved.
  await select(d, "Caio").focus();
  // Type-ahead (the first letter of the option) changes a closed select on every platform; on macOS ArrowDown only opens its menu.
  await page.keyboard.press("V");
  await expectLevel(d, "Caio", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { rows: [{ account: "acc-caio", level: "see" }] } } });
  // Enter on the close button closes it, and the focus is back where the person was.
  await d.getByRole("button", { name: "Fechar" }).focus();
  await page.keyboard.press("Enter");
  await expect(d).toBeHidden();
  await expect(opener).toBeFocused();
  // A folder: Enter on Aplicar applies, Escape closes, the focus returns.
  await folderRow(app).focus();
  await folderRow(app).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Acesso…" }).focus();
  await page.keyboard.press("Enter");
  const fd = dialogOf(app, /^Acesso · pasta “Mundo”/);
  await select(fd, "Toda a mesa").focus();
  await page.keyboard.press("V");
  await expectLevel(fd, "Toda a mesa", "Vê");
  expect((await app.calls("access_set")).filter((c) => c.paths[0] === "Mundo")).toHaveLength(0);
  await fd.getByRole("button", { name: "Aplicar" }).focus();
  await page.keyboard.press("Enter");
  // The file Caio was given earlier has its own access: it is written back after the folder (Manter).
  await expect.poll(async () => (await app.calls("access_set")).find((c) => c.paths[0] === "Mundo")).toMatchObject({ paths: ["Mundo"], change: { set: { whole: "see" } } });
  await page.keyboard.press("Escape");
  await expect(fd).toBeHidden();
  await expect(page.locator("#notes").locator(":focus")).toHaveCount(1);
});

for (const width of [1500, 820, 390]) {
  test(`at ${width} px every control is reachable, nothing is cut off and the page does not scroll sideways`, async ({ app }) => {
    await setup(app, width);
    const page = app.page;
    const sheetWidth = width <= 760;
    let at = -1;
    for (const [target, name, folder] of [
      [row(app, "Mundo/Cripta.md"), /^Acesso · Cripta/, false],
      [folderRow(app), /^Acesso · pasta “Mundo”/, true],
    ]) {
      at += 1;
      // A phone's side panel gives way to the sheet: bring it back.
      if (sheetWidth && at > 0) {
        if (!(await page.evaluate(() => document.body.classList.contains("side-open")))) await page.getByRole("button", { name: "Arquivos" }).click();
        await expect(folderRow(app)).toBeInViewport();
      }
      await fromMenu(app, target);
      const d = dialogOf(app, name);
      await expect(d).toBeVisible();
      const sheet = width <= 760;
      await expect(d).toHaveClass(sheet ? /is-sheet/ : /^(?!.*is-sheet)/);
      const box = await d.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
      if (sheet) expect(box.width).toBeGreaterThanOrEqual(width - 2);
      // No horizontal scroll, neither on the page nor inside the dialog.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      // Every control can be scrolled to, is in the dialog's width, and is a fair target on a phone.
      const controls = [d.getByRole("button", { name: "Fechar" }), ...["Toda a mesa", ...NAMES].map((who) => select(d, who))];
      if (folder) controls.push(d.getByRole("button", { name: "Aplicar" }), d.getByRole("button", { name: "Cancelar" }));
      for (const c of controls) {
        await c.scrollIntoViewIfNeeded();
        await expect(c).toBeInViewport();
        const b = await c.boundingBox();
        expect(b.width).toBeGreaterThan(0);
        expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
        if (sheet) expect(b.height).toBeGreaterThanOrEqual(43);
      }
      // Something is still done at this width: the choice saves.
      if (!folder) {
        await choose(d, "Bia", "Vê");
        await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Cripta.md"], change: { set: { rows: [{ account: "acc-bia", level: "see" }] } } });
      }
      await d.getByRole("button", { name: "Fechar" }).click();
      await expect(d).toBeHidden();
    }
  });
}

test("in the dark theme the words have contrast, a chosen level differs from the others and nothing is invisible", async ({ app }) => {
  await setup(app);
  await app.page.emulateMedia({ colorScheme: "dark" });
  await fromMenu(app, row(app, "Mundo/Cripta.md"));
  const d = dialogOf(app);
  await choose(d, "Dora", "Edita");
  await expectLevel(d, "Dora", "Edita");
  await expect(d.getByText("acesso próprio", { exact: true })).toBeVisible();
  const report = await d.evaluate((root) => {
    const cv = document.createElement("canvas").getContext("2d");
    const rgba = (css) => {
      cv.clearRect(0, 0, 1, 1);
      cv.fillStyle = "#000";
      cv.fillStyle = css;
      cv.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // The colour a box is drawn on: the first ancestor with an opaque background.
    const under = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0.95) return c;
      }
      return [255, 255, 255, 1];
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const bad = [];
    for (const el of root.querySelectorAll("*")) {
      const st = getComputedStyle(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || el.closest("[hidden]") || st.display === "none") continue;
      if (st.visibility === "hidden" || Number(st.opacity) === 0) bad.push(`invisible: ${el.className} ${el.textContent.trim().slice(0, 20)}`);
      const fg = rgba(st.color);
      const bg = under(el);
      const disabled = el.matches(":disabled");
      const r = ratio(fg, bg);
      if (!disabled && r < 4.5) bad.push(`contrast ${r.toFixed(2)}: ${el.className} "${el.textContent.trim().slice(0, 20)}"`);
    }
    const paper = rgba(getComputedStyle(root).backgroundColor);
    const selects = [...root.querySelectorAll(".ac-sel select")];
    const edit = selects.find((s) => s.value === "edit");
    const plain = selects.find((s) => s.value === "none");
    return {
      bad,
      paperDark: lum(paper) < 0.2,
      editDiffers: getComputedStyle(edit).backgroundColor !== getComputedStyle(plain).backgroundColor,
      borderSeen: rgba(getComputedStyle(root).borderTopColor)[3] > 0,
      tokens: ["--paper", "--ink", "--ink-2", "--hair"].map((t) => [t, getComputedStyle(document.documentElement).getPropertyValue(t).trim()]),
    };
  });
  expect(report.bad).toEqual([]);
  expect(report.paperDark).toBe(true);
  expect(report.editDiffers).toBe(true);
  expect(report.borderSeen).toBe(true);
  for (const [token, value] of report.tokens) expect(value, token).not.toBe("");
  // Every state has a word, never colour alone.
  await expect(select(d, "Dora").getByRole("option", { selected: true })).toHaveText("Edita");
  // The same is reachable on the phone's sheet.
  await app.page.keyboard.press("Escape");
  await app.page.setViewportSize({ width: 390, height: 844 });
  await app.page.getByRole("button", { name: "Arquivos" }).click();
  await fromMenu(app, row(app, "Mundo/Cripta.md"));
  const sheet = dialogOf(app);
  await expect(sheet).toHaveClass(/is-sheet/);
  await expectLevel(sheet, "Dora", "Edita");
  await expect(select(sheet, "Dora")).toBeInViewport();
});
