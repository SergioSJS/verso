// Settings › Recursos shows its switches in two titled groups: the
// application's and the RPG ones (the maintainer, 2026-10-21; ADR 0103).

import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const SHOTS = "e2e/results/featgroups-shots";
mkdirSync(SHOTS, { recursive: true });

async function openPage(app, page, nav) {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: nav }).click();
}

for (const [lang, nav, groups, all, none, link] of [
  ["pt-BR", "Recursos", ["Aplicação", "RPG e mesa"], "Ligar todos", "Desligar todos", "Ajustes…"],
  ["en", "Features", ["Application", "RPG and tabletop"], "Turn all on", "Turn all off", "Settings…"],
]) {
  test(`${lang}: two labelled groups, their all-links, and the link to the page of a feature`, async ({ app, page }, info) => {
    if (lang === "en") await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ lang: "en" })));
    await openPage(app, page, nav);
    const body = page.locator(".settings-body");
    for (const g of groups) await expect(body.getByRole("group", { name: g, exact: true })).toBeVisible();
    const app_ = body.getByRole("group", { name: groups[0], exact: true });
    const rpg = body.getByRole("group", { name: groups[1], exact: true });
    expect(await app_.locator("input[type=checkbox]").count()).toBe(1);
    expect(await rpg.locator("input[type=checkbox]").count()).toBe(6);
    await expect(app_.getByRole("button", { name: all, exact: true })).toHaveCount(0);

    // The page's own order: shortcuts, the application's group, then the RPG one.
    const order = await body.evaluate((b) => [...b.querySelectorAll("button, input")].map((e) => e.closest("fieldset[data-group]")?.dataset.group ?? "-").filter((v, i, a) => a[i - 1] !== v));
    expect(order).toEqual(["-", "app", "rpg"]);

    await rpg.getByRole("button", { name: none, exact: true }).click();
    await expect(rpg.locator("input[type=checkbox]:checked")).toHaveCount(0);
    await expect(app_.locator("input[type=checkbox]")).toBeChecked();
    await page.screenshot({ path: `${SHOTS}/${lang}-rpg-off.png` });
    await rpg.getByRole("button", { name: all, exact: true }).click();
    // Five come on; the 3D dice stays off.
    await expect(rpg.locator("input[type=checkbox]:checked")).toHaveCount(5);
    await page.locator(".settings-box").screenshot({ path: `${SHOTS}/${lang}-page.png`, animations: "disabled" });

    // The search still finds the switches.
    await page.locator(".settings-search").fill(lang === "en" ? "oracle" : "oráculo");
    await expect(body.locator(".setting-title", { hasText: lang === "en" ? "Oracles" : "Oráculos" }).first()).toBeVisible();
    await page.locator(".settings-search").fill("");

    // A feature with its own page links to it.
    await body.getByRole("button", { name: new RegExp(lang === "en" ? "settings of Oracles" : "ajustes de Oráculos", "i") }).click();
    await expect(page.locator('.settings-nav-item[aria-current="true"]')).toContainText(lang === "en" ? "Oracle" : "Oráculo");
    expect(link.length).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });
}
