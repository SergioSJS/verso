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
