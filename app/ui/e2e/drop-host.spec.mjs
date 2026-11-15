// T.11 (decided 2026-10-22): a file dragged in from the file manager is
// caught by the host (Tauri's drag-and-drop events carry the paths), so a
// drop on the tree is an import like "Importar arquivos…" — the host copies
// each file, up to the limit set in Settings — and the window is told only
// where the drop fell and the files' names. Elsewhere (a note, a board) the
// file is taken in as it always was, from its bytes. The harness plays the
// host: `files-over` and `files-dropped` come as events, `take_dropped`
// answers like the picker (`pickNext`). The real drag is checked in the app.

import { test, expect, modeOn } from "./fixtures.mjs";

const FILES = { "Zeta/Alfa.md": "a\n", "Beta.md": "beta original\n" };

async function tree(app) {
  await app.open("?vault=empty");
  for (const [p, text] of Object.entries(FILES)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(FILES), true);
  await expect(app.page.locator('#notes summary[data-folder="Zeta"]')).toBeVisible();
}
const centre = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const choose = (page, files, byToken) => page.evaluate(([f, t]) => window.__harness.pickNext(f, [], t), [files, byToken]);

test("a drag over the tree marks the folder under it, and leaving clears it", async ({ app, page }) => {
  await tree(app);
  const zeta = page.locator('#notes summary[data-folder="Zeta"]');
  const at = await centre(zeta);
  await app.emit("files-over", { over: true, ...at });
  await expect(zeta).toHaveClass(/\bdrop\b/);
  await app.emit("files-over", { over: false, x: 0, y: 0 });
  await expect(zeta).not.toHaveClass(/\bdrop\b/);
});

test("a drop on a folder of the tree is imported by the host, to the limit set, and never leaves a path", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ importMaxMb: 200 })));
  await tree(app);
  await choose(page, [{ name: "Livro.pdf", text: "livro" }, { name: "Beta.md", text: "outro beta" }], true);
  const at = await centre(page.locator('#notes summary[data-folder="Zeta"]'));
  await app.emit("files-dropped", { ...at, names: ["Livro.pdf", "Beta.md"] });
  await expect(page.locator('#notes li[data-path="Zeta/Livro.pdf"]')).toBeVisible();
  expect(await app.file("Zeta/Livro.pdf")).toBe("livro");
  expect(await app.file("Zeta/Beta.md")).toBe("outro beta");
  expect(await app.file("Beta.md")).toBe("beta original\n");
  await expect(page.locator("#status")).toContainText("2 arquivos importados");
  // The window asked the host for them by the limit set and by token, not bytes.
  const calls = await app.calls("take_dropped");
  expect(calls).toEqual([{ maxMb: 200, asBytes: false }]);
  expect((await app.calls("create_picked")).length).toBe(2);
  expect((await app.calls("create_file")).length).toBe(0);
});

test("a drop on the tree's empty part goes to the root; a file past the limit is named, the rest still come", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ importMaxMb: 1 })));
  await tree(app);
  await choose(page, [{ name: "Solto.txt", text: "x" }, { name: "Enorme.bin", text: "y".repeat(2 * 1024 * 1024) }], true);
  const at = await centre(page.locator("#tree-root"));
  await app.emit("files-dropped", { ...at, names: ["Solto.txt", "Enorme.bin"] });
  await expect(page.locator('#notes li[data-path="Solto.txt"]')).toBeVisible();
  await expect(page.locator("#status")).toContainText("Enorme.bin (grande demais, o limite é 1 MB)");
});

test("a drop on a note is taken in from its bytes, as the browser's drop was", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  await modeOn(page, "Editar");
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await choose(page, [{ name: "capa.png", text: "png-bytes" }], false);
  // A drop falls inside the window: the note is taller than the screen.
  const box = await editor.boundingBox();
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(Math.min(box.y + box.height / 2, page.viewportSize().height / 2)) };
  await app.emit("files-dropped", { ...at, names: ["capa.png"] });
  await expect.poll(async () => (await app.files()).includes("assets/capa.png")).toBe(true);
  expect(await app.calls("take_dropped")).toEqual([{ maxMb: 32, asBytes: true }]);
});
