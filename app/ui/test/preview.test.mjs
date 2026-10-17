// The hover preview (ADR 0085): when its one card opens and closes, over
// happy-dom, with the clock in the test's hands. Half a second of rest
// opens it (item 4), leaving the link and the card closes it, the pointer
// may cross into it; Edit mode's links need ⌘ or Ctrl (item 3); one card
// at a time, never a preview of a preview; the setting off stops the hover
// and not the command (item 8); the command's card takes the focus, is a
// labelled dialog, and Escape gives the focus back (item 6); a finger has
// no hover, and a long press shows the card (item 5).

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "tauri://localhost/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "DOMRect", "PointerEvent", "KeyboardEvent", "MouseEvent", "Event"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
globalThis.queueMicrotask ??= (f) => Promise.resolve().then(f);

await esbuild.build({
  stdin: { contents: 'export { PreviewCard, placeCard } from "./src/preview/card"; export { HoverPreview, OPEN_MS, CLOSE_MS, PRESS_MS } from "./src/preview/hover";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/preview.test-bundle.mjs",
  logLevel: "error",
});
const { PreviewCard, placeCard, HoverPreview, OPEN_MS, CLOSE_MS, PRESS_MS } = await import("./.bundles/preview.test-bundle.mjs");

/** A clock the test moves. */
const clock = {
  now: 0,
  next: 1,
  waiting: new Map(),
  setTimeout(f, ms) {
    const id = this.next++;
    this.waiting.set(id, { at: this.now + ms, f });
    return id;
  },
  clearTimeout(id) {
    this.waiting.delete(id);
  },
  tick(ms) {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.waiting.entries()].filter(([, w]) => w.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.waiting.delete(due[0]);
      this.now = due[1].at;
      due[1].f();
    }
    this.now = until;
  },
};

const filled = [];
let enabled = true;
let nothingSaid = 0;
const card = new PreviewCard({ card: (n) => `Prévia de ${n}`, loading: "Lendo…", clickOpens: "Clique para abrir" });
const preview = new HoverPreview({
  card,
  fill: async (req, slot) => {
    filled.push(req.target);
    slot.body.innerHTML = `<p>texto de ${req.target}</p><a class="wikilink" data-target="Outra">Outra</a>`;
  },
  enabled: () => enabled,
  label: (req) => ({ title: req.target, path: req.path ?? "" }),
  nothing: () => nothingSaid++,
  timers: clock,
});
preview.install(document);

let unregister = [];
let opened = [];
/** A root of links, as a note's reading view is: `a.wikilink`. */
function reading({ modifier = false } = {}) {
  const root = document.createElement("div");
  root.innerHTML = `<a class="wikilink" data-target="Nota A" tabindex="0">A</a> e <a class="wikilink" data-target="Nota B">B</a> <span class="plain">texto</span>`;
  document.body.append(root);
  unregister.push(
    preview.register(
      root,
      (el) => {
        const a = el.closest("a.wikilink");
        if (!a || !root.contains(a)) return null;
        const target = a.dataset.target;
        return { target, path: `${target}.md`, anchor: a, open: () => opened.push(target) };
      },
      modifier ? { modifier: () => true } : {},
    ),
  );
  return root;
}
const move = (el, init = {}) => el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 10, clientY: 10, ...init }));
const down = (el, init = {}) => el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", isPrimary: true, ...init }));
const key = (el, k, init = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: k, ...init }));
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  enabled = true;
  filled.length = 0;
  opened = [];
  nothingSaid = 0;
});
afterEach(() => {
  preview.close(false);
  for (const u of unregister) u();
  unregister = [];
  document.body.innerHTML = "";
  clock.waiting.clear();
});

describe("Where the card goes", () => {
  test("below the link at the pointer's x, above it when there is more room there, inside the view", () => {
    const view = { w: 1000, h: 800 };
    assert.deepEqual(placeCard({ left: 100, top: 100, bottom: 120 }, { w: 400, h: 300 }, view, 150), { left: 138, top: 126 });
    // Near the bottom: above the link.
    assert.deepEqual(placeCard({ left: 100, top: 700, bottom: 720 }, { w: 400, h: 300 }, view), { left: 88, top: 394 });
    // Near the right edge: pulled in, a margin kept.
    assert.equal(placeCard({ left: 980, top: 100, bottom: 120 }, { w: 400, h: 300 }, view).left, 592);
    // Taller than either side: kept inside.
    const tall = placeCard({ left: 10, top: 400, bottom: 420 }, { w: 300, h: 790 }, view);
    assert.ok(tall.top >= 8 && tall.top + 790 <= 800 || tall.top === 8, JSON.stringify(tall));
  });
});

describe("The hover", () => {
  test("opens after the pointer rests about half a second, and not before", async () => {
    const root = reading();
    const a = root.querySelector('[data-target="Nota A"]');
    move(a);
    clock.tick(OPEN_MS - 50);
    assert.equal(card.isOpen, false, "not yet");
    clock.tick(60);
    assert.equal(card.isOpen, true);
    await settle();
    assert.deepEqual(filled, ["Nota A"]);
    assert.equal(card.el.getAttribute("role"), "dialog");
    assert.equal(card.el.getAttribute("aria-label"), "Prévia de Nota A");
    assert.ok(document.activeElement !== card.el, "a hover takes no focus");
  });

  test("closes when the pointer leaves the link, stays while it crosses into the card", () => {
    const root = reading();
    const a = root.querySelector('[data-target="Nota A"]');
    move(a);
    clock.tick(OPEN_MS);
    assert.equal(card.isOpen, true);
    // Out of the link, into the card within the grace: it stays.
    move(root.querySelector(".plain"));
    clock.tick(CLOSE_MS - 50);
    card.el.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
    move(card.el);
    clock.tick(CLOSE_MS * 2);
    assert.equal(card.isOpen, true, "the pointer is in the card");
    // Out of the card onto plain text: closed.
    card.el.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    move(root.querySelector(".plain"));
    clock.tick(CLOSE_MS);
    assert.equal(card.isOpen, false);
  });

  test("leaving before the half second opens nothing", () => {
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(200);
    move(root.querySelector(".plain"));
    clock.tick(OPEN_MS * 2);
    assert.equal(card.isOpen, false);
  });

  test("one card at a time: another link's card replaces it", () => {
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(OPEN_MS);
    move(root.querySelector('[data-target="Nota B"]'));
    clock.tick(OPEN_MS);
    assert.equal(document.querySelectorAll(".hover-preview").length, 1);
    assert.equal(card.el.getAttribute("aria-label"), "Prévia de Nota B");
    assert.equal(preview.open?.target, "Nota B");
  });

  test("a link inside the card is not previewed: no preview of a preview", async () => {
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(OPEN_MS);
    await settle();
    const inner = card.el.querySelector("a.wikilink");
    assert.ok(inner, "the card has a link");
    move(inner);
    clock.tick(OPEN_MS * 2);
    assert.equal(preview.open?.target, "Nota A");
    assert.deepEqual(filled, ["Nota A"]);
  });

  test("a click inside the card opens the note, as following the link does, and the card goes", () => {
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(OPEN_MS);
    card.el.querySelector(".hover-preview-head").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.deepEqual(opened, ["Nota A"]);
    assert.equal(card.isOpen, false);
  });

  test("a press elsewhere, a key typed or a scroll puts a hovered card away", () => {
    const root = reading();
    const a = root.querySelector('[data-target="Nota A"]');
    for (const away of [() => down(root.querySelector(".plain")), () => key(root, "x"), () => document.dispatchEvent(new Event("scroll"))]) {
      move(root.querySelector(".plain"));
      move(a);
      clock.tick(OPEN_MS);
      assert.equal(card.isOpen, true);
      away();
      assert.equal(card.isOpen, false);
    }
  });

  test("a finger has no hover", () => {
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'), { pointerType: "touch" });
    clock.tick(OPEN_MS * 2);
    assert.equal(card.isOpen, false);
  });

  test("the setting off: no card on a hover", () => {
    enabled = false;
    const root = reading();
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(OPEN_MS * 2);
    assert.equal(card.isOpen, false);
  });
});

describe("Edit mode: with ⌘ or Ctrl held (item 3)", () => {
  test("a plain hover opens nothing; with the modifier it opens", () => {
    const root = reading({ modifier: true });
    const a = root.querySelector('[data-target="Nota A"]');
    move(a);
    clock.tick(OPEN_MS * 2);
    assert.equal(card.isOpen, false, "plain hover in the editor");
    move(a, { metaKey: true, clientX: 11 });
    clock.tick(OPEN_MS);
    assert.equal(card.isOpen, true, "⌘ held");
    preview.close(false);
    move(root.querySelector(".plain"));
    move(a, { ctrlKey: true, clientX: 12 });
    clock.tick(OPEN_MS);
    assert.equal(card.isOpen, true, "Ctrl held");
  });

  test("⌘ pressed with the pointer already resting on the link opens it", () => {
    const root = reading({ modifier: true });
    move(root.querySelector('[data-target="Nota A"]'));
    clock.tick(OPEN_MS * 2);
    assert.equal(card.isOpen, false);
    key(document.body, "Meta", { metaKey: true });
    clock.tick(OPEN_MS);
    assert.equal(card.isOpen, true);
  });
});

describe("The command (item 6)", () => {
  test("previews the focused link, takes the focus, and Escape gives it back", () => {
    const root = reading();
    const a = root.querySelector('[data-target="Nota A"]');
    a.focus();
    assert.ok(document.activeElement === a);
    assert.equal(preview.command(null, a), true);
    assert.equal(card.isOpen, true);
    assert.ok(document.activeElement === card.el, "the card has the focus");
    assert.equal(card.el.getAttribute("role"), "dialog");
    // The pointer wandering off does not close a card opened by the keys.
    move(root.querySelector(".plain"));
    clock.tick(CLOSE_MS * 4);
    assert.equal(card.isOpen, true);
    key(card.el, "Escape");
    assert.equal(card.isOpen, false);
    assert.ok(document.activeElement === a, "the focus is back on the link");
  });

  test("works with the setting off, and says so when there is nothing to preview", () => {
    enabled = false;
    const root = reading();
    assert.equal(preview.command(null, root.querySelector(".plain")), false);
    assert.equal(nothingSaid, 1);
    assert.equal(preview.command(null, root.querySelector('[data-target="Nota B"]')), true);
    assert.equal(card.isOpen, true);
  });
});

describe("A long press (item 5)", () => {
  test("a finger held still on a node shows its card, and the lift opens nothing", () => {
    const node = document.createElement("div");
    node.setAttribute("data-preview-press", "");
    node.dataset.target = "Nó";
    document.body.append(node);
    let clicked = 0;
    node.addEventListener("click", () => clicked++);
    unregister.push(preview.register(document.body, (el) => (el.closest("[data-preview-press]") ? { target: "Nó", path: "Nó.md", anchor: node, open: () => opened.push("Nó") } : null)));
    down(node, { pointerType: "touch", pointerId: 7, clientX: 50, clientY: 50 });
    clock.tick(PRESS_MS);
    assert.equal(card.isOpen, true);
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 7 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(clicked, 0, "the lift's click is the press's");
    assert.equal(card.isOpen, true, "a finger's card waits for a tap elsewhere");
  });

  test("a finger that moves is a drag, not a press", () => {
    const node = document.createElement("div");
    node.setAttribute("data-preview-press", "");
    document.body.append(node);
    unregister.push(preview.register(document.body, (el) => (el.closest("[data-preview-press]") ? { target: "Nó", path: "Nó.md", anchor: node } : null)));
    down(node, { pointerType: "touch", pointerId: 8, clientX: 50, clientY: 50 });
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", pointerId: 8, clientX: 80, clientY: 50 }));
    clock.tick(PRESS_MS * 2);
    assert.equal(card.isOpen, false);
  });
});
