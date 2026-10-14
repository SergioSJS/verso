// The typed note (ADR 0052): a note whose `type:` names a schema of the
// folder shows its type above the properties, the declared properties
// first under their labels, a value that does not fit its kind marked, and
// an empty row for a declared key it lacks, which writes nothing until it
// is given a value. Two schemas of one name type nothing; a schema that
// does not read says so in its own note; `type:` searches.

import { test, expect } from "./fixtures.mjs";

const SCHEMA = "# PdM\n\n```verso-schema\ntype: npc\nlabel: { pt-BR: PdM, en: NPC }\nproperties:\n  - key: facção\n    kind: text\n    label: { pt-BR: Facção, en: Faction }\n  - key: nível\n    kind: number\n    label: { pt-BR: Nível, en: Level }\n  - key: aparição\n    kind: date\n    label: { pt-BR: Primeira aparição, en: First appearance }\n```\n";
const BARAO = "---\ntype: NPC\nfacção: Coroa\nnível: alto\nhumor: azedo\n---\n# Barão\n";

async function folder(app, files) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

test("a typed note shows its type, its declared properties first, and writes nothing until a value is given", async ({ app, page }) => {
  // A guide that shows a schema as an example, inside another code block:
  // an example, not a second schema of the name.
  await folder(app, { "PdM.md": SCHEMA, "Barão.md": BARAO, "Guia.md": "# Guia\n\n````markdown\n```verso-schema\ntype: npc\n```\n````\n" });
  await app.quickOpen("Barão");
  const props = page.locator(".props");
  await expect(props.locator(".props-type")).toContainText("Tipo: PdM");
  const keys = await props.locator(".prop .prop-key-text").allTextContents();
  expect(keys).toEqual(["Facção", "Nível", "Primeira aparição", "type", "humor"]);
  // `nível: alto` is not a number: shown as written, and marked.
  await expect(props.locator('.prop[data-key="nível"]')).toHaveClass(/misfit/);
  await expect(props.locator('.prop[data-key="nível"] input')).toHaveValue("alto");
  // The declared key the note lacks: an empty date row, nothing written.
  const absent = props.locator('.prop.absent[data-key="aparição"] input');
  await expect(absent).toHaveAttribute("type", "date");
  expect(await app.calls("write_note")).toEqual([]);
  // Given a value, the key goes at the end of the frontmatter.
  // `fill` fires the date field's change, as a pick does.
  await absent.fill("2026-10-07");
  await expect.poll(async () => app.file("Barão.md")).toBe("---\ntype: NPC\nfacção: Coroa\nnível: alto\nhumor: azedo\naparição: 2026-10-07\n---\n# Barão\n");
  // The schema's note opens from the type's line.
  await props.locator(".props-type-schema").click();
  await expect(page.locator(".note-title:visible")).toHaveText("PdM");
});

test("two schemas of one name type nothing; a schema that does not read says so in its note; type: searches", async ({ app, page }) => {
  await folder(app, {
    "PdM.md": SCHEMA,
    "PdM cópia.md": SCHEMA,
    "Barão.md": BARAO,
    "Lugares.md": "# Lugares\n\n```verso-schema\ntype: lugar\nproperties:\n  - key: perigo\n    kind: relation\n```\n",
  });
  await app.quickOpen("Barão");
  const line = page.locator(".props .props-type.problem");
  await expect(line).toContainText("2 schemas");
  await expect(line.locator(".props-type-schema")).toHaveCount(2);
  await app.quickOpen("Lugares");
  await expect(page.locator(".flags")).toContainText("O schema da linha 3 não lê (kind desconhecido)");
  await page.locator("#search").fill("type:npc");
  await page.locator("#search").press("Enter");
  await expect(page.locator("#notes")).toContainText("Barão");
  await expect(page.locator("#notes")).not.toContainText("Lugares");
});

test("each kind's empty row writes once, when given a value: a list, a checkbox, a number", async ({ app, page }) => {
  const schema = "```verso-schema\ntype: t\nproperties:\n  - key: aliados\n    kind: list\n  - key: ativo\n    kind: checkbox\n  - key: nível\n    kind: number\n```\n";
  await folder(app, { "Tipo.md": schema, "N.md": "---\ntype: t\nvazio:\n---\n" });
  await app.quickOpen("N");
  const props = page.locator(".props");
  // An empty value is empty, not wrong.
  await expect(props.locator('.prop[data-key="vazio"]')).not.toHaveClass(/misfit/);
  const list = props.locator('.prop.absent[data-key="aliados"] input');
  await list.fill("Lia, Ruy");
  await list.press("Enter");
  await expect.poll(async () => app.file("N.md")).toBe("---\ntype: t\nvazio:\naliados:\n  - Lia\n  - Ruy\n---\n");
  await props.locator('.prop.absent[data-key="ativo"] input').click();
  await expect.poll(async () => app.file("N.md")).toBe("---\ntype: t\nvazio:\naliados:\n  - Lia\n  - Ruy\nativo: true\n---\n");
  const level = props.locator('.prop.absent[data-key="nível"] input');
  await level.fill("3");
  await level.press("Enter");
  await expect.poll(async () => app.file("N.md")).toBe("---\ntype: t\nvazio:\naliados:\n  - Lia\n  - Ruy\nativo: true\nnível: 3\n---\n");
});

test("a property edited in the panel in Edit mode reaches the file", async ({ app, page }) => {
  // Live Preview keeps keys out of the folded frontmatter; the panel's own
  // edits pass (they were dropped as typing until 2026-10-14).
  await folder(app, { "PdM.md": SCHEMA, "Barão.md": BARAO });
  await app.quickOpen("Barão");
  await app.key("Mod+e");
  await expect(page.locator(".editor:visible")).toBeVisible();
  const faction = page.locator('.props .prop[data-key="facção"] input');
  await faction.fill("Guilda");
  await faction.press("Enter");
  await expect.poll(async () => app.file("Barão.md")).toBe(BARAO.replace("facção: Coroa", "facção: Guilda"));
});
