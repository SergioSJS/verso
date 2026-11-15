// A note opened on a server's folder shows its text when it is read, not
// when its room is joined; what is typed in between is kept; a note nobody
// edited is never "unsaved" (perf/note-open, 2026-10-26).

import { test, expect, modeOn } from "./fixtures.mjs";

const NOTE = "Bem-vindos.md";

async function server(app, page, joinDelay) {
  await app.open();
  await page.evaluate((d) => {
    const r = window.__harness.rooms;
    r.asServer = true;
    r.up = true;
    r.joinDelay = d;
  }, joinDelay);
  await app.writeOutside(NOTE, "# Bem-vindos\n\num\n");
  await app.folderChanged([NOTE], true);
}

test("the text shows before the room joins, and what is typed meanwhile is kept once", async ({ app, page }) => {
  await server(app, page, 2500);
  const began = Date.now();
  await app.quickOpen("Bem-vindos");
  await modeOn(page, "Editar");
  const editor = page.locator(".cm-content").first();
  await expect(editor).toContainText("um", { timeout: 1500 });
  expect(Date.now() - began).toBeLessThan(2000);
  // The room has been asked and has not answered yet: nothing of the typing is in it.
  expect(await app.calls("collab_join")).toHaveLength(1);
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.type(" digitado antes");
  // Not written to the file while the room is on its way.
  await page.waitForTimeout(1500);
  expect(await app.calls("write_note")).toHaveLength(0);
  // The room joins: the tab is live, the text is there once, and the room holds it.
  await expect.poll(() => page.evaluate((n) => window.__harness.rooms.text(n), NOTE), { timeout: 8000 }).toContain("digitado antes");
  await expect(editor).toContainText("digitado antes");
  expect(((await editor.innerText()).match(/digitado antes/g) ?? []).length).toBe(1);
  await expect.poll(() => page.evaluate((n) => window.__harness.rooms.text(n), NOTE)).toContain("digitado antes");
  // Typing goes on in the room.
  await page.keyboard.type(" e depois");
  await expect.poll(() => page.evaluate((n) => window.__harness.rooms.text(n), NOTE)).toContain("digitado antes e depois");
  expect(await app.calls("write_note")).toHaveLength(0);
});

test("a note nobody edited is not unsaved, in a reader's tab or after the room joins", async ({ app, page }) => {
  await server(app, page, 300);
  await app.quickOpen("Bem-vindos");
  await modeOn(page, "Editar");
  await expect.poll(async () => (await app.calls("collab_join")).length).toBe(1);
  await page.waitForTimeout(600);
  await page.evaluate((n) => window.__harness.rooms.present(n, "Bia"), NOTE);
  await page.evaluate((n) => window.__harness.rooms.type(n, "Bia", "da Bia\n"), NOTE);
  await expect(page.locator(".cm-content").first()).toContainText("da Bia");
  const tab = page.getByRole("tab", { name: /Bem-vindos/ });
  await expect(tab).not.toHaveAccessibleName(/unsaved|salv/i);
});

test("a reader's tab is not unsaved", async ({ app, page }) => {
  await app.open("?vault=empty&side=server&role=reader");
  await app.writeOutside(NOTE, "# Bem-vindos\n\num\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Bem-vindos");
  await expect(page.locator(".cm-content").first()).toContainText("um");
  await expect(page.getByRole("tab", { name: /Bem-vindos/ })).not.toHaveAccessibleName(/unsaved|salv/i);
});
