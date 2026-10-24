// The Mesa on a phone, photographed (fix/phone-table-space, 2026-10-24): runs only with SHOTS=<dir> and
// SHOT_PREFIX; used for the before / after pairs of docs/media/test-runs/2026-10-23-mesa. Asserts nothing.

import { test } from "./fixtures.mjs";

const OUT = process.env.SHOTS;
const PREFIX = process.env.SHOT_PREFIX ?? "x";

// Skipped for the whole file, before any fixture opens a window: a skip
// inside the test left the harness unread and failed the clean-log check.
test.skip(!OUT, "SHOTS not set");

for (const theme of ["light", "dark"]) {
  test(`the Mesa, ${theme} @layout`, async ({ app, page }, info) => {
    await page.addInitScript((th) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, theme: th }));
    }, theme);
    await app.open("?vault=empty&table=owner");
    await app.writeOutside("Diario.md", "# Diário\n");
    await app.folderChanged(["Diario.md"], true);
    await page.evaluate(() => {
      const t = window.__harness.table;
      t.role = "owner";
      t.up = true;
      const hh = window.__harness;
      hh.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
      hh.emit("campaign-changed", { paths: [] });
      t.join("Bia", "#1565c0", "editor");
      t.join("Cris", "#ad1457", "reader");
      t.say("Bia", "Chegamos à taverna. Quem abre a porta?");
      t.roll("Cris", "1d20+3");
      t.say("Ana", "Eu abro.");
      t.roll("Ana", "2d6");
      t.say("Bia", "Tem alguém lá dentro?");
      t.roll("Bia", "1d20+5", { path: "Diario.md" });
      t.say("Cris", "Rolei furtividade.");
      t.roll("Cris", "1d20+2");
      t.say("Ana", "Entramos devagar.");
      t.roll("Ana", "1d8+3");
      t.say("Bia", "Vejo uma luz no fundo.");
      t.roll("Bia", "1d4+1d6+1d8");
    });
    const w = page.viewportSize()?.width ?? 1500;
    if (w <= 760) await page.locator(".bar-right").click();
    else await page.evaluate(() => document.body.classList.remove("no-right"));
    await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
    await page.locator(".table-view .table-entry").first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${PREFIX}-${info.project.name}-${theme}.png` });
  });
}
