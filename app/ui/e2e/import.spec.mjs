// Walkthrough, section 1 (docs/reference/demo-vault-walkthrough.md):
// "Importar cofre de exemplo" into an empty folder.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const demo = readFileSync(new URL("../src/demoVault.ts", import.meta.url), "utf8");
const DEMO_FILES = [...demo.matchAll(/"path": ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1])).sort();
const parents = (p) => p.split("/").slice(0, -1).map((_, i, all) => all.slice(0, i + 1).join("/"));

test("the demo content goes into an empty folder whole, in its own folders", async ({ app }) => {
  await app.open("?vault=empty");
  expect(await app.files()).toEqual([]);
  await app.command("Importar cofre de exemplo");
  await app.page.locator(".confirm-box button.save").click();
  await expect.poll(() => app.files()).toEqual(DEMO_FILES);
  // Its folders, and none it no longer has (a51aab2: `daily`, `templates`).
  expect(await app.folders()).toEqual([...new Set(DEMO_FILES.flatMap(parents))].sort());
  // Byte for byte.
  for (const p of DEMO_FILES) {
    const want = demo.slice(demo.indexOf(`"path": ${JSON.stringify(p)}`)).match(/"b64": "([^"]*)"/)?.[1];
    expect(await app.page.evaluate((x) => window.__harness.bytes(x), p), p).toBe(want);
  }
  await expect(app.page.locator(".tab", { hasText: "00 - Bem-vindo ao Verso" }).first()).toBeVisible();
});

test("importing again over an earlier version's demo adds what is missing and names what it kept", async ({ app }) => {
  await app.open("?vault=empty");
  // The demo of an earlier version: an older welcome note, and nothing else.
  await app.writeOutside("00 - Bem-vindo ao Verso.md", "# Bem-vindo\n\nA versão antiga.\n");
  await app.folderChanged(["00 - Bem-vindo ao Verso.md"], true);
  await app.command("Importar cofre de exemplo");
  await app.page.locator(".confirm-box button.save").click();
  await expect(app.page.locator(".confirm-box")).toContainText("foram mantidos como estão");
  await expect(app.page.locator(".confirm-box")).toContainText("00 - Bem-vindo ao Verso.md");
  expect(await app.files()).toEqual(DEMO_FILES);
  expect(await app.file("00 - Bem-vindo ao Verso.md")).toBe("# Bem-vindo\n\nA versão antiga.\n");
  await app.page.locator(".confirm-box button.save").click();
  // What happened is in the app's log, for a report.
  const log = await app.page.evaluate(() => window.__harness.log.filter((l) => l.message.startsWith("import demo:")).map((l) => l.message));
  expect(log).toEqual(["import demo: asked", `import demo: ${DEMO_FILES.length} files`, `import demo: ${DEMO_FILES.length - 1} created, 0 updated, 1 kept, 0 failed`]);
});

test("importing over an untouched older demo note updates it and says how many were created, updated and kept", async ({ app }) => {
  await app.open("?vault=empty");
  // The first welcome note ever shipped (git 8c8df942): the person's
  // untouched copy of an older tutorial, not an edit. The folder also holds
  // a note of the person's own under a demo file's name.
  const old = readFileSync(new URL("./data/welcome-8c8df942.md", import.meta.url), "utf8");
  const want = Buffer.from(demo.slice(demo.indexOf('"path": "00 - Bem-vindo ao Verso.md"')).match(/"b64": "([^"]*)"/)?.[1] ?? "", "base64").toString("utf8");
  expect(old).not.toBe(want);
  await app.writeOutside("00 - Bem-vindo ao Verso.md", old);
  await app.writeOutside("01 - Guia de Markdown e Sintaxe.md", "# O meu guia\n");
  await app.folderChanged(["00 - Bem-vindo ao Verso.md", "01 - Guia de Markdown e Sintaxe.md"], true);
  await app.command("Importar cofre de exemplo");
  await app.page.locator(".confirm-box button.save").click();
  await expect(app.page.locator("#status")).toContainText("1 atualizado");
  // The edit is named, the old copy is not: it was replaced.
  await expect(app.page.locator(".confirm-box")).toContainText("01 - Guia de Markdown e Sintaxe.md");
  await expect(app.page.locator(".confirm-box")).not.toContainText("00 - Bem-vindo ao Verso.md");
  await app.page.locator(".confirm-box button.save").click();
  await expect.poll(() => app.file("00 - Bem-vindo ao Verso.md")).toBe(want);
  expect(await app.file("01 - Guia de Markdown e Sintaxe.md")).toBe("# O meu guia\n");
  const log = await app.page.evaluate(() => window.__harness.log.filter((l) => l.message.startsWith("import demo:")).map((l) => l.message));
  expect(log.at(-1)).toBe(`import demo: ${DEMO_FILES.length - 2} created, 1 updated, 1 kept, 0 failed`);
});
