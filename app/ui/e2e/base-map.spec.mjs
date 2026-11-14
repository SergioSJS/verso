// The rest of bases (ADR 0094): a map view of a few notes — its places
// listed, a place opening its note, a marker on the map doing the same —
// over the world outline shipped with the app, with nothing asked of the
// network; a base naming a tile origin nobody approved, which draws the
// world and asks first; `html()` drawn through the sanitizer; and a base
// embedded in a note, edited in place.

import { test, expect } from "./fixtures.mjs";

// Chromium draws WebGL with its software renderer only when told to;
// WebKit takes none of its flags.
test.use({
  launchOptions: [async ({ browserName }, use) => use(browserName === "chromium" ? { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } : {}), { scope: "worker" }],
});

/** Every request the page makes to an origin other than the harness's. */
function outside(page) {
  const seen = [];
  page.on("request", (r) => {
    const url = r.url();
    if (/^https?:/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) seen.push(url);
  });
  return seen;
}

/** Switch the open base to the view named `name`. */
async function chooseView(page, name) {
  await page.locator(".base-views").first().click();
  await page.getByRole("menuitem", { name: new RegExp(`${name} ·`) }).click();
}

test("a map view lists its places, and a place opens its note, with nothing from the network", async ({ app, page }) => {
  const seen = outside(page);
  await app.open();
  await app.quickOpen("Projetos.base");
  await chooseView(page, "Mapa");
  const list = page.locator(".base-map-list");
  await expect(list).toBeVisible();
  // The view's order (by name), each with its coordinates.
  await expect(list.locator("li")).toHaveCount(3);
  await expect(list.locator("li").filter({ hasText: "Projeto Alpha" })).toContainText("-23,5505, -46,6333");
  await expect(list.locator("li").filter({ hasText: "Projeto Beta" })).toContainText("38,7223, -9,1393");
  await expect(list).toHaveAttribute("aria-label", "Lugares do mapa");
  // The map: drawn, or saying why it cannot be — never silent.
  const box = page.locator(".base-map");
  await expect(box).toHaveAttribute("aria-label", "Mapa com 3 lugares; a lista abaixo os nomeia.");
  await expect(box.locator("canvas, .base-map-failed").first()).toBeVisible({ timeout: 20_000 });
  // A place in the list is a link, reached by Tab, opening its note.
  const alpha = list.getByRole("link", { name: "Projeto Alpha" });
  await alpha.focus();
  await expect(alpha).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab.active, .leaf-tab.active, [role=tab][aria-selected=true]").filter({ hasText: "Projeto Alpha" }).first()).toBeVisible();
  // The world outline is the window's own file: no other origin was asked.
  expect(seen).toEqual([]);
});

test("a marker on the map opens its note", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Projetos.base");
  await chooseView(page, "Mapa");
  const box = page.locator(".base-map");
  await expect(box.locator("canvas, .base-map-failed").first()).toBeVisible({ timeout: 20_000 });
  test.skip((await box.locator(".base-map-failed").count()) > 0, "no WebGL in this browser: the list is the map");
  const pins = page.locator(".base-map-pin");
  await expect(pins).toHaveCount(3);
  // Zoom by button too, named in the window's language.
  await expect(box.getByRole("button", { name: "Aproximar" })).toBeVisible();
  // Named for the hover preview, hidden from assistive technology (the
  // list names them).
  const beta = page.locator('.base-map-pin[data-preview-path="projetos/Projeto Beta.md"]');
  await expect(beta.locator("xpath=..")).toHaveAttribute("aria-hidden", "true");
  await beta.click();
  await expect(page.locator(".tab.active, .leaf-tab.active, [role=tab][aria-selected=true]").filter({ hasText: "Projeto Beta" }).first()).toBeVisible();
});

test("a base naming a tile origin nobody approved draws the world and asks first", async ({ app, page }) => {
  const seen = outside(page);
  // A tile server, answered here: nothing reaches the network.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
  await page.route("https://tiles.example.org/**", (route) => route.fulfill({ status: 200, body: png, contentType: "image/png" }));
  await app.open();
  await app.writeOutside(
    "Mundo.base",
    "views:\n  - type: map\n    name: Mundo\n    coordinates: note.local\n    mapTiles: https://tiles.example.org/{z}/{x}/{y}.png\n",
  );
  await app.folderChanged(["Mundo.base"], true);
  await app.quickOpen("Mundo.base");
  const ask = page.locator(".base-map-ask");
  await expect(ask).toContainText("Esta base pede o fundo do mapa a https://tiles.example.org.");
  await expect(page.locator(".base-map-list li")).toHaveCount(3);
  await page.waitForTimeout(500);
  expect(seen).toEqual([]);
  // Approved: kept in the person's settings, and the map asks for tiles.
  await ask.getByRole("button", { name: "Aprovar https://tiles.example.org" }).click();
  await expect(ask).toHaveCount(0);
  const approved = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings") ?? "{}").mapTileOrigins);
  expect(approved).toEqual(["https://tiles.example.org"]);
  const drawn = (await page.locator(".base-map-failed").count()) === 0;
  if (drawn) await expect.poll(() => seen.filter((u) => u.startsWith("https://tiles.example.org/")).length, { timeout: 20_000 }).toBeGreaterThan(0);
});

test("html() is drawn as HTML, through the sanitizer", async ({ app, page }) => {
  await app.open();
  await app.writeOutside(
    "Html.base",
    [
      "formulas:",
      `  rotulo: 'html("<b class=\\"forte\\">Atenção</b><img src=\\"x\\" onerror=\\"window.__hit = 1\\"><script>window.__hit = 2</script>")'`,
      'filters: file.inFolder("projetos")',
      "views:",
      "  - type: table",
      "    name: H",
      "    order: [file.name, formula.rotulo]",
      "",
    ].join("\n"),
  );
  await app.folderChanged(["Html.base"], true);
  await app.quickOpen("Html.base");
  const cell = page.locator(".base-html").first();
  await expect(cell.locator("b")).toHaveText("Atenção");
  await expect(cell.locator("script")).toHaveCount(0);
  await expect(cell.locator("img[onerror]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__hit)).toBeUndefined();
});

test("a base embedded in a note is edited in place: its menus write the .base file", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("14 - Visualização de Bases e Dados");
  const embed = page.locator(".embed-base").first();
  await expect(embed.locator(".base-table")).toBeVisible();
  // The view's tools are there, in the note.
  const sort = embed.getByRole("button", { name: "Ordenar" });
  await expect(sort).toBeVisible();
  await sort.click();
  await page.locator(".base-pop").getByRole("button", { name: /Adicionar ordenação/ }).click();
  // Written to the base's own file, over the revision read.
  await expect.poll(() => app.file("Projetos.base")).toContain("property: file.name");
  const text = await app.file("Projetos.base");
  expect(text).toContain("formula.mes"); // the rest kept
  await page.keyboard.press("Escape");
});
