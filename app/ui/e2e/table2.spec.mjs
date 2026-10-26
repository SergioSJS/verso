// The table of a UniVerso folder (ADR 0107, phase 2): the server's table
// played by the harness (`__harness.table`: up, role, and the others who
// join, say, roll and send images). Messages, `/r`, secret rolls masked by
// role, pins at the top, the owner's clear, images as thumbnails, the
// roster, the input row on a phone. Screenshots for reading by eye go to
// $HOME/.cache/table2-shots (mounted by the runner), when the folder exists.

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/table2-shots`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==", "base64");
const shot = async (page, name) => {
  if (existsSync(SHOTS)) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const tag = (page) => (phone(page) ? "phone" : "desktop");

/** The folder's table is up, the window with `role`; Bia and Cris are there. */
async function serve(app, page, role = "owner", { others = true } = {}) {
  await app.open();
  await app.writeOutside("Diario.md", "# Diário\n\nTexto.\n");
  await app.writeOutside("Lobos.md", "# Lobos\n");
  await app.folderChanged(["Diario.md", "Lobos.md"], true);
  await page.evaluate(
    ([r, o]) => {
      const t = window.__harness.table;
      t.role = r;
      t.up = true;
      if (o) {
        t.join("Bia", "#1565c0", "editor");
        t.join("Cris", "#ad1457", "reader");
      }
    },
    [role, others],
  );
}

/** The panel open on its Mesa tab, the server's input row there. */
async function openTable(page) {
  if (phone(page)) {
    await page.locator(".bar-right").click();
  } else {
    await page.evaluate(() => document.body.classList.remove("no-right"));
  }
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  await expect(view.locator(".table-compose")).toBeVisible();
  return view;
}

const log = (view) => view.locator(".table-log .table-entry");
const field = (view) => view.getByRole("textbox", { name: "Mensagem para a mesa" });

test("a server's table: the roster, the others' messages and rolls, and what this window writes and rolls @layout", async ({ app, page }) => {
  await serve(app, page);
  const view = await openTable(page);
  // Who is at the table: the window's own account and the two who joined, in their colours.
  // ONE small icon with the count; the names (in their colours) show on hover, on a tap or on Enter, Escape closes.
  const members = view.locator(".table-roster .table-member");
  const rosterButton = view.locator(".table-roster-button");
  await expect(rosterButton).toHaveText("3");
  await expect(rosterButton).toHaveAccessibleName("3 pessoas na mesa: Ana, Bia, Cris");
  await expect(view.locator(".table-roster-list")).toBeHidden();
  await rosterButton.hover();
  await expect(members).toHaveText(["Ana", "Bia", "Cris"]);
  await expect(members.nth(1).locator(".table-dot")).toHaveCSS("background-color", "rgb(21, 101, 192)");
  await expect(view.locator(".table-roster-list")).toHaveAccessibleName("Quem está na mesa");
  await page.mouse.move(5, 5);
  await expect(view.locator(".table-roster-list")).toBeHidden();
  await rosterButton.focus();
  await page.keyboard.press("Enter");
  await expect(view.locator(".table-roster-list")).toBeVisible();
  await expect(rosterButton).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(view.locator(".table-roster-list")).toBeHidden();
  await expect(rosterButton).toBeFocused();
  await expect(view.locator(".table-empty")).toContainText("A mesa está vazia");
  // Others write and roll; the log keeps the server's order.
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.say("Bia", "Chegamos à taverna. Quem abre a porta?");
    t.roll("Cris", "1d20+3", { path: "Lobos.md" });
  });
  await expect(log(view)).toHaveCount(2);
  await expect(log(view).nth(0).locator(".table-who")).toHaveText("Bia");
  await expect(log(view).nth(0).locator(".table-text")).toHaveText("Chegamos à taverna. Quem abre a porta?");
  await expect(log(view).nth(1).locator(".table-notation")).toHaveText("1d20+3");
  await expect(log(view).nth(1).locator(".table-where")).toHaveText("Lobos");
  // This window writes: Enter sends; the field empties; the entry is mine, once.
  await field(view).fill("Eu abro. [[Lobos]] está lá fora.");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(3);
  await expect(field(view)).toHaveValue("");
  const mine = log(view).nth(2);
  await expect(mine.locator(".table-who")).toHaveText("Você");
  await expect(mine).toHaveClass(/mine/);
  // A link to a note of the folder is a link; everything else is text.
  await expect(mine.locator(".table-text .table-link")).toHaveText("Lobos");
  expect(await app.calls("table_say")).toEqual([{ text: "Eu abro. [[Lobos]] está lá fora.", table: "" }]);
  // `/r` rolls through the table's command; the server's roll comes back once.
  await field(view).fill("/r 2d6+1");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(4);
  const roll = log(view).nth(3);
  await expect(roll.locator(".table-notation")).toHaveText("2d6+1");
  await expect(roll.locator(".table-die")).toHaveCount(2);
  const calls = await app.calls("table_roll");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ notation: "2d6+1", secret: null });
  await expect(field(view)).toHaveValue("");
  // The roller's own dice travel with the roll, closed in form.
  expect(Object.keys(calls[0].styles).sort()).toEqual(["1", "2", "3"]);
  // A line that is no roll is told so and nothing is sent.
  await field(view).fill("/r banana");
  await field(view).press("Enter");
  await expect(view.locator(".table-compose-error")).toContainText("Não entendi “banana” como rolagem");
  expect((await app.calls("table_roll")).length).toBe(1);
  await field(view).fill("");
  // Bia leaves: the roster follows.
  await page.evaluate(() => window.__harness.table.leave("Bia"));
  await expect(members).toHaveText(["Ana", "Cris"]);
  await shot(page, `${tag(page)}-table`);
});

test("a message past 500 characters is counted, refused here, and never sent; a pace refusal is told politely @layout", async ({ app, page }) => {
  await serve(app, page);
  const view = await openTable(page);
  await expect(view.locator(".table-counter")).toBeHidden();
  await field(view).fill("a".repeat(420));
  await expect(view.locator(".table-counter")).toHaveText("420 de 500");
  await field(view).fill("b".repeat(501));
  await expect(view.locator(".table-counter")).toHaveClass(/over/);
  await field(view).press("Enter");
  await expect(view.locator(".table-compose-error")).toHaveText("A mensagem tem 501 caracteres; o máximo é 500.");
  expect(await app.calls("table_say")).toHaveLength(0);
  // The server's pace: the draft stays, the words are kind.
  await field(view).fill("Uma mensagem");
  await page.evaluate(() => (window.__harness.table.refuseNext = "too fast: wait 2 s"));
  await field(view).press("Enter");
  await expect(view.locator(".table-compose-error")).toHaveText("Devagar: espere 2 s para enviar de novo.");
  await expect(field(view)).toHaveValue("Uma mensagem");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(1);
  await expect(view.locator(".table-compose-error")).toBeHidden();
  await shot(page, `${tag(page)}-refusal`);
});

test("a secret roll: the roller and the owners see it, the other members see that it was rolled", async ({ app, page }) => {
  await serve(app, page, "editor");
  const view = await openTable(page);
  await page.evaluate(() => window.__harness.table.roll("Bia", "1d20+5", { secret: true }));
  const masked = log(view).first();
  await expect(masked).toHaveAttribute("data-kind", "secret");
  await expect(masked).toContainText("Bia");
  await expect(masked).toContainText("rolou em segredo");
  await expect(masked.locator(".table-notation, .table-total, .table-die")).toHaveCount(0);
  await expect(page.locator(".table-said")).toHaveText("Bia rolou em segredo");
  // This window rolls in secret with the toggle: it sees its own roll in full, marked.
  const mode = view.getByRole("button", { name: /^Quem vê a rolagem/ });
  await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Pública");
  await mode.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: /^Secreta/ }).click();
  await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Secreta");
  await field(view).fill("/r 1d8");
  await field(view).press("Enter");
  const own = log(view).nth(1);
  await expect(own.locator(".table-total")).toHaveText(/^\d$/);
  await expect(own.locator(".table-secret")).toHaveText("Secreta");
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "1d8", secret: true });
  await shot(page, "desktop-secret-editor");
});

test("an owner sees another member's secret roll in full", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  await page.evaluate(() => window.__harness.table.roll("Bia", "1d20+5", { secret: true }));
  const e = log(view).first();
  await expect(e).toHaveAttribute("data-kind", "roll");
  await expect(e.locator(".table-notation")).toHaveText("1d20+5");
  await expect(e.locator(".table-secret")).toHaveText("Secreta");
});

test("pinning puts an entry at the top for everyone; unpinning puts it back; any member pins @layout", async ({ app, page }) => {
  await serve(app, page, "editor");
  const view = await openTable(page);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.say("Bia", "A senha da cripta é “lua nova”.");
    t.say("Bia", "Outra coisa qualquer.");
  });
  await expect(log(view)).toHaveCount(2);
  await expect(view.locator(".table-pins")).toBeHidden();
  await log(view).first().getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Fixar" }).click();
  const pins = view.locator(".table-pins");
  await expect(pins).toBeVisible();
  await expect(pins.locator(".table-text")).toHaveText("A senha da cripta é “lua nova”.");
  await expect(log(view)).toHaveCount(1);
  expect(await app.calls("table_pin")).toHaveLength(1);
  // Another member pins the other one: the pinned list has both, oldest first.
  await page.evaluate(() => {
    const t = window.__harness.table;
    return window.__harness.emit("table-pinned", { id: t.entries()[1].id, pinned: true });
  });
  await expect(pins.locator(".table-entry")).toHaveCount(2);
  await shot(page, `${tag(page)}-pinned`);
  await pins.locator(".table-entry").first().getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Desafixar" }).click();
  await expect(pins.locator(".table-entry")).toHaveCount(1);
  await expect(log(view)).toHaveCount(1);
});

test("the owner clears the table, keeping the pinned ones unless told otherwise; others have no such menu", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.say("Bia", "Fixe esta.");
    t.say("Bia", "Vai embora.");
    t.roll("Cris", "1d6");
  });
  await expect(log(view)).toHaveCount(3);
  await log(view).first().getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Fixar" }).click();
  await expect(view.locator(".table-pins .table-entry")).toHaveCount(1);
  // The question comes first, with "keep the pinned" ticked; Cancel clears nothing.
  await view.getByRole("button", { name: "Mais opções da mesa" }).click();
  await page.getByRole("menuitem", { name: "Limpar a mesa" }).click();
  const box = page.getByRole("alertdialog");
  await expect(box).toContainText("Limpar a mesa para todos?");
  await expect(box.getByRole("checkbox", { name: "Manter as entradas fixadas" })).toBeChecked();
  await shot(page, "desktop-clear-ask");
  await box.getByRole("button", { name: "Cancelar" }).click();
  expect(await app.calls("table_clear")).toHaveLength(0);
  await expect(log(view)).toHaveCount(2);
  // Cleared keeping the pinned: the log is empty, the pinned stays.
  await view.getByRole("button", { name: "Mais opções da mesa" }).click();
  await page.getByRole("menuitem", { name: "Limpar a mesa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Limpar" }).click();
  await expect(log(view)).toHaveCount(0);
  await expect(view.locator(".table-pins .table-entry")).toHaveCount(1);
  expect(await app.calls("table_clear")).toEqual([{ keepPinned: true, table: "" }]);
  // And again, unticked: everything goes.
  await view.getByRole("button", { name: "Mais opções da mesa" }).click();
  await page.getByRole("menuitem", { name: "Limpar a mesa" }).click();
  const second = page.getByRole("alertdialog");
  await second.getByRole("checkbox").uncheck();
  await second.getByRole("button", { name: "Limpar" }).click();
  await expect(view.locator(".table-pins")).toBeHidden();
  expect((await app.calls("table_clear")).at(-1)).toEqual({ keepPinned: false, table: "" });
  // An editor has no menu to clear with, and the server would refuse.
  await page.evaluate(() => (window.__harness.table.role = "editor"));
  await expect(view.getByRole("button", { name: "Mais opções da mesa" })).toHaveCount(0);
});

test("a reader writes and rolls but sends no image, and can neither clear nor delete another's message", async ({ app, page }) => {
  await serve(app, page, "reader");
  const view = await openTable(page);
  await expect(view.getByRole("button", { name: "Anexar imagem" })).toBeHidden();
  await expect(view.locator(".tray-row")).toBeVisible();
  await expect(view.getByRole("button", { name: "Mais opções da mesa" })).toHaveCount(0);
  await page.evaluate(() => window.__harness.table.say("Bia", "Oi, leitor."));
  await field(view).fill("Oi, Bia.");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  // No Apagar on Bia's message; on mine, yes.
  await log(view).first().getByRole("button", { name: /^Ações da entrada/ }).click();
  await expect(page.getByRole("menuitem", { name: "Apagar" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Fixar" })).toBeVisible();
  await page.keyboard.press("Escape");
  await log(view).nth(1).getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Apagar" }).click();
  await expect(log(view)).toHaveCount(1);
  expect(await app.calls("table_delete")).toHaveLength(1);
  // A drop of an image is not taken.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "a.png", { type: "image/png" }));
    document.querySelector(".table-view").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(100);
  expect(await app.calls("table_send_image")).toHaveLength(0);
});

test("an owner deletes another's message, image or roll; a player deletes no roll", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.roll("Bia", "1d4");
    t.say("Bia", "Apague-me.");
  });
  await expect(log(view)).toHaveCount(2);
  await log(view).nth(1).getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Apagar" }).click();
  await expect(log(view)).toHaveCount(1);
  // The game master (an owner) deletes a roll too, after the same question of the menu.
  await log(view).first().getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Apagar" }).click();
  await expect(log(view)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Mesa: entrada apagada para todos.");
  // Another window's delete is heard.
  await page.evaluate(() => window.__harness.table.roll("Bia", "1d4"));
  await expect(log(view)).toHaveCount(1);
  await page.evaluate(() => window.__harness.emit("table-removed", { id: window.__harness.table.entries()[0].id }));
  await expect(log(view)).toHaveCount(0);
});

test("images: the file's thumbnail, opened large; sent from the picker, checked first; pasted or dropped @layout", async ({ app, page }) => {
  await serve(app, page, "editor");
  const view = await openTable(page);
  // Bia's image is a file of the folder.
  await page.evaluate((b64) => {
    window.__harness.core.handlers["create_file"]({ path: "attachments/mapa.png", base64: b64 });
    window.__harness.table.image("Bia", "attachments/mapa.png");
  }, PNG.toString("base64"));
  const thumb = log(view).first().locator("img.table-thumb");
  await expect(thumb).toHaveAttribute("src", "/__vault/attachments/mapa.png");
  await expect(thumb).toHaveAccessibleName("Imagem enviada por Bia");
  await expect.poll(() => thumb.evaluate((img) => img.naturalWidth)).toBe(1);
  await log(view).first().getByRole("button", { name: /^Abrir imagem/ }).click();
  const big = page.getByRole("dialog", { name: "Imagem enviada por Bia" });
  await expect(big.locator("img")).toBeVisible();
  await shot(page, `${tag(page)}-image-open`);
  await page.keyboard.press("Escape");
  await expect(big).toHaveCount(0);
  // Chosen from the picker: it waits in the box as a small preview, and Enter sends it (the image first, then the text, if any).
  const chooser = page.waitForEvent("filechooser");
  await view.getByRole("button", { name: "Anexar imagem" }).click();
  await (await chooser).setFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(view.locator(".table-chip")).toHaveCount(1);
  await expect(view.locator(".table-chip-name")).toHaveText("foto.png");
  expect(await app.calls("table_send_image")).toHaveLength(0);
  // The × takes it out of the box without sending.
  await view.getByRole("button", { name: "Tirar a imagem foto.png" }).click();
  await expect(view.locator(".table-chip")).toHaveCount(0);
  expect(await app.calls("table_send_image")).toHaveLength(0);
  const again0 = page.waitForEvent("filechooser");
  await view.getByRole("button", { name: "Anexar imagem" }).click();
  await (await again0).setFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(view.locator(".table-chip")).toHaveCount(1);
  await field(view).fill("Olhem o mapa");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(3);
  await expect(log(view).nth(1).locator("img.table-thumb")).toHaveAttribute("src", /^\/__vault\/attachments\/mesa-\d+\.png$/);
  await expect(log(view).nth(2).locator(".table-text")).toHaveText("Olhem o mapa");
  await expect(view.locator(".table-chip")).toHaveCount(0);
  expect(await app.calls("table_send_image")).toHaveLength(1);
  expect((await app.files()).some((f) => /^attachments\/mesa-\d+\.png$/.test(f))).toBe(true);
  // Checked when it is chosen: the bytes, not the name.
  const refused = page.waitForEvent("filechooser");
  await view.getByRole("button", { name: "Anexar imagem" }).click();
  await (await refused).setFiles({ name: "arte.png", mimeType: "image/png", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await expect(view.locator(".table-compose-error")).toContainText("não é um arquivo que a mesa aceite");
  const huge = page.waitForEvent("filechooser");
  await view.getByRole("button", { name: "Anexar imagem" }).click();
  await (await huge).setFiles({ name: "enorme.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]) });
  await expect(view.locator(".table-compose-error")).toContainText("passa de 10 MB");
  await expect(view.locator(".table-chip")).toHaveCount(0);
  expect(await app.calls("table_send_image")).toHaveLength(1);
  // Pasted into the box (Ctrl+V, right click > Paste and the phone's long press all end in this event) or dropped on the panel: the same preview.
  await field(view).focus();
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.querySelector(".table-input").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString("base64"));
  await expect(view.locator(".table-chip")).toHaveCount(1);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "solta.png", { type: "image/png" }));
    document.querySelector(".table-view").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, PNG.toString("base64"));
  await expect(view.locator(".table-chip")).toHaveCount(2);
  await view.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(log(view)).toHaveCount(5);
  await expect(view.locator(".table-chip")).toHaveCount(0);
  await shot(page, `${tag(page)}-image-pasted`);
  // The server's own refusal of an image is shown, not swallowed.
  await page.evaluate(() => (window.__harness.table.refuseNext = "too fast: wait 1 s"));
  const again = page.waitForEvent("filechooser");
  await view.getByRole("button", { name: "Anexar imagem" }).click();
  await (await again).setFiles({ name: "outra.png", mimeType: "image/png", buffer: PNG });
  // The file is read before it waits in the box: Enter pressed earlier has nothing to send.
  await expect(view.locator(".table-chip")).toHaveCount(1);
  await field(view).press("Enter");
  await expect(view.locator(".table-compose-error")).toContainText("Devagar");
  // The refused image stays in the box, for another try.
  await expect(view.locator(".table-chip")).toHaveCount(1);
});

test("a roll in a note, out of a live room, is the table's server's roll; one in a live room goes with the roller's dice", async ({ app, page }) => {
  const NOTE = "Mesa.md";
  await serve(app, page, "owner");
  await app.writeOutside(NOTE, "# Mesa\n\nAtaque: `dice: 1d20+3`.\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Mesa");
  const view = await openTable(page);
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(log(view)).toHaveCount(1);
  await expect(log(view).first().locator(".table-where")).toHaveText("Mesa");
  expect(await app.calls("table_roll")).toMatchObject([{ notation: "1d20+3", path: NOTE, secret: null }]);
  // In a live room the note's own command carries the dice (item 11): the note joins its room.
  const synced = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await page.evaluate((st) => (window.__harness.core.handlers.folder_sync = () => st), synced);
  await app.emit("sync-status", synced);
  await app.quickOpen("Diario");
  await app.quickOpen("Mesa");
  await page.locator(".preview:visible").getByRole("button", { name: /^Rolar (1d20\+3|de novo)$/ }).first().click();
  await expect.poll(async () => (await app.calls("collab_roll")).length).toBe(1);
  const call = (await app.calls("collab_roll"))[0];
  expect(Object.keys(call.styles).sort()).toEqual(["1", "2", "3"]);
  // The table has it once: from the harness's server, appended to the log, however many ways it was told.
  await expect(log(view)).toHaveCount(2);
});

test("a roll heard from the table is drawn in the roller's colours", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  const style = (body, number) => ({ body, number, outline: "#000000", texture: "none", material: "plastic" });
  await page.evaluate(() => {
    const s = (body, number) => ({ body, number, outline: "#000000", texture: "none", material: "plastic" });
    window.__harness.table.roll("Bia", "1d20", { styles: { 1: s("#112233", "#ffeeaa"), 2: s("#445566", "#ffffff"), 3: s("#778899", "#000000") } });
  });
  const die = log(view).locator(".table-die").last();
  await expect(die).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(die).toHaveCSS("color", "rgb(255, 238, 170)");
});

test("older entries come on request, a page at a time, and are not news", async ({ app, page }) => {
  await serve(app, page, "editor");
  // 130 messages are on the table before this window joins it again: it is given the latest 100.
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.up = false;
    for (let i = 1; i <= 130; i++) t.say("Bia", `mensagem ${i}`);
    t.up = true;
  });
  const view = await openTable(page);
  await expect(log(view)).toHaveCount(100);
  await expect(log(view).first().locator(".table-text")).toHaveText("mensagem 31");
  const older = view.getByRole("button", { name: "Ver anteriores" });
  await older.click();
  await expect(log(view)).toHaveCount(130);
  await expect(log(view).first().locator(".table-text")).toHaveText("mensagem 1");
  await expect(older).toBeHidden();
  expect(await app.calls("table_history")).toHaveLength(1);
});

test("add to note: a message is a line of text, an image an embed of its file, written only after the yes", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  await page.evaluate((b64) => {
    const t = window.__harness.table;
    t.say("Bia", "Os lobos\nvêm do norte.");
    window.__harness.core.handlers["create_file"]({ path: "attachments/mapa.png", base64: b64 });
    t.image("Bia", "attachments/mapa.png");
  }, PNG.toString("base64"));
  await expect(log(view)).toHaveCount(2);
  const pick = async (entry) => {
    await entry.getByRole("button", { name: /^Ações da entrada/ }).click();
    await page.getByRole("menuitem", { name: "Adicionar à nota…" }).click();
    const combo = page.getByRole("combobox", { name: "Abrir…" });
    await combo.fill("Diario");
    await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Diario");
    await combo.press("Enter");
  };
  await pick(log(view).first());
  const box = page.locator(".confirm-box");
  await expect(box).toContainText('ao fim de "Diario"');
  await expect(box).toContainText("Bia");
  await expect(box).toContainText("Os lobos vêm do norte.");
  await box.getByRole("button", { name: "Cancelar" }).click();
  expect(await app.file("Diario.md")).toBe("# Diário\n\nTexto.\n");
  await pick(log(view).nth(1));
  await expect(page.locator(".confirm-box")).toContainText("![[attachments/mapa.png]]");
  await page.locator(".confirm-box").getByRole("button", { name: "Adicionar" }).click();
  await expect.poll(async () => await app.file("Diario.md")).toMatch(/^# Diário\n\nTexto\.\n\n- \*\*Bia\*\* · \d\d:\d\d:\d\d — !\[\[attachments\/mapa\.png\]\]\n$/);
});

test("the Mesa notification is off until turned on; then another's message, with the panel closed, is a toast", async ({ app, page }) => {
  await serve(app, page, "owner");
  const toasts = page.locator("#notify-toasts .notify-toast");
  // Off by default: counted, not notified.
  await page.evaluate(() => window.__harness.table.say("Bia", "Primeira."));
  await expect(page.locator("body")).toHaveAttribute("data-table-unread", "1");
  await page.waitForTimeout(300);
  await expect(toasts).toHaveCount(0);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Notificações" }).click();
  const kind = page.getByRole("combobox", { name: "Mesa", exact: true });
  await expect(kind).toHaveValue("off");
  await kind.selectOption("toast");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__harness.table.say("Bia", "Segunda."));
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toContainText("Bia escreveu: Segunda.");
  await expect(page.locator("body")).toHaveAttribute("data-table-unread", "2");
  // Its action brings the panel up.
  await toasts.getByRole("button", { name: "Abrir a mesa" }).click();
  await expect(page.locator(".table-view")).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
  await expect(toasts).toHaveCount(0);
  // With the panel on screen, nothing more is notified.
  await page.evaluate(() => window.__harness.table.say("Bia", "Terceira."));
  await expect(page.locator(".table-log .table-entry")).toHaveCount(3);
  await page.waitForTimeout(300);
  await expect(toasts).toHaveCount(0);
});

test("without a table on the side, the local source stays: no input row, no roster", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-note")).toBeVisible();
  // The field and the dice row stay for the local table's `/r`; messages, images and Secreta are the server's.
  await expect(view.locator(".table-compose")).toBeVisible();
  await expect(view.locator(".tray-mode")).toBeHidden();
  await expect(view.locator(".table-roster")).toBeHidden();
  // The table comes up: the server's source replaces the local one; down again, it goes back.
  await page.evaluate(() => (window.__harness.table.up = true));
  await expect(view.locator(".table-compose")).toBeVisible();
  await expect(view.locator(".table-note")).toBeHidden();
  await expect(view.locator(".tray-mode")).toBeVisible();
  await page.evaluate(() => (window.__harness.table.up = false));
  await expect(view.locator(".tray-mode")).toBeHidden();
  await expect(view.locator(".table-note")).toBeVisible();
});

test("the phone: the input row stays in the sheet, rises above the keyboard, and the targets are finger-sized @layout", async ({ app, page }) => {
  await serve(app, page, "owner");
  const view = await openTable(page);
  await page.evaluate(() => window.__harness.table.say("Bia", "Olá do celular."));
  await expect(log(view)).toHaveCount(1);
  const size = page.viewportSize();
  const input = field(view);
  const box = await input.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  if (phone(page)) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Anexar imagem", "Enviar"]) {
      const b = await view.getByRole("button", { name }).boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(32);
      expect(b.height).toBeGreaterThanOrEqual(32);
    }
    const menu = await log(view).first().getByRole("button", { name: /^Ações da entrada/ }).boundingBox();
    expect(menu.width).toBeGreaterThanOrEqual(32);
    expect(menu.x + menu.width).toBeLessThanOrEqual(size.width);
    // The keyboard (a visual viewport that shrinks) lifts the sheet: its foot is above the keyboard.
    const sheet = page.locator("aside.right");
    const before = await sheet.boundingBox();
    await page.evaluate(() => document.body.style.setProperty("--table-kb", "300px"));
    await expect.poll(async () => (await sheet.boundingBox()).y + (await sheet.boundingBox()).height).toBeLessThanOrEqual(size.height - 300 + 1);
    const after = await sheet.boundingBox();
    expect(after.height).toBeLessThanOrEqual(before.height);
    expect(after.y).toBeGreaterThanOrEqual(0);
    await shot(page, "phone-keyboard");
    await page.evaluate(() => document.body.style.removeProperty("--table-kb"));
  }
  await shot(page, `${tag(page)}-input`);
});

for (const [name, others, falls] of [
  ["another person's roll at the table falls in 3D in their dice when the 3D dice are on", undefined, true],
  ["and not when 'show others' rolls in 3D' is off", false, false],
]) {
  test(`${name}`, async ({ app, page }) => {
    const chunks = [];
    page.on("request", (r) => /\/(harness-)?chunks\/stage-[^/]*\.js/.test(r.url()) && chunks.push(r.url()));
    await page.addInitScript((o) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, ...(o === undefined ? {} : { others3d: o }) }));
    }, others);
    await serve(app, page, "editor");
    const view = await openTable(page);
    await page.evaluate(() => window.__harness.table.roll("Bia", "1d20+3"));
    // The line is on the table either way (the log is not the fall).
    await expect(log(view)).toHaveCount(1, { timeout: 20000 });
    if (falls) await expect.poll(() => chunks.length, { timeout: 15000 }).toBeGreaterThan(0);
    else {
      await page.waitForTimeout(1500);
      expect(chunks).toHaveLength(0);
    }
    // A roll made in secret and masked for this editor never falls.
  });
}

test("`/r 1d20` empties the field as soon as the server takes it, not after the 3D dice have fallen", async ({ app, page }) => {
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true } }));
  });
  await serve(app, page);
  const view = await openTable(page);
  await field(view).fill("/r 1d20");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(1);
  // Emptied while the dice are still falling (the fall takes seconds).
  await expect(field(view)).toHaveValue("", { timeout: 1500 });
  // What is typed meanwhile is kept for the next message.
  await field(view).fill("e outra");
  await expect(field(view)).toHaveValue("e outra");
});
