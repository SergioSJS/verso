// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A web page as a card on the board (ADR 0057 point 10, decided
// 2026-10-21; ADR 0056): a link node with the page flag, shown in a
// sandboxed iframe when its origin is approved and its site allows being
// framed, a placeholder when it does not. The harness answers
// `embed_frameable` no for an address with "frames-no" in it.

import { test, expect } from "./fixtures.mjs";

const OK = "https://frames-ok.example/p";
const NO = "https://frames-no.example/p";
// The layout Obsidian writes (anything else asks to be rewritten first).
const BOARD = (nodes) => `{\n\t"nodes":[\n${nodes.map((n) => `\t\t${JSON.stringify(n)}`).join(",\n")}\n\t],\n\t"edges":[]\n}`;
const PAGE = (id, url, y = 0) => ({ id, type: "link", url, x: 0, y, width: 480, height: 360, verso: { page: true } });

async function openBoard(app, page, nodes) {
  await page.route("https://frames-ok.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>Pagina de fora</p>" }));
  await app.open();
  await app.writeOutside("Mesa.canvas", BOARD(nodes));
  await app.folderChanged(["Mesa.canvas"], true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
}

/** A button of a card that is not entered, pressed as a hand does: the board
 *  answers the pointer there (a card's buttons lie under Excalidraw's
 *  canvas), so the click goes to the point, not to the element. */
async function press(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const card = (page, id) => page.locator(`.board-card-slot[data-card="${id}"]`);

test("an approved, frameable origin shows the page in a sandboxed frame; a first visit asks first", async ({ app, page }) => {
  await openBoard(app, page, [PAGE("p", OK)]);
  const c = card(page, "p");
  // Not approved: the gate in the card, nothing asked of the network.
  await expect(c.locator(".board-card-gate")).toBeVisible();
  await expect(c.locator("iframe")).toHaveCount(0);
  expect(await app.calls("embed_frameable")).toEqual([]);
  await press(page, c.locator("button.save"));
  const frame = c.locator("iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute("src", OK);
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(frame).toHaveAttribute("title", /frames-ok\.example/);
  // The native clipped view is not used in a board.
  expect(await app.calls("web_open")).toEqual([]);
  await expect(c.locator(".board-card-title")).toHaveText("https://frames-ok.example");
});

test("a site that forbids framing is said so before the approval, and the card shows a placeholder", async ({ app, page }) => {
  await openBoard(app, page, [PAGE("p", NO)]);
  const c = card(page, "p");
  await press(page, c.locator("button.save"));
  await expect(c.locator("[role=alert]")).toContainText("proíbe ser incorporado");
  // Not approved by that click.
  await expect(c.locator("iframe")).toHaveCount(0);
  await press(page, c.locator("button.save"));
  await expect(c.locator(".board-card-note")).toContainText("não permite ser incorporado");
  await expect(c.locator("button.board-card-page-link")).toBeVisible();
  await expect(c.locator("iframe")).toHaveCount(0);
  expect(await app.calls("web_open")).toEqual([]);
});

test("the frame takes the pointer only while the card is entered; Esc on the header leaves", async ({ app, page }) => {
  await openBoard(app, page, [PAGE("p", OK)]);
  const c = card(page, "p");
  await press(page, c.locator("button.save"));
  const frame = c.locator("iframe");
  await expect(frame).toHaveCount(1);
  const events = () => frame.evaluate((f) => getComputedStyle(f).pointerEvents);
  const stop = () => frame.evaluate((f) => f.tabIndex);
  expect(await events()).toBe("none");
  expect(await stop()).toBe(-1);
  const enter = c.locator("button.board-card-interact");
  await expect(enter).toHaveAttribute("aria-pressed", "false");
  await press(page, enter);
  await expect(enter).toHaveAttribute("aria-pressed", "true");
  await expect.poll(events).toBe("auto");
  expect(await stop()).toBe(0);
  // Esc with the focus on the header returns to the board.
  await enter.focus();
  await page.keyboard.press("Escape");
  await expect(enter).toHaveAttribute("aria-pressed", "false");
  await expect.poll(events).toBe("none");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".excalidraw"))).toBe(true);
});

test("Insert › Web page… adds a link node with the flag, and the canvas round-trips", async ({ app, page }) => {
  await openBoard(app, page, [{ id: "t", type: "text", text: "Alfa", x: 0, y: 0, width: 250, height: 60 }]);
  await page.getByTestId("board-tool-insert").click();
  await page.getByTestId("board-tool-page").click();
  await page.locator(".prompt-field").fill(OK);
  await page.locator(".prompt-box button.save").click();
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes.find((n) => n.type === "link")?.verso).toEqual({ page: true });
  const link = JSON.parse(await app.file("Mesa.canvas")).nodes.find((n) => n.type === "link");
  expect(link.url).toBe(OK);
  // Closed and opened again: still a page card.
  await app.key("Mod+w");
  await app.quickOpen("Mesa");
  await app.boardReady();
  await expect(page.locator(".board-card-page")).toHaveCount(1);
});

test("a plain link card is switched to its page and back from the toolbar", async ({ app, page }) => {
  await openBoard(app, page, [{ id: "l", type: "link", url: OK, x: 0, y: 0, width: 400, height: 120 }]);
  await expect(card(page, "l").locator(".board-card-page")).toHaveCount(0);
  await app.select("l");
  await page.getByTestId("board-tool-page-toggle").click();
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes[0].verso).toEqual({ page: true });
  await expect(card(page, "l").locator(".board-card-page")).toHaveCount(1);
  await page.getByTestId("board-tool-page-toggle").click();
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes[0].verso).toBeUndefined();
  await expect(card(page, "l").locator(".board-card-page")).toHaveCount(0);
});
