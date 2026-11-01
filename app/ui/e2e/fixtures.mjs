// What every end-to-end test of the window starts from (ADR 0058): the
// browser harness opened on the demo vault (or an empty folder), and, at
// the end, a window whose console stayed clean and whose log holds no
// error — what was read by eye on 2026-10-01, read here by machine.

import { test as base, expect } from "@playwright/test";

import { leakFixtures } from "./leaks.mjs";

/** Console lines that are not the window's errors: WebKit's line for a
 *  response that failed, which the fixture reports itself, by address. */
const NOISE = [/^Failed to load resource: the server responded with a status of \d+/];

const TYPES = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", html: "text/html; charset=utf-8", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac" };

/** The window under test, and what a test asks of it. */
export class App {
  constructor(page) {
    this.page = page;
    /** Faults a test provokes on purpose (a blocked request): the fixture lets these lines pass. */
    this.expected = [];
  }

  /** The test breaks something on purpose: a fault line matching `pattern` is not a failure. */
  expectFault(pattern) {
    this.expected.push(pattern);
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

  /** Open a file by name with the quick switcher (⌘P): the name typed
   *  into its field, and Enter only once the list answers it. */
  async quickOpen(name, label = "Abrir…") {
    await this.key("Mod+p");
    const field = this.page.getByRole("combobox", { name: label });
    await expect(field).toBeFocused();
    await field.fill(name);
    await expect(this.page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
    await field.press("Enter");
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

  /** The watcher's word that `paths` changed in the harness's folder;
   *  `listing` when files came or went. */
  folderChanged(paths, listing = false) {
    return this.emit("folder-changed", { key: "harness", changed: paths, removed: [], listing, index: { indexed: 0, unchanged: 0, removed: 0, placeholders: 0, problems: [], unwatched: null, unindexed: null } });
  }

  /** Write a file of the folder as another app would: no event. */
  writeOutside(path, text) {
    return this.page.evaluate(([p, t]) => window.__harness.writeOutside(p, t), [path, text]);
  }

  /** Delete a file of the folder as another app would: no event. */
  removeOutside(path) {
    return this.page.evaluate((p) => window.__harness.removeOutside(p), path);
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
      // The element at 60 % of the view at most, never past 100 %.
      const px = (e.width * (1 / 0.6 - 1)) / 2;
      const py = (e.height * (1 / 0.6 - 1)) / 2;
      a.setViewport({ target: [e.x - px, e.y - py, e.x + e.width + px, e.y + e.height + py], fit: "scale-down", animation: false });
    }, id);
  }
}

export const test = base.extend({
  ...leakFixtures,
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
    // Headless Chromium (Docker, the Mac's CI) draws WebGL with SwiftShader, a
    // CPU renderer; the window's own probe (src/dice3d/gl.ts, 2026-10-26)
    // sends such a computer to the 2D card, as it must. The 3D specs need a
    // canvas, so the renderer's name the probe reads is a GPU's here (the
    // probe's judgement of software names stays covered by test/dice3d.test.mjs).
    // A test of the fallback sets `window.__keepGlRenderer` before the window loads.
    await page.addInitScript(() => {
      for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype]) {
        if (!proto) continue;
        const get = proto.getParameter;
        proto.getParameter = function (p) {
          const v = get.call(this, p);
          return typeof v === "string" && !globalThis.__keepGlRenderer ? v.replace(/swiftshader|llvmpipe/gi, "Test GPU") : v;
        };
      }
    });
    page.on("console", (m) => {
      if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    // A resource the window asked for and did not get, by its address (the
    // console says only "Failed to load resource").
    page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${decodeURIComponent(new URL(r.url()).pathname)}`));
    // And one that got no answer at all: a refused address, a blocked
    // request (ADR 0058 point 11; review `board.md`, reading 4, finding 6).
    // A sound file's element that read what it needed (the length, with
    // `preload="metadata"`) and let the rest go is the engine's, not a fault:
    // Chromium reports it as an aborted request (ADR 0116, audio embeds).
    page.on("requestfailed", (r) => {
      const path = decodeURIComponent(new URL(r.url()).pathname);
      const why = r.failure()?.errorText ?? "?";
      if (r.resourceType() === "media" && /ERR_ABORTED|cancelled/i.test(why)) return;
      problems.push(`request failed: ${path} (${why})`);
    });
    // The `verso:` protocol of the harness, from the folder in memory: what
    // a test wrote is what the window reads.
    await page.route("**/__vault/**", async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice("/__vault/".length));
      const b64 = await page.evaluate((p) => window.__harness?.bytes(p) ?? null, path).catch(() => null);
      if (b64 === null) return route.fulfill({ status: 404, body: "" });
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      const body = Buffer.from(b64, "base64");
      const contentType = TYPES[ext] ?? "application/octet-stream";
      // A media element asks by ranges, as of /f/ and verso:// (a sound
      // seeks only in what it was served by range).
      const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
      if (range && body.length > 0) {
        const start = range[1] ? Math.min(Number(range[1]), body.length - 1) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        return route.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType, headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${body.length}` } });
      }
      await route.fulfill({ status: 200, body, contentType, headers: { "accept-ranges": "bytes" } });
    });
    const app = new App(page);
    await use(app);
    // The harness still there: a test that left it reports nothing.
    const there = await page.evaluate(() => window.__harness !== undefined).catch(() => false);
    if (!there) problems.push("the harness is gone at the end of the test: its log and console were not read");
    const logged = await page.evaluate(() => window.__harness?.log.filter((l) => l.level === "ERROR").map((l) => l.message) ?? []).catch(() => []);
    for (const l of logged) problems.push(`app log: ${l}`);
    const jumps = await page.evaluate(() => window.__shellJumps ?? []).catch(() => []);
    for (const j of new Set(jumps)) problems.push(`layout: ${j}`);
    expect(problems.filter((p) => !app.expected.some((re) => re.test(p))), "the window's console and the app's log stay clean").toEqual([]);
  },
});

/** The box of `locator` once it has stopped moving: the same box on five
 *  reads in a row, each after the page drew a few frames, so a force
 *  layout (the graph's simulation counts frames, not milliseconds) that a
 *  loaded machine draws slowly is waited for, not guessed at with a sleep. */
export async function settledBox(page, locator, { reads = 5, within = 30_000 } = {}) {
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))));
  const key = (b) => JSON.stringify(b);
  const deadline = Date.now() + within;
  let was = null;
  let same = 0;
  for (;;) {
    await frames();
    const now = await locator.boundingBox();
    same = now && was && key(now) === key(was) ? same + 1 : 0;
    if (same >= reads - 1) return now;
    if (Date.now() > deadline) throw new Error("settledBox: the element kept moving");
    was = now;
    await page.waitForTimeout(50);
  }
}

export { expect };
