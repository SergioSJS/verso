// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A web page embedded in a note (ADR 0056, revised 2026-10-15): a site the
// host says may be framed is a real <iframe> in the note — the box's size,
// scrolling and clipped with the note by the browser — and a site that
// refuses keeps the host's child web view. The harness answers
// `embed_frameable` no for an address with "frames-no" in it.

import { test, expect } from "./fixtures.mjs";

const NOTE = "Pagina.md";
const FILLER = Array.from({ length: 40 }, (_, i) => `Linha ${i + 1} da nota.`).join("\n\n");

async function open(app, page, text) {
  await app.open();
  await app.writeOutside(NOTE, text);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Pagina");
  // The origin is asked about once; approving it is what loads the page.
  await page.locator('[data-embed-action="approve"]').click();
  // A site that forbids framing is said so first (ADR 0056.aviso); a second
  // click approves it all the same.
  if (/frames-no/.test(text)) await page.locator('[data-embed-action="approve-anyway"]').click();
}

test("a site that allows framing is an iframe, the size of its box, scrolling with the note", async ({ app, page }) => {
  await page.route("https://frames-ok.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>Pagina de fora</p>" }));
  await open(app, page, `${FILLER}\n\n<iframe src="https://frames-ok.example/p" width="500" height="300"></iframe>\n\n${FILLER}\n`);
  const box = page.locator(".preview .embed-web");
  const frame = box.locator("iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute("src", "https://frames-ok.example/p");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  // No child web view: the page is in the document, not over it.
  expect(await app.calls("web_open")).toEqual([]);
  expect(await app.calls("embed_frameable")).toEqual([{ url: "https://frames-ok.example/p" }]);
  // The frame is the box's content exactly.
  const sizes = await page.evaluate(() => {
    const b = document.querySelector(".preview .embed-web");
    const f = b.querySelector("iframe");
    const bb = b.getBoundingClientRect();
    const fb = f.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return { boxW: bb.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth), boxH: bb.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth), w: fb.width, h: fb.height };
  });
  expect(Math.abs(sizes.w - sizes.boxW)).toBeLessThan(1.5);
  expect(Math.abs(sizes.h - sizes.boxH)).toBeLessThan(1.5);
  // Scrolling the note moves the frame with it, by exactly as much.
  await box.scrollIntoViewIfNeeded();
  const before = (await frame.boundingBox()).y;
  const moved = await page.evaluate(() => {
    // The nearest ancestor that scrolls: the note's own scroller.
    let el = document.querySelector(".preview .embed-web").parentElement;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    const was = el.scrollTop;
    el.scrollTop += 50;
    return el.scrollTop - was;
  });
  expect(moved).toBe(50);
  await expect.poll(async () => before - (await frame.boundingBox()).y).toBeGreaterThan(40);
});

test("a site that refuses framing keeps the child web view", async ({ app, page }) => {
  await open(app, page, `<iframe src="https://frames-no.example/p" width="500" height="300"></iframe>\n`);
  await expect.poll(() => app.calls("web_open").then((c) => c.length)).toBe(1);
  expect((await app.calls("web_open"))[0].url).toBe("https://frames-no.example/p");
  await expect(page.locator(".preview .embed-web iframe")).toHaveCount(0);
  expect(await app.calls("embed_frameable")).toEqual([{ url: "https://frames-no.example/p" }]);
});

test("the approval warns before it is given when the site forbids framing", async ({ app, page }) => {
  await app.open();
  await app.writeOutside(NOTE, `<iframe src="https://frames-no.example/p" width="500" height="300"></iframe>\n`);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Pagina");
  // Nothing is asked of the host before the click.
  expect(await app.calls("embed_frameable")).toEqual([]);
  await page.locator('[data-embed-action="approve"]').click();
  const warn = page.locator(".embed-gate-warn");
  await expect(warn).toBeVisible();
  await expect(warn).toHaveAttribute("role", "alert");
  // The desktop host shows such a site in the clipped native view: said so.
  await expect(warn).toContainText("visão nativa");
  expect(await app.calls("web_open")).toEqual([]);
  expect(await app.calls("embed_frameable")).toEqual([{ url: "https://frames-no.example/p" }]);
  // Cancelled, the origin stays unapproved.
  await page.locator('[data-embed-action="cancel"]').click();
  expect(await app.calls("web_open")).toEqual([]);
});

test("a site that allows framing is approved by one click, with no warning", async ({ app, page }) => {
  await page.route("https://frames-ok.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>x</p>" }));
  await open(app, page, `<iframe src="https://frames-ok.example/p" width="500" height="300"></iframe>\n`);
  await expect(page.locator(".preview .embed-web iframe")).toHaveCount(1);
  await expect(page.locator(".embed-gate-warn")).toHaveCount(0);
});
