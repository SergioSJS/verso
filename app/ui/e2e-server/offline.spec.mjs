// The window kept offline (ADR 0092) against a real `verso serve`: a folder
// made available offline opens with no network, is read and edited from the
// browser's own store, and what was written goes up by sync's rules when the
// network returns — a note both sides appended to joined, one both changed
// kept as a copy; the sign-out and the server ending the session delete the
// copy; a full store and a refusal to keep are said; plain HTTP says why it
// cannot. In Chromium, WebKit and at a phone's width, as the server's other
// tests. The network is the browser's (offline mode) and the WebSocket's (a
// route that drops the page's connections and refuses new ones).

import { expect, test as base } from "@playwright/test";

import { leakFixtures } from "../e2e/leaks.mjs";

const test = base.extend(leakFixtures);

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

function watch(page) {
  const errors = [];
  page.on("console", (m) => {
    // A connection that fails while the network is off is the test's doing.
    if (m.type() === "error" && !/Failed to load resource|WebSocket|net::ERR|offline|Failed to fetch|network|reading 'invoke'/i.test(m.text())) errors.push(m.text());
  });
  // The window's events in a tab warned "[TAURI] Couldn't find callback id"
  // (a console warning, not an error: it slipped past; events.ts).
  page.on("console", (m) => {
    if (m.type() === "warning" && /\[TAURI\]/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    // A page being replaced (a reload, the sign-in page after a sign-out) has
    // its host's bridge gone for a moment: not the feature's.
    if (!/Failed to fetch|Load failed|NetworkError|network connection was lost|reading 'invoke'|Importing a module script failed/i.test(String(e))) errors.push(String(e));
  });
  return errors;
}

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

async function signedIn(page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  const res = await enter(page);
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  // The page landed on asks the server before it is left (see `settled` in server.spec.mjs).
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

/** A folder of the admin's own, made through the server's API. */
async function newFolder(page, name) {
  return page.evaluate(async (name) => {
    const state = await (await fetch("/api/state")).json();
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-verso-csrf": state.csrf },
      body: JSON.stringify({ name }),
    });
    return (await res.json()).id;
  }, name);
}

/** What a device does on the server, over a connection of its own. */
async function device(page, folder, steps) {
  return page.evaluate(
    async ({ folder, steps }) => {
      const sha = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      const waiting = new Map();
      let id = 0;
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (typeof m.id === "number") waiting.get(m.id)?.(m);
      });
      await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
      });
      const call = (c, a) =>
        new Promise((resolve) => {
          const n = ++id;
          waiting.set(n, resolve);
          ws.send(JSON.stringify({ id: n, cmd: c, args: a }));
        });
      await call("open_server_folder", { id: folder });
      const out = [];
      for (const step of steps) {
        const state = await call("sync_state", {});
        const found = state.ok.files.find((f) => f.path === step.path);
        if (step.put !== undefined) {
          const bytes = new TextEncoder().encode(step.put);
          out.push(await call("sync_put", { path: step.path, offset: 0, size: bytes.length, hash: await sha(bytes), base: found?.hash ?? null, data: btoa(String.fromCharCode(...bytes)) }));
        } else if (step.read) {
          const a = await call("sync_read", { path: step.path, offset: 0 });
          out.push(a.ok ? { text: new TextDecoder().decode(Uint8Array.from(atob(a.ok.data), (c) => c.charCodeAt(0))) } : a);
        } else if (step.list) {
          out.push({ files: state.ok.files.map((f) => f.path).sort() });
        }
      }
      ws.close();
      return out;
    },
    { folder, steps },
  );
}

const put = (page, folder, path, put) => device(page, folder, [{ path, put }]);
const read = async (page, folder, path) => (await device(page, folder, [{ path, read: true }]))[0].text ?? null;
const listing = async (page, folder) => (await device(page, folder, [{ list: true }]))[0].files;

/** The network, as the person's phone has it: off drops the page's
 *  connections, refuses new ones, and stops every request. */
async function network(page) {
  const live = new Set();
  let off = false;
  await page.routeWebSocket(/\/api\/ws$/, (ws) => {
    if (off) {
      ws.close();
      return;
    }
    ws.connectToServer();
    live.add(ws);
    ws.onClose(() => live.delete(ws));
  });
  return {
    async off() {
      off = true;
      await page.context().setOffline(true);
      for (const ws of live) ws.close();
      await page.evaluate(() => dispatchEvent(new Event("offline"))).catch(() => undefined);
    },
    async on() {
      off = false;
      await page.context().setOffline(false);
      await page.evaluate(() => dispatchEvent(new Event("online"))).catch(() => undefined);
    },
    /** Requests go through again, but no socket connects: a sync pass
     *  cannot run, so what waits keeps waiting. */
    async requestsOnly() {
      off = true;
      await page.context().setOffline(false);
      await page.evaluate(() => dispatchEvent(new Event("online"))).catch(() => undefined);
    },
  };
}

/** A file of the browser's store (IndexedDB), as text; null when it is not
 *  there. */
async function kept(page, folder, path) {
  return page.evaluate(
    ({ folder, path }) =>
      new Promise((resolve) => {
        const open = indexedDB.open("verso-offline");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("blobs")) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction("blobs", "readonly").objectStore("blobs").get([folder, path]);
          get.onsuccess = () => {
            db.close();
            resolve(get.result ? new TextDecoder().decode(get.result.bytes) : null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { folder, path },
  );
}

/** Every file path the store keeps for a folder. */
async function keptPaths(page, folder) {
  return page.evaluate(
    (folder) =>
      new Promise((resolve) => {
        const open = indexedDB.open("verso-offline");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction("files", "readonly").objectStore("files").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result.filter((r) => r.id === folder).map((r) => r.path).sort());
          };
          all.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
    folder,
  );
}

/** The tests that go offline and edit there need the network to be cut
 *  under the page: Chromium does it (offline mode, and a WebSocket route that
 *  closes the page's sockets). Playwright's WebKit does not: it cannot open a
 *  page while its network is off, and its WebSocket route leaves the window's
 *  own socket delivering, so the window never finds itself offline (seen:
 *  the offline status shows, the writes do not reach the store). What the
 *  e2e cannot show there is checked by hand on a real iPhone and in Safari
 *  (manual-checks.md); the engine, the syncer and the server's side are
 *  tested in every browser's absence (test/offlineSync.test.mjs). */
function chromiumOnly() {
  test.skip(test.info().project.name !== "chromium", "Playwright's WebKit cannot cut the network under a page (see chromiumOnly)");
}

/** The page opens again with no network — where the browser can show it:
 *  Playwright's WebKit fails a navigation made while its network is off
 *  before the service worker can answer, so there the window stays open and
 *  only its connections go (the page opening offline is for Chromium here,
 *  and for the real Safari by hand: manual-checks.md). */
async function reopen(page) {
  if (test.info().project.name === "chromium") await page.reload();
}

/** Another browser of the same account, with the network on: what another
 *  device does on the server meanwhile. */
async function elsewhere(browser) {
  const base = test.info().project.use.baseURL;
  const context = await browser.newContext({ locale: "pt-BR", baseURL: base });
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("E-mail").fill(ADMIN.email);
  await other.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  expect((await enter(other)).status()).toBe(200);
  await other.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  // The page landed on asks the server before it is left (see `settled` in server.spec.mjs).
  await other.waitForLoadState("networkidle", { timeout: 30_000 });
  return { page: other, close: () => context.close() };
}

async function showTree(page) {
  if ((page.viewportSize()?.width ?? 1000) >= 760) return;
  const open = page.locator("body.side-open");
  await expect(async () => {
    if ((await open.count()) === 0) await page.locator(".bottom-bar .bar-files").click();
    await expect(open).toHaveCount(1, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

/** Settings › Sem rede for the folder shown. */
async function offlineSettings(page) {
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".settings-nav-item", { hasText: "Sem rede" }).click();
  return page.locator(".offline");
}

/** The folder made available offline, from its settings, and waited for
 *  until the copy is there and the window is kept to open without a network. */
async function keepIt(page, { attachments } = {}) {
  const section = await offlineSettings(page);
  await section.getByRole("button", { name: "Deixar disponível sem rede" }).click();
  await expect(section.locator(".sync-space").first()).toBeVisible({ timeout: 30_000 });
  if (attachments) await section.locator("select").selectOption(attachments);
  await section.getByRole("button", { name: "Guardar neste aparelho" }).click();
  await expect(section.getByText("arquivos guardados")).toBeVisible({ timeout: 30_000 });
  // The window's own code, kept by the service worker.
  await expect(section.getByText("A janela abre sem rede neste aparelho.")).toBeVisible({ timeout: 120_000 });
  await expect(section.getByText("Nada esperando para subir.")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  return section;
}

/** A note opened and its text replaced, in the editor. */
async function typeIn(page, noteFile, text) {
  // A toast on a phone's narrow screen can cover the list: Escape closes it.
  await page.keyboard.press("Escape");
  await showTree(page);
  await page.locator("#notes li", { hasText: noteFile }).first().click();
  // A note opens in Reading; Edit is Ctrl+E.
  await expect(page.locator(".leaf:not([hidden])").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+e");
  const editor = page.locator(".leaf:not([hidden]) .cm-content").first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
  // Saved on the person's word, as the browsers differ in when they let go
  // of the typing.
  await page.keyboard.press("ControlOrMeta+s");
}

async function open(page, folder) {
  await page.goto(`/?folder=${folder}`);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 30_000 });
}

test("a folder kept opens with no network, is edited there, and goes up when the network returns", async ({ page }, info) => {
  chromiumOnly();
  test.setTimeout(240_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Sem rede ${info.project.name}`);
  await put(page, folder, "um.md", "# Um\nprimeira linha\n");
  await put(page, folder, "dois.md", "# Dois\n");
  // Routed from the start: a socket made before the route is not its.
  const net = await network(page);
  await open(page, folder);
  await keepIt(page);
  // The copy is the browser's: the notes are in its store, whole.
  expect(await keptPaths(page, folder)).toEqual(expect.arrayContaining(["dois.md", "um.md"]));
  expect(await kept(page, folder, "um.md")).toBe("# Um\nprimeira linha\n");

  await net.off();
  // Opened with no network: the installed page comes from the worker, the
  // account from what the page kept, the folder from the store.
  await reopen(page);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#notes")).toContainText("um.md");
  // Said, not silent: offline, with what waits.
  await expect(page.locator("#sync-state")).toContainText("Sem conexão", { timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-offline", "1");
  // An edit offline is kept in the store at once.
  await typeIn(page, "um.md", "# Um\nescrito sem rede\n");
  await expect.poll(() => kept(page, folder, "um.md"), { timeout: 30_000 }).toContain("escrito sem rede");
  await expect(page.locator("#sync-state")).toContainText("1 mudança esperando", { timeout: 30_000 });
  // The server has not seen it.
  await net.on();
  // The window is answered by the server again, and sync sends the edit.
  await expect.poll(async () => read(page, folder, "um.md"), { timeout: 90_000 }).toContain("escrito sem rede");
  await expect(page.locator("#sync-state")).not.toContainText("Sem conexão", { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("a note both sides appended to is joined; one both changed is kept as a copy, both listed", async ({ page, browser }, info) => {
  chromiumOnly();
  test.setTimeout(240_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Dois lados ${info.project.name}`);
  await put(page, folder, "diario.md", "# Dia\n");
  await put(page, folder, "plano.md", "plano original\n");
  // Routed from the start: a socket made before the route is not its.
  const net = await network(page);
  await open(page, folder);
  await keepIt(page);
  await net.off();
  await reopen(page);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 60_000 });
  // Offline: an append to one note, a rewrite of the other.
  await typeIn(page, "diario.md", "# Dia\nde dentro\n");
  await typeIn(page, "plano.md", "plano reescrito aqui\n");
  await expect.poll(() => kept(page, folder, "plano.md"), { timeout: 30_000 }).toContain("reescrito aqui");
  await expect.poll(() => kept(page, folder, "diario.md"), { timeout: 30_000 }).toContain("de dentro");
  // Meanwhile on the server, another device did the same on both.
  const away = await elsewhere(browser);
  await put(away.page, folder, "diario.md", "# Dia\nde fora\n");
  await put(away.page, folder, "plano.md", "plano reescrito la\n");
  await away.close();
  await net.on();
  // Appends joined — the server's tail first — by sync's rule.
  await expect.poll(async () => read(page, folder, "diario.md"), { timeout: 90_000 }).toBe("# Dia\nde fora\nde dentro\n");
  // The other: the server's keeps the name, this device's is the copy, and
  // both are on the server.
  await expect.poll(async () => (await listing(page, folder)).some((p) => /^plano \(conflito, .+\)\.md$/.test(p)), { timeout: 90_000 }).toBe(true);
  expect(await read(page, folder, "plano.md")).toBe("plano reescrito la\n");
  const copy = (await listing(page, folder)).find((p) => /^plano \(conflito, /.test(p));
  expect(await read(page, folder, copy)).toBe("plano reescrito aqui\n");
  // The settings list the conflict, with the choice to the person.
  const section = await offlineSettings(page);
  await expect(section.locator(".sync-item", { hasText: "plano" })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("a picture is kept once opened; every attachment on the person's word", async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Anexos ${info.project.name}`);
  // A one-pixel PNG, and a second one nobody opens.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await page.evaluate(
    async ({ folder, png }) => {
      const sha = async (b) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      const waiting = new Map();
      let id = 0;
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (typeof m.id === "number") waiting.get(m.id)?.(m);
      });
      await new Promise((r) => ws.addEventListener("open", r));
      const call = (c, a) => new Promise((resolve) => ((n) => (waiting.set(n, resolve), ws.send(JSON.stringify({ id: n, cmd: c, args: a }))))(++id));
      await call("open_server_folder", { id: folder });
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      for (const name of ["aberta.png", "fechada.png"]) {
        await call("sync_put", { path: name, offset: 0, size: bytes.length, hash: await sha(bytes), base: null, data: png });
      }
      ws.close();
    },
    { folder, png },
  );
  await put(page, folder, "nota.md", "# Nota\n![[aberta.png]]\n");
  await open(page, folder);
  await keepIt(page);
  // Notes whole; the pictures not yet.
  expect(await keptPaths(page, folder)).toContain("nota.md");
  expect(await keptPaths(page, folder)).not.toContain("aberta.png");
  // Opened: the note shows its picture, and the worker tells the page, which
  // keeps it.
  await showTree(page);
  await page.locator("#notes li", { hasText: "nota.md" }).first().click();
  await expect.poll(() => keptPaths(page, folder), { timeout: 60_000 }).toContain("aberta.png");
  expect(await keptPaths(page, folder)).not.toContain("fechada.png");
  // "Keep every attachment".
  const section = await offlineSettings(page);
  await section.locator("select").first().selectOption("all");
  await expect.poll(() => keptPaths(page, folder), { timeout: 60_000 }).toContain("fechada.png");
  expect(errors).toEqual([]);
});

test("the browser's refusals are said: no promise to keep, a full store, plain HTTP", async ({ page }, info) => {
  chromiumOnly();
  test.setTimeout(180_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Limites ${info.project.name}`);
  await put(page, folder, "a.md", "a\n");
  // The browser does not promise to keep the copy: asked, and said.
  await page.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = async () => false;
      navigator.storage.persisted = async () => false;
    }
  });
  // Routed from the start: a socket made before the route is not its.
  const net = await network(page);
  await open(page, folder);
  await keepIt(page);
  const section = await offlineSettings(page);
  await expect(section.getByText(/não prometeu guardar esta cópia/)).toBeVisible();
  await expect(section.getByText(/não é cifrada/)).toBeVisible();
  await page.keyboard.press("Escape");
  // The store fills: a write offline is refused where it was made.
  await net.off();
  await reopen(page);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const was = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "blobs") throw new DOMException("the quota", "QuotaExceededError");
      return was.apply(this, args);
    };
  });
  await typeIn(page, "a.md", "mais um texto\n");
  // Said where it was made — on the status line, which the sync's own words
  // may replace a moment later — and the tab says it is not saved.
  await expect(page.locator("body")).toContainText(test.info().project.name === "chromium" ? /armazenamento do navegador está cheio/i : /alterações não salvas|armazenamento do navegador está cheio/i, { timeout: 30_000 });
  // Nothing half-kept: the store still holds the note as it was.
  expect(await kept(page, folder, "a.md")).toBe("a\n");
  expect(errors).toEqual([]);
});

test("over plain HTTP the setting says offline needs HTTPS, and why", async ({ page }, info) => {
  const errors = watch(page);
  await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { value: false }));
  await signedIn(page);
  const folder = await newFolder(page, `Sem HTTPS ${info.project.name}`);
  await put(page, folder, "a.md", "a\n");
  await open(page, folder);
  const section = await offlineSettings(page);
  await expect(section.getByText(/Sem rede precisa de HTTPS/)).toBeVisible();
  await expect(section.getByRole("button", { name: "Deixar disponível sem rede" })).toBeDisabled();
  // ADR 0073 item 6, amended 2026-10-16: said, with a way to read how to
  // turn HTTPS on, and one notice for the session that can be closed.
  await expect(section.getByRole("button", { name: "Como ligar o HTTPS" })).toBeVisible();
  await page.keyboard.press("Escape");
  const bar = page.locator(".plain-http-bar");
  await expect(bar).toContainText("Conexão sem HTTPS");
  await bar.getByRole("button", { name: "Como ligar o HTTPS" }).click();
  const modal = page.locator("dialog.plain-http-dialog");
  await expect(modal).toContainText("VERSO_PUBLIC_URL");
  await modal.getByRole("button", { name: "Fechar" }).click();
  await bar.getByRole("button", { name: "Fechar" }).click();
  await expect(bar).toHaveCount(0);
  // The notice closes; the status bar's mark stays and lists what is off (hidden on phone).
  if (info.project.name !== "phone") {
    const mark = page.locator(".status-plain-http");
    await expect(mark).toContainText("sem HTTPS");
    await mark.click();
    await expect(modal.locator(".plain-http-off li")).toHaveCount(6);
    await modal.getByRole("button", { name: "Fechar" }).click();
  }
  // The window cannot update itself in a browser: no "newest version" it
  // never checked (2026-10-16).
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".settings-nav-item", { hasText: "Geral" }).click();
  await expect(page.getByText("Você está usando a versão mais recente.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verificar atualizações" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("signing out deletes the copy, after saying how many writes have not gone up", async ({ page }, info) => {
  chromiumOnly();
  test.setTimeout(240_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Sair ${info.project.name}`);
  await put(page, folder, "a.md", "a\n");
  // Routed from the start: a socket made before the route is not its.
  const net = await network(page);
  await open(page, folder);
  await keepIt(page);
  // A write that has not gone up: made while the connection is down.
  await net.off();
  await reopen(page);
  await expect(page.locator("#notes li").first()).toBeVisible({ timeout: 60_000 });
  await typeIn(page, "a.md", "feito sem rede\n");
  await expect.poll(() => kept(page, folder, "a.md"), { timeout: 30_000 }).toContain("feito sem rede");
  // Signing out is a request; the sync pass needs a socket. With requests
  // back and sockets still refused, the write keeps waiting, whatever the
  // timing (it raced the pass before, and lost on a busy machine).
  await net.requestsOnly();
  await page.locator("#sync-state").waitFor({ state: "attached" }).catch(() => undefined);
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".settings-nav-item", { hasText: "Conta" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  const dialog = page.locator("dialog.web-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Sair apaga a cópia deste aparelho");
  await dialog.getByRole("button", { name: "Sair e apagar a cópia" }).click();
  await page.waitForURL(/\/signin/, { timeout: 30_000 });
  // Nothing of the account is left in this browser.
  expect(await keptPaths(page, folder)).toEqual([]);
  expect(await kept(page, folder, "a.md")).toBeNull();
  expect(errors).toEqual([]);
});

test("the server ending the session deletes the copy at the device's next connection", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  await signedIn(page);
  const folder = await newFolder(page, `Revogada ${info.project.name}`);
  await put(page, folder, "a.md", "a\n");
  await open(page, folder);
  await keepIt(page);
  expect(await kept(page, folder, "a.md")).toBe("a\n");
  // The same account, signed in on another browser, ends the other sessions.
  const other = await browser.newContext({ locale: "pt-BR" });
  const second = await other.newPage();
  await second.goto("/");
  await second.getByLabel("E-mail").fill(ADMIN.email);
  await second.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  expect((await enter(second)).status()).toBe(200);
  await second.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
  // The page landed on asks the server before it is left (see `settled` in server.spec.mjs).
  await second.waitForLoadState("networkidle", { timeout: 30_000 });
  const ended = await second.evaluate(async () => {
    const state = await (await fetch("/api/state")).json();
    const res = await fetch("/api/me/sessions/others", { method: "DELETE", headers: { "x-verso-csrf": state.csrf } });
    return res.status;
  });
  expect(ended).toBe(200);
  await other.close();
  // The device is told at its connection: the copy goes.
  await expect.poll(() => keptPaths(page, folder), { timeout: 60_000 }).toEqual([]);
  expect(await kept(page, folder, "a.md")).toBeNull();
  expect(errors.filter((e) => !/session|signed|unauthor/i.test(e))).toEqual([]);
});
