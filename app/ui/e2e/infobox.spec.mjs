// The infobox (ADR 0086): a typed note whose schema says `layout:
// infobox` shows its properties as a card at the right of the text — the
// picture at its head, the type, the declared properties, the others
// folded — in the reading view and in Edit mode; on a narrow pane the
// card goes above the text, folded to the picture and three properties.
// An edit in the card is the panel's edit; a link is followed; a web
// picture from an origin nobody approved is never fetched.

import { test, expect } from "./fixtures.mjs";

const SCHEMA = "# PdM\n\n```verso-schema\ntype: npc\nlabel: { pt-BR: PdM, en: NPC }\nlayout: infobox\nproperties:\n  - key: retrato\n    kind: image\n    label: { pt-BR: Retrato, en: Portrait }\n  - key: aliados\n    kind: link\n    label: { pt-BR: Aliados, en: Allies }\n  - key: nível\n    kind: number\n    label: { pt-BR: Nível, en: Level }\n  - key: facção\n    kind: text\n    label: { pt-BR: Facção, en: Faction }\n```\n";
const RODERICK = '---\ntype: npc\nretrato: "[[retrato-lorde.svg|Lorde Roderick]]"\naliados:\n  - "[[Barão]]"\nnível: 3\nfacção: Coroa\nhumor: azedo\n---\n# Roderick\n\nO lorde guarda a ponte.\n';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#a33"/></svg>';

async function folder(app, files) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

test("a typed note in the infobox layout: a card beside the text, named after the note, edited as the panel", async ({ app, page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": RODERICK, "Barão.md": "# Barão\n", "Irmã Cinza.md": "# Irmã\n", "retrato-lorde.svg": SVG });
  await app.quickOpen("Roderick");
  const card = page.getByRole("complementary", { name: "Roderick" });
  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/narrow/);
  // The picture at its head, its alternative text the link's alias.
  const picture = card.locator(".ib-picture img");
  await expect(picture).toHaveAttribute("alt", "Lorde Roderick");
  await expect.poll(() => picture.evaluate((i) => i.complete && i.naturalWidth)).toBe(40);
  await expect(card.locator(".props-type")).toContainText("Tipo: PdM");
  // The declared properties in the schema's order, the others folded.
  expect(await card.locator(":scope > .prop .prop-key-text").allTextContents()).toEqual(["Retrato", "Aliados", "Nível", "Facção"]);
  await expect(card.locator("details.ib-others > summary")).toHaveText("Outras propriedades (2)");
  // At the right of the text, the text beside it.
  const cardBox = await card.boundingBox();
  const textBox = await page.locator(".note-sheet > .preview:visible").boundingBox();
  expect(cardBox.x).toBeGreaterThan(textBox.x + textBox.width - 1);
  // Edit mode: the same card.
  await app.key("Mod+e");
  await expect(page.locator(".editor:visible")).toBeVisible();
  await expect(card).toBeVisible();
  // An edit in the card: one more link, written as a quoted wikilink.
  const add = card.locator('.prop[data-key="aliados"] .prop-add');
  await add.fill("Irmã Cinza");
  await add.press("Enter");
  await expect.poll(() => app.file("Roderick.md")).toBe(RODERICK.replace('  - "[[Barão]]"\n', '  - "[[Barão]]"\n  - "[[Irmã Cinza]]"\n'));
  // A link is followed.
  await card.locator('.prop[data-key="aliados"] a.wikilink', { hasText: "Barão" }).click();
  await expect(page.locator(".note-title:visible")).toHaveText("Barão");
});

test("opening a typed note in the infobox layout writes nothing", async ({ app }) => {
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": RODERICK, "retrato-lorde.svg": SVG });
  await app.quickOpen("Roderick");
  await expect(app.page.locator(".props.infobox")).toBeVisible();
  expect(await app.calls("write_note")).toEqual([]);
  expect(await app.file("Roderick.md")).toBe(RODERICK);
});

test("on a narrow pane the card goes above the text, folded to the picture and three properties", async ({ app, page }) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": RODERICK, "retrato-lorde.svg": SVG });
  await app.quickOpen("Roderick");
  const card = page.locator(".props.infobox");
  await expect(card).toHaveClass(/narrow/);
  await expect(card.locator(".ib-picture img")).toBeVisible();
  await expect(card.locator(':scope > .prop[data-key="facção"]')).toBeHidden();
  await expect(card.locator("details.ib-others")).toBeHidden();
  const cardBox = await card.boundingBox();
  const textBox = await page.locator(".note-sheet > .preview:visible").boundingBox();
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(textBox.y + 1);
  const more = card.locator(".ib-expand");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(':scope > .prop[data-key="facção"]')).toBeVisible();
  await expect(card.locator("details.ib-others")).toBeVisible();
});

test("a web picture from an origin nobody approved is not fetched: its address, why, and a way to approve", async ({ app, page }) => {
  const asked = [];
  page.on("request", (r) => r.url().startsWith("https://img.example.invalid/") && asked.push(r.url()));
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": RODERICK.replace('"[[retrato-lorde.svg|Lorde Roderick]]"', "https://img.example.invalid/roderick.png") });
  await app.quickOpen("Roderick");
  const held = page.locator(".props.infobox .ib-picture .prop-picture-held");
  await expect(held.locator(".prop-picture-address")).toHaveText("https://img.example.invalid/roderick.png");
  await expect(held.locator(".prop-picture-why")).toContainText("não foi aprovada");
  await expect(held.getByRole("button", { name: "Aprovar https://img.example.invalid" })).toBeVisible();
  await expect(page.locator(".props.infobox img")).toHaveCount(0);
  expect(asked).toEqual([]);
});

test("a picture or a link that does not fit its kind is shown as written and marked", async ({ app, page }) => {
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": '---\ntype: npc\nretrato: "[[Barão]]"\naliados: Barão\n---\n# Roderick\n', "Barão.md": "# Barão\n" });
  await app.quickOpen("Roderick");
  const card = page.locator(".props.infobox");
  await expect(card.locator(".ib-picture")).toHaveCount(0);
  await expect(card.locator('.prop[data-key="retrato"]')).toHaveClass(/misfit/);
  await expect(card.locator('.prop[data-key="retrato"] input')).toHaveValue("[[Barão]]");
  await expect(card.locator('.prop[data-key="aliados"]')).toHaveClass(/misfit/);
  await expect(card.locator('.prop[data-key="aliados"] input')).toHaveValue("Barão");
});

test("the demo vault's Porto Cinzento: the tutorial's infobox (note 13)", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Porto Cinzento");
  const card = page.getByRole("complementary", { name: "Porto Cinzento" });
  await expect(card).toBeVisible();
  const picture = card.locator(".ib-picture img");
  await expect(picture).toHaveAttribute("alt", "O Porto Cinzento visto do farol");
  await expect.poll(() => picture.evaluate((i) => i.complete && i.naturalWidth)).toBe(320);
  await expect(card.locator(".props-type")).toContainText("Tipo: Lugar");
  expect(await card.locator(':scope > .prop[data-key="habitantes"] a.wikilink').allTextContents()).toEqual(["Lia Torres", "Capitão Ruy"]);
  await expect(card.locator("details.ib-others > summary")).toHaveText("Outras propriedades (2)");
  expect(await app.calls("write_note")).toEqual([]);
});
