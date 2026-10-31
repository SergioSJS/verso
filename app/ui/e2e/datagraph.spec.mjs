// Structured data as a diagram (ADR 0106): a .json, .yaml… file opens as
// text; "Diagrama" draws it as boxes and lines to move, fold and search; a
// code block of a note gets "Ver como diagrama"; and the Features switch
// takes both away. The diagram only reads: no test here writes the data.

import { test, expect } from "./fixtures.mjs";

const NPCS = JSON.stringify(
  {
    campaign: "Aurora",
    npcs: [
      { name: "Rowan", class: "fighter", gear: { weapon: "sword", armor: "mail" } },
      { name: "Mira", class: "wizard", gear: { weapon: "staff" } },
    ],
    notes: "x".repeat(120),
  },
  null,
  2,
) + "\n";

const YAML_TEXT = "party: &p\n  - name: Rowan\n  - name: Mira\nagain: *p\n---\ncount: 2\n";

/** What the window copies, kept for the test: no permission asked. */
async function clipboard(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void window.__copied.push(t), write: async () => {} } });
  });
}

async function openFile(app, files, name) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  await app.quickOpen(name);
}

/** Open mesa-teste.json and switch to its diagram. */
async function diagram(app, page, files = { "mesa-teste.json": NPCS }, name = "mesa-teste") {
  await openFile(app, files, name);
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
}

const box = (page, id) => page.locator(`.dg-box[data-id="${id}"]`);
const at = async (page, id) => (await box(page, id).boundingBox());
const head = (page, id) => box(page, id).locator(".dg-head");

/** Drag a box by its title bar (clear of the fold button and the count). */
async function drag(page, id, dx, dy, alt = false) {
  const b = await head(page, id).boundingBox();
  const x = b.x + 60;
  const y = b.y + b.height / 2;
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
}

const close = (a, b) => Math.abs(a - b) <= 2;

test("a .json opens as text; Diagrama draws boxes and lines, Texto goes back; the file is never written", async ({ app, page }) => {
  await openFile(app, { "mesa-teste.json": NPCS }, "mesa-teste");
  const modes = page.locator(".leaf:visible .data-modes");
  await expect(modes.locator("button[data-mode=text]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dg-box")).toHaveCount(0);
  await modes.locator("button[data-mode=diagram]").click();
  // Root, npcs, two npcs and their two gear boxes.
  await expect(page.locator(".dg-box")).toHaveCount(6);
  await expect(page.locator(".dg-edge").first()).toHaveAttribute("d", /^M/);
  await expect(box(page, 0)).toContainText("campaign");
  await expect(box(page, 0)).toContainText("Aurora");
  // A long text is cut, with all of it a click away.
  await expect(box(page, 0).locator(".dg-cut")).toHaveCount(1);
  await box(page, 0).locator(".dg-cut").click();
  await expect(page.locator(".dg-full")).toContainText("x".repeat(120));
  await page.keyboard.press("Escape");
  await expect(page.locator(".dg-full")).toHaveCount(0);
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".dg-box")).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await app.file("mesa-teste.json")).toBe(NPCS);
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("dragging a box carries what hangs under it; Alt moves it alone; the moves are kept and Arrumar de novo drops them", async ({ app, page }) => {
  await diagram(app, page);
  const scale = () => page.locator(".dg-layer").evaluate((el) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1));
  // In the diagram's own units: the view may be fitted again, at another zoom.
  const rel = async () => ((await at(page, 2)).x - (await at(page, 4)).x) / (await scale());
  const gap0 = await rel();
  const before = { b2: await at(page, 2), b3: await at(page, 3), b4: await at(page, 4), b0: await at(page, 0) };
  await drag(page, 2, 120, 60);
  const after = { b2: await at(page, 2), b3: await at(page, 3), b4: await at(page, 4), b0: await at(page, 0) };
  expect(close(after.b2.x - before.b2.x, 120) && close(after.b2.y - before.b2.y, 60)).toBe(true);
  // Its child went with it; its sibling and the root stayed.
  expect(close(after.b3.x - before.b3.x, 120) && close(after.b3.y - before.b3.y, 60)).toBe(true);
  expect(close(after.b4.x, before.b4.x) && close(after.b4.y, before.b4.y)).toBe(true);
  expect(close(after.b0.x, before.b0.x) && close(after.b0.y, before.b0.y)).toBe(true);
  // Alt: the box alone.
  await drag(page, 4, 0, 90, true);
  const alone4 = await at(page, 4);
  const alone5 = await at(page, 5);
  expect(close(alone4.y - after.b4.y, 90)).toBe(true);
  expect(close(alone5.y, (await at(page, 5)).y)).toBe(true);
  const gapMoved = await rel();
  // Kept for the file on this device: Texto and back.
  await page.waitForTimeout(700);
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
  expect(Math.abs((await rel()) - gapMoved)).toBeLessThan(3);
  await page.locator(".dg").getByRole("button", { name: "Arrumar de novo" }).click();
  // The boxes are drawn again on the next frame: a read in between finds none.
  await expect.poll(async () => (await rel().then((r) => Math.abs(r - gap0) < 3, () => false))).toBe(true);
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("a branch folds and unfolds from its box, and a folded box says how much it hides", async ({ app, page }) => {
  await diagram(app, page);
  await box(page, 1).locator(".dg-fold").click();
  await expect(page.locator(".dg-box")).toHaveCount(2);
  await expect(box(page, 1)).toContainText("2 itens");
  await expect(box(page, 1)).toHaveAttribute("aria-expanded", "false");
  await box(page, 1).locator(".dg-fold").click();
  await expect(page.locator(".dg-box")).toHaveCount(6);
  // Fold all keeps the root open; unfold all opens everything; to a level.
  await page.locator(".dg").getByRole("button", { name: "Recolher tudo" }).click();
  await expect(page.locator(".dg-box")).toHaveCount(2);
  await page.locator(".dg").getByRole("button", { name: "Expandir tudo" }).click();
  await expect(page.locator(".dg-box")).toHaveCount(6);
  await page.getByLabel("Expandir até o nível…").selectOption("2");
  await expect(page.locator(".dg-box")).toHaveCount(4);
});

test("the search reaches into a folded branch and unfolds the way to the match", async ({ app, page }) => {
  await diagram(app, page);
  await page.locator(".dg").getByRole("button", { name: "Recolher tudo" }).click();
  await expect(page.locator(".dg-box")).toHaveCount(2);
  const search = page.getByRole("searchbox", { name: /Buscar nos dados/ });
  await search.fill("staff");
  await expect(page.locator(".dg-matches")).toHaveText("1 de 1");
  await expect(page.locator(".dg-row.dg-current")).toContainText("staff");
  // The path to it is open: the root, npcs, the second npc and its gear.
  await expect(box(page, 5)).toBeVisible();
  await expect(box(page, 5)).toHaveAttribute("aria-expanded", "true");
  // Next and previous wrap; Esc clears and gives the focus back to the tree.
  await search.fill("a");
  await expect(page.locator(".dg-matches")).toHaveText(/^1 de (?!1$)\d+/);
  await search.press("Enter");
  await expect(page.locator(".dg-matches")).toHaveText(/^2 de \d+/);
  await search.press("Shift+Enter");
  await expect(page.locator(".dg-matches")).toHaveText(/^1 de \d+/);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator(".dg-row.dg-hit")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("dg-box"))).toBe(true);
});

test("a tree for the keyboard and a screen reader: arrows walk it, Enter folds, Alt with arrows moves, T goes to the text", async ({ app, page }) => {
  await diagram(app, page);
  await expect(page.locator(".dg-stage")).toHaveAttribute("role", "tree");
  await expect(box(page, 0)).toHaveAttribute("role", "treeitem");
  await expect(box(page, 0)).toHaveAttribute("aria-level", "1");
  await expect(box(page, 3)).toHaveAttribute("aria-level", "4");
  // The page holds the boxes in the data's order.
  expect(await page.locator(".dg-box").evaluateAll((els) => els.map((e) => Number(e.dataset.id)))).toEqual([0, 1, 2, 3, 4, 5]);
  const active = () => page.evaluate(() => document.activeElement?.dataset?.id ?? null);
  await box(page, 0).focus();
  await page.keyboard.press("ArrowRight");
  expect(await active()).toBe("1");
  await page.keyboard.press("ArrowRight");
  expect(await active()).toBe("2");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("4");
  await page.keyboard.press("ArrowUp");
  expect(await active()).toBe("2");
  await page.keyboard.press("ArrowLeft");
  expect(await active()).toBe("1");
  await page.keyboard.press("Enter");
  await expect(box(page, 1)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(box(page, 1)).toHaveAttribute("aria-expanded", "true");
  // Alt with an arrow moves the box with what hangs under it; with Shift, alone.
  const b1 = await at(page, 1);
  const b2 = await at(page, 2);
  // The boxes are placed on the next animation frame after the key, so the
  // positions are polled, never read in the turn of the key press.
  const moved = (id, from, axis, by) => expect.poll(async () => close((await at(page, id))[axis] - from[axis], by)).toBe(true);
  await page.keyboard.press("Alt+ArrowDown");
  await moved(1, b1, "y", 16);
  await moved(2, b2, "y", 16);
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await moved(1, b1, "x", 16);
  await moved(2, b2, "x", 0);
  // T: the text view, the box's range selected.
  await page.keyboard.press("t");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  const picked = await page.evaluate(() => {
    const v = [...document.querySelectorAll(".editor.source")].find((e) => e.offsetParent !== null).__cmView;
    const s = v.state.selection.main;
    return v.state.doc.sliceString(s.from, s.to);
  });
  expect(picked.startsWith("[")).toBe(true);
  expect(picked).toContain("Rowan");
});

test("the diagram and the text side by side: a box selects its range, the caret marks its box, typing redraws, an error keeps the last diagram", async ({ app, page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await openFile(app, { "mesa-teste.json": NPCS }, "mesa-teste");
  await app.key("Mod+\\");
  await app.quickOpen("mesa-teste");
  const panes = page.locator(".pane");
  await expect(panes).toHaveCount(2);
  await panes.nth(1).locator(".data-modes button[data-mode=diagram]").click();
  await expect(panes.nth(1).locator(".dg-box").first()).toBeVisible();
  const text = () => panes.nth(0).locator(".editor.source");
  const sel = () =>
    text().evaluate((el) => {
      const v = el.__cmView;
      const s = v.state.selection.main;
      return v.state.doc.sliceString(s.from, s.to);
    });
  // A box (the second npc's gear) selects its range in the text.
  await panes.nth(1).locator('.dg-box[data-id="5"] .dg-head').click({ position: { x: 70, y: 12 } });
  await expect.poll(sel).toBe('{\n        "weapon": "staff"\n      }');
  // A row selects the member.
  await panes.nth(1).locator('.dg-box[data-id="2"] .dg-row', { hasText: "class" }).click();
  await expect.poll(sel).toBe('"class": "fighter"');
  // The caret in the text marks the box and the row it is in.
  await text().evaluate((el) => {
    const v = el.__cmView;
    v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf("Mira") + 1 } });
  });
  await expect(panes.nth(1).locator(".dg-row.dg-caret")).toContainText("Mira");
  // Typing redraws after a pause.
  await text().evaluate((el) => {
    const v = el.__cmView;
    const i = v.state.doc.toString().indexOf("Mira");
    v.dispatch({ changes: { from: i, to: i + 4, insert: "Zed" } });
  });
  await expect(panes.nth(1).locator(".dg-box", { hasText: "Zed" })).toBeVisible();
  // Text that does not parse: the last diagram stays, the error is told and linked.
  await text().evaluate((el) => {
    const v = el.__cmView;
    v.dispatch({ changes: { from: v.state.doc.length, insert: "}}" } });
  });
  await expect(panes.nth(1).locator(".dg-error")).toContainText("O texto não é válido: Há mais texto depois do valor");
  await expect(panes.nth(1).locator(".dg-box", { hasText: "Zed" })).toBeVisible();
  await panes.nth(1).getByRole("button", { name: "Ir ao erro" }).click();
  const where = await text().evaluate((el) => {
    const v = el.__cmView;
    return [v.state.selection.main.from, v.state.doc.length];
  });
  expect(where[0]).toBeGreaterThan(where[1] - 6);
  // Mended, the diagram is drawn again and the error goes.
  await text().evaluate((el) => {
    const v = el.__cmView;
    v.dispatch({ changes: { from: v.state.doc.length - 2, to: v.state.doc.length, insert: "" } });
  });
  await expect(panes.nth(1).locator(".dg-error")).toBeHidden();
});

test("Copiar caminho and Copiar valor, from a row's menu", async ({ app, page }) => {
  await clipboard(page);
  await diagram(app, page);
  await box(page, 3).locator(".dg-row", { hasText: "weapon" }).click({ button: "right" });
  const menu = page.locator(".menu:not([hidden])");
  await menu.getByRole("menuitem", { name: "Copiar caminho" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe("$.npcs[0].gear.weapon");
  await expect(page.locator("#status")).toContainText("Caminho copiado: $.npcs[0].gear.weapon");
  await box(page, 3).locator(".dg-row", { hasText: "weapon" }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Copiar valor" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe("sword");
  // A box: its path, and its text.
  await head(page, 4).click({ button: "right", position: { x: 70, y: 12 } });
  await menu.getByRole("menuitem", { name: "Copiar caminho" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe("$.npcs[1]");
});

test("Ctrl with the wheel zooms the diagram, not the window", async ({ app, page }) => {
  await diagram(app, page);
  const scale = () => page.locator(".dg-layer").evaluate((el) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1));
  const s0 = await scale();
  const r = await page.locator(".dg-stage").boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(scale).toBeGreaterThan(s0);
});

test("a code block of a note gets 'Ver como diagrama', which opens it read-only in a tab beside", async ({ app, page }) => {
  const note = "# Bloco\n\n```json\n{\"a\": {\"b\": [1, 2]}, \"c\": true}\n```\n\n```js\nlet x = 1;\n```\n";
  await openFile(app, { "Dg Bloco.md": note }, "Dg Bloco");
  const pre = page.locator(".preview:visible pre", { hasText: '"a"' });
  await pre.hover();
  const buttons = page.locator(".preview:visible [data-action=view-diagram]");
  await expect(buttons).toHaveCount(1);
  await buttons.click();
  const beside = page.locator(".pane").nth(1);
  await expect(beside.locator(".dg-box").first()).toBeVisible();
  await expect(beside.locator(".dg-box", { hasText: "c" }).first()).toContainText("true");
  await expect(beside.getByRole("button", { name: "Ir ao erro" })).toHaveCount(0);
  // Read-only and note-less of a text view: no switch, no write.
  await expect(beside.locator(".data-modes")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await app.file("Dg Bloco.md")).toBe(note);
  // The Live Preview has the button as well.
  await page.locator(".pane").first().locator(".tab").first().click();
  await app.key("Mod+e");
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  const live = page.locator(".cm-lp-diagram-btn");
  await expect(live).toHaveCount(1);
  await live.dispatchEvent("click");
  await expect(page.locator(".pane")).toHaveCount(3);
});

test("the Data diagram switch in Settings › Features takes the switch and the button away, and no file changes", async ({ app, page }) => {
  const note = "```json\n{\"a\": 1}\n```\n";
  await openFile(app, { "Dg Bloco.md": note, "mesa-teste.json": NPCS }, "Dg Bloco");
  await page.locator(".preview:visible pre").hover();
  await expect(page.locator(".preview:visible [data-action=view-diagram]")).toHaveCount(1);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Diagrama de dados$/ }) });
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await row.locator("label.switch").click();
  await expect(row.locator("input[type=checkbox]")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings:not([hidden])")).toHaveCount(0);
  await expect(page.locator(".preview:visible [data-action=view-diagram]")).toHaveCount(0);
  await app.quickOpen("mesa-teste");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".data-modes:visible")).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await app.file("Dg Bloco.md")).toBe(note);
});

test("YAML: every document a root, an alias a dashed line to its anchor's box; JSONL, TOML, XML and CSV draw too", async ({ app, page }) => {
  await diagram(app, page, { "dg-party.yaml": YAML_TEXT }, "dg-party");
  // Two documents: #1 with the sequence and a line to it, #2.
  await expect(box(page, 0)).toContainText("#1");
  await expect(page.locator(".dg-box", { hasText: "#2" })).toBeVisible();
  await expect(page.locator(".dg-box .dg-badge", { hasText: "&p" })).toBeVisible();
  await expect(page.locator(".dg-alias-edge")).toHaveAttribute("d", /^M.+C/);
  for (const [file, text, expected] of [
    ["dg-log.jsonl", '{"a":1}\nnot json\n{"b":2}\n', "Inesperado"],
    ["dg-conf.toml", 'title = "T"\n[server]\nport = 8080\n', "8080"],
    ["dg-data.xml", '<r a="1"><n>Rowan</n></r>', "Rowan"],
    ["dg-people.csv", "name,hp\nRowan,12\n", "Rowan"],
  ]) {
    await app.writeOutside(file, text);
    await app.folderChanged([file], true);
    await app.quickOpen(file.split(".")[0]);
    await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
    await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
    await expect(page.locator(".leaf:visible .dg-box").first()).toBeVisible();
    await expect(page.locator(".leaf:visible .dg-stage")).toContainText(expected);
  }
});

test("the view last used for a type of file is the next one's, per type", async ({ app, page }) => {
  await openFile(app, { "dg-a.yaml": "x: 1\n", "dg-b.yaml": "y: 2\n", "dg-c.json": '{"z":3}', "dg-d.yaml": "w: 4\n" }, "dg-a");
  // The first time a type opens: text.
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
  // Another file of the type: the diagram. Another type: still text.
  await app.quickOpen("dg-b");
  await expect(page.locator(".leaf:visible .dg-box").first()).toBeVisible();
  await app.quickOpen("dg-c");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".leaf:visible .dg-box")).toHaveCount(0);
  // Back to text on a yaml: the type goes back to text, for the next file of it.
  await app.quickOpen("dg-b");
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await app.quickOpen("dg-d");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".leaf:visible .dg-box")).toHaveCount(0);
});

test("Salvar como board… shows what it will write and creates a JSON Canvas file through the contract", async ({ app, page }) => {
  await diagram(app, page);
  await page.locator(".dg").getByRole("button", { name: "Salvar como board…" }).click();
  const dialog = page.getByRole("dialog", { name: "Salvar o diagrama como board" });
  await expect(dialog).toContainText("6 cartões de texto e 5 linhas");
  const name = dialog.getByRole("textbox");
  await name.fill("Mapa de NPCs");
  await dialog.getByRole("button", { name: "Criar board" }).click();
  await expect.poll(() => app.file("Mapa de NPCs.canvas")).not.toBeNull();
  const canvas = JSON.parse(await app.file("Mapa de NPCs.canvas"));
  expect(canvas.nodes).toHaveLength(6);
  expect(canvas.edges).toHaveLength(5);
  expect(canvas.nodes.every((n) => n.type === "text")).toBe(true);
  expect(canvas.edges.map((e) => e.label)).toContain("npcs");
  expect(await app.file("mesa-teste.json")).toBe(NPCS);
});

test("a file past 20 MB is text only", async ({ app, page }) => {
  test.setTimeout(150_000);
  await app.open();
  // Short lines: the text view holds them as it holds any big file.
  await page.evaluate(() => window.__harness.writeOutside("dg-grande.json", `[${" ".repeat(98)}\n`.repeat(220_000) + "]"));
  await app.folderChanged(["dg-grande.json"], true);
  await app.quickOpen("dg-grande");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-empty")).toContainText("mais que os 20 MB");
  await expect(page.locator(".dg-box")).toHaveCount(0);
});

/** Flip "Diagrama de dados" in Settings › Recursos (the dialog is closed again after). */
async function flipSwitch(app, page) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Diagrama de dados$/ }) });
  await row.locator("label.switch").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings:not([hidden])")).toHaveCount(0);
}

test("turning the switch off takes the diagram away from tabs already open, and on brings it back", async ({ app, page }) => {
  const note = "```json\n{\"a\": 1}\n```\n";
  await openFile(app, { "Dg Bloco.md": note, "mesa-teste.json": NPCS }, "mesa-teste");
  await expect(page.locator(".leaf:visible .data-modes")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
  await app.quickOpen("Dg Bloco");
  await page.locator(".preview:visible pre").hover();
  await expect(page.locator(".preview:visible [data-action=view-diagram]")).toHaveCount(1);

  await flipSwitch(app, page);
  // The note's button is gone, the diagram tab is text again, no tab has the switch.
  await expect(page.locator(".preview:visible [data-action=view-diagram]")).toHaveCount(0);
  await expect(page.locator(".dg-box")).toHaveCount(0);
  await expect(page.locator(".data-modes:visible")).toHaveCount(0);
  await page.locator(".tab", { hasText: "mesa-teste" }).click();
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".data-modes:visible")).toHaveCount(0);

  await flipSwitch(app, page);
  await page.locator(".tab", { hasText: "mesa-teste" }).click();
  await expect(page.locator(".leaf:visible .data-modes")).toBeVisible();
  await page.locator(".tab", { hasText: "Dg Bloco" }).click();
  await page.locator(".preview:visible pre").hover();
  await expect(page.locator(".preview:visible [data-action=view-diagram]")).toHaveCount(1);
});
test("turning the switch off closes a diagram tab opened from a note's code block (D.2)", async ({ app, page }) => {
  await openFile(app, { "Dg Bloco.md": "# Bloco\n\n```json\n{\"a\": 1}\n```\n" }, "Dg Bloco");
  await page.locator(".preview:visible pre", { hasText: '"a"' }).hover();
  await page.locator(".preview:visible [data-action=view-diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
  await expect(page.locator(".tab")).toHaveCount(2);
  await flipSwitch(app, page);
  await expect(page.locator(".dg-box")).toHaveCount(0);
  await expect(page.locator(".tab")).toHaveCount(1);
});
test("the diagram's code loads on the first diagram only", async ({ app, page }) => {
  const chunks = [];
  page.on("request", (r) => {
    if (/chunks\/datagraph/.test(r.url())) chunks.push(r.url());
  });
  await openFile(app, { "mesa-teste.json": NPCS }, "mesa-teste");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await expect(page.locator(".leaf:visible .data-modes")).toBeVisible();
  expect(chunks).toEqual([]);
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
  expect(chunks.length).toBe(1);
});

test("a diagram whose code cannot load shows an error line, not a blank tab", async ({ app, page }) => {
  app.expectFault(/request failed: .*chunks\/datagraph|console: Failed to load resource: net::ERR_FAILED/);
  await page.route(/chunks\/datagraph/, (route) => route.abort());
  await openFile(app, { "mesa-teste.json": NPCS }, "mesa-teste");
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".leaf:visible .dg-loading[role=alert]")).toContainText("Não foi possível carregar o diagrama");
  await expect(page.locator(".dg-box")).toHaveCount(0);
});
