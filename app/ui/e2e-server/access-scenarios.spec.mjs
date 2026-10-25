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

import { PNG, dragIntoSheet, invoke, mesa, openFolder, openSheet, say, sendFile, setup, sheetDoc, switcher, traces } from "./access-helpers.mjs";

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
