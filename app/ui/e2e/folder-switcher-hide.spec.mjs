// T.10 (decided 2026-10-22): a × per recent folder in the folder switcher
// hides it from the list — nothing is deleted — and "Mostrar pastas
// ocultas" in Settings › Arquivos e links brings them back. The open folder
// has no ×. The choice is kept on this device. Screenshots for the eye in
// ~/.cache/tarde-shots.

import { test, expect } from "./fixtures.mjs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/tarde-shots`;

async function switcher(page) {
  // On a phone the folder button is in the files drawer.
  if (page.viewportSize().width < 760 && (await page.locator("body.side-open").count()) === 0) {
    await page.locator(".bottom-bar .bar-files").click();
    await page.locator("aside.side").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  }
  await page.locator("#open").click();
  const box = page.getByRole("dialog", { name: "Trocar de pasta" });
  await expect(box).toBeVisible();
  return box;
}

test("the × hides a recent folder from the switcher, Settings brings it back @layout", async ({ app, page }, info) => {
  await app.open();
  const phone = page.viewportSize().width < 760;
  const tag = phone ? "phone" : "desk";
  let box = await switcher(page);
  const here = box.getByRole("region", { name: "Neste computador" });
  await expect(here.getByRole("button", { name: /^Mundo antigo/ })).toBeVisible();
  await expect(here.getByRole("button", { name: /^Mesa de testes/ })).toBeVisible();
  // The open folder has no ×; the other two have one, named for the folder.
  await expect(here.getByRole("button", { name: /^Ocultar “/ })).toHaveCount(2);
  const x = here.getByRole("button", { name: "Ocultar “Mundo antigo” da lista" });
  const target = await x.boundingBox();
  if (phone) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${SHOTS}/switcher-x-${tag}.png` });
  await x.click();
  await expect(here.getByRole("button", { name: /^Mundo antigo/ })).toHaveCount(0);
  await expect(here.getByRole("button", { name: /^Mesa de testes/ })).toBeVisible();
  // Said on screen, with the way back; the focus stays in the list.
  await expect(page.locator("#notify-toasts .notify-toast", { hasText: "“Mundo antigo” saiu da lista" })).toContainText("Mostrar pastas ocultas");
  expect(await page.evaluate(() => document.activeElement?.closest(".folder-switcher") !== null)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/switcher-hidden-${tag}.png` });
  // Kept: closed and opened again, still gone.
  await page.keyboard.press("Escape");
  await expect(box).toBeHidden();
  box = await switcher(page);
  await expect(box.getByRole("button", { name: /^Mundo antigo/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The way back, in Settings.
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  const back = page.getByRole("button", { name: "Mostrar 1 pasta oculta" });
  await expect(back).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/switcher-settings-${tag}.png` });
  await back.click();
  await expect(page.getByRole("button", { name: "Nenhuma pasta oculta" })).toBeDisabled();
  await page.keyboard.press("Escape");
  box = await switcher(page);
  await expect(box.getByRole("button", { name: /^Mundo antigo/ })).toBeVisible();
});
