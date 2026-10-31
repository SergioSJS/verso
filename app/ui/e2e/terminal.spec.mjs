// The embedded terminal (ADR 0115, section G): off by default, a switch in
// Settings › Features turns it on and the host refuses it while off; a tab
// from the palette or a folder's menu, its prompt, keys typed and answered,
// the size told, the keys that leave it, a close that asks while a program
// runs; the AI tools found on a click and started in a new tab; the window
// of a server's folder opening it in the home directory with a line; and
// the server's own window and a loose-files window drawing no entry at all.
// The harness has no pseudo-terminal: its scripted shell (src/harness/
// terminal.ts) answers as the host does.

import { test, expect } from "./fixtures.mjs";

/** The terminal switch as a person's stored settings, before the window loads. */
async function withSwitch(page, on = true, lang = null) {
  await page.addInitScript(
    ([value, language]) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, ...(language ? { lang: language } : {}), features: { ...(s.features ?? {}), terminal: value } }));
    },
    [on, lang],
  );
}

/** What the terminal in front shows. */
const screen = (page) => page.evaluate(() => window.__VERSO_TEST__.terminal?.() ?? "");

/** Whether the palette lists `label`. */
async function paletteHas(app, label) {
  await app.key("Mod+Shift+p");
  await app.page.keyboard.type(label);
  const rows = app.page.locator(".palette:not([hidden]) .quick-list li", { hasText: label });
  const n = await rows.count();
  await app.page.keyboard.press("Escape");
  return n > 0;
}

const busy = (page) => page.evaluate(() => [...window.__harness.terminals.open.values()].some((t) => t.busy));

test("off by default: no entry, the host refuses, and Settings › Features turns it on", async ({ app, page }) => {
  await app.open();
  expect(await paletteHas(app, "Novo terminal")).toBe(false);
  // A stale command is refused while the switch is off.
  const refused = await page.evaluate(() =>
    window.__harness
      .invoke("terminal_open", { start: { size: { cols: 80, rows: 24 }, folder: null, cli: null, shell: null, locale: null }, output: { onmessage() {} } })
      .then(
        () => "opened",
        (e) => e.kind,
      ),
  );
  expect(refused).toBe("refused");
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: /^Recursos$/ }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Terminal$/ }) });
  const box = row.locator("input[type=checkbox]");
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__harness.terminals.on)).toBe(true);
  expect(await paletteHas(app, "Novo terminal")).toBe(true);
});

test("a terminal from the palette: prompt, keys answered, size, the keys that leave it, a close that asks", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await app.quickOpen("00 - Bem-vindo");
  await app.command("Novo terminal");
  const tab = page.locator(".tab", { hasText: /^Terminal — / });
  await expect(tab).toHaveCount(1);
  await expect.poll(() => screen(page)).toContain("demo-vault $");
  // The notice, the first time in this folder.
  await expect(page.locator(".terminal-line", { hasText: "histórico de versões" })).toBeVisible();
  await expect(page.locator(".terminal-where")).toHaveText(/zsh em /);
  // Keys typed reach the shell, accents whole, and its answer is drawn.
  await page.keyboard.type("echo olá, ação, você, pôr, à");
  await page.keyboard.press("Enter");
  await expect.poll(() => screen(page)).toMatch(/\nolá, ação, você, pôr, à/);
  // The size reaches the host when the box changes.
  const before = (await app.calls("terminal_resize")).length;
  await page.setViewportSize({ width: 900, height: 600 });
  await expect.poll(async () => (await app.calls("terminal_resize")).length).toBeGreaterThan(before);
  // ⌘⇧] is the app's: the keyboard leaves the terminal for the next tab.
  await page.locator(".terminal-host").click();
  await app.key("Mod+Shift+]");
  await expect(page.locator(".tab[aria-selected=true]")).not.toHaveText(/Terminal/);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".terminal-host")))).toBe(false);
  // Back in it: a program runs, so closing asks; Cancelar keeps it.
  await tab.click();
  await page.locator(".terminal-host").click();
  await page.keyboard.type("sleep 100");
  await page.keyboard.press("Enter");
  await expect.poll(() => busy(page)).toBe(true);
  await app.key("Mod+w");
  const question = page.getByRole("alertdialog");
  await expect(question).toContainText("Um programa ainda está rodando");
  await question.getByRole("button", { name: "Cancelar" }).click();
  await expect(tab).toHaveCount(1);
  // Ctrl+C reaches the program; then the tab closes and the shell with it.
  await page.locator(".terminal-host").click();
  await page.keyboard.press("Control+c");
  await expect.poll(() => busy(page)).toBe(false);
  await app.key("Mod+w");
  await expect(tab).toHaveCount(0);
  expect((await app.calls("terminal_close")).length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__harness.terminals.open.size)).toBe(0);
  // A second terminal in the same folder says nothing more.
  await app.command("Novo terminal");
  await expect.poll(() => screen(page)).toContain("demo-vault $");
  await expect(page.locator(".terminal-line", { hasText: "histórico de versões" })).toHaveCount(0);
});

test("a shell that exits closes its tab and says how", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await app.command("Novo terminal");
  await expect.poll(() => screen(page)).toContain("$ ");
  await page.keyboard.type("exit");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab", { hasText: /^Terminal — / })).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("O terminal terminou (código 0).");
});

test("the AI tools: asked on a click, a found one starts in a new terminal, an absent one opens its install page", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await app.command("Novo terminal");
  await expect.poll(() => screen(page)).toContain("$ ");
  expect((await app.calls("terminal_detect")).length).toBe(0);
  await page.locator(".leaf:not([hidden])").getByRole("button", { name: "Ferramentas de IA" }).click();
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu).toContainText("Abrir Claude Code");
  await expect(menu).toContainText("Codex não está instalado");
  await expect(menu).toContainText("OpenCode não está instalado");
  await expect(menu).toContainText("Cursor CLI não está instalado");
  await menu.getByText("Abrir Gemini CLI").click();
  await expect(page.locator(".tab", { hasText: /^Terminal 2 — / })).toHaveCount(1);
  await expect.poll(() => screen(page)).toContain("gemini: started in the harness");
  await page.locator(".leaf:not([hidden])").getByRole("button", { name: "Ferramentas de IA" }).click();
  await page.locator(".menu:not([hidden])").getByText("Codex não está instalado").click();
  await expect.poll(() => page.evaluate(() => window.__harness.terminals.pages)).toEqual(["codex"]);
});

test("Open terminal here on a folder of the tree starts the shell there", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await page.locator('#notes summary[data-folder="Personagens"]').click({ button: "right" });
  await page.locator(".menu:not([hidden])").getByText("Abrir terminal aqui").click();
  await expect(page.locator(".tab", { hasText: "Terminal — Personagens" })).toHaveCount(1);
  await expect.poll(() => screen(page)).toContain("Personagens $");
  const start = (await app.calls("terminal_open")).at(-1).start;
  expect(start.folder).toBe("Personagens");
});

test("a window reloaded brings its terminal tab back", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await app.command("Novo terminal");
  await expect.poll(() => screen(page)).toContain("demo-vault $");
  // The layout is kept a moment after it changes.
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  // The harness's shell did not survive the page (the app's host keeps
  // it, tests_terminal.rs): the tab asks for it again, then starts one.
  await expect(page.locator(".tab", { hasText: /^Terminal — / })).toHaveCount(1);
  await expect.poll(() => screen(page)).toContain("demo-vault $");
  expect((await app.calls("terminal_attach")).length).toBe(1);
});

test("a desktop window on a server's folder opens the shell in the home directory, and says so", async ({ app, page }) => {
  await withSwitch(page);
  await app.open();
  await page.evaluate(() => window.__harness.showServerFolder("owner"));
  await expect.poll(() => paletteHas(app, "Novo terminal")).toBe(true);
  await app.command("Novo terminal");
  await expect(page.locator(".terminal-line", { hasText: "não está neste computador" })).toBeVisible();
  await expect.poll(() => screen(page)).toContain("~ $");
});

test("in English: the tab, the tools and the notice speak English", async ({ app, page }) => {
  await withSwitch(page, true, "en");
  await app.open();
  await app.command("New terminal");
  await expect(page.locator(".tab", { hasText: /^Terminal — / })).toHaveCount(1);
  await expect(page.locator(".terminal-line", { hasText: "version history" })).toBeVisible();
  await expect(page.locator(".leaf:not([hidden])").getByRole("button", { name: "AI tools" })).toBeVisible();
  await expect(page.locator(".terminal-where")).toHaveText(/zsh in /);
});

for (const [name, query] of [
  ["the server's own window", "?side=server"],
  ["a loose-files window", "?loose=1"],
]) {
  test(`${name} draws no terminal entry anywhere, the switch on`, async ({ app, page }) => {
    await withSwitch(page);
    await app.open(query);
    expect(await paletteHas(app, "Novo terminal")).toBe(false);
    await app.key("Mod+,");
    // "Terminal e agentes" may be there for the verso command and the MCP
    // (ADR 0054, the loose window has them); it holds no terminal row.
    const cli = page.locator(".settings-nav-item", { hasText: /^Terminal e agentes$/ });
    if (query === "?side=server") await expect(cli).toHaveCount(0);
    else if (await cli.count()) {
      await cli.click();
      await expect(page.locator(".setting-title", { hasText: /^Terminal$|^Ferramentas de IA$/ })).toHaveCount(0);
    }
    const features = page.locator(".settings-nav-item", { hasText: /^Recursos$/ });
    if (await features.count()) {
      await features.click();
      await expect(page.locator(".setting-title", { hasText: /^Terminal$/ })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    if (query === "?side=server") {
      // A folder's menu has no "Open terminal here".
      await page.locator('#notes summary[data-folder="Personagens"]').click({ button: "right" });
      await expect(page.locator(".menu:not([hidden])")).toBeVisible();
      await expect(page.locator(".menu:not([hidden])").getByText("Abrir terminal aqui")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    expect((await app.calls("terminal_open")).length).toBe(0);
    expect((await app.calls("set_terminal_enabled")).length).toBe(0);
  });
}
