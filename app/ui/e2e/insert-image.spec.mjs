// The editor's "insert image" button (the maintainer, 2026-10-15: "tem um
// botão inútil de inserir imagem na barra de ferramentas"): a small menu
// that opens the system's picker — here a stubbed file chooser — copies the
// image into the folder's attachments folder under a name nothing holds,
// and writes its embed at the caret as one edit. On a phone the camera is a
// choice of its own; a reader, a bound and a server out of reach each say
// so.

import { test, expect, modeOn } from "./fixtures.mjs";

const NOTE = "04 - Escrevendo no Editor.md";
// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");


async function openEdit(app, query = "") {
  await app.open(query);
  await app.quickOpen("04 - Escrevendo");
  await modeOn(app.page, "Editar");
  const editor = app.page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await app.page.keyboard.press("Enter");
}

const button = (page) => page.locator(".toolbar [data-insert-image]");
const menu = (page) => page.locator(".menu:not([hidden])");

/** Choose `file` in the picker the item opens. */
async function choose(page, item, file) {
  const chooser = page.waitForEvent("filechooser");
  await menu(page).getByRole("menuitem", { name: item }).click();
  const c = await chooser;
  await c.setFiles(file);
  return c;
}

test.describe("on the desktop", () => {
  test("the button opens a menu, the chosen image is copied into assets/ and embedded, and ⌘Z takes the embed back", async ({ app, page }) => {
    await openEdit(app);
    await button(page).click();
    await expect(menu(page).getByRole("menuitem")).toHaveText(["Do computador…", "Da pasta…"]);
    await expect(menu(page).getByRole("menuitem", { name: "Tirar foto" })).toHaveCount(0);
    const chooser = await choose(page, "Do computador…", { name: "capa.png", mimeType: "image/png", buffer: PNG });
    expect(chooser.isMultiple()).toBe(true);
    // Copied with its own bytes, beside the note, in the attachments folder.
    await expect.poll(async () => (await app.files()).includes("assets/capa.png")).toBe(true);
    expect(await page.evaluate(() => window.__harness.bytes("assets/capa.png"))).toBe(PNG.toString("base64"));
    await expect(page.locator("#status")).toHaveText("Imagem anexada: “capa.png” (em assets/).");
    const calls = await app.calls("create_file");
    expect(calls.map((c) => c.path)).toEqual(["assets/capa.png"]);
    // The embed, in the note, once saved.
    await expect.poll(async () => (await app.file(NOTE)).includes("![[capa.png]]"), { timeout: 15_000 }).toBe(true);
    await app.key("Mod+z");
    await expect.poll(async () => (await app.file(NOTE)).includes("![[capa.png]]"), { timeout: 15_000 }).toBe(false);
  });

  test("a name that is taken is never overwritten: capa (2).png, capa (3).png", async ({ app, page }) => {
    await openEdit(app);
    for (const want of ["assets/capa.png", "assets/capa (2).png", "assets/capa (3).png"]) {
      await button(page).click();
      await choose(page, "Do computador…", { name: "capa.png", mimeType: "image/png", buffer: PNG });
      await expect.poll(async () => (await app.files()).includes(want)).toBe(true);
    }
    await expect.poll(async () => (await app.file(NOTE)).includes("![[capa (3).png]]"), { timeout: 15_000 }).toBe(true);
  });

  test("the folder setting for attachments says where it goes", async ({ app, page }) => {
    await openEdit(app);
    await page.evaluate(() => localStorage.setItem("verso.settings", JSON.stringify({ attachments: "anexos/fotos" })));
    await page.reload();
    await page.waitForFunction(() => window.__harness?.ready === true);
    await app.quickOpen("04 - Escrevendo");
    await modeOn(page, "Editar");
    await page.locator(".cm-content").first().click();
    await button(page).click();
    await choose(page, "Do computador…", { name: "x.png", mimeType: "image/png", buffer: PNG });
    await expect.poll(async () => (await app.files()).includes("anexos/fotos/x.png")).toBe(true);
    await expect(page.locator("#status")).toHaveText("Imagem anexada: “x.png” (em anexos/fotos/).");
  });

  test("“Da pasta…” is the old way: ![[ and the files already in the folder", async ({ app, page }) => {
    await openEdit(app);
    await button(page).click();
    await menu(page).getByRole("menuitem", { name: "Da pasta…" }).click();
    await expect(page.locator(".cm-content").first()).toContainText("![[");
    await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
    expect(await app.calls("create_file")).toEqual([]);
  });

  test("a file that is not an image is refused where it was chosen, and nothing is copied", async ({ app, page }) => {
    await openEdit(app);
    await button(page).click();
    // The picker filters to images; a drop or a stubbed chooser may not.
    await choose(page, "Do computador…", { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("oi") });
    await expect(page.locator("#status")).toHaveText("“notas.txt” não é uma imagem; nada foi copiado.");
    expect(await app.calls("create_file")).toEqual([]);
  });

  test("a server out of reach says so, and no embed is written", async ({ app, page }) => {
    await openEdit(app);
    await page.evaluate(() => {
      window.__harness.core.handlers.create_file = () => {
        throw { kind: "unreachable", message: "localhost:7351" };
      };
    });
    await button(page).click();
    await choose(page, "Do computador…", { name: "capa.png", mimeType: "image/png", buffer: PNG });
    await expect(page.locator("#status")).toContainText("Não foi possível alcançar o servidor localhost:7351");
    await page.waitForTimeout(300);
    expect(await app.file(NOTE)).not.toContain("![[capa.png]]");
  });

  test("a pasted image takes the same path: a name that is taken is not overwritten", async ({ app, page }) => {
    await openEdit(app);
    const paste = () =>
      page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], "figura.png", { type: "image/png" }));
        document.querySelector(".cm-content").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      }, PNG.toString("base64"));
    await paste();
    await expect.poll(async () => (await app.files()).includes("assets/figura.png")).toBe(true);
    await paste();
    await expect.poll(async () => (await app.files()).includes("assets/figura (2).png")).toBe(true);
  });
});

test.describe("on a server", () => {
  test("a reader is told they only read, and nothing is sent", async ({ app, page }) => {
    await app.open("?side=server&role=reader");
    await app.quickOpen("04 - Escrevendo");
    await modeOn(page, "Editar").catch(() => undefined);
    const b = button(page);
    if (await b.isVisible()) {
      await b.click();
      await expect(page.locator("#status")).toHaveText("Você só lê esta pasta.");
    }
    expect(await app.calls("create_file")).toEqual([]);
  });

  test("an image over 32 MB is not sent: the server takes 48 MB a message, as base64", async ({ app, page }) => {
    await openEdit(app, "?side=server");
    // The Enter typed to make room is saved first: "Salvo." would take the
    // status line over after the answer.
    await expect(page.locator("#status")).toHaveText("Salvo.");
    await button(page).click();
    await choose(page, "Do computador…", { name: "enorme.png", mimeType: "image/png", buffer: Buffer.alloc(32 * 1024 * 1024 + 1) });
    await expect(page.locator("#status")).toHaveText("“enorme.png” passa de 32 MB, o máximo que o servidor recebe de uma vez; nada foi copiado.");
    expect(await app.calls("create_file")).toEqual([]);
  });
});

test.describe("on a phone @layout", () => {
  test.skip(({ isMobile }) => !isMobile, "the camera is offered where a finger is the pointer");
  test("the camera is a choice of its own, and the gallery stays one", async ({ app, page }) => {
    await openEdit(app, "?side=server");
    await button(page).tap();
    await expect(menu(page).getByRole("menuitem")).toHaveText(["Fotos e arquivos…", "Tirar foto", "Da pasta…"]);
    // The gallery: no capture attribute, so the phone offers both.
    const gallery = await choose(page, "Fotos e arquivos…", { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: PNG });
    await expect.poll(async () => (await app.files()).includes("assets/IMG_0001.jpg")).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll("input[data-attach-picker]").length)).toBe(0);
    expect(gallery.isMultiple()).toBe(true);
    // The camera: a picture named by when it was taken.
    await button(page).tap();
    const camera = page.waitForEvent("filechooser");
    await menu(page).getByRole("menuitem", { name: "Tirar foto" }).tap();
    const c = await camera;
    expect(c.isMultiple()).toBe(false);
    expect(await c.element().getAttribute("capture")).toBe("environment");
    await c.setFiles({ name: "image.jpg", mimeType: "image/jpeg", buffer: PNG });
    await expect.poll(async () => (await app.files()).some((f) => /^assets\/Foto \d{4}-\d{2}-\d{2} \d{6}\.jpg$/.test(f))).toBe(true);
  });
});
