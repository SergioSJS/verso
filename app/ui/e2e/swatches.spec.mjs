// Colour swatches (ADR 0108): a small square of the colour before a colour
// code — in code, in properties and in plain text where the code is no tag;
// in Live Preview and Source a click opens the picker, which writes the code
// back in its own format as an ordinary edit (⌘Z undoes it); in Reading the
// swatch only shows; the switch "Amostras de cor" removes them all. A note
// with codes is never rewritten by opening or reading it (invariant 7).

import { mkdirSync } from "node:fs";
import { test, expect, modeOn } from "./fixtures.mjs";

const SHOTS = `${process.env.HOME}/.cache/swatch-shots`;
mkdirSync(SHOTS, { recursive: true });

const NOTE = "Cores.md";
const TEXT = [
  "---",
  'cor: "#abcdef"',
  "tags: [bad]",
  "---",
  "# Cores",
  "",
  "Código: `#ff0000` e `rgb(10 20 30 / 50%)` e `hsl(160, 69%, 37%)`.",
  "",
  "Texto: color:#1d9e75 e rgb(29, 158, 117).",
  "",
  "Etiqueta: cor #bada55 aqui, e (#fff), **#1d9e75**.",
  "",
  "Ligações: [[Cores#abc]] e page#abc e [ver](#abc).",
  "",
  "```css",
  "a { color: #112233; }",
  "```",
  "",
].join("\n");

// The codes that get a swatch, in order: the property, the three spans, the
// two in plain text, the bold one, the block.
const SHOWN = ["#abcdef", "#ff0000", "rgb(10 20 30 / 50%)", "hsl(160, 69%, 37%)", "#1d9e75", "rgb(29, 158, 117)", "#1d9e75", "#112233"];

async function openNote(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Cores");
}
const swatches = (page, root) => page.locator(`${root} .swatch`);
const names = (loc) => loc.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const picker = (page) => page.locator(".cp");

test("Reading shows a swatch beside each code that is no tag, and no picker; the file is untouched", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const sw = swatches(page, ".preview:visible");
  // The property is the properties panel's, the rest is the body.
  await expect(sw).toHaveCount(SHOWN.length - 1);
  expect(await names(sw)).toEqual(SHOWN.slice(1).map((c) => `Cor ${c}`));
  // The property's value, in the properties panel, shows its colour too.
  await expect(page.locator(".prop-value .swatch:visible")).toHaveCount(1);
  await expect(page.locator(".prop-value .swatch:visible")).toHaveAttribute("aria-label", "Cor #abcdef — ajustar");
  // The tags stay tags, with no swatch beside them.
  // (The harness draws a tag as text; the core's reader as a link. Either way: no swatch.)
  const tagged = swatches(page, ".preview:visible p:has-text('Etiqueta:')");
  await expect(tagged).toHaveCount(1);
  await expect(tagged).toHaveAttribute("aria-label", "Cor #1d9e75");
  // It only shows: a click opens nothing, and it is no button.
  await sw.first().click({ force: true });
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator(".preview:visible button.swatch")).toHaveCount(0);
  // Its colour is the code's.
  expect(await sw.first().locator(".swatch-chip").evaluate((e) => getComputedStyle(e).getPropertyValue("--sw"))).toContain("255 0 0");
  expect(await app.file(NOTE)).toBe(TEXT);
});

for (const mode of ["Editar", "Fonte"]) {
  test(`${mode}: swatches beside the codes; a click opens the picker, a pick rewrites the code in its format, ⌘Z restores @layout`, async ({ app, page }, info) => {
    await app.open();
    await openNote(app);
    await modeOn(page, mode);
    const editor = page.locator(".cm-content:visible").first();
    const sw = editor.locator(".cm-swatch");
    // In Source the frontmatter is text; in Live it is folded to a line.
    const expected = mode === "Fonte" ? SHOWN : SHOWN.slice(1);
    await expect(sw).toHaveCount(expected.length);
    expect(await names(sw)).toEqual(expected.map((c) => `Cor ${c} — ajustar`));
    for (const code of expected) await expect(editor.getByRole("button", { name: `Cor ${code} — ajustar`, exact: true }).first()).toBeVisible();

    // A hex code: open with a click, pick with the keyboard (brightness down).
    const hex = editor.getByRole("button", { name: "Cor #ff0000 — ajustar", exact: true });
    await hex.click();
    await expect(picker(page)).toBeVisible();
    await expect(picker(page).getByRole("slider", { name: "Saturação e brilho" })).toBeFocused();
    const box = await picker(page).boundingBox();
    const vp = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-${mode}-picker.png` });
    await page.keyboard.press("ArrowDown");
    await app.key("Mod+s");
    await expect.poll(() => app.file(NOTE)).toContain("`#fc0000`");
    // Only the code changed.
    expect(await app.file(NOTE)).toBe(TEXT.replace("#ff0000", "#fc0000"));
    await page.keyboard.press("Enter");
    await expect(picker(page)).toHaveCount(0);
    // ⌘Z: the picked colour goes, the original is back.
    await app.key("Mod+z");
    await app.key("Mod+s");
    await expect.poll(() => app.file(NOTE)).toBe(TEXT);

    // rgb() keeps its syntax, its percent alpha: the hue strip by a pointer.
    const rgb = editor.getByRole("button", { name: "Cor rgb(10 20 30 / 50%) — ajustar", exact: true });
    await rgb.click();
    const strip = picker(page).getByRole("slider", { name: "Matiz" });
    const b = await strip.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.5);
    await app.key("Mod+s");
    await expect.poll(async () => (await app.file(NOTE)).includes("rgb(10 20 30 / 50%)")).toBe(false);
    expect(await app.file(NOTE)).toMatch(/`rgb\(\d+ \d+ \d+ \/ 50%\)`/);
    expect((await app.file(NOTE)).replace(/rgb\(\d+ \d+ \d+ \/ 50%\)/, "rgb(10 20 30 / 50%)")).toBe(TEXT);
    // Esc cancels and puts it back.
    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
    await app.key("Mod+s");
    await expect.poll(() => app.file(NOTE)).toBe(TEXT);

    // hsl() stays hsl() with its commas.
    await editor.getByRole("button", { name: "Cor hsl(160, 69%, 37%) — ajustar", exact: true }).click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await app.key("Mod+s");
    await expect.poll(async () => (await app.file(NOTE)).includes("hsl(160, 69%, 37%)")).toBe(false);
    expect(await app.file(NOTE)).toMatch(/`hsl\(160, \d+%, \d+%\)`/);
    await app.key("Mod+z");
    await app.key("Mod+s");
    await expect.poll(() => app.file(NOTE)).toBe(TEXT);
  });
}

test("the switch removes the swatches everywhere, and bringing it back draws them again", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  await expect(swatches(page, ".preview:visible")).toHaveCount(SHOWN.length - 1);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const box = page.locator(".settings-body").getByRole("checkbox", { name: /Amostras de cor/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.keyboard.press("Escape");
  await expect(swatches(page, ".preview:visible")).toHaveCount(0);
  // The property's swatch goes too, without leaving and coming back.
  await expect(page.locator(".prop-value .swatch:visible")).toHaveCount(0);
  await modeOn(page, "Editar");
  await expect(page.locator(".cm-content:visible .cm-swatch")).toHaveCount(0);
  expect(await app.file(NOTE)).toBe(TEXT);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  await page.locator(".settings-body").getByRole("checkbox", { name: /Amostras de cor/ }).check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-content:visible .cm-swatch")).toHaveCount(SHOWN.length - 1);
  await expect(page.locator(".prop-value .swatch:visible")).toHaveCount(1);
});

test("the property's swatch opens the picker; the pick is written into the frontmatter value in its format, nothing else changes @layout", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const sw = page.locator(".prop-value").getByRole("button", { name: "Cor #abcdef — ajustar", exact: true });
  await sw.click();
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker(page)).toHaveCount(0);
  await app.key("Mod+s");
  await expect.poll(async () => (await app.file(NOTE)).includes("#abcdef")).toBe(false);
  const after = await app.file(NOTE);
  const line = /^cor: "?(#[0-9a-f]{6})"?$/m.exec(after);
  expect(line).not.toBeNull();
  expect(after.replace(line[0], 'cor: "#abcdef"')).toBe(TEXT);
  // The field and the swatch follow the new colour.
  await expect(page.locator(".prop-input[aria-label='cor']")).toHaveValue(line[1]);
  // Keyboard: Enter on the swatch opens it; Esc leaves the file as it is.
  await page.locator(".prop-value").getByRole("button", { name: `Cor ${line[1]} — ajustar`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  await app.key("Mod+s");
  expect(await app.file(NOTE)).toBe(after);
});

test("the picker is keyboard operable and named @layout", async ({ app, page }, info) => {
  await app.open();
  await openNote(app);
  await modeOn(page, "Fonte");
  const editor = page.locator(".cm-content:visible").first();
  const hex = editor.getByRole("button", { name: "Cor #112233 — ajustar", exact: true });
  await hex.focus();
  await page.keyboard.press("Enter");
  const p = picker(page);
  await expect(p).toHaveAttribute("role", "dialog");
  await expect(p).toHaveAccessibleName("Seletor de cor");
  for (const name of ["Saturação e brilho", "Opacidade", "Matiz"]) await expect(p.getByRole("slider", { name })).toBeVisible();
  // Tab goes round the three controls and stays in the popover.
  await page.keyboard.press("Tab");
  await expect(p.getByRole("slider", { name: "Opacidade" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await app.key("Mod+s");
  await expect.poll(() => app.file(NOTE)).toContain("#112233fc");
  await page.keyboard.press("Tab");
  await expect(p.getByRole("slider", { name: "Matiz" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(p.getByRole("slider", { name: "Saturação e brilho" })).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-keyboard.png` });
  await page.keyboard.press("Escape");
  await expect(p).toHaveCount(0);
  await app.key("Mod+s");
  await expect.poll(() => app.file(NOTE)).toBe(TEXT);
});
