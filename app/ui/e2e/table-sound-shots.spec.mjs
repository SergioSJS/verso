// Screenshots of the table's music for the maintainer (ADR 0116 as amended
// 2026-10-31), with real music: run only in the Docker e2e when a folder of
// MP3s is mounted at /logs/music-test (they are never part of the repo).
// The harness's folder gets the files' names; their bytes are served from
// that folder, so each element loads and measures a real track. Shots go to
// /logs/shots/music.

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const MUSIC = "/logs/music-test";
const SHOTS = "/logs/shots/music";
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

/** Where each real track goes in the harness's folder. */
const PLACES = [
  ["Dingy Tavern - Fast.mp3", "Música/Taverna"],
  ["Tourist Trap.mp3", "Música/Taverna"],
  ["Kraghammer.mp3", "Música/Cidade"],
  ["Frost and Steel - Ambient.mp3", "Música/Combate"],
  ["The Atropal.mp3", "Música/Combate"],
  ["The Blooming Grove.mp3", "Música/Floresta"],
  ["Dreamer’s Ziggurat.mp3", "Música/Masmorra"],
  ["Echoes from the Abyss - Ambient.mp3", "Música/Masmorra"],
];

const NOTE = `# Sessão 3 — A Torre

## Chegada na cidade

- [[Kraghammer]]
- [[Dingy Tavern - Fast]]

## A emboscada

- [[Frost and Steel - Ambient]]
- [[The Atropal]]

## Na masmorra

- [[Echoes from the Abyss - Ambient]]
- [[Dreamer’s Ziggurat]]
`;

async function shot(page, name, info) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });
}

async function setUp(app, page, role) {
  const there = new Set(existsSync(MUSIC) ? readdirSync(MUSIC) : []);
  const files = PLACES.filter(([f]) => there.has(f)).map(([f, dir]) => [`${dir}/${f}`, `${MUSIC}/${f}`]);
  // The real bytes, for the element.
  await page.route("**/__vault/M%C3%BAsica/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice("/__vault/".length));
    const hit = files.find(([p]) => p === path);
    if (!hit) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ status: 200, body: readFileSync(hit[1]), contentType: "audio/mpeg" });
  });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  app.expectFault(/request failed: \/__vault\/Música\//);
  await app.open("?vault=empty");
  await page.evaluate(
    ([paths, role]) => {
      const h = window.__harness;
      // A few bytes stand for each file in the folder's list: the element is served the real ones.
      for (const p of paths) h.core.handlers.create_file({ path: p, base64: "SUQzBAAAAAAAAA==" });
      h.table.role = role;
      h.table.up = true;
      h.table.join("Ana", "#1565c0", "reader");
      h.table.join("Bruno", "#2e7d32", "reader");
    },
    [files.map(([p]) => p), role],
  );
  await app.writeOutside("Sessão 3.md", NOTE);
  await app.folderChanged(["Sessão 3.md", ...files.map(([p]) => p)], true);
}

async function openTab(page, name) {
  if (phone(page)) {
    if (!(await page.locator("body.right-open").count())) await page.locator(".bar-right").click();
  } else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name }).click();
}

test("desktop 1440 × 900: the master's Music tab, the soundboard, the mini-player, the status item; a player's tab; dark", async ({ app, page }, info) => {
  test.skip(!existsSync(MUSIC) || phone(page) || info.project.name !== "chromium", "the Docker e2e with the music mounted, once");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await setUp(app, page, "owner");
  await app.quickOpen("Sessão 3");
  await openTab(page, /^Música/);
  const view = page.locator(".music-view");
  await expect(view.locator(".music-folders")).toContainText("Música/Taverna");
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “Kraghammer”" }).click();
  await expect(view.locator(".music-title")).toHaveText("Kraghammer");
  await expect(view.locator(".music-time")).toContainText(" de ");
  await page.waitForTimeout(1500);
  await shot(page, "01-music-tab-master-playing", info);
  // From the note: a scene, next/previous over it, loop the list.
  await page.locator(".preview:visible").getByRole("button", { name: "Tocar “Frost and Steel - Ambient” na mesa" }).click();
  await expect(view.locator(".music-from")).toContainText("A emboscada");
  await view.getByRole("button", { name: "Repetir: desligado" }).click();
  await view.getByRole("button", { name: "Repetir: esta faixa" }).click();
  await page.waitForTimeout(800);
  await shot(page, "02-music-tab-scene-queue-loop", info);
  await page.locator(".preview:visible .table-sound-play").first().scrollIntoViewIfNeeded();
  await shot(page, "03-soundboard-note", info);
  // The Table tab: one row.
  await openTab(page, /^Mesa/);
  await expect(page.locator(".table-mini")).toBeVisible();
  await shot(page, "04-table-tab-mini-player-master", info);
  await page.locator(".table-mini").getByRole("button", { name: "Volume", exact: true }).click();
  await shot(page, "05-mini-player-volume-popover", info);
  await page.keyboard.press("Escape");
  // Both tabs closed: the status bar.
  await page.evaluate(() => document.body.classList.add("no-right"));
  await openTab(page, /^Estrutura/);
  await page.evaluate(() => document.body.classList.add("no-right"));
  await expect(page.locator(".status-sound")).toBeVisible();
  await shot(page, "06-status-bar-item", info);
  // Dark.
  await page.emulateMedia({ colorScheme: "dark" });
  await openTab(page, /^Música/);
  await page.waitForTimeout(500);
  await shot(page, "07-music-tab-master-dark", info);
  await page.emulateMedia({ colorScheme: "light" });
  // A player's window: the same lists, no controls; a hidden track.
  await page.evaluate(() => {
    window.__harness.table.role = "reader";
  });
  await page.waitForTimeout(800);
  await openTab(page, /^Música/);
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/Taverna/Dingy Tavern - Fast.mp3"));
  await expect(view.locator(".music-title")).toHaveText("Dingy Tavern - Fast");
  await page.waitForTimeout(800);
  await shot(page, "08-music-tab-player", info);
  await page.evaluate(() => {
    const s = window.__harness.tableSound;
    s.hidden.add("Música/Masmorra/Dreamer’s Ziggurat.mp3");
    s.masterPlays("Música/Masmorra/Dreamer’s Ziggurat.mp3");
  });
  await expect(view.locator(".music-title")).toHaveText("uma faixa que você não vê");
  await shot(page, "09-music-tab-player-hidden-track", info);
  await openTab(page, /^Mesa/);
  await shot(page, "10-table-tab-mini-player-player", info);
});

test("phone 390 × 844: the Music sheet and the mini-player @layout", async ({ app, page }, info) => {
  test.skip(!existsSync(MUSIC) || info.project.name !== "phone-webkit", "the Docker e2e with the music mounted, on the phone");
  test.setTimeout(120_000);
  await setUp(app, page, "owner");
  await openTab(page, /^Música/);
  const view = page.locator(".music-view");
  await view.locator(".music-folders").getByRole("button", { name: "Tocar “Kraghammer”" }).click();
  await expect(view.locator(".music-title")).toHaveText("Kraghammer");
  await page.waitForTimeout(1500);
  await shot(page, "11-phone-music-sheet", info);
  await view.locator(".music-folders").scrollIntoViewIfNeeded();
  await shot(page, "12-phone-music-sheet-lists", info);
  await openTab(page, /^Mesa/);
  await expect(page.locator(".table-mini")).toBeVisible();
  await shot(page, "13-phone-table-mini-player", info);
  await page.emulateMedia({ colorScheme: "dark" });
  await openTab(page, /^Música/);
  await page.waitForTimeout(500);
  await shot(page, "14-phone-music-sheet-dark", info);
});
