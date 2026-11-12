// Files only in iCloud are brought down before any action on them (the
// maintainer, 2026-11-11: "qualquer interação que um arquivo receba, ele
// deveria baixar esse arquivo"; ADR 0043 amended that day, ADR 0048's
// placeholder rule revised): a selection moved into a folder downloads
// the ones in the cloud first, then moves all of them; one that cannot
// come down stops the move and is named.

import { test, expect } from "./fixtures.mjs";

const row = (app, p) => app.page.locator(`#notes li[data-path="${p}"] > button`);
const folderRow = (app, f) => app.page.locator(`#notes summary[data-folder="${f}"]`);
const selected = (app) => app.page.locator("#notes .selected").evaluateAll((els) => els.map((e) => e.dataset.folder ?? e.parentElement.dataset.path));

async function dragOnto(app, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await app.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await app.page.mouse.up();
}

/** A folder where `cloud` are listed as placeholders until `fetch_file`
 *  brings each down (or refuses, when `refuse` names it); every call is
 *  logged in order on `window.__order`. */
async function cloudFolder(app, files, cloud, refuse = []) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.page.evaluate(
    ([c, r]) => {
      const core = window.__harness.core;
      const inCloud = new Set(c);
      window.__order = [];
      const list = core.handlers.list_entries;
      core.handlers.list_entries = (a) => list(a).map((e) => (inCloud.has(e.path) ? { ...e, kind: "placeholder" } : e));
      core.handlers.fetch_file = (a) => {
        const path = String(a.path);
        window.__order.push(`fetch ${path}`);
        if (r.includes(path)) throw { kind: "unavailable", message: `fetching ${path} from the cloud: Operation timed out (os error 60)` };
        return inCloud.delete(path);
      };
      const move = core.handlers.move_entries;
      core.handlers.move_entries = (a) => {
        window.__order.push("move");
        return move(a);
      };
    },
    [cloud, refuse],
  );
  await app.folderChanged(Object.keys(files), true);
  await folderRow(app, "Zona").evaluate((s) => {
    const d = s.parentElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
}

async function selectBoth(app) {
  await row(app, "Zona/Ma.canvas").scrollIntoViewIfNeeded();
  await row(app, "Zona/Ma.canvas").click({ modifiers: ["Meta"] });
  await row(app, "Zona/Mb.canvas").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toEqual(["Zona/Ma.canvas", "Zona/Mb.canvas"]);
}

const files = {
  "Zona/Destino/Fica.md": "fica\n",
  "Zona/Ma.canvas": '{"nodes":[],"edges":[]}\n',
  "Zona/Mb.canvas": '{"nodes":[],"edges":[]}\n',
};

test("a selection with files only in iCloud is downloaded first, then moves whole", async ({ app }) => {
  await cloudFolder(app, files, ["Zona/Ma.canvas", "Zona/Mb.canvas"]);
  await selectBoth(app);
  await dragOnto(app, row(app, "Zona/Mb.canvas"), folderRow(app, "Zona/Destino"));
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Destino/Ma.canvas", "Zona/Destino/Mb.canvas"]));
  const order = await app.page.evaluate(() => window.__order);
  expect(order.slice(0, 2).sort()).toEqual(["fetch Zona/Ma.canvas", "fetch Zona/Mb.canvas"]);
  expect(order[2]).toBe("move");
});

test("a file that cannot come down from iCloud stops the move and is named", async ({ app }) => {
  await cloudFolder(app, files, ["Zona/Ma.canvas", "Zona/Mb.canvas"], ["Zona/Mb.canvas"]);
  await selectBoth(app);
  await dragOnto(app, row(app, "Zona/Mb.canvas"), folderRow(app, "Zona/Destino"));
  await expect(app.page.locator("#status")).toContainText("Não foi possível baixar do iCloud: Mb");
  expect(await app.page.evaluate(() => window.__order)).not.toContain("move");
  expect(await app.files()).toEqual(expect.arrayContaining(["Zona/Ma.canvas", "Zona/Mb.canvas"]));
});

test("a note in iCloud that links to the moved one comes down before the move", async ({ app }) => {
  // The maintainer, 2026-11-12: the notes the link plan reads come down
  // too, so their links are rewritten instead of skipped.
  const linked = { ...files, "Outra/Liga.md": "veja [[Ma.canvas]]\n" };
  await cloudFolder(app, linked, ["Outra/Liga.md"]);
  await app.page.evaluate(() => {
    const core = window.__harness.core;
    const back = core.handlers.backlinks;
    core.handlers.backlinks = (a) => {
      window.__order.push(`backlinks ${a.path}`);
      return back(a);
    };
  });
  await selectBoth(app);
  await dragOnto(app, row(app, "Zona/Mb.canvas"), folderRow(app, "Zona/Destino"));
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Destino/Ma.canvas", "Zona/Destino/Mb.canvas"]));
  const order = await app.page.evaluate(() => window.__order);
  expect(order).toContain("fetch Outra/Liga.md");
  expect(order.indexOf("fetch Outra/Liga.md")).toBeLessThan(order.indexOf("move"));
});

test("a single file only in iCloud is downloaded before it is moved", async ({ app }) => {
  await cloudFolder(app, files, ["Zona/Ma.canvas"]);
  await row(app, "Zona/Ma.canvas").scrollIntoViewIfNeeded();
  // WebKit starts a drag on a row the pointer has met before: ⌘-clicked
  // in and out, as the selection tests do, without opening the file
  // (opening would bring it down itself).
  await row(app, "Zona/Ma.canvas").click({ modifiers: ["Meta"] });
  await row(app, "Zona/Ma.canvas").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toEqual([]);
  await dragOnto(app, row(app, "Zona/Ma.canvas"), folderRow(app, "Zona/Destino"));
  await expect.poll(() => app.files()).toContain("Zona/Destino/Ma.canvas");
  expect((await app.page.evaluate(() => window.__order))[0]).toBe("fetch Zona/Ma.canvas");
});

