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

import { PDF, PNG, accessDialog, entries, applyFolder, choose, exceptionsOf, fileRow, openNoteBy, reveal, tryInvoke, dragIntoSheet, invoke, mesa, openFolder, openSheet, say, sendFile, setup, sheetDoc, switcher, traces, where } from "./access-helpers.mjs";

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
      expect(JSON.stringify(await entries(p))).not.toContain("Zqsegredo");
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
async function drawText(page, text, at = [0, 300]) {
  const free = await onBoard(page, at[0], at[1]);
  await page.mouse.click(free.x, free.y);
  await page.keyboard.press("t");
  await page.mouse.click(free.x, free.y);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  const away = await onBoard(page, 500, 520);
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
    await drawText(bruno.page, "do Bruno antes", [250, 420]);
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
    await drawText(bruno.page, "do Bruno depois", [250, 420]);
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
    await expect(folderDialog).toContainText("1 arquivo com acesso próprio");
    const listed = await exceptionsOf(folderDialog);
    await expect(listed).toContainText("Zqtaverna");
    await expect(listed).toContainText("1 vê");
    await gm.keyboard.press("Escape");
    await expect.poll(async () => (await treeOf(ana.page)).join(), { timeout: 30_000 }).toBe("false,true");
    // The tab she had open on it drops its content at once — no closing it, no reload:
    // neutral words, no name, no text, nothing of it in the page, the status line,
    // the tab, the recent files or the switcher.
    const dead = ana.page.locator(".leaf.unshared");
    await expect(dead).toHaveCount(1, { timeout: 30_000 });
    await expect(dead).toContainText("Este arquivo não é mais compartilhado com você");
    await expect(ana.page.locator(".tab-list .tab", { hasText: "Sem acesso" })).toHaveCount(1);
    await expect(ana.page.locator("#status")).not.toContainText("Zqtaverna");
    expect(await traces(ana.page, ["Zqtaverna", "zqmarcatav"]), await where(ana.page, "Zqtaverna")).toEqual([]);
    expect((await switcher(ana.page, "")).join("|")).not.toContain("Zqtaverna");
    expect((await switcher(ana.page, "Zqtaverna")).join("|")).not.toContain("Zqtaverna");
    await ana.page.keyboard.press("Escape");
    expect(await traces(ana.page, ["Zqtaverna", "zqmarcatav"])).toEqual([]);
    expect(JSON.stringify(await entries(ana.page))).not.toContain("Zqtaverna");
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
    await expect(last.getByRole("button", { name: /com acesso próprio/ })).toHaveCount(0);
    await expect(await fileRow(gm, "Cenas/Ponte.md")).toBeVisible();
  });
});

/** The window's tabs closed, from each tab's menu. */
async function closeTabs(page) {
  while ((await page.locator(".tab-list .tab").count()) > 0) {
    await page.locator(".tab-list .tab").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Fechar aba", exact: true }).click();
  }
}

/** Rows of an open menu, picked by its labels ("Novo", then "Nova nota nesta pasta"). */
async function pickMenu(page, ...labels) {
  const menu = page.locator(".menu:not([hidden])");
  for (const name of labels) await menu.getByRole("menuitem", { name, exact: true }).click();
}

test("d. Ana, given \"Cria notas\", makes and renames a note in a folder she edits and cannot delete it; a name a hidden file holds gets the silent suffix", async ({ browser, page: gm }, info) => {
  const files = { "Diario/Base.md": "# Base\n", "Diario/Zqsombra.md": "# Zqsombra\n\nzqcorposombra\n" };
  await scenario(browser, gm, info, "criar", files, async ({ folder, ana, bruno, set, id }) => {
    // Edits on a folder renames what is in it; adding to it is a right of its own (ADR 0113 K.6).
    await invoke(gm, "table_rights_set", { root: "", accounts: [id("Ana")], right: "create_notes", on: true });
    // The folder: the table sees, Ana edits. One file of it is hidden from all.
    await applyFolder(gm, "Diario", [["Toda a mesa", "Vê"], ["Ana", "Edita"]]);
    await gm.keyboard.press("Escape");
    await set(["Diario/Zqsombra.md"], "none");
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    await reveal(ana.page, "Diario");
    const mine = (n) => ana.page.locator(`#notes li[data-path="Diario/${n}.md"]`);
    await expect(mine("Base")).toBeVisible({ timeout: 30_000 });
    expect(await traces(ana.page, ["Zqsombra", "zqcorposombra"])).toEqual([]);

    // She makes a note in the folder, from the folder's menu.
    await ana.page.locator('#notes summary[data-folder="Diario"]').click({ button: "right" });
    await pickMenu(ana.page, "Novo", "Nova nota nesta pasta");
    await ana.page.locator("input.new-note").fill("Sessao um");
    await ana.page.locator("input.new-note").press("Enter");
    await expect.poll(async () => (await entries(gm)).includes("Diario/Sessao um.md"), { timeout: 30_000 }).toBe(true);
    await expect(mine("Sessao um")).toBeVisible({ timeout: 30_000 });

    // She renames it, from the note's menu.
    await mine("Sessao um").locator("> button").click({ button: "right" });
    await ana.page.getByRole("menuitem", { name: "Renomear", exact: true }).click();
    await ana.page.locator("input.rename").fill("Sessao dois");
    await ana.page.locator("input.rename").press("Enter");
    await expect.poll(async () => (await entries(gm)).filter((f) => f.startsWith("Diario/Sessao")), { timeout: 30_000 }).toEqual(["Diario/Sessao dois.md"]);
    await expect(mine("Sessao dois")).toBeVisible({ timeout: 30_000 });

    // She cannot delete it: no row in the menu, and the command is refused.
    await mine("Sessao dois").locator("> button").click({ button: "right" });
    await expect(ana.page.getByRole("menuitem", { name: "Renomear", exact: true })).toBeVisible();
    await expect(ana.page.getByRole("menuitem", { name: "Mover para a lixeira", exact: true })).toHaveCount(0);
    await ana.page.keyboard.press("Escape");
    const refused = await tryInvoke(ana.page, "delete_entry", { path: "Diario/Sessao dois.md" });
    expect(refused.error, JSON.stringify(refused)).toBeTruthy();
    expect(await entries(gm)).toContain("Diario/Sessao dois.md");

    // A name that a hidden file holds: the silent suffix, no word of the hidden one.
    await ana.page.locator('#notes summary[data-folder="Diario"]').click({ button: "right" });
    await pickMenu(ana.page, "Novo", "Nova nota nesta pasta");
    await ana.page.locator("input.new-note").fill("Zqsombra");
    await ana.page.locator("input.new-note").press("Enter");
    await expect.poll(async () => (await entries(gm)).filter((f) => f.startsWith("Diario/Zqsombra")).sort(), { timeout: 30_000 }).toEqual(["Diario/Zqsombra 2.md", "Diario/Zqsombra.md"]);
    await expect(mine("Zqsombra 2")).toBeVisible({ timeout: 30_000 });
    await expect(ana.page.locator("#status")).not.toContainText(/exist|já|outro nome/i);
    expect(await ana.page.locator('#notes li[data-path="Diario/Zqsombra.md"]').count()).toBe(0);
    // Her own file is hers; the hidden one's body is in no page of hers.
    expect(await traces(ana.page, ["zqcorposombra"])).toEqual([]);
    expect(await entries(ana.page)).not.toContain("Diario/Zqsombra.md");
    // The same through the contract: a rename onto the hidden name is also suffixed, never "exists".
    const moved = await tryInvoke(ana.page, "rename_entry", { from: "Diario/Sessao dois.md", to: "Diario/Zqsombra.md" });
    expect(moved.error, JSON.stringify(moved)).toBeFalsy();
    expect(moved.path).toBe("Diario/Zqsombra 3.md");
    // Bruno sees Ana's notes of the folder (it is shared with the table) and nothing of the hidden one.
    await expect.poll(async () => (await entries(bruno.page)).includes("Diario/Zqsombra 2.md"), { timeout: 30_000 }).toBe(true);
    expect(await traces(bruno.page, ["zqcorposombra", "Zqsombra.md"])).toEqual([]);
  });
});

test("e. the game master moves a file with its own access into another folder: it keeps it, as an exception of the new folder", async ({ browser, page: gm }, info) => {
  const files = { "A/Zqitem.md": "# Zqitem\n\nzqcorpoitem\n", "A/Outro.md": "# Outro\n", "B/Base.md": "# Base\n" };
  await scenario(browser, gm, info, "mover", files, async ({ folder, ana, bruno, set, id }) => {
    await applyFolder(gm, "A", [["Toda a mesa", "Vê"]]);
    await applyFolder(gm, "B", [["Toda a mesa", "Vê"]]);
    await gm.keyboard.press("Escape");
    // The file has its own access: only Ana, and she edits.
    await set(["A/Zqitem.md"], "none", { Ana: "edit" });
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    await reveal(ana.page, "A");
    await reveal(bruno.page, "A");
    await expect(ana.page.locator('#notes li[data-path="A/Zqitem.md"]')).toBeVisible({ timeout: 30_000 });
    await expect(bruno.page.locator('#notes li[data-path="A/Outro.md"]')).toBeVisible({ timeout: 30_000 });
    expect(await traces(bruno.page, ["Zqitem", "zqcorpoitem"])).toEqual([]);
    // In A's dialog it is an exception.
    const before = await accessDialog(gm, "A", true);
    await expect(await exceptionsOf(before)).toContainText("Zqitem");
    await gm.keyboard.press("Escape");

    // The move.
    await gm.locator('#notes li[data-path="A/Zqitem.md"] > button').click({ button: "right" });
    await gm.getByRole("menuitem", { name: "Mover para…", exact: true }).click();
    await gm.locator("input.new-note").fill("B");
    await gm.locator("input.new-note").press("Enter");
    await expect.poll(async () => (await entries(gm)).filter((f) => f.endsWith("Zqitem.md")), { timeout: 30_000 }).toEqual(["B/Zqitem.md"]);
    await expect(gm.locator('#notes li[data-path="B/Zqitem.md"]')).toBeVisible({ timeout: 30_000 });
    const own = (await invoke(gm, "access_get", { paths: ["B/Zqitem.md"] }))[0];
    expect(own.own, "the file has its own access").toBeTruthy();
    expect(own.own.whole).toBe("none");
    expect(own.own.rows).toEqual([{ account: id("Ana"), level: "edit" }]);

    // The new folder's dialog shows it as an exception: Ana edits; the old folder lists none.
    const after = await accessDialog(gm, "B", true);
    await expect(after).toContainText("1 arquivo com acesso próprio");
    const listedB = await exceptionsOf(after);
    await expect(listedB).toContainText("Zqitem");
    await expect(listedB).toContainText("Ana edita");
    await gm.keyboard.press("Escape");
    const old = await accessDialog(gm, "A", true);
    await expect(old.getByRole("button", { name: /com acesso próprio/ })).toHaveCount(0);
    await gm.keyboard.press("Escape");
    // The file's dialog says it is its own, as an exception of B.
    const file = await accessDialog(gm, "B/Zqitem.md");
    await expect(file).toContainText("Acesso próprio (exceção de “B”)");
    await gm.keyboard.press("Escape");

    // Ana still has it, in B, and edits it; Bruno has no word of it.
    await expect.poll(async () => (await entries(ana.page)).includes("B/Zqitem.md"), { timeout: 30_000 }).toBe(true);
    const read = await invoke(ana.page, "read_note", { path: "B/Zqitem.md" });
    const wrote = await tryInvoke(ana.page, "write_note", { path: "B/Zqitem.md", text: `${read.text}\nAna foi aqui\n`, revision: read.revision });
    expect(wrote.error, JSON.stringify(wrote)).toBeFalsy();
    expect((await invoke(gm, "read_note", { path: "B/Zqitem.md" })).text).toContain("Ana foi aqui");
    await expect.poll(async () => (await entries(bruno.page)).includes("B/Base.md"), { timeout: 30_000 }).toBe(true);
    expect(await traces(bruno.page, ["Zqitem", "zqcorpoitem"])).toEqual([]);
    expect(JSON.stringify(await entries(bruno.page))).not.toContain("Zqitem");
  });
});

test("f. Ana, with \"Arquivos\", sends a PDF to the chat and the game master and Bruno see its card; without the right she cannot", async ({ browser, page: gm }, info) => {
  const files = { "Fichas/Ana.md": "# Ana\n", "Zqsegredo.md": "# Zqsegredo\n\nzqcorpo\n" };
  await scenario(browser, gm, info, "pdf", files, async ({ folder, ana, bruno, set }) => {
    await set(["Fichas/Ana.md"], "none", { Ana: "edit" });
    await set(["Zqsegredo.md"], "none");
    await openFolder(ana.page, folder.id);
    await openFolder(bruno.page, folder.id);
    const [g, a, b] = [await mesa(gm), await mesa(ana.page), await mesa(bruno.page)];
    const attach = a.getByRole("button", { name: "Anexar imagem" });
    const cards = (v) => v.locator(".table-file", { hasText: "PDF" });
    // The players are in the game master's status now: a command that changes the table makes the window ask again.
    await invoke(gm, "campaign_settings", { root: "", open: true, logMax: null, imageMax: null });
    await g.getByRole("button", { name: "Abrir a janela da Mesa" }).click();
    const dialog = gm.locator(".campaign-dialog");
    await expect(dialog).toBeVisible();
    const sw = dialog.getByRole("switch", { name: "Ana pode enviar arquivos" });

    // Without the right: no button, the paste is not taken, the command is refused.
    await expect(attach).toBeHidden();
    await dialog.getByRole("button", { name: /^Ana tem \d de 4 direitos/ }).click({ timeout: 15_000 });
    await expect(sw).toBeVisible({ timeout: 15_000 });
    await expect(sw).not.toBeChecked();
    await sendFile(ana.page, a, "plano.pdf", "application/pdf", PDF);
    const refused = await tryInvoke(ana.page, "table_send_image", { base64: PDF.toString("base64"), table: null });
    expect(refused.error, JSON.stringify(refused)).toBeTruthy();
    await ana.page.waitForTimeout(1000);
    for (const v of [g, a, b]) await expect(cards(v)).toHaveCount(0);

    // The game master lets her: the button appears, live; her PDF reaches the others as a card.
    await sw.check({ force: true });
    await expect(dialog.locator(".cd-right").filter({ has: gm.getByRole("switch", { name: "Ana pode enviar arquivos" }) }).locator(".cd-feedback")).toContainText("Salvo");
    await expect(attach).toBeVisible({ timeout: 15_000 });
    await sendFile(ana.page, a, "plano.pdf", "application/pdf", PDF);
    for (const v of [g, a, b]) await expect(cards(v)).toHaveCount(1, { timeout: 30_000 });
    expect((await invoke(gm, "list_files", {})).some((f) => /attachments\/mesa-\d+-\w+\.pdf$/.test(f))).toBe(true);
    // Bruno has no right of his own: no button.
    await expect(b.getByRole("button", { name: "Anexar imagem" })).toBeHidden();
    // A click on the card opens the file for those who see it (the table's own place is the table's).
    await cards(b).click();
    await expect(bruno.page.locator(".leaf:not([hidden])")).toBeVisible({ timeout: 30_000 });

    // The right taken back: the button goes at once.
    await sw.uncheck({ force: true });
    await expect(attach).toBeHidden({ timeout: 15_000 });
    for (const p of [ana.page, bruno.page]) {
      expect(await traces(p, ["Zqsegredo", "zqcorpo"])).toEqual([]);
      expect(JSON.stringify(await entries(p))).not.toContain("Zqsegredo");
    }
  });
});

test("g. a board and a picture Ana has open drop their content when the game master stops sharing them, at once", async ({ browser, page: gm }, info) => {
  const board = JSON.stringify({
    nodes: [
      { id: "um", type: "text", text: "zqcartaoum", x: 0, y: 0, width: 200, height: 60 },
      { id: "dois", type: "text", text: "zqcartaodois", x: 300, y: 0, width: 200, height: 60 },
    ],
    edges: [],
  });
  const files = { "Zqquadro.canvas": board, "Livre.md": "# Livre\n" };
  await scenario(browser, gm, info, "retirar", files, async ({ folder, ana, set }) => {
    await invoke(gm, "create_file", { path: "Zqfigura.png", base64: PNG.toString("base64") });
    await set(["Zqquadro.canvas", "Zqfigura.png", "Livre.md"], "see");
    await openBoard(ana.page, folder.id, "Zqquadro");
    await expect.poll(async () => (await scene(ana.page)).length).toBeGreaterThanOrEqual(2);
    const cards = () => ana.page.evaluate(() => JSON.stringify((window.__VERSO_TEST__?.board?.getSceneElements() ?? []).map((e) => e.customData ?? null)));
    expect(await cards()).toContain("zqcartaoum");
    // A double click keeps the board's tab (a preview tab is replaced by the next file opened).
    await ana.page.locator(".tab-list .tab").first().dblclick();
    // The picture, from the tree, in a tab of its own.
    await ana.page.locator('#notes li[data-path="Zqfigura.png"] > button').click();
    await expect(ana.page.locator(".leaf:not([hidden]) img").first()).toBeVisible({ timeout: 30_000 });

    // The game master takes both away: no closing, no reload.
    await set(["Zqquadro.canvas", "Zqfigura.png"], "none");
    await expect(ana.page.locator(".leaf.unshared")).toHaveCount(2, { timeout: 30_000 });
    await expect(ana.page.locator(".tab-list .tab", { hasText: "Sem acesso" })).toHaveCount(2);
    expect(await traces(ana.page, ["Zqquadro", "Zqfigura", "zqcartaoum", "zqcartaodois"]), await where(ana.page, "Zqquadro")).toEqual([]);
    await expect(ana.page.locator("#status")).not.toContainText(/Zqquadro|Zqfigura/);
    expect(await ana.page.locator(".leaf img[src*='Zqfigura']").count()).toBe(0);
    expect((await switcher(ana.page, "Zq")).join("|")).not.toMatch(/Zqquadro|Zqfigura/);
    await ana.page.keyboard.press("Escape");
    // What stays shared stays usable.
    await openNoteBy(ana.page, "Livre");
  });
});
