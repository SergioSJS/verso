// The pane headers on narrow windows, photographed (fix/narrow-header, 2026-10-30): runs only with
// SHOTS=<dir> and SHOT_PREFIX, in chromium, in the language of LOCALE (pt-BR or en-US). Asserts nothing.

import { test } from "./fixtures.mjs";

const OUT = process.env.SHOTS;
const PREFIX = process.env.SHOT_PREFIX ?? "x";
const LOC = process.env.LOCALE ?? "pt-BR";
test.skip(!OUT, "SHOTS not set");
test.use({ locale: LOC });

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };
const NAMES = ["Bruno", "Ana", "Caio", "Dora", "Eduardo", "Fabíola"];
const WIDTHS = (process.env.WIDTHS ?? "1440,1073,900,760,390").split(",").map(Number);
const SCEN = [
  ["board-2", "Tour do Verso", 2],
  ["board-6", "Tour do Verso", 6],
  ["note-6", "Sessao ao vivo.md", 6],
  ["base", "Projetos.base", 0],
];

for (const w of WIDTHS)
  for (const [name, file, people] of SCEN)
    test(`${name} at ${w}`, async ({ app, page }, info) => {
      test.skip(info.project.name !== "chromium", "photographed once");
      await page.setViewportSize({ width: w, height: w < 600 ? 844 : 751 });
      await app.open("?vault=empty&table=owner");
      const path = file.endsWith(".md") ? file : file === "Projetos.base" ? file : file + ".canvas";
      if (file.endsWith(".md")) await app.writeOutside(file, "# Sessao\n\num\n");
      else if (file === "Projetos.base") await app.writeOutside(file, "views:\n  - type: table\n    name: Tabela\n");
      else await app.writeOutside(path, '{"nodes":[{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"}],"edges":[]}');
      await app.folderChanged([path], true);
      await page.evaluate(() => {
        window.__harness.rooms.up = true;
        const t = window.__harness.table;
        t.role = "owner"; t.up = true;
        window.__harness.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
        window.__harness.emit("campaign-changed", { paths: [] });
        t.say("Bruno", "oi"); t.roll("Ana", "2d6");
      });
      await page.evaluate(async (st) => {
        window.__harness.core.handlers.folder_sync = () => st;
        await window.__harness.emit("sync-status", st);
      }, SYNCED);
      await app.quickOpen(path.replace(/\.(canvas|md)$/, ""), LOC === "en-US" ? "Open…" : "Abrir…");
      if (path.endsWith(".canvas")) await app.boardReady();
      await page.waitForTimeout(400);
      await page.evaluate(([p, n]) => n.forEach((x) => window.__harness.rooms.present(p, x)), [path, NAMES.slice(0, people)]);
      if (w > 760) await page.evaluate(() => document.body.classList.remove("no-right"));
      await page.locator("#right-tabs").getByRole("tab", { name: /^(Mesa|Table)/ }).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${PREFIX}-${LOC}-${name}-${w}.png` });
    });
