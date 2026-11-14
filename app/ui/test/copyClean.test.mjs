// Copying from the reading view must not carry the theme's colours into
// other apps (the maintainer, 2026-11-13: a block pasted into a website
// came out in the theme's colours). cleanCopyHtml strips the colour-
// carrying inline styles and colour attributes while keeping the
// structure; cleanCopy only acts on a selection inside the reader.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window();
globalThis.document = win.document;
globalThis.window = win;

await esbuild.build({
  entryPoints: ["src/leaves/note/copyClean.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/copyClean.test-bundle.mjs",
  logLevel: "error",
});
const { cleanCopyHtml, cleanCopy } = await import("./.bundles/copyClean.test-bundle.mjs");

/** A fragment holding the parsed HTML, as Range.cloneContents() returns. */
function fragmentOf(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

describe("cleanCopyHtml", () => {
  test("strips colour and background from inline styles, keeps the text", () => {
    const out = cleanCopyHtml(
      fragmentOf('<p style="color: rgb(200,200,200); background: #222; margin-top: 4px">Olá <strong style="color:#f80">mundo</strong></p>'),
    );
    assert.ok(!/color/i.test(out), `colour survived: ${out}`);
    assert.ok(!/background/i.test(out), `background survived: ${out}`);
    assert.ok(out.includes("margin-top"), "a non-colour style was dropped");
    assert.ok(out.includes("<strong"), "bold structure kept");
    assert.ok(out.includes("Olá") && out.includes("mundo"), "text kept");
  });

  test("drops the style attribute when only colour was in it", () => {
    const out = cleanCopyHtml(fragmentOf('<span style="color: red">x</span>'));
    assert.equal(out, "<span>x</span>");
  });

  test("removes colour attributes (font color, svg fill/stroke)", () => {
    const out = cleanCopyHtml(fragmentOf('<font color="#abc">a</font><svg><rect fill="red" stroke="blue"></rect></svg>'));
    assert.ok(!/color=|fill=|stroke=/i.test(out), `a colour attribute survived: ${out}`);
  });

  test("keeps links and their href", () => {
    const out = cleanCopyHtml(fragmentOf('<a href="https://x.y" style="color:#09f" class="wikilink" data-target="N">N</a>'));
    assert.ok(out.includes('href="https://x.y"'), "href kept");
    assert.ok(out.includes('class="wikilink"'), "class kept for paste back into Verso");
    assert.ok(!/color/i.test(out), "link colour stripped");
  });
});

describe("cleanCopy", () => {
  beforeEach(() => document.body.replaceChildren());

  test("does nothing when the selection is collapsed", () => {
    const within = document.createElement("div");
    document.body.append(within);
    window.getSelection().removeAllRanges();
    let prevented = false;
    const ev = { clipboardData: { setData() {} }, preventDefault: () => (prevented = true) };
    assert.equal(cleanCopy(ev, within), false);
    assert.equal(prevented, false);
  });

  test("writes stripped html and plain text for a selection in the reader", () => {
    const within = document.createElement("div");
    within.className = "preview";
    within.innerHTML = '<p style="color: rgb(1,2,3)">bloco de texto</p>';
    document.body.append(within);
    const range = document.createRange();
    range.selectNodeContents(within);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const data = {};
    let prevented = false;
    const ev = {
      clipboardData: { setData: (k, v) => (data[k] = v) },
      preventDefault: () => (prevented = true),
    };
    const handled = cleanCopy(ev, within);
    assert.equal(handled, true);
    assert.equal(prevented, true);
    assert.ok(data["text/plain"].includes("bloco de texto"), "plain text set");
    assert.ok(!/color/i.test(data["text/html"] ?? ""), `colour in html: ${data["text/html"]}`);
  });
});
