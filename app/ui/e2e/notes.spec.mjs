// Walkthrough, sections 3, 4 and 6: writing in a note, a note renamed with
// its backlinks, the daily note and its calendar.

import { crc32, deflateSync } from "node:zlib";

import { test, expect, modeOn } from "./fixtures.mjs";

/** Today in the window's clock, as the app names a daily note. */
const today = (app) =>
  app.page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

test("the / menu inserts today's date, and ⌘Z takes it back", async ({ app }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  const note = "04 - Escrevendo no Editor.md";
  await modeOn(app.page, "Editar");
  const editor = app.page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await app.page.keyboard.press("Enter");
  await app.page.keyboard.press("Enter");
  await app.page.keyboard.type("/");
  const menu = app.page.locator(".slash");
  await expect(menu).toBeVisible();
  for (const section of ["Básico", "Listas", "Destaques", "Inserir"]) await expect(menu.locator(".slash-section", { hasText: section })).toBeVisible();
  await app.page.keyboard.type("data");
  await app.page.keyboard.press("Enter");
  // At the end of the note (its frontmatter has a date of its own).
  const day = await today(app);
  const end = async () => (await app.file(note)).trimEnd().split("\n").pop();
  await expect.poll(end, { timeout: 15_000 }).toBe(day);
  await app.key("Mod+z");
  await expect.poll(end, { timeout: 15_000 }).not.toBe(day);
  expect(await app.file(note)).not.toContain(`\n${day}`);
});

test("a note's own picture is shown from the folder, and its corner resizes it in the note", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("18 - Documentos");
  const note = "18 - Documentos e Mídia.md";
  // `![Diagrama|320](assets/diagrama.svg)`: asked of the core, never of the
  // window's own address first (the fixture fails on that 404).
  const img = page.locator('.preview img[alt="Diagrama|320"]');
  await expect(img).toHaveAttribute("src", "/__vault/assets/diagrama.svg");
  await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  // Its size, read from the alt text's `|320` (it had none, and a picture
  // without a size of its own was drawn 0 px wide).
  expect((await img.boundingBox()).width).toBe(320);
  // In the middle of the view: at its foot the status bar covers the corner.
  await img.evaluate((i) => i.scrollIntoView({ block: "center" }));
  await img.hover();
  const grip = img.locator("xpath=following-sibling::span[contains(@class, 'cm-lp-grip')]");
  const at = await grip.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => app.file(note)).toMatch(/\n!\[Diagrama\|\d+x\d+\]\(assets\/diagrama\.svg\)\n/);
  // The same picture written as an example in the heading's code is text:
  // it was the one rewritten (2026-10-01).
  expect(await app.file(note)).toContain("### Markdown com largura (`![Diagrama|320](assets/diagrama.svg)`)");
});

test("a renamed note shows who links to it at once", async ({ app }) => {
  await app.open();
  await app.quickOpen("Projeto Beta");
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="backlinks"]').click();
  const panel = app.page.locator("#right-body");
  await expect(panel.locator("li").first()).toBeVisible();
  await app.page.locator(".note-title:visible").first().click();
  const field = app.page.locator("input.title-input");
  await field.fill("Projeto Gama");
  await field.press("Enter");
  await app.page.locator(".plan:visible button.save").click();
  await expect.poll(() => app.files()).toContain("projetos/Projeto Gama.md");
  // Pointed at the new name, the notes and the boards — and listed now,
  // without opening the note again (bf12a4d).
  // The plan writes note by note: waited for, not read once.
  await expect.poll(() => app.file("projetos/Projeto Alpha.md")).toContain("[[Projeto Gama]]");
  await expect.poll(() => app.file("Board de Demonstração.canvas")).toContain('"file":"projetos/Projeto Gama.md"');
  await expect(panel).toContainText("Projeto Alpha");
  await expect(panel).toContainText("Pesquisa e Descobertas");
});

test("backlinks and outgoing links share one tab, a divider between them", async ({ app }) => {
  await app.open();
  await app.quickOpen("Projeto Beta");
  await app.key("Mod+Alt+ArrowRight");
  await expect(app.page.locator('#right-tabs button[data-tab="outgoing"]')).toHaveCount(0);
  await app.page.locator('#right-tabs button[data-tab="backlinks"]').click();
  const panel = app.page.locator("#right-body");
  await expect(panel.locator(".links-back .links-head")).toBeVisible();
  await expect(panel.locator(".links-out .links-head")).toBeVisible();
});


test("⌘⇧D makes today's note from the Diário template, and the calendar marks the days", async ({ app }) => {
  await app.open();
  const day = await today(app);
  await app.key("Mod+Shift+d");
  await expect.poll(() => app.file(`Diário/${day}.md`)).toContain(`# ${day}`);
  const text = await app.file(`Diário/${day}.md`);
  expect(text).toContain("## 🎯 Foco do Dia");
  expect(text).not.toContain("{{");
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="calendar"]').click();
  const cal = app.page.locator(".daily-cal");
  await expect(cal.locator(`.daily-day.has[data-day="${day}"]`)).toBeVisible();
  // Back to September 2026 by its date: as many months as lie between.
  const months = await app.page.evaluate(() => {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth() - (2026 * 12 + 8);
  });
  for (let i = 0; i < months; i++) await cal.getByRole("button", { name: "Anterior" }).click();
  await expect(cal.locator('.daily-day.has[data-day="2026-09-24"]')).toBeVisible();
  await expect(cal.locator('.daily-day.has[data-day="2026-09-25"]')).toBeVisible();
});

test("a note changed on disk while text typed here is unsaved shows both, and the disk's stays", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  const note = "04 - Escrevendo no Editor.md";
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type(" digitado aqui");
  // Another app writes the note before this tab saves (invariant 11).
  const outside = (await app.file(note)) + "\nescrito lá fora\n";
  await app.writeOutside(note, outside);
  await app.folderChanged([note]);
  await expect(page.locator(".conflict:visible")).toBeVisible();
  expect(await app.file(note)).toBe(outside);
});

test("a picture whose name has an accent is shown from the folder", async ({ app, page }) => {
  await app.open();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#c33"/></svg>';
  await app.writeOutside("assets/gráfico.svg", svg);
  await app.writeOutside("Nota do Gráfico.md", "# Nota do Gráfico\n\n![g|120](assets/gráfico.svg)\n");
  await app.folderChanged(["assets/gráfico.svg", "Nota do Gráfico.md"], true);
  await expect(page.locator("#notes")).toContainText("Nota do Gráfico");
  await app.quickOpen("Nota do Gráfico");
  // The renderer writes `gr%C3%A1fico`; the folder names the file `gráfico`
  // (review `board.md`, reading 3, finding 6).
  const img = page.locator('.preview img[alt="g|120"]');
  await expect(img).toHaveAttribute("src", /^\/__vault\/assets\//);
  await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
});

/** A PNG of `w`×`h` pixels, one colour: a picture whose natural size is
 *  larger than the pane, written without any file on disk. */
const widePng = (w, h) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x88)]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
};

test("a wide picture inside an embedded note does not rewrap the whole note", async ({ app, page }) => {
  await app.open();
  // The note embedded holds a picture 1600 px wide — wider than the pane.
  await app.writeOutside("Ficha.md", `# Ficha\n\n![](${widePng(1600, 400)})\n`);
  await app.writeOutside("Com Embute.md", "Um parágrafo de prosa que tem de quebrar na largura do painel, e nunca passar da borda direita da janela.\n\n![[Ficha]]\n\nOutro parágrafo, o mesmo caso.\n");
  await app.folderChanged(["Ficha.md", "Com Embute.md"], true);
  await app.quickOpen("Com Embute");
  await modeOn(page, "Editar");
  // The caret away from the embed's line: the live preview draws it.
  await page.locator(".cm-content").first().click({ position: { x: 50, y: 10 } });
  await expect(page.locator(".cm-lp-embed-body img")).toBeVisible();
  const box = () =>
    page.evaluate(() => {
      const content = document.querySelector(".cm-content");
      const sheet = content.closest(".sheet");
      return {
        content: Math.round(content.getBoundingClientRect().width),
        scroller: Math.round(content.closest(".cm-scroller").getBoundingClientRect().width),
        over: sheet.scrollWidth - sheet.clientWidth,
      };
    });
  await expect.poll(async () => (await box()).over).toBeLessThanOrEqual(0);
  const { content, scroller } = await box();
  expect(content).toBeLessThanOrEqual(scroller + 1);
});

test("an embedded note is drawn in the editor as the reading view draws it", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Ficha.md", "## Ideais\n\nPrimeiro parágrafo da ficha.\n\nSegundo parágrafo da ficha.\n");
  await app.writeOutside("Com Ficha.md", "Antes do embute.\n\n![[Ficha]]\n\nDepois do embute.\n");
  await app.folderChanged(["Ficha.md", "Com Ficha.md"], true);
  await app.quickOpen("Com Ficha");
  // The reading view's line numbers on: their gutter is the reading view's
  // own, and never reaches into an embed.
  await page.evaluate(() => document.documentElement.classList.add("show-line-numbers-preview"));
  /** The step from one paragraph to the next, the heading's colour, and
   *  how far the text sits inside the embed's frame. */
  const look = (body) =>
    page.evaluate((sel) => {
      const [a, b] = document.querySelectorAll(`${sel} p`);
      const frame = a.closest(".embed-note");
      return {
        step: Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().top),
        heading: getComputedStyle(document.querySelector(`${sel} h2`)).color,
        inset: Math.round(a.getBoundingClientRect().left - frame.getBoundingClientRect().left),
      };
    }, body);
  await expect(page.locator(".embed-note-body h2")).toBeVisible();
  const reading = await look(".embed-note-body");
  await modeOn(page, "Editar");
  // The caret away from the embed's line: the live preview draws it.
  await page.locator(".cm-content").first().click({ position: { x: 50, y: 10 } });
  await expect(page.locator(".cm-lp-embed-body h2")).toBeVisible();
  // Each line break between the rendered blocks was drawn as an empty
  // line (the editor's `white-space: break-spaces`), and the headings in
  // the editor's default type.
  expect(await look(".cm-lp-embed-body")).toEqual(reading);
});

test("⌘R saves the note typed in, then reloads the window", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  const note = "04 - Escrevendo no Editor.md";
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type(" digitado aqui");
  // What the folder holds as the page goes (the folder in memory goes
  // with it), and when: before the autosave's 1.5 s, so ⌘R wrote it.
  await page.evaluate((n) => {
    sessionStorage.setItem("typedAt", String(Date.now()));
    addEventListener("beforeunload", () => {
      sessionStorage.setItem("atUnload", window.__harness.read(n));
      sessionStorage.setItem("unloadAt", String(Date.now()));
    });
  }, note);
  // The new page, not the old one between its unload and the navigation.
  await Promise.all([page.waitForEvent("load"), app.key("Mod+r")]);
  await page.waitForFunction(() => window.__harness?.ready === true);
  const at = await page.evaluate(() => ({ text: sessionStorage.getItem("atUnload"), typed: Number(sessionStorage.getItem("typedAt")), gone: Number(sessionStorage.getItem("unloadAt")) }));
  expect(at.gone - at.typed, "unloaded before the autosave could write").toBeLessThan(1500);
  expect(at.text).toContain("digitado aqui");
});

test("⌘R does not reload over a note that cannot be saved", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  const note = "04 - Escrevendo no Editor.md";
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type(" digitado aqui");
  // The note changed on disk meanwhile: it is not saved without a choice.
  await app.writeOutside(note, (await app.file(note)) + "\nescrito lá fora\n");
  await app.folderChanged([note]);
  await expect(page.locator(".conflict:visible")).toBeVisible();
  await page.evaluate(() => (window.__notReloaded = true));
  await app.key("Mod+r");
  await expect(page.locator("#status")).toContainText("A janela não recarregou");
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true);
  await expect(page.locator(".cm-content").first()).toContainText("digitado aqui");
});

test("changing between Leitura and Editar keeps in view what was at the top", async ({ app, page }) => {
  await app.open();
  const sections = Array.from({ length: 40 }, (_, i) => `## Seção ${i + 1}\n\n- Um item de lista da seção ${i + 1}, comprido o bastante para quebrar em duas linhas no painel.\n- Outro item.\n\nUm parágrafo da seção ${i + 1}.\n`);
  await app.writeOutside("Longa.md", `# Longa\n\n${sections.join("\n")}`);
  await app.folderChanged(["Longa.md"], true);
  await app.quickOpen("Longa");
  /** The first heading or line whose text starts in view: by its text,
   *  not its box (a heading's line in the editor has padding above it). */
  const atTop = () =>
    page.evaluate(() => {
      const sheet = [...document.querySelectorAll(".sheet")].find((s) => s.offsetParent !== null);
      const top = sheet.getBoundingClientRect().top;
      const textTop = (e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return r.getClientRects()[0]?.top ?? -Infinity;
      };
      const shown = [...sheet.querySelectorAll(".preview:not([hidden]) h2, .cm-line")].filter((e) => e.offsetParent !== null && e.textContent.trim());
      return shown.find((e) => textTop(e) >= top - 1)?.textContent.replace(/^#+\s*/, "").trim();
    });
  await page.locator(".preview h2", { hasText: /Seção 20$/ }).evaluate((h) => h.scrollIntoView({ block: "start" }));
  await expect.poll(atTop).toMatch(/^(\d+)?Seção 20$/);
  await modeOn(page, "Editar");
  await expect.poll(atTop).toBe("Seção 20");
  await modeOn(page, "Leitura");
  await expect.poll(atTop).toMatch(/^(\d+)?Seção 20$/);
});

test("Editar sets the text where Leitura does: same column, width and line height", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Coluna.md", "# Coluna\n\nUm parágrafo de texto corrido, comprido o bastante para quebrar em mais de uma linha no painel do teste, e mais um pouco.\n\n- Um item de lista, comprido o bastante para quebrar em mais de uma linha no painel do teste, e mais um pouco.\n- Outro item.\n");
  await app.folderChanged(["Coluna.md"], true);
  await app.quickOpen("Coluna");
  /** Where the text of a block starts and ends, and its line height. */
  const measure = (sel, text) =>
    page.evaluate(([s, t]) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null && e.textContent.includes(t));
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.includes(t.slice(0, 6)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      const range = document.createRange();
      range.selectNodeContents(walker.nextNode());
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { left: range.getClientRects()[0].left, right: box.right - parseFloat(style.paddingRight), lineHeight: style.lineHeight };
    }, [sel, text]);
  // Drawn first: under load the measure could run before the paragraph is.
  await expect(page.locator(".preview p", { hasText: "Um parágrafo" })).toBeVisible();
  const reading = { para: await measure(".preview p", "Um parágrafo"), item: await measure(".preview li", "Um item") };
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  const editing = { para: await measure(".cm-line", "Um parágrafo"), item: await measure(".cm-line", "Um item") };
  for (const block of ["para", "item"]) {
    expect(Math.abs(editing[block].left - reading[block].left), `${block}: where its text starts`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(editing[block].right - reading[block].right), `${block}: where its lines end`).toBeLessThanOrEqual(1.5);
  }
  expect(editing.item.lineHeight).toBe(reading.item.lineHeight);
});

test("a name already taken is said, and logged as an answer, not an error", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Ocupada.md", "# Ocupada\n");
  await app.folderChanged(["Ocupada.md"], true);
  await app.key("Mod+n");
  // The title is offered for a name: one the folder already has. Typed
  // once the field has the focus — before, the keys went to the tree's
  // filter (flaky, 2026-10-08).
  await expect(page.locator("input.title-input")).toBeFocused();
  await page.keyboard.type("Ocupada");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Já existe um arquivo com esse nome.");
  expect(await app.file("Ocupada.md")).toBe("# Ocupada\n");
  // The fixture fails on any ERROR in the log; the answer is INFO.
  const info = await page.evaluate(() => window.__harness.log.filter((l) => l.level === "INFO").map((l) => l.message));
  expect(info).toContain("Já existe um arquivo com esse nome.");
});

test("a conflict in the editor keeps both: the disk's under the name, mine in a copy beside it, and the tab shows the copy", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  const note = "04 - Escrevendo no Editor.md";
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type(" digitado aqui");
  const outside = (await app.file(note)) + "\nescrito lá fora\n";
  await app.writeOutside(note, outside);
  await app.folderChanged([note]);
  const conflict = page.locator(".conflict:visible");
  await expect(conflict).toBeVisible();
  // Three ways out, each labelled by what it does.
  await expect(conflict.getByRole("button")).toHaveText(["Descartar o meu e recarregar", "Gravar o meu por cima", "Guardar os dois"]);
  await conflict.getByRole("button", { name: "Guardar os dois" }).click();
  // Named as sync names a copy: this computer's name (the host's) and the minute.
  const named = /^04 - Escrevendo no Editor \(conflito, Mac de Teste, \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\)\.md$/;
  await expect.poll(async () => (await app.files()).filter((f) => named.test(f)).length).toBe(1);
  const copy = (await app.files()).find((f) => named.test(f));
  // The disk's version kept its name; mine is in the copy, a new file.
  expect(await app.file(note)).toBe(outside);
  expect(await app.file(copy)).toContain("digitado aqui");
  expect(await app.file(copy)).not.toContain("escrito lá fora");
  // The tab shows the copy, with nothing left to save and no conflict.
  await expect(page.locator(".note-title:visible")).toHaveText(copy.replace(/\.md$/, ""));
  await expect(page.locator(".conflict:visible")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Os dois ficaram: a versão do disco em 04 - Escrevendo no Editor, o seu texto em 04 - Escrevendo no Editor (conflito");
});

/** A note of its own, opened in Editar with text typed at its end. */
async function typeIn(app, page, file, typed) {
  await app.writeOutside(file, `# ${file.replace(/\.md$/, "")}\n\ntexto\n`);
  await app.folderChanged([file], true);
  await app.quickOpen(file.replace(/\.md$/, ""));
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type(typed);
}

test("a note deleted outside while its tab holds unsaved text says so, stops saving, and saves it again on a click", async ({ app, page }) => {
  await app.open();
  // Deleted by another program, or by sync for another device, before the
  // autosave wrote what was typed: no event, the save finds it gone.
  await app.writeOutside("Apagada.md", "# Apagada\n\ntexto\n");
  await app.folderChanged(["Apagada.md"], true);
  await app.quickOpen("Apagada");
  await modeOn(page, "Editar");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await app.removeOutside("Apagada.md");
  await page.keyboard.type(" digitado aqui");
  const gone = page.locator(".gone-banner:visible");
  await expect(gone).toContainText("Esta nota foi apagada ou movida fora do Verso. O seu texto continua aqui.");
  await expect(gone.getByRole("button")).toHaveText(["Salvar de novo", "Fechar sem salvar"]);
  // The tab says it too, and the text stays.
  await expect(page.locator(".tab.gone")).toHaveCount(1);
  await expect(page.locator(".cm-content").first()).toContainText("digitado aqui");
  // Nothing more is written until the person chooses: not ⌘S, not the
  // autosave after more typing.
  const writes = async () => (await app.calls("write_note")).length;
  const tried = await writes();
  await page.keyboard.type(" e mais");
  await app.key("Mod+s");
  await expect(page.locator("#status")).toHaveText("Nada gravado: a nota não está mais na pasta — escolha acima entre salvar de novo e fechar sem salvar.");
  await page.waitForTimeout(2000);
  expect(await writes()).toBe(tried);
  // A note no longer there is the window's state, not a fault: INFO in the
  // log, once (the fixture fails on any ERROR).
  const info = await page.evaluate(() => window.__harness.log.filter((l) => l.level === "INFO" && l.message.startsWith("not_found")).length);
  expect(info).toBe(1);
  // Save again: the file made anew at its name, with the tab's text.
  await gone.getByRole("button", { name: "Salvar de novo" }).click();
  await expect.poll(() => app.file("Apagada.md")).toContain("digitado aqui e mais");
  await expect(page.locator(".gone-banner:visible")).toHaveCount(0);
  await expect(page.locator(".tab.gone")).toHaveCount(0);
  await expect(page.locator(".dirty-mark:visible")).toHaveCount(0);
});

test("a note deleted outside while its tab holds unsaved text closes without saving when asked", async ({ app, page }) => {
  await app.open();
  await typeIn(app, page, "Descartada.md", "");
  await app.removeOutside("Descartada.md");
  await page.keyboard.type(" digitado aqui");
  const gone = page.locator(".gone-banner:visible");
  await expect(gone).toBeVisible();
  await gone.getByRole("button", { name: "Fechar sem salvar" }).click();
  // Closed at once — the person chose — and nothing made again.
  await expect(page.locator(".tab", { hasText: "Descartada" })).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await app.file("Descartada.md")).toBeNull();
});

test("after a rename, a linking note that changed meanwhile is named in a notice, and tried again over its new text", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Lista.md", "# Lista\n");
  await app.writeOutside("Indice.md", "# Indice\n\nVer [[Lista]].\n");
  await app.writeOutside("Outra.md", "# Outra\n\nTambém [[Lista]].\n");
  await app.folderChanged(["Lista.md", "Indice.md", "Outra.md"], true);
  await app.quickOpen("Lista");
  await page.locator(".note-title:visible").first().click();
  const field = page.locator("input.title-input");
  await field.fill("Lista nova");
  await field.press("Enter");
  await expect(page.locator(".plan:visible")).toBeVisible();
  // Another program writes one of the linking notes while the plan is on
  // screen: its rewrite is refused (invariant 11).
  await app.writeOutside("Indice.md", "# Indice\n\nUma linha nova.\n\nVer [[Lista]].\n");
  await page.locator(".plan:visible button.save").click();
  await expect.poll(() => app.file("Outra.md")).toContain("[[Lista nova]]");
  // The status line fits; the notice names the note, and stays.
  await expect(page.locator("#status")).toHaveText("1 atualizada, 1 não.");
  const notice = page.locator(".plan-notice");
  await expect(notice).toHaveText(/Não atualizada: Indice\. Mudou em disco enquanto isso\./);
  await page.keyboard.type("x");
  await expect(notice).toBeVisible();
  // Tried again: the same change over the text on disk now, shown first.
  await notice.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(notice).toHaveCount(0);
  const plan = page.locator(".plan:visible");
  await expect(plan.locator("h2")).toHaveText("De novo, sobre o que está no disco agora: 1 nota. Aplicar?");
  expect(await app.file("Indice.md")).toContain("Ver [[Lista]].");
  await plan.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect.poll(() => app.file("Indice.md")).toBe("# Indice\n\nUma linha nova.\n\nVer [[Lista nova]].\n");
  await expect(page.locator("#status")).toHaveText("1 atualizada.");
  await expect(page.locator(".plan-notice")).toHaveCount(0);
});
