// A note released to some players (ADR 0110 item 4, amended 2026-10-23; the
// maintainer: "gosto da sua sugestão… quem tem acesso"), against a real
// `verso serve`, in three browser contexts: the game master, Ana and Bia,
// two players of the same table. The game master releases a note to Ana
// alone: Ana has it in her file list at once, with no reload, and Bia does
// not — nor in her quick open, nor to a command that asks for it by name.
// Then Bia is added and the note is hers, live; then Ana is taken off and
// it leaves her list. Every check is live: no reload anywhere.

import { expect, test } from "@playwright/test";

const ADMIN = { email: "admin@verso.test", password: "uma senha bem longa" };

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
  await expect(page).toHaveURL(/\/signin/, { timeout: 30_000 }); // the redirect follows the session check, which is slow when the server is busy
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
const invoke = (page, cmd, args = {}) => page.evaluate(async ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

/** Whether the command is answered (true) or refused (false). */
const answered = (page, cmd, args) =>
  page.evaluate(
    async ([c, a]) => {
      try {
        await window.__TAURI_INTERNALS__.invoke(c, a);
        return true;
      } catch {
        return false;
      }
    },
    [cmd, args],
  );

/** An account made from an invitation link, a reader of the folder. */
async function player(browser, gm, { email, name, password, folder }) {
  const made = await api(gm, "POST", "/api/admin/invitations", { email, folder, role: "reader" });
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

const row = (page, path) => page.locator(`#notes li[data-path="${path}"]`);

/** What the quick open lists for `word`. */
async function quick(page, word) {
  await page.keyboard.press("ControlOrMeta+p");
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await expect(box).toBeFocused();
  await box.fill(word);
  await page.waitForTimeout(400);
  const text = (await page.locator(".quick:not([hidden]) .quick-list").textContent()) ?? "";
  await page.keyboard.press("Escape");
  return text;
}

test.use({ actionTimeout: 10_000 });

test("a note released to Ana alone is in her list at once and not in Bia's, until Bia is added", async ({ browser, page: gm }, info) => {
  test.skip(info.project.name === "phone", "the panels are side by side");
  test.setTimeout(240_000);
  const tag = info.project.name;
  const name = `Mesa audiencia ${tag}`;
  const ana = { email: `ana-aud-${tag}@verso.test`, name: "Ana", password: "a senha da ana" };
  const bia = { email: `bia-aud-${tag}@verso.test`, name: "Bia", password: "a senha da bia" };
  const opened = [];
  try {
    await signedIn(gm, ADMIN.email, ADMIN.password);
    const folder = await api(gm, "POST", "/api/folders", { name });
    await gm.goto(`/?folder=${folder.id}`);
    await expect(gm.locator("#folder")).toHaveText(name, { timeout: 30_000 });
    for (const [n, text] of [
      ["Aberta", "# Aberta\n\nPara todas.\n"],
      ["Segredo da Ana", "# Segredo da Ana\n\nzqsegredo palavra rara\n"],
    ]) {
      const made = await invoke(gm, "create_note", { name: n, text });
      expect(made.path ?? n).toBeTruthy();
    }
    await invoke(gm, "campaign_make", { root: "" });
    await invoke(gm, "campaign_release", { paths: ["Aberta.md"], released: true });
    const a = await player(browser, gm, { ...ana, folder: folder.id });
    const b = await player(browser, gm, { ...bia, folder: folder.id });
    opened.push(a.context, b.context);
    for (const p of [a.page, b.page]) {
      await p.goto(`/?folder=${folder.id}`);
      await expect(row(p, "Aberta.md")).toBeVisible({ timeout: 30_000 });
    }
    const status = await invoke(gm, "campaign_status");
    const idOf = (n) => status.players.find((p) => p.name === n).id;
    const [anaId, biaId] = [idOf("Ana"), idOf("Bia")];

    // Hidden from both.
    await expect(row(a.page, "Segredo da Ana.md")).toHaveCount(0);
    await expect(row(b.page, "Segredo da Ana.md")).toHaveCount(0);

    // Released to Ana alone: hers at once, and no reload.
    await invoke(gm, "campaign_audience", { paths: ["Segredo da Ana.md"], audience: { kind: "players", accounts: [anaId] } });
    await expect(row(a.page, "Segredo da Ana.md")).toBeVisible({ timeout: 15_000 });
    await expect(row(b.page, "Segredo da Ana.md")).toHaveCount(0);
    expect(await quick(a.page, "Segredo")).toContain("Segredo da Ana");
    expect(await quick(b.page, "Segredo")).not.toContain("Segredo");
    // Bia's commands answer as for a note that does not exist.
    expect(await answered(a.page, "read_note", { path: "Segredo da Ana.md" })).toBe(true);
    expect(await answered(b.page, "read_note", { path: "Segredo da Ana.md" })).toBe(false);
    expect(await answered(b.page, "campaign_access", { path: "Segredo da Ana.md" })).toBe(false);
    const found = await invoke(b.page, "search", { words: "zqsegredo", limit: 20 });
    expect(found).toEqual([]);
    const hers = await invoke(a.page, "search", { words: "zqsegredo", limit: 20 });
    expect(hers.length).toBe(1);
    // The game master sees who has access.
    const access = await invoke(gm, "campaign_access", { path: "Segredo da Ana.md" });
    expect(access.people.find((p) => p.id === anaId).access).toBe("sees");
    expect(access.people.find((p) => p.id === biaId).access).toBe("none");

    // Bia is added: the note is hers, live.
    await invoke(gm, "campaign_audience", { paths: ["Segredo da Ana.md"], audience: { kind: "players", accounts: [anaId, biaId] } });
    await expect(row(b.page, "Segredo da Ana.md")).toBeVisible({ timeout: 15_000 });
    expect(await quick(b.page, "Segredo")).toContain("Segredo da Ana");
    expect(await answered(b.page, "read_note", { path: "Segredo da Ana.md" })).toBe(true);

    // Ana is taken off: it leaves her list, and stays in Bia's.
    await invoke(gm, "campaign_audience", { paths: ["Segredo da Ana.md"], audience: { kind: "players", accounts: [biaId] } });
    await expect(row(a.page, "Segredo da Ana.md")).toHaveCount(0, { timeout: 15_000 });
    await expect(row(b.page, "Segredo da Ana.md")).toBeVisible();
    expect(await answered(a.page, "read_note", { path: "Segredo da Ana.md" })).toBe(false);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
});
