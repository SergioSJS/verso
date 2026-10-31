// The feature switches are split over two pages (the maintainer, 2026-10-21;
// ADR 0103): Application › Features keeps the shortcuts and the general
// switches, and RPG & Solo Play › Dice and RPG holds the RPG ones, the "all"
// links and the 3D dice's appearance.

import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const SHOTS = `${process.env.HOME}/.cache/rpgset-shots`;
mkdirSync(SHOTS, { recursive: true });

async function openPage(app, page, nav) {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: nav }).click();
}

for (const [lang, general, rpgNav, all, none, link, rpgLine] of [
  ["pt-BR", "Recursos", "Dados e RPG", "Ligar todos", "Desligar todos", "Ajustes…", /Os recursos de RPG ficam em RPG & Mesa Solo/],
  ["en", "Features", "Dice and RPG", "Turn all on", "Turn all off", "Settings…", /The RPG features are in RPG & Solo Play/],
]) {
  test(`${lang}: the general page keeps the general switches; the RPG page holds the RPG ones`, async ({ app, page }, info) => {
    if (lang === "en") await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ lang: "en" })));
    await openPage(app, page, general);
    const body = page.locator(".settings-body");
    // The general page: one switch, the shortcuts, no sub-headings, a way to the RPG page.
    expect(await body.locator("input[type=checkbox]").count()).toBe(2);
    await expect(body.locator("fieldset fieldset")).toHaveCount(0);
    await expect(body.getByText(rpgLine)).toBeVisible();
    await expect(body.getByRole("button", { name: all, exact: true })).toHaveCount(0);
    await page.locator(".settings-box").screenshot({ path: `${SHOTS}/${lang}-general.png`, animations: "disabled" });

    // The sidebar entry is the first of RPG & Solo Play, and the link opens it.
    const items = await page.locator(".settings-nav-item").allTextContents();
    expect(items.map((s) => s.trim()).filter((s) => s.includes(rpgNav)).length).toBe(1);
    await body.getByRole("button", { name: rpgLine }).click();
    await expect(page.locator('.settings-nav-item[aria-current="true"]')).toContainText(rpgNav);

    const rpg = body.getByRole("group", { name: rpgNav, exact: true });
    expect(await rpg.locator("> .setting input[type=checkbox]").count()).toBe(7);
    await expect(body.getByRole("group", { name: /RPG e mesa|RPG and tabletop/ })).toBeVisible();
    await rpg.getByRole("button", { name: none, exact: true }).click();
    await expect(rpg.locator("input[type=checkbox]:checked")).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/${lang}-rpg-off.png` });
    await rpg.getByRole("button", { name: all, exact: true }).click();
    // Six come on; the 3D dice stays off.
    await expect(rpg.locator("input[type=checkbox]:checked")).toHaveCount(6);
    await page.locator(".settings-box").screenshot({ path: `${SHOTS}/${lang}-rpg.png`, animations: "disabled" });

    // The 3D dice's appearance is on this page (turn them on to see it).
    await expect(body.locator(".setting-title", { hasText: lang === "en" ? "3D dice: size" : "Dados 3D: tamanho" })).toHaveCount(1);

    // The search finds the switches and the appearance, and lands on this page.
    await page.locator(".settings-search").fill(lang === "en" ? "oracle" : "oráculo");
    await expect(body.locator(".setting-title", { hasText: lang === "en" ? "Oracles" : "Oráculos" }).first()).toBeVisible();
    await page.locator(".settings-search").fill(lang === "en" ? "texture" : "textura");
    await expect(body.locator(".setting-title", { hasText: lang === "en" ? "3D dice: texture" : "Dados 3D: textura" })).toBeVisible();
    await page.locator(".settings-search").fill("");

    // A feature with its own page links to it.
    await body.getByRole("button", { name: new RegExp(lang === "en" ? "settings of Oracles" : "ajustes de Oráculos", "i") }).click();
    await expect(page.locator('.settings-nav-item[aria-current="true"]')).toContainText(lang === "en" ? "Oracle" : "Oráculo");
    expect(link.length).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });
}
