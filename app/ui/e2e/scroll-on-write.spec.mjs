// A button that writes into the open note (the oracle's "Inserir na nota",
// a statblock's tracker box or "Quebrado" mark, a task box) never moves the
// view: what the person was reading further down stays where it was, in
// Leitura and in Editar (Live Preview).

import { test, expect } from "./fixtures.mjs";

const NOTE = "Rolagem.md";
const fill = (tag, n) => Array.from({ length: n }, (_, i) => `## ${tag} ${i + 1}\n\nUm parágrafo de ${tag} ${i + 1}, comprido o bastante para ocupar espaço no painel do teste.\n`).join("\n");
const ORACLE = ["> [!oracle] A porta está trancada?", "> **Sim** _(d100: 41, 50 / 50)_ ", "> A chave sumiu.", ""].join("\n");
const STATBLOCK = [
  "```statblock",
  "layout: fractal-character",
  "name: Yara do Farol",
  "jogador: Letícia",
  "xp: 4",
  "reserva_1_nome: Coragem",
  "reserva_1_atual: 1",
  "reserva_1_total: 3",
  "fatos:",
  "  - nome: Guardiã do farol velho",
  "    quebrado: false",
  "  - nome: Dívida com a capitã Duarte",
  "    quebrado: false",
  "fatos_aplicaveis: 2",
  "```",
  "",
].join("\n");
const TASKS = "- [ ] Primeira tarefa\n- [ ] Segunda tarefa\n- [ ] Terceira tarefa\n";

const TEXT = ["# Rolagem", "", fill("Antes", 45), "## Alvo", "", ORACLE, STATBLOCK, TASKS, fill("Depois", 45)].join("\n");

async function openLong(app, mode) {
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Rolagem");
  await app.page.getByRole("button", { name: mode === "live" ? "Editar" : "Leitura", exact: true }).click();
}

/** Scroll the visible sheet so `selector`'s first visible match is a little below its top; return a probe. */
async function watch(page, selector) {
  const probe = () =>
    page.evaluate((sel) => {
      const sheet = [...document.querySelectorAll(".sheet")].find((s) => s.offsetParent !== null);
      const el = [...sheet.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
      if (!el) return null;
      return { rel: Math.round(el.getBoundingClientRect().top - sheet.getBoundingClientRect().top), top: sheet.scrollTop };
    }, selector);
  // The editor draws only what is near the view: walk down until the target exists.
  for (let i = 0; i < 80; i++) {
    const found = await page.evaluate((sel) => {
      const sheet = [...document.querySelectorAll(".sheet")].find((s) => s.offsetParent !== null);
      const el = [...sheet.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
      if (el) el.scrollIntoView({ block: "center" });
      else sheet.scrollTop += 600;
      return !!el;
    }, selector);
    if (found) break;
    await page.waitForTimeout(60);
  }
  await expect.poll(async () => (await probe())?.top ?? 0).toBeGreaterThan(500);
  await page.waitForTimeout(400);
  const before = await probe();
  if (process.env.SCROLL_DEBUG)
    await page.evaluate(() => {
      window.__trace = [];
      const sheet = [...document.querySelectorAll(".sheet")].find((s) => s.offsetParent !== null);
      const pv = sheet.querySelector(".preview");
      new MutationObserver((m) => window.__trace.push(`mut ${m.length} h=${sheet.scrollHeight} hidden=${pv.hidden} ${pv.children.length}`)).observe(sheet, { childList: true, subtree: false, attributes: true });
      new MutationObserver((m) => window.__trace.push(`pvmut ${m.length} h=${sheet.scrollHeight} st=${sheet.scrollTop}`)).observe(pv, { childList: true });
      sheet.addEventListener("scroll", () => window.__trace.push(`scroll ${sheet.scrollTop} ${new Error().stack}`));
      const d = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
      Object.defineProperty(sheet, "scrollTop", { get() { return d.get.call(this); }, set(v) { window.__trace.push(`set ${v} ${new Error().stack}`); d.set.call(this, v); } });
    });
  return { before, still: async () => {
    await page.waitForTimeout(700);
    const after = await probe();
    if (process.env.SCROLL_DEBUG) console.log((await page.evaluate(() => window.__trace.join("\n---\n"))));
    expect(after, "the target is still drawn").not.toBeNull();
    expect(Math.abs(after.rel - before.rel), `moved from ${before.rel} (scrollTop ${before.top}) to ${after.rel} (scrollTop ${after.top})`).toBeLessThanOrEqual(30);
  } };
}

for (const mode of ["preview", "live"]) {
  const where = mode === "live" ? ".cm-content" : ".preview";

  test(`${mode}: the oracle's Inserir na nota keeps the view where it was`, async ({ app, page }) => {
    await app.open();
    await openLong(app, mode);
    const w = await watch(page, `${where} .oracle-callout-btn`);
    await page.locator(`${where} .oracle-callout-btn`).first().click();
    const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
    await dialog.getByRole("button", { name: "Gravar no callout" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => ((await app.file(NOTE)) ?? "").split("d100:").length, { timeout: 8000 }).toBeGreaterThan(mode === "live" ? 1 : 2);
    await w.still();
  });

  test(`${mode}: a statblock reserve box and the Quebrado mark keep the view`, async ({ app, page }) => {
    await app.open();
    await openLong(app, mode);
    const w = await watch(page, `${where} .statblock-card`);
    const card = page.locator(`${where} .statblock-card`).first();
    await card.getByRole("button", { name: "Coragem: marcar 3 de 3" }).click();
    await expect.poll(() => app.file(NOTE)).toContain("reserva_1_atual: 3");
    await w.still();
    await card.getByRole("button", { name: "Quebrado: Dívida com a capitã Duarte" }).click();
    await expect.poll(() => app.file(NOTE)).toContain("quebrado: true");
    await w.still();
  });
}

test("preview: a task box keeps the view", async ({ app, page }) => {
  await app.open();
  await openLong(app, "preview");
  const w = await watch(page, ".preview input[type=checkbox]");
  await page.locator(".preview input[type=checkbox]").first().click();
  await expect.poll(() => app.file(NOTE)).toContain("- [x] Primeira tarefa");
  await w.still();
});
