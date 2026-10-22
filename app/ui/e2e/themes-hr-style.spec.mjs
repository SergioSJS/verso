// Themes, the horizontal rule (ADR 0109, decided 2026-10-22): hr-style is a
// closed list whose first value, asterism (the line with the ⁂), is the
// window's own and writes nothing; line, thin and fade replace it, in the
// reading view and in Live Preview, in --hr-color (the hair colour without
// one). The builder's Structure group has the control and the sample an hr.
// With SHOTS set, a screenshot of the rule per value is kept.
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;

const NOTE = `# Título

Antes da linha.

---

Depois da linha, com acentuação: ação, coração.

- item
`;
const COLORS = { "--paper": "#ffffff", "--paper-2": "#f3f1ec", "--hair": "#c9c4b8", "--ink": "#1b1b1b", "--seal": "#8a2be2", "--brass-ink": "#6b4a10" };
const settingsOf = (style, hr) => ({
  look: { light: { ...COLORS, ...(hr ? { "--hr-color": hr } : {}) }, dark: {}, ...(style ? { style: { "hr-style": style } } : {}) },
  lookName: "Linha",
});

async function open(app, style, hr, live = false) {
  const { page } = app;
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript((v) => localStorage.setItem("verso.settings", v), JSON.stringify(settingsOf(style, hr)));
  await app.open();
  await app.writeOutside("Linha.md", NOTE);
  await app.folderChanged(["Linha.md"], true);
  await app.quickOpen("Linha");
  await expect(page.locator(".leaf:not([hidden]) .preview h1")).toBeVisible();
  if (live) {
    await app.key("Mod+e");
    await expect(page.locator(".editor.live .cm-content")).toBeVisible();
    await page.locator(".editor.live .cm-line", { hasText: "Depois da linha" }).click();
  }
  return page;
}
const attr = (page) => page.evaluate(() => document.documentElement.dataset.hrStyle ?? null);
/** Computed facts of the rule: its line (::before) and its ornament (::after). */
const facts = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const b = getComputedStyle(el, "::before");
    const a = getComputedStyle(el, "::after");
    return { lineH: b.height, lineBg: b.backgroundImage !== "none" ? b.backgroundImage : b.backgroundColor, ornament: a.content };
  }, sel);
const READ = ".leaf:not([hidden]) .preview hr";
const LIVE = ".leaf:not([hidden]) .editor .cm-line.cm-lp-hr-line";
async function shot(page, name, sel) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const el = page.locator(sel).first();
  const box = await el.boundingBox();
  if (!box) return;
  await page.screenshot({ path: `${SHOTS}/hr-${name}.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 40), width: Math.min(box.width + 80, 760), height: box.height + 80 } });
}

test("with no hr-style, nothing is written on the root and the rule is the window's own, the ⁂ line @layout", async ({ app }) => {
  const page = await open(app, null);
  expect(await attr(page)).toBeNull();
  const f = await facts(page, READ);
  expect(f.lineH).toBe("1px");
  expect(f.lineBg).toBe("rgb(201, 196, 184)");
  expect(f.ornament).toContain("⁂");
  await shot(page, "default-reading", READ);
});

test("naming asterism writes nothing either, and the rule is the default @layout", async ({ app }) => {
  const page = await open(app, "asterism");
  expect(await attr(page)).toBeNull();
  const f = await facts(page, READ);
  expect(f.lineH).toBe("1px");
  expect(f.ornament).toContain("⁂");
});

for (const [value, h, bits] of [["line", "2px", ["rgb(201, 196, 184)"]], ["thin", "1px", ["rgb(201, 196, 184)"]], ["fade", "2px", ["linear-gradient"]]]) {
  test(`hr-style ${value}: written on the root, no ornament, ${h} line, in reading and in Live Preview`, async ({ app }) => {
    const page = await open(app, value);
    await expect.poll(() => attr(page)).toBe(value);
    let f = await facts(page, READ);
    expect(f.lineH).toBe(h);
    for (const b of bits) expect(f.lineBg).toContain(b);
    expect(f.ornament).toBe("none");
    await shot(page, `${value}-reading`, READ);
    await app.key("Mod+e");
    await expect(page.locator(".editor.live .cm-content")).toBeVisible();
    await page.locator(".editor.live .cm-line", { hasText: "Depois da linha" }).click();
    f = await facts(page, LIVE);
    expect(f.lineH).toBe(h);
    for (const b of bits) expect(f.lineBg).toContain(b);
    expect(f.ornament).toBe("none");
    await shot(page, `${value}-live`, LIVE);
  });
}

test("Live Preview keeps the default rule too, and the caret on the line shows the dashes @layout", async ({ app }) => {
  const page = await open(app, null, null, true);
  const f = await facts(page, LIVE);
  expect(f.ornament).toContain("⁂");
  expect(f.lineH).toBe("1px");
  await shot(page, "default-live", LIVE);
});

test("--hr-color colours the rule, in every value", async ({ app }) => {
  const page = await open(app, "line", "#d12a2a");
  const f = await facts(page, READ);
  expect(f.lineBg).toContain("rgb(209, 42, 42)");
  await shot(page, "line-red", READ);
});

test("--hr-color also colours the default ⁂ line (the line, not the ornament)", async ({ app }) => {
  const page = await open(app, null, "#d12a2a");
  const f = await facts(page, READ);
  expect(f.lineBg).toBe("rgb(209, 42, 42)");
  expect(f.ornament).toContain("⁂");
});

test("the builder's Structure group has the control and a colour row, written live and in the sample @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await page.locator(".themes").getByRole("button", { name: "Novo tema" }).click();
  const builder = page.locator(".builder");
  await expect(builder).toBeVisible();
  await builder.locator('[data-group="structure"] > summary').click();
  await expect(builder.getByLabel("Linha horizontal (---)", { exact: true }).first()).toBeVisible();
  const sample = builder.locator(".look-sample");
  await expect(sample.locator("hr")).toHaveCount(1);
  expect(await sample.locator("hr").evaluate((el) => getComputedStyle(el, "::after").content)).toContain("⁂");
  for (const value of ["line", "thin", "fade"]) {
    await builder.locator('[data-style="hr-style"] select').selectOption(value);
    await expect.poll(() => attr(page), value).toBe(value);
    expect(await sample.locator("hr").evaluate((el) => getComputedStyle(el, "::after").content), value).toBe("none");
  }
  await expect(builder.locator('[data-token="--hr-color"]')).toBeVisible();
  if (SHOTS) await builder.screenshot({ path: `${SHOTS}/hr-builder-${test.info().project.name}.png` });
  await builder.locator('[data-style="hr-style"] select').selectOption("asterism");
  await expect.poll(() => attr(page)).toBeNull();
});

// The catalogue's own themes, as the window would apply them: four notes with a rule.
const CATALOGUE = new URL("../themes/catalogue/", import.meta.url);
for (const [slug, scheme] of [["minimal", "light"], ["dracula", "dark"], ["blue-topaz", "light"], ["things", "light"], ["rose-pine", "dark"], ["catppuccin-mocha", "dark"]]) {
  test(`catalogue ${slug}: its hr-style is on the root and the rule follows it`, async ({ app }) => {
    const file = JSON.parse(readFileSync(new URL(`${slug}.verso-theme`, CATALOGUE), "utf8"));
    const look = { light: file.values.light ?? {}, dark: file.values.dark ?? {}, style: {} };
    for (const k of Object.keys(file.values)) if (k !== "light" && k !== "dark" && !k.startsWith("--") && k !== "font-size") look.style[k] = file.values[k];
    const { page } = app;
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript((v) => localStorage.setItem("verso.settings", v), JSON.stringify({ look, lookName: file.name }));
    await app.open();
    await app.writeOutside("Linha.md", NOTE + "\n> citação\n\n> [!note] Nota\n> Corpo.\n\n---\n\nFim.\n");
    await app.folderChanged(["Linha.md"], true);
    await app.quickOpen("Linha");
    await expect(page.locator(".leaf:not([hidden]) .preview h1")).toBeVisible();
    expect(await attr(page)).toBe(file.values["hr-style"]);
    const f = await facts(page, READ);
    expect(f.ornament).toBe("none");
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.locator(".leaf:not([hidden]) .preview").first().screenshot({ path: `${SHOTS}/hr-theme-${slug}.png` });
    }
  });
}
