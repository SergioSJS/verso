// The scenarios of the maintainer's live test of a table (2026-10-24) that
// access.spec.mjs and board-players.spec.mjs do not run, as the server's
// end-to-end tests (ADR 0113 S9): a real `verso serve`, a game master and two
// players, Ana in the browser (and Bruno in his own). Each follows the real
// window: the tree's menu, "Acesso…", the Mesa's panel, the quick switcher.
//
// In every one the hidden names (a canary word each) are looked for in the
// players' pages — tree, switcher, chat, dialogs, what is open: a hidden name
// in a player's page is a bug (BLOCKING, "visibility leak").

import { expect, test } from "@playwright/test";

import { PNG, accessDialog, applyFolder, choose, fileRow, openNoteBy, reveal, dragIntoSheet, invoke, mesa, openFolder, openSheet, say, sendFile, setup, sheetDoc, switcher, traces } from "./access-helpers.mjs";

test.use({ actionTimeout: 15_000 });

/** Run `body` with a table of `files`, closing the players' browsers at the end. */
async function scenario(browser, gm, info, label, files, body) {
  test.skip(info.project.name === "phone", "the panels are side by side");
  test.setTimeout(300_000);
  const s = await setup(browser, gm, info, label, files);
  try {
    await body(s);
  } finally {
    for (const c of s.contexts) await c.close().catch(() => {});
  }
}

test("a. Ana drags the map from the chat onto her sheet and it is linked; Bruno, who only sees, cannot", async ({ browser, page: gm }, info) => {
  const files = { "Fichas/Ana.md": "# Ana\n\nforça 12\n", "Fichas/Bruno.md": "# Bruno\n\nforça 10\n", "Zqsegredo.md": "# Zqsegredo\n\nzqcorpo\n" };
  await scenario(browser, gm, info, "mapa", files, async ({ folder, ana, bruno, set }) => {
    await set(["Fichas/Ana.md"], "none", { Ana: "edit", Bruno: "see" });
    await set(["Fichas/Bruno.md"], "none", { Bruno: "edit", Ana: "see" });
    await set(["Zqsegredo.md"], "none");
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    const [g, a, b] = [await mesa(gm), await mesa(ana.page), await mesa(bruno.page)];
    await say(g, "o mapa da cripta");
    await sendFile(gm, g, "cripta.png", "image/png", PNG);
    for (const v of [a, b]) await expect(v.locator('.table-entry[data-kind="image"]')).toHaveCount(1, { timeout: 30_000 });
    const before = (await invoke(gm, "list_files", {})).length;

    // Ana edits her sheet: the picture is linked, the file that is there; nothing is uploaded.
    await openSheet(ana.page, "Ana");
    await dragIntoSheet(ana.page, a.locator('.table-entry[data-kind="image"]'));
    await expect.poll(() => sheetDoc(ana.page)).toMatch(/!\[\[[^\]]*mesa-\d+-\w+\.png\]\]/);
    expect((await invoke(gm, "list_files", {})).length).toBe(before);
    await expect.poll(async () => (await invoke(gm, "read_note", { path: "Fichas/Ana.md" })).text).toMatch(/!\[\[[^\]]*mesa-\d+-\w+\.png\]\]/);

    // Bruno sees her sheet and cannot: the notice names the note, nothing lands.
    await openSheet(bruno.page, "Ana");
    const seen = await sheetDoc(bruno.page);
    await dragIntoSheet(bruno.page, b.locator('.table-entry[data-kind="image"]'));
    await expect(bruno.page.locator(".reader-notice")).toContainText("Você só lê esta nota");
    expect(await sheetDoc(bruno.page)).toBe(seen);
    const onDisk = (await invoke(gm, "read_note", { path: "Fichas/Ana.md" })).text;
    expect(onDisk.match(/!\[\[/g)).toHaveLength(1);

    // The hidden note is in nobody's page, nor in what the switcher lists.
    for (const p of [ana.page, bruno.page]) {
      expect((await switcher(p, "Zqsegredo")).join("|")).not.toContain("Zqsegredo");
      await p.keyboard.press("Escape");
      expect(await traces(p, ["Zqsegredo", "zqcorpo"])).toEqual([]);
      expect(JSON.stringify(await invoke(p, "list_files", {}))).not.toContain("Zqsegredo");
    }
  });
});

/** The board's nodes: a card of a note the table sees, one of a note it does not, a secret pin. */
const BOARD = JSON.stringify({
  nodes: [
    { id: "livre", type: "file", file: "Livre.md", x: 0, y: 0, width: 250, height: 60 },
    { id: "cripta", type: "file", file: "Zqescondida.md", x: 300, y: 0, width: 250, height: 60 },
    { id: "zqpin", type: "text", text: "zqpinboard", verso: { secret: true }, x: 600, y: 0, width: 80, height: 40 },
  ],
  edges: [{ id: "zqedge", fromNode: "livre", toNode: "zqpin" }],
});
const HIDDEN_BOARD = ["Zqescondida", "zqpin", "zqedge", "zqcorpo"];

/** The board's scene in a window, as a test reads it. */
const scene = (page) =>
  page.evaluate(() => (window.__VERSO_TEST__?.board?.getSceneElements() ?? []).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, locked: e.locked === true, text: e.text })));

/** A point of the board, on the page. */
async function onBoard(page, x, y) {
  const v = await page.evaluate(() => {
    const s = window.__VERSO_TEST__.board.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, left: s.offsetLeft, top: s.offsetTop };
  });
  return { x: (x + v.scrollX) * v.zoom + v.left, y: (y + v.scrollY) * v.zoom + v.top };
}

/** The group's board open in a window (the folder, then the quick switcher). */
async function openBoard(page, folder, name) {
  await openFolder(page, folder);
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await page.waitForFunction(() => (window.__VERSO_TEST__?.board?.getSceneElements().length ?? 0) >= 2 && window.__VERSO_TEST__.board.getAppState().width > 0, null, { timeout: 30_000 });
}

/** A text drawn on the board where a person would: a free spot, the text tool, a click away to let go. */
async function drawText(page, text) {
  const free = await onBoard(page, 0, 300);
  await page.mouse.click(free.x, free.y);
  await page.keyboard.press("t");
  await page.mouse.click(free.x, free.y);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  const away = await onBoard(page, 500, 450);
  await page.mouse.click(away.x, away.y);
}

/** The drawn texts the file of the board holds. */
const drawn = async (gm) => {
  const doc = JSON.parse((await invoke(gm, "read_text", { path: "Quadro do grupo.canvas" })).text);
  return (doc.verso?.drawing ?? []).filter((d) => d.type === "text").map((d) => d.text);
};

test("b. Ana edits the group's board live and the game master gets it; Bruno, who sees, cannot; one change in the dialog gives both Edits", async ({ browser, page: gm }, info) => {
  const files = { "Livre.md": "# Livre\n\npara todos\n", "Zqescondida.md": "# Zqescondida\n\nzqcorpo\n", "Quadro do grupo.canvas": BOARD };
  await scenario(browser, gm, info, "quadro", files, async ({ folder, ana, bruno, set, id }) => {
    await set(["Livre.md"], "see");
    await set(["Zqescondida.md"], "none");
    await set(["Quadro do grupo.canvas"], "see");
    await openBoard(gm, folder.id, "Quadro do grupo");
    // From the one dialog of the board: Ana edits, Bruno only sees.
    const dialog = await accessDialog(gm, "Quadro do grupo.canvas");
    await choose(dialog, "Ana", "Edita");
    await expect(dialog).toContainText("Salvo");
    await gm.keyboard.press("Escape");
    const level = async (who) => (await invoke(gm, "access_get", { paths: ["Quadro do grupo.canvas"] }))[0].set.rows.find((r) => r.account === id(who))?.level ?? "whole";
    await expect.poll(() => level("Ana")).toBe("edit");

    // Ana draws; the game master's window has it, and the file.
    await openBoard(ana.page, folder.id, "Quadro do grupo");
    await expect.poll(async () => (await scene(ana.page)).find((e) => e.id === "cripta")?.locked).toBe(true);
    await drawText(ana.page, "da Ana");
    if (info.project.name === "chromium") {
      await expect.poll(async () => (await scene(gm)).some((e) => e.type === "text" && e.text === "da Ana"), { timeout: 30_000 }).toBe(true);
    }
    await expect.poll(() => drawn(gm), { timeout: 30_000 }).toContain("da Ana");
    expect(await traces(ana.page, HIDDEN_BOARD)).toEqual([]);

    // Bruno only sees: what he draws is none.
    await openBoard(bruno.page, folder.id, "Quadro do grupo");
    const before = (await scene(bruno.page)).length;
    await drawText(bruno.page, "do Bruno antes");
    await bruno.page.waitForTimeout(1500);
    expect((await scene(bruno.page)).length).toBe(before);
    expect(await drawn(gm)).not.toContain("do Bruno antes");
    expect(await traces(bruno.page, HIDDEN_BOARD)).toEqual([]);

    // The game master gives the whole table Edits in one change of the dialog: Ana and Bruno both edit.
    const again = await accessDialog(gm, "Quadro do grupo.canvas");
    await choose(again, "Toda a mesa", "Edita");
    await expect(again).toContainText("Salvo");
    await gm.keyboard.press("Escape");
    await expect.poll(() => level("Bruno")).toBe("whole");
    const now = (await invoke(gm, "access_get", { paths: ["Quadro do grupo.canvas"] }))[0].set;
    expect(now.whole).toBe("edit");
    // Bruno's window opens the board again (the room is joined at the opening) and he draws.
    await openBoard(bruno.page, folder.id, "Quadro do grupo");
    await drawText(bruno.page, "do Bruno depois");
    await expect.poll(() => drawn(gm), { timeout: 30_000 }).toContain("do Bruno depois");
    expect(await drawn(gm)).toContain("da Ana");
    expect(await traces(bruno.page, HIDDEN_BOARD)).toEqual([]);
    expect(await traces(ana.page, HIDDEN_BOARD)).toEqual([]);
  });
});

test("c. a folder set, then an exception on one file, then back to the folder: what Ana sees at each step", async ({ browser, page: gm }, info) => {
  const files = { "Cenas/Zqtaverna.md": "# Zqtaverna\n\nzqmarcatav\n", "Cenas/Ponte.md": "# Ponte\n\nzqmarcaponte\n" };
  await scenario(browser, gm, info, "pasta", files, async ({ folder, ana, bruno }) => {
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    const names = ["Zqtaverna", "Ponte"];
    const treeOf = async (page) => {
      const out = [];
      for (const n of names) out.push((await page.locator(`#notes li[data-path="Cenas/${n}.md"]`).count()) > 0);
      return out;
    };
    // The default hides: Ana sees no file of the folder, and the switcher finds none.
    expect((await switcher(ana.page, "Zqtaverna")).join("|")).not.toContain("Zqtaverna");
    await ana.page.keyboard.press("Escape");
    expect(await traces(ana.page, ["Zqtaverna", "zqmarcatav"])).toEqual([]);

    // The folder: the whole table sees. The game master's dialog counts the two files.
    const dialog = await applyFolder(gm, "Cenas", [["Toda a mesa", "Vê"]]);
    await expect(dialog).toContainText("Aplicado a 2 arquivos");
    await gm.keyboard.press("Escape");
    for (const p of [ana.page, bruno.page]) {
      await expect.poll(async () => {
        await reveal(p, "Cenas");
        return treeOf(p);
      }, { timeout: 30_000 }).toEqual([true, true]);
    }
    await openNoteBy(ana.page, "Zqtaverna");
    await expect(ana.page.locator(".leaf:not([hidden])")).toContainText("zqmarcatav", { timeout: 30_000 });

    // An exception on one file, from the file's own dialog: Ana does not see it, Bruno does.
    const file = await accessDialog(gm, "Cenas/Zqtaverna.md");
    await expect(file).toContainText("Segue a pasta");
    await choose(file, "Ana", "Não vê");
    await expect(file).toContainText("Salvo");
    await expect(file).toContainText("Acesso próprio");
    await gm.keyboard.press("Escape");
    // ... and the folder's dialog lists it as an exception, with who sees it.
    const folderDialog = await accessDialog(gm, "Cenas", true);
    await expect(folderDialog.locator(".ac-ex-list")).toContainText("Cenas/Zqtaverna.md");
    await expect(folderDialog.locator(".ac-ex-list")).toContainText("1 vê");
    await expect(folderDialog).toContainText("Exceções (1)");
    await gm.keyboard.press("Escape");
    await expect.poll(async () => (await treeOf(ana.page)).join(), { timeout: 30_000 }).toBe("false,true");
    expect((await switcher(ana.page, "Zqtaverna")).join("|")).not.toContain("Zqtaverna");
    await ana.page.keyboard.press("Escape");
    expect(await traces(ana.page, ["Zqtaverna", "zqmarcatav"])).toEqual([]);
    expect(JSON.stringify(await invoke(ana.page, "list_files", {}))).not.toContain("Zqtaverna");
    expect(await treeOf(bruno.page)).toEqual([true, true]);
    // The folder's exception keeps the rest following the folder.
    await openNoteBy(ana.page, "Ponte");
    await expect(ana.page.locator(".leaf:not([hidden])")).toContainText("zqmarcaponte", { timeout: 30_000 });

    // The arrow back, on the file: it follows the folder again, and Ana sees it.
    const again = await accessDialog(gm, "Cenas/Zqtaverna.md");
    await again.getByRole("button", { name: "↺ Seguir a pasta" }).click();
    await expect(again).toContainText("Segue a pasta", { timeout: 30_000 });
    await gm.keyboard.press("Escape");
    await expect.poll(async () => (await treeOf(ana.page)).join(), { timeout: 30_000 }).toBe("true,true");
    await openNoteBy(ana.page, "Zqtaverna");
    await expect(ana.page.locator(".leaf:not([hidden])")).toContainText("zqmarcatav", { timeout: 30_000 });
    const last = await accessDialog(gm, "Cenas", true);
    await expect(last).toContainText("Exceções (0)");
    expect(await fileRow(gm, "Cenas/Ponte.md")).toBeVisible();
  });
});
