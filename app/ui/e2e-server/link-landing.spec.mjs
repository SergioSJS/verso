// Where a player lands in the server's window (the real-app walk of
// 2026-11-06, findings 5a and 5c; ADR 0074 item 6 as amended that day):
//
// a. A link `/?folder=<id>&note=<path>` to a note the player may not open —
//    hidden from them, not there, outside the folder — opens their folder
//    without the note and names it nowhere: the same "not found" a hidden
//    note's read answers (ADR 0113). One they see opens as a tab.
// c. A player with one folder who lands on the start page — after signing
//    in, at `/`, or from a link to a folder they are not in — is taken
//    straight into it (the maintainer, 2026-11-06, closing "F2").
//
// Never "Escolha uma pasta deste servidor", never "Importar cofre de
// exemplo" for a reader (5b), and the hidden name (a canary word) in no
// part of the player's page.

import { expect, test } from "@playwright/test";

import { api, setup, signedIn, traces } from "./access-helpers.mjs";

test.use({ actionTimeout: 15_000 });

const FILES = {
  "Aberta.md": "# Aberta\n\nzqaberta texto\n",
  "Segredos/Zqoculta.md": "# Zqoculta\n\nzqcorpo escondido\n",
};
const HIDDEN = ["Zqoculta", "zqcorpo"];

/** The player's window settled on `name`'s folder: its tree drawn, the start page nowhere. */
async function inFolder(page, name) {
  await expect(page.locator("#folder")).toHaveText(name, { timeout: 30_000 });
  // Attached, not visible: on a phone the tree is in its drawer.
  await expect(page.locator("#notes li").first()).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  // What opens a link's note runs once the folder is shown: given its moment.
  await page.waitForTimeout(800);
  await expect(page.getByRole("heading", { name: "Escolha uma pasta deste servidor." })).toHaveCount(0);
  await expect(page.locator("button", { hasText: "Importar cofre de exemplo" })).toHaveCount(0);
}

/** Nothing of the hidden note in the page, nor in its address. */
async function noTrace(page) {
  expect(await traces(page, HIDDEN)).toEqual([]);
  expect(page.url()).not.toMatch(/Zqoculta|note=/);
  await expect(page.locator(".leaf:not([hidden])", { hasText: "zqcorpo" })).toHaveCount(0);
}

test("a link to a note a player may not open opens their folder alone, naming nothing; one they see opens", async ({ browser, page: gm }, info) => {
  test.setTimeout(300_000);
  const s = await setup(browser, gm, info, "link", FILES);
  try {
    await s.set(["Aberta.md"], "see");
    const name = `Zz cenario link-${info.project.name}`;
    const ana = s.ana.page;
    const at = (note) => `/?folder=${s.folder.id}&note=${encodeURIComponent(note)}`;
    // Hidden from her, not there, out of the folder, odd: the folder, nothing else.
    for (const note of ["Segredos/Zqoculta.md", "Zqnaoexiste.md", "../../Zqoculta.md", "/Segredos/Zqoculta.md", "Segredos/../Segredos/Zqoculta.md"]) {
      await ana.goto(at(note));
      await inFolder(ana, name);
      await noTrace(ana);
      expect(new URL(ana.url()).searchParams.get("folder")).toBe(s.folder.id);
    }
    // The tree she sees has the released note only.
    await expect(ana.locator('#notes li[data-path="Aberta.md"]')).toBeAttached();
    // A note she sees: the link opens it, as a tab of her folder's window.
    await ana.goto(at("Aberta.md"));
    await inFolder(ana, name);
    await expect(ana.locator(".leaf:not([hidden])")).toContainText("zqaberta texto", { timeout: 30_000 });
    await noTrace(ana);
  } finally {
    for (const c of s.contexts) await c.close().catch(() => {});
  }
});

test("a player with one folder lands in it: after signing in, at the root, and from a folder that is not hers", async ({ browser, page: gm }, info) => {
  test.setTimeout(300_000);
  const s = await setup(browser, gm, info, "uma", FILES);
  try {
    const name = `Zz cenario uma-${info.project.name}`;
    // A folder of the game master's that Ana is not in.
    const other = await api(gm, "POST", "/api/folders", { name: `Zz outra uma-${info.project.name}` });
    const ana = s.ana.page;
    await ana.goto("/");
    await inFolder(ana, name);
    await ana.goto(`/?folder=${other.id}&note=${encodeURIComponent("Segredos/Zqoculta.md")}`);
    await inFolder(ana, name);
    expect(new URL(ana.url()).searchParams.get("folder")).toBe(s.folder.id);
    await noTrace(ana);
    // Signed in afresh, in a browser that remembers nothing of her: her folder.
    const fresh = await browser.newContext({ locale: "pt-BR" });
    s.contexts.push(fresh);
    const again = await fresh.newPage();
    await signedIn(again, `ana-s9-uma-${info.project.name}@verso.test`, "a senha da ana");
    await inFolder(again, name);
  } finally {
    for (const c of s.contexts) await c.close().catch(() => {});
  }
});
