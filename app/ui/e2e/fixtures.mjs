// What every end-to-end test of the window starts from (ADR 0058): the
// browser harness opened on the demo vault (or an empty folder), and, at
// the end, a window whose console stayed clean and whose log holds no
// error — what was read by eye on 2026-10-01, read here by machine.

import { test as base, expect } from "@playwright/test";

/** Console lines that are not the window's errors. */
const NOISE = [/^Failed to load resource/];

const TYPES = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", html: "text/html; charset=utf-8" };

/** The window under test, and what a test asks of it. */
export class App {
  constructor(page) {
    this.page = page;
  }

  /** Open the harness: `?vault=empty` for an empty folder. */
  async open(query = "") {
    await this.page.goto(`/harness.html${query}`);
    await this.page.waitForFunction(() => window.__harness?.ready === true);
  }

  /** A key, ⌘ written as `Mod` (Ctrl off a Mac). */
  async key(combo) {
    await this.page.keyboard.press(combo.replace(/\bMod\b/g, "ControlOrMeta"));
  }

  /** Open a file by name with the quick switcher (⌘P). */
  async quickOpen(name) {
    await this.key("Mod+p");
    await this.page.keyboard.type(name);
    await this.page.keyboard.press("Enter");
  }

  /** Run a command of the palette (⌘⇧P) by its label. */
  async command(label) {
    await this.key("Mod+Shift+p");
    await this.page.keyboard.type(label);
    await this.page.keyboard.press("Enter");
  }

  /** A file of the folder in memory: its text, or null. */
  file(path) {
    return this.page.evaluate((p) => window.__harness.read(p), path);
  }

  /** Every file of the folder in memory. */
  files() {
    return this.page.evaluate(() => window.__harness.files());
  }

  /** Every folder of the folder in memory. */
  folders() {
    return this.page.evaluate(() => window.__harness.folders());
  }

  /** The commands the window asked the core for, by name. */
  calls(cmd) {
    return this.page.evaluate((c) => window.__harness.calls.filter((x) => x.cmd === c).map((x) => x.args), cmd);
  }

  /** An event from the host, as the app's host sends one. */
  emit(event, payload) {
    return this.page.evaluate(([e, p]) => window.__harness.emit(e, p), [event, payload]);
  }

  // ---- The board ---------------------------------------------------------

  /** Wait for a board's scene, and its view laid out. */
  async boardReady() {
    await this.page.waitForFunction(() => {
      const a = window.__VERSO_TEST__?.board;
      return a && a.getSceneElements().length > 0 && a.getAppState().width > 0;
    });
  }

  /** The board's live elements, in their order, with what a test reads. */
  scene() {
    return this.page.evaluate(() =>
      window.__VERSO_TEST__.board.getSceneElements().map((e) => ({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        text: e.text,
        name: e.name,
        frameId: e.frameId,
        containerId: e.containerId,
        startBinding: e.startBinding?.elementId ?? null,
        endBinding: e.endBinding?.elementId ?? null,
        boundElements: e.boundElements ?? null,
      })),
    );
  }

  /** The board's view: scroll, zoom and where the canvas sits. */
  view() {
    return this.page.evaluate(() => {
      const s = window.__VERSO_TEST__.board.getAppState();
      return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, left: s.offsetLeft, top: s.offsetTop, width: s.width, height: s.height };
    });
  }

  /** The board's view once it stops moving (a view shown from the outline
   *  or the search slides there). */
  async settledView() {
    let was = await this.view();
    for (;;) {
      await this.page.waitForTimeout(150);
      const now = await this.view();
      if (JSON.stringify(now) === JSON.stringify(was)) return now;
      was = now;
    }
  }

  /** A point of the board, on the page. */
  async toPage(x, y) {
    const v = await this.view();
    return { x: (x + v.scrollX) * v.zoom + v.left, y: (y + v.scrollY) * v.zoom + v.top };
  }

  /** The middle of an element of the board, on the page. */
  async centerOf(id) {
    const e = (await this.scene()).find((x) => x.id === id);
    if (!e) throw new Error(`no element ${id} on the board`);
    return this.toPage(e.x + e.width / 2, e.y + e.height / 2);
  }

  /** Select elements of the board by id. */
  select(...ids) {
    return this.page.evaluate((list) => {
      const a = window.__VERSO_TEST__.board;
      a.updateScene({ appState: { selectedElementIds: Object.fromEntries(list.map((i) => [i, true])) } });
    }, ids);
  }

  /** Show an element of the board whole, near the middle of the view. */
  show(id) {
    return this.page.evaluate((i) => {
      const a = window.__VERSO_TEST__.board;
      const e = a.getSceneElements().find((x) => x.id === i);
      a.scrollToContent(e, { fitToViewport: true, viewportZoomFactor: 0.6, maxZoom: 1 });
    }, id);
  }
}

export const test = base.extend({
  app: async ({ page }, use) => {
    const problems = [];
    // The window's work area fills the window, always: a draft a library
    // puts in the body (a grid) once took a row of it, and the whole window
    // shrank while Mermaid drew (2026-10-01).
    await page.addInitScript(() => {
      window.__shellJumps = [];
      addEventListener("DOMContentLoaded", () => {
        const work = document.querySelector("main.work");
        if (!work) return;
        new ResizeObserver(() => {
          const h = Math.round(work.getBoundingClientRect().height);
          if (h !== innerHeight) window.__shellJumps.push(`the work area is ${h} px tall in a window of ${innerHeight}`);
        }).observe(work);
      });
    });
    page.on("console", (m) => {
      if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    // A resource the window asked for and did not get, by its address (the
    // console says only "Failed to load resource").
    page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${decodeURIComponent(new URL(r.url()).pathname)}`));
    // The `verso:` protocol of the harness, from the folder in memory: what
    // a test wrote is what the window reads.
    await page.route("**/__vault/**", async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice("/__vault/".length));
      const b64 = await page.evaluate((p) => window.__harness?.bytes(p) ?? null, path).catch(() => null);
      if (b64 === null) return route.fulfill({ status: 404, body: "" });
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      await route.fulfill({ status: 200, body: Buffer.from(b64, "base64"), contentType: TYPES[ext] ?? "application/octet-stream" });
    });
    await use(new App(page));
    const logged = await page.evaluate(() => window.__harness?.log.filter((l) => l.level === "ERROR").map((l) => l.message) ?? []).catch(() => []);
    for (const l of logged) problems.push(`app log: ${l}`);
    const jumps = await page.evaluate(() => window.__shellJumps ?? []).catch(() => []);
    for (const j of new Set(jumps)) problems.push(`layout: ${j}`);
    expect(problems, "the window's console and the app's log stay clean").toEqual([]);
  },
});

export { expect };
