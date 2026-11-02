// A player at a table is the same player whichever door they came in by
// (ADR 0110, "A share is the same table", 2026-10-23; the maintainer: "qual
// que é a diferença de entrar na mesa por compartilhamento ou entrar na mesa
// como membro… Existe algum motivo plausível pra ter diferença?").
//
// The SAME scenario runs twice against a real `verso serve`, in two browser
// contexts and more — the game master, a player who writes, another who only
// reads, a second window of the player — once with the player a MEMBER of the
// folder (the table is the folder, root "") and once with the player on a
// SHARE of a subfolder table (folder "Pai", table "Mesa"): what a share
// changes is what files the player sees, nothing at the table. Every check
// is LIVE: no reload anywhere. Each numbered item reports on its own; the
// test fails if any item did.

import { deflateSync } from "node:zlib";

import { expect, test } from "@playwright/test";

import { nameAGpu } from "./software-gl.mjs";

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };
/** A 1x1 PNG, made here: the bytes are what the window checks, and the picture must decode. */
const PNG = (() => {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(1, 0);
  head.writeUInt32BE(1, 4);
  head[8] = 8;
  head[9] = 2;
  return [...Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.from([0, 200, 30, 30]))), chunk("IEND", Buffer.alloc(0))])];
})();
const RED = "#c0392b";
const LOOK = { body: RED, number: "#ffffff", outline: "#222222", texture: "none", material: "plastic" };

/** Press "Entrar" and answer the answer; wait when the limiter asks for it. */
async function enter(page) {
  for (let i = 0; ; i++) {
    const answer = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/signin" && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const res = await answer;
    if (res.status() !== 429 || i === 10) return res;
    const body = await res.json().catch(() => ({}));
    await page.waitForTimeout((body.retry ?? 1) * 1000);
  }
}

async function signedIn(page, email, password) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const res = await enter(page);
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

async function api(page, method, path, data) {
  const state = await (await page.request.get("/api/state")).json();
  const res = await page.request.fetch(path, { method, data, headers: { "x-verso-csrf": state.csrf ?? "", origin: new URL(page.url()).origin } });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** A command of the contract, as the window sends it. */
const invoke = (page, cmd, args = {}) =>
  page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

/** The player's own dice (red) and the 3D switch on, before the window loads. */
async function withDice(context) {
  await nameAGpu(context);
  await context.addInitScript(
    ([look]) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, dice3dLook: { styles: { 1: look, 2: look, 3: look } } }));
    },
    [LOOK],
  );
}

/** An account made from an invitation link (folder and role in it, or none). */
async function account(browser, gm, { email, name, password, folder, role }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email, ...(folder ? { folder, role } : {}) });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await page.goto(made.link);
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Senha nova").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/invite/);
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  return { context, page };
}

/** The folder on screen: by address for a member, from "Shared with me" for a share. */
async function openFolder(page, id, shareName) {
  if (!shareName) {
    await page.goto(`/?folder=${id}`);
  } else {
    await page.goto("/");
    await page.locator("#open").click();
    const dialog = page.getByRole("dialog", { name: "Trocar de pasta" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("region", { name: "Compartilhados comigo" }).getByRole("button", { name: shareName }).click();
  }
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
}

/** The Mesa panel of the window, open. */
async function mesa(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-compose")).toBeVisible({ timeout: 30_000 });
  return view;
}

const field = (view) => view.getByRole("textbox", { name: "Mensagem para a mesa" });

async function say(view, text) {
  await field(view).fill(text);
  await field(view).press("Enter");
}

const said = (view, text) => view.locator('.table-entry[data-kind="say"]', { hasText: text });

async function openNote(page, name) {
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Rolar 1d20+3" }).first()).toBeVisible({ timeout: 30_000 });
}

/** Who is at the table, by name. */
const roster = (view) => view.locator(".table-roster-list .table-member");

test.use({ actionTimeout: 10_000 });

for (const format of ["member", "share"]) {
  test(`a player at the table as a ${format === "member" ? "folder member (table root \"\")" : "share of a subfolder table (folder Pai, table Mesa)"}: the same table, live`, async ({ browser, page: gm }, info) => {
    test.skip(info.project.name === "phone", "the panels are side by side");
    test.setTimeout(240_000);
    const tag = `${format}-${info.project.name}`;
    const root = format === "member" ? "" : "Mesa/";
    const pai = `Pai ${tag}`;
    const player = { email: `ana-${tag}@verso.test`, name: "Ana", password: "a senha da ana" };
    const other = { email: `bia-${tag}@verso.test`, name: "Bia", password: "a senha da bia" };
    const results = [];
    const item = async (n, what, fn) => {
      try {
        await fn();
        results.push(`${format} item ${n} PASS ${what}`);
      } catch (e) {
        results.push(`${format} item ${n} FAIL ${what}: ${String(e.message ?? e).replace(/\s+/g, " ").slice(0, 700)}`);
      }
    };
    const opened = [];
    try {
      // The game master: the admin, in a folder of its own with a table.
      await signedIn(gm, ADMIN.email, ADMIN.password);
      const folder = await api(gm, "POST", "/api/folders", { name: pai });
      await gm.goto(`/?folder=${folder.id}`);
      await expect(gm.locator("#folder")).toHaveText(pai, { timeout: 30_000 });
      const text = "# Nota\n\nAtaque: `dice: 1d20+3`.\n";
      for (const n of ["Fichas/Ata", "Fichas/Diario"]) {
        const made = await invoke(gm, "create_note", { name: `${root}${n}`, text });
        expect(made.status ?? "ok", JSON.stringify(made)).toBe("ok");
      }
      await invoke(gm, "create_note", { name: "Fora", text: "# Fora\n" });
      await invoke(gm, "campaign_make", { root: root.replace(/\/$/, "") });
      // The player writes, the other only reads: members, or shares of "Mesa".
      const members = format === "member";
      const ana = await account(browser, gm, { ...player, ...(members ? { folder: folder.id, role: "editor" } : {}) });
      const bia = await account(browser, gm, { ...other, ...(members ? { folder: folder.id, role: "reader" } : {}) });
      opened.push(ana.context, bia.context);
      if (!members) {
        await api(gm, "PUT", `/api/folders/${folder.id}/shares`, { path: "Mesa", email: player.email, role: "editor" });
        await api(gm, "PUT", `/api/folders/${folder.id}/shares`, { path: "Mesa", email: other.email, role: "reader" });
      }
      // Ana writes: an editor, at a table, is a player who edits what she sees
      // (ADR 0113 item 3, K.1). The game master releases the notes to the
      // table, and lets her send files (K.4).
      const released = await invoke(gm, "campaign_release", {
        paths: [`${root}Fichas/Ata.md`, `${root}Fichas/Diario.md`],
        released: true,
      });
      expect(released.viewer, JSON.stringify(released)).toBe("owner");
      const anaId = released.players.find((x) => x.name === "Ana")?.id;
      expect(anaId, JSON.stringify(released.players)).toBeTruthy();
      await invoke(gm, "table_rights_set", { root: root.replace(/\/$/, ""), accounts: [anaId], right: "images", on: true });
      await withDice(ana.context);
      const shareName = members ? null : /Mesa \(admin\)/;
      await openFolder(ana.page, folder.id, shareName);
      await openFolder(bia.page, folder.id, shareName);
      const [g, p, r] = [await mesa(gm), await mesa(ana.page), await mesa(bia.page)];
      const title = () => p.locator(".table-title-name").textContent().catch(() => "");
      const titleAtStart = await title();

      await item(1, "player says -> GM sees; GM says -> player sees", async () => {
        await say(p, "oi do jogador");
        await expect(said(g, "oi do jogador")).toHaveCount(1);
        await expect(said(p, "oi do jogador")).toHaveCount(1);
        await say(g, "oi do mestre");
        await expect(said(p, "oi do mestre")).toHaveCount(1);
        await expect(said(r, "oi do mestre")).toHaveCount(1);
      });

      await item(3, "GM rolls from a note -> player sees it live and the 3D path runs", async () => {
        const chunk = ana.page.waitForRequest((q) => /stage-[^/]*\.js/.test(q.url()), { timeout: 20_000 });
        await openNote(gm, "Ata");
        await gm.getByRole("button", { name: "Rolar 1d20+3" }).first().click();
        await expect(p.locator('.table-entry[data-by]:not(.mine)[data-kind="roll"]')).toHaveCount(1);
        await chunk;
      });

      await item(2, "player rolls from a note's dice button -> both panels, in the player's dice colour", async () => {
        await openNote(ana.page, "Ata");
        await ana.page.getByRole("button", { name: "Rolar 1d20+3" }).first().click();
        for (const v of [p, g]) {
          const mine = v.locator('.table-entry[data-by="Ana"][data-kind="roll"]');
          await expect(mine).toHaveCount(1);
          await expect(mine.locator(".table-notation")).toHaveText("1d20+3");
          await expect(mine.locator(".table-die").first()).toHaveAttribute("style", new RegExp(RED, "i"));
        }
      });

      await item(4, "tray: /r and a die of the tray; secret mode shown to the GM, masked to the other player", async () => {
        await field(p).fill("/r 1d6");
        await field(p).press("Enter");
        for (const v of [p, g]) await expect(v.locator('.table-entry[data-by="Ana"] .table-notation', { hasText: /^1d6$/ })).toHaveCount(1);
        // The player's dice rest on the table until touched, and the box is busy till then.
        await ana.page.keyboard.press("Escape");
        await p.getByRole("button", { name: /^Adicionar um d8/ }).click();
        await field(p).press("Enter");
        for (const v of [p, g]) await expect(v.locator('.table-entry[data-by="Ana"] .table-notation', { hasText: /^1d8$/ })).toHaveCount(1);
        await p.locator(".tray-mode").click();
        await ana.page.getByRole("menuitem", { name: /Secreta/ }).click();
        await ana.page.keyboard.press("Escape");
        await field(p).fill("/r 1d4");
        await field(p).press("Enter");
        await expect(g.locator('.table-entry[data-by="Ana"][data-kind="roll"] .table-notation', { hasText: /^1d4$/ })).toHaveCount(1);
        await expect(r.locator('.table-entry[data-kind="secret"] .table-masked')).toHaveCount(1);
        await p.locator(".tray-mode").click();
        await ana.page.getByRole("menuitem", { name: /Pública/ }).click();
      });

      await item(5, "player pastes an image -> both see it, and it loads", async () => {
        await ana.page.evaluate((b64) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], "dado.png", { type: "image/png" }));
          document.querySelector(".table-view").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        }, Buffer.from(PNG).toString("base64"));
        await ana.page.keyboard.press("Escape");
        await ana.page.waitForTimeout(500);
        await field(p).press("Enter");
        for (const [who, v] of [["player", p], ["GM", g], ["reader", r]]) {
          const img = v.locator('.table-entry[data-kind="image"]');
          await expect(img).toHaveCount(1);
          const miss = await img.locator(".table-image-missing").count();
          if (miss) throw new Error(`the ${who}'s thumbnail is missing`);
          await expect.poll(() => img.locator("img.table-thumb").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
        }
      });

      await item(6, "roster shows everyone; GM deletes a player's message -> gone in the player's panel", async () => {
        for (const v of [g, p, r]) {
          await expect(roster(v)).toHaveCount(3);
          for (const n of ["Ana", "Bia"]) await expect(roster(v).filter({ hasText: n })).toHaveCount(1);
        }
        const line = said(g, "oi do jogador");
        await line.locator(".table-menu").click();
        await gm.getByRole("menuitem", { name: "Apagar" }).click();
        await expect(said(p, "oi do jogador")).toHaveCount(0);
        await expect(said(g, "oi do jogador")).toHaveCount(0);
      });

      await item(8, "two windows of the player's account both keep receiving, after the second joins and after one leaves", async () => {
        const again = await ana.context.newPage();
        await openFolder(again, folder.id, shareName);
        const p2 = await mesa(again);
        await say(g, "para as duas janelas");
        await expect(said(p, "para as duas janelas")).toHaveCount(1);
        await expect(said(p2, "para as duas janelas")).toHaveCount(1);
        await again.close();
        await say(g, "so a primeira");
        await expect(said(p, "so a primeira")).toHaveCount(1);
        await say(p, "a primeira fala");
        await expect(said(g, "a primeira fala")).toHaveCount(1);
        await expect(roster(g)).toHaveCount(3);
      });

      await item(9, "note, another note, the folder page: the same table, still live", async () => {
        const live = async (what) => {
          await say(g, what);
          await expect(said(p, what)).toHaveCount(1);
        };
        await openNote(ana.page, "Diario");
        await live("depois do diario");
        await ana.page.locator('#notes summary[data-folder="Fichas"] button.folder-page').click();
        await expect(ana.page.locator(".sheet:not(.note-sheet)")).toBeVisible();
        await live("na pagina da pasta");
        expect(await title()).toBe(titleAtStart);
        await openNote(ana.page, "Ata");
        await live("de volta a nota");
      });

      await item(7, "GM closes the table -> the reader is told and out; open again -> back in, live", async () => {
        const closed = async (open) => invoke(gm, "campaign_settings", { root: root.replace(/\/$/, ""), open, logMax: null, imageMax: null });
        await closed(false);
        // The reader's window leaves the folder at once, and says why.
        await expect(bia.page.locator("#notes li")).toHaveCount(0, { timeout: 15_000 });
        await closed(true);
        await openFolder(bia.page, folder.id, shareName);
        const again = await mesa(bia.page);
        await say(g, "mesa reaberta");
        await expect(said(again, "mesa reaberta")).toHaveCount(1);
      });
    } finally {
      for (const c of opened) await c.close().catch(() => {});
    }
    for (const line of results) console.log(line);
    expect(results.filter((l) => l.includes(" FAIL ")), results.join("\n")).toEqual([]);
  });
}
