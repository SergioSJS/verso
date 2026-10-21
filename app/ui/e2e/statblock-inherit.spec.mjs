// Statblocks, ADR 0099 item 1 and item 6: a block that `extends:` another
// note's statblock draws the base's keys under its own, links to the base,
// and draws again when the base changes (even from outside); and the
// World of Darkness 5th-edition sheet draws with its Dark Pack notice and
// rolls its pool.

import { test, expect } from "./fixtures.mjs";

const BASE = "Bestiário de ensaio.md";
const CHILD = "Chefe de ensaio.md";
const baseText = (senses) =>
  [
    "# Bestiário de ensaio",
    "",
    "```statblock",
    "layout: d20-creature",
    "name: Goblin",
    "hp: 7",
    "ac: 15",
    `senses: ${senses}`,
    "traits:",
    "  - name: Nimble Escape",
    "    desc: Our own trait for the test.",
    "```",
    "",
  ].join("\n");
const CHILD_TEXT = ["# Chefe de ensaio", "", "```statblock", "extends: [[Bestiário de ensaio]]", "name: Goblin Rei", "hp: 21", "```", ""].join("\n");

test("a block that extends another note draws its keys, links to it and follows its changes", async ({ app, page }) => {
  await app.open();
  await app.writeOutside(BASE, baseText("darkvision 60 ft."));
  await app.writeOutside(CHILD, CHILD_TEXT);
  await app.folderChanged([BASE, CHILD], true);
  await app.quickOpen("Chefe de ensaio");
  const card = page.locator(".preview:visible .statblock-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("Goblin Rei").first()).toBeVisible();
  // Inherited: the trait, the sense, the armour; overridden: the hit points.
  await expect(card.getByText("Nimble Escape")).toBeVisible();
  await expect(card.getByText("darkvision 60 ft.")).toBeVisible();
  await expect(card.getByText("21", { exact: false }).first()).toBeVisible();
  await expect(card.locator(".statblock-badge")).toHaveCount(0);
  // Read-only: neither note was touched.
  expect(await app.file(CHILD)).toBe(CHILD_TEXT);
  expect(await app.file(BASE)).toBe(baseText("darkvision 60 ft."));

  // The base changes (another program, another device): the card follows.
  await app.writeOutside(BASE, baseText("blindsight 10 ft."));
  await app.folderChanged([BASE], false);
  await expect(card.getByText("blindsight 10 ft.")).toBeVisible();
  await expect(card.getByText("darkvision 60 ft.")).toHaveCount(0);

  // The link to the base is reached by keyboard and opens it.
  const link = card.getByRole("link", { name: /Abrir a nota-base: Goblin/ });
  await expect(link).toHaveText("baseado em Goblin");
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".leaf:not([hidden]) .preview, .leaf:not([hidden]) .cm-content").getByText("Bestiário de ensaio").first()).toBeVisible();
});

test("a base that does not exist is said on the card, and the block's own keys still draw", async ({ app, page }) => {
  await app.open();
  const text = ["# Órfão de ensaio", "", "```statblock", "name: Sem Base", "extends: Fantasma", "hp: 3", "```", ""].join("\n");
  await app.writeOutside("Órfão de ensaio.md", text);
  await app.folderChanged(["Órfão de ensaio.md"], true);
  await app.quickOpen("Órfão de ensaio");
  const card = page.locator(".preview:visible .statblock-card");
  await expect(card.getByText("Sem Base").first()).toBeVisible();
  await expect(card.locator(".statblock-badge-base")).toContainText("Fantasma");
});

test("a Vampire: The Masquerade 5e sheet draws with the Dark Pack notice and rolls its pool", async ({ app, page }) => {
  await app.open();
  const text = ["# V5 de ensaio", "", "```statblock", "layout: vtm5-character", "name: Ilse Varga", "hunger: 2", "hunger_max: 5", "health: 5", "health_superficial: 1", "```", ""].join("\n");
  await app.writeOutside("V5 de ensaio.md", text);
  await app.folderChanged(["V5 de ensaio.md"], true);
  await app.quickOpen("V5 de ensaio");
  const card = page.locator(".preview:visible .statblock-card");
  await expect(card.getByText("Ilse Varga").first()).toBeVisible();
  const notice = card.locator('[data-block="notice"]');
  await expect(notice).toContainText("Paradox Interactive AB");
  await expect(notice).toContainText("não é material oficial de World of Darkness");
  await expect(card.getByRole("group", { name: /Fome/ })).toBeVisible();
  const fields = card.locator(".statblock-roll-field input");
  await fields.nth(0).fill("3");
  await fields.nth(1).fill("1");
  await card.locator("button.statblock-roll-go").click();
  await expect(card.locator(".statblock-roll-out")).not.toBeEmpty();
  await expect(card.locator(".statblock-roll-failed")).toHaveCount(0);
});
