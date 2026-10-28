// The game master lets a player send images to the table (ADR 0107 item 3 as
// amended 2026-10-24; ADR 0110, "who may send images"): against a real
// `verso serve`, in separate browser contexts — the game master, a player who
// only reads (Ana) and another (Bia) — once with the player a MEMBER of the
// folder (table root "") and once on a SHARE of a subfolder table (folder
// "Pai", table "Mesa"). Off by default: no attach button. The game master turns
// the player's switch on in the Players table: the button appears in Ana's
// window with no reload, she pastes an image, the game master and Bia see it and
// its thumbnail loads. The game master turns it off: the button goes at once and
// a send is refused. Every item reports on its own.

import { deflateSync } from "node:zlib";

import { expect, test } from "@playwright/test";

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
const SWITCH = { name: "Ana pode enviar imagens" };
/** Ana's count of rights, which opens the four switches (ADR 0113 K.6). */
const RIGHTS = { name: /^Ana tem \d de 4 direitos/ };

test.use({ actionTimeout: 10_000 });

for (const format of ["member", "share"]) {
  test(`a player may send images only when the game master lets it, live: ${format === "member" ? "a folder member (table root \"\")" : "a share of a subfolder table"}`, async ({ browser, page: gm }, info) => {
    test.skip(info.project.name === "phone", "the panels are side by side");
    test.setTimeout(240_000);
    const tag = `perm-${format}-${info.project.name}`;
    const root = format === "member" ? "" : "Mesa";
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
      await signedIn(gm, ADMIN.email, ADMIN.password);
      const folder = await api(gm, "POST", "/api/folders", { name: pai });
      await gm.goto(`/?folder=${folder.id}`);
      await expect(gm.locator("#folder")).toHaveText(pai, { timeout: 30_000 });
      const at = root === "" ? "" : `${root}/`;
      for (const n of ["Fichas/Ata", "Fichas/Diario"]) await invoke(gm, "create_note", { name: `${at}${n}`, text: "# Nota\n" });
      await invoke(gm, "campaign_make", { root });
      const members = format === "member";
      const ana = await account(browser, gm, { ...player, ...(members ? { folder: folder.id, role: "reader" } : {}) });
      const bia = await account(browser, gm, { ...other, ...(members ? { folder: folder.id, role: "reader" } : {}) });
      opened.push(ana.context, bia.context);
      if (!members) {
        await api(gm, "PUT", `/api/folders/${folder.id}/shares`, { path: "Mesa", email: player.email, role: "reader" });
        await api(gm, "PUT", `/api/folders/${folder.id}/shares`, { path: "Mesa", email: other.email, role: "reader" });
      }
      const shareName = members ? null : /Mesa \(admin\)/;
      await openFolder(ana.page, folder.id, shareName);
      await openFolder(bia.page, folder.id, shareName);
      const [g, p, r] = [await mesa(gm), await mesa(ana.page), await mesa(bia.page)];
      const attach = p.getByRole("button", { name: "Anexar imagem" });
      // The players are in the game master's status now: a command that changes the table makes the window ask again.
      await invoke(gm, "campaign_settings", { root, open: true, logMax: null, imageMax: null });
      await g.getByRole("button", { name: "Abrir a janela da Mesa" }).click();
      const dialog = gm.locator(".campaign-dialog");
      await expect(dialog).toBeVisible();
      const sw = dialog.getByRole("switch", SWITCH);
      const feedback = dialog.locator(".cd-right").filter({ has: gm.getByRole("switch", SWITCH) }).locator(".cd-feedback");

      await item(1, "off by default: the player has no attach button, the switch is off", async () => {
        await expect(attach).toBeHidden();
        await dialog.getByRole("button", RIGHTS).click({ timeout: 15_000 });
        await expect(sw).toBeVisible({ timeout: 15_000 });
        await expect(sw).not.toBeChecked();
      });

      await item(2, "the game master turns it on -> the attach button appears in the player's window, live", async () => {
        await sw.check({ force: true });
        await expect(feedback).toContainText("Salvo");
        await expect(attach).toBeVisible({ timeout: 15_000 });
      });

      await item(3, "the player pastes an image -> the game master and the other player see it and it loads", async () => {
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
          if (await img.locator(".table-image-missing").count()) throw new Error(`the ${who}'s thumbnail is missing`);
          await expect.poll(() => img.locator("img.table-thumb").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
        }
        // The file is the folder's: in the table's attachments place, written by the server.
        const listed = JSON.stringify(await invoke(gm, "list_files", {}));
        expect(listed).toMatch(new RegExp(`${at}attachments/mesa-\\d+-[0-9a-zA-Z]+\\.png`));
      });

      await item(4, "the game master turns it off -> the button goes at once and a send is refused", async () => {
        await sw.uncheck({ force: true });
        await expect(feedback).toContainText("Salvo");
        await expect(attach).toBeHidden({ timeout: 15_000 });
        const refused = await ana.page.evaluate(async () => {
          try {
            await window.__TAURI_INTERNALS__.invoke("table_send_image", { base64: "iVBORw0KGgo=", table: null });
            return "sent";
          } catch (e) {
            return JSON.stringify(e);
          }
        });
        expect(refused).toContain("only read");
        await expect(g.locator('.table-entry[data-kind="image"]')).toHaveCount(1);
      });

      await item(5, "the header box gives everyone the permission, and Bia's window learns it too", async () => {
        const all = dialog.getByRole("checkbox", { name: "Todos podem enviar arquivos" });
        await all.check({ force: true });
        await expect(attach).toBeVisible({ timeout: 15_000 });
        await expect(bia.page.locator(".table-view").getByRole("button", { name: "Anexar imagem" })).toBeVisible({ timeout: 15_000 });
        // The box is disabled while its save is in flight: wait for it to settle before undoing.
        await expect(all).toBeEnabled({ timeout: 15_000 });
        await expect(all).toBeChecked();
        await all.uncheck({ force: true });
        await expect(attach).toBeHidden({ timeout: 15_000 });
      });
    } finally {
      for (const c of opened) await c.close().catch(() => {});
    }
    for (const line of results) console.log(line);
    expect(results.filter((l) => l.includes(" FAIL ")), results.join("\n")).toEqual([]);
  });
}

